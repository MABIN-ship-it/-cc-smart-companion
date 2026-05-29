/**
 * 飞书集成服务 — API 封装 + 配置管理 + 事件回调
 *
 * 使用飞书开放平台 API：
 *   - 消息收发: im/v1/messages
 *   - 多维表格: bitable/v1
 *   - 云文档: docx/v1
 *   - 通讯录: contact/v3
 *   - 认证: auth/v3
 */
const FEISHU_CONFIG_KEY = 'cc_feishu_config';
const FEISHU_TOKEN_KEY = 'cc_feishu_token';
const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis';
const FEISHU_CREDENTIALS_KEY = 'cc_feishu_credentials'; // 持久化凭证

// 事件回调列表
const messageCallbacks = [];
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'

// ─── 配置管理 ─────────────────────────────────────

export function saveFeishuConfig(appId, appSecret) {
  const config = { appId, appSecret, updatedAt: Date.now() };
  localStorage.setItem(FEISHU_CONFIG_KEY, JSON.stringify(config));
  // 同时持久化凭证（明文，方便自动重连）
  localStorage.setItem(FEISHU_CREDENTIALS_KEY, JSON.stringify({ appId, appSecret }));
  // 同步到主进程（供上传文件时读取 token）
  try { window.electronAPI?.feishuSaveConfigFile?.(appId, appSecret); } catch {}
  return config;
}

export function getFeishuConfig() {
  try {
    const data = localStorage.getItem(FEISHU_CONFIG_KEY);
    if (data) return JSON.parse(data);
    // fallback: 从凭证存储读取
    const cred = localStorage.getItem(FEISHU_CREDENTIALS_KEY);
    return cred ? JSON.parse(cred) : null;
  } catch {
    return null;
  }
}

export function isFeishuConfigured() {
  const config = getFeishuConfig();
  return !!(config && config.appId && config.appSecret);
}

export function getConnectionStatus() {
  return connectionStatus;
}

export function setConnectionStatus(status) {
  connectionStatus = status;
}

// ─── Token 管理 ─────────────────────────────────────

function getCachedToken() {
  try {
    const data = localStorage.getItem(FEISHU_TOKEN_KEY);
    if (!data) return null;
    const token = JSON.parse(data);
    if (token.expiresAt && Date.now() < token.expiresAt - 300000) {
      return token.accessToken;
    }
    return null;
  } catch { return null; }
}

function cacheToken(accessToken, expireIn) {
  localStorage.setItem(FEISHU_TOKEN_KEY, JSON.stringify({
    accessToken,
    expiresAt: Date.now() + expireIn * 1000,
  }));
}

export async function getTenantAccessToken() {
  const cached = getCachedToken();
  if (cached) return cached;

  const config = getFeishuConfig();
  if (!config?.appId || !config?.appSecret) {
    throw new Error('飞书未配置');
  }

  const response = await fetch(`${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
  });

  if (!response.ok) {
    throw new Error(`获取飞书token失败: ${response.status}`);
  }

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`飞书认证失败(code=${data.code}): ${data.msg}`);
  }

  cacheToken(data.tenant_access_token, data.expire);
  return data.tenant_access_token;
}

// ─── 租户域名 ─────────────────────────────────────

let cachedTenantDomain = null;

export async function getFeishuTenantDomain() {
  if (cachedTenantDomain) return cachedTenantDomain;
  try {
    // 从云盘文件列表提取租户域名（无需 tenant API 权限）
    const result = await feishuApi('GET', '/drive/v1/files?page_size=5');
    const files = result.data?.files || [];
    for (const f of files) {
      if (f.url) {
        const m = f.url.match(/https:\/\/([^.]+)\.feishu\.cn\//);
        if (m) { cachedTenantDomain = m[1]; return cachedTenantDomain; }
      }
    }
  } catch { /* 静默回退 */ }
  return 'bytedance';
}

export function getFeishuWebUrl(type, id) {
  // type: 'docx', 'base', 'mindnotes', 'sheets'
  return `https://${cachedTenantDomain || 'bytedance'}.feishu.cn/${type}/${id}`;
}

// ─── Token 缓存清理 ──────────────────────────────────

function clearCachedToken() {
  try { localStorage.removeItem(FEISHU_TOKEN_KEY); } catch {}
}

// ─── 通用 API 请求 ─────────────────────────────────────

const TOKEN_EXPIRED_CODES = [99991663, 99991664, 99991665, 99991667];

export async function feishuApi(method, path, body = null) {
  const url = `${FEISHU_BASE_URL}${path}`;

  const doRequest = async (token) => {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    };
    if (body && method !== 'GET') options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    return response.json();
  };

  let token = await getTenantAccessToken();
  const data = await doRequest(token);

  // token 过期 → 清缓存重新获取 → 重试一次
  if (TOKEN_EXPIRED_CODES.includes(data.code)) {
    clearCachedToken();
    token = await getTenantAccessToken();
    const retryData = await doRequest(token);
    if (retryData.code !== 0) {
      throw new Error(`飞书API错误(${retryData.code}): ${retryData.msg}`);
    }
    return retryData;
  }

  if (data.code !== 0) {
    throw new Error(`飞书API错误(${data.code}): ${data.msg}`);
  }

  return data;
}

// ─── 测试连接 ─────────────────────────────────────

export async function testConnection(appId, appSecret) {
  try {
    const response = await fetch(`${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const data = await response.json();
    if (data.code !== 0) {
      return { success: false, error: `飞书认证失败: ${data.msg}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: `连接失败: ${e.message}` };
  }
}

// ─── 消息 ─────────────────────────────────────

export async function sendMessage(receiveIdType, receiveId, content, msgType = 'text') {
  const body = {
    receive_id: receiveId,
    msg_type: msgType,
    content: msgType === 'text' ? JSON.stringify({ text: content }) : content,
  };
  const result = await feishuApi('POST', `/im/v1/messages?receive_id_type=${receiveIdType}`, body);
  return { success: true, messageId: result.data?.message_id, data: result.data };
}

/**
 * 发送图片消息（需先在主进程上传获取 image_key）
 */
export async function sendImageMessage(receiveIdType, receiveId, imageKey) {
  const content = JSON.stringify({ image_key: imageKey });
  return sendMessage(receiveIdType, receiveId, content, 'image');
}

/**
 * 发送文件消息（需先在主进程上传获取 file_key）
 */
export async function sendFileMessage(receiveIdType, receiveId, fileKey, fileName) {
  const content = JSON.stringify({ file_key: fileKey, file_name: fileName || 'file' });
  return sendMessage(receiveIdType, receiveId, content, 'file');
}

export async function getMessageList(containerId, containerIdType = 'chat', { pageSize = 50, pageToken } = {}) {
  let path = `/im/v1/messages?container_id_type=${containerIdType}&container_id=${containerId}&page_size=${pageSize}`;
  if (pageToken) path += `&page_token=${pageToken}`;
  const result = await feishuApi('GET', path);
  return result.data || { items: [] };
}

export async function getMessageContent(messageId) {
  const result = await feishuApi('GET', `/im/v1/messages/${messageId}`);
  return result.data;
}

// ─── 群聊 ─────────────────────────────────────

export async function getChatList({ pageSize = 50, pageToken } = {}) {
  let path = `/im/v1/chats?page_size=${pageSize}`;
  if (pageToken) path += `&page_token=${pageToken}`;
  const result = await feishuApi('GET', path);
  return result.data?.items || [];
}

// ─── 通讯录 ─────────────────────────────────────

export async function getUserList({ pageSize = 50, pageToken } = {}) {
  let path = `/contact/v3/users?page_size=${pageSize}`;
  if (pageToken) path += `&page_token=${pageToken}`;
  const result = await feishuApi('GET', path);
  return result.data?.items || [];
}

export async function searchContacts(query) {
  const result = await feishuApi('GET', `/search/v1/contact?query=${encodeURIComponent(query)}`);
  const data = result.data || {};
  // 飞书返回可能是数组或 { items: [] }，统一为 { items: [] }
  if (Array.isArray(data)) return { items: data };
  return data;
}

export async function getUserInfo() {
  const result = await feishuApi('GET', '/contact/v3/users/me');
  return result.data;
}

// ─── 云文档 ─────────────────────────────────────

export async function createDocument(title, content) {
  await getFeishuTenantDomain();
  const createResult = await feishuApi('POST', '/docx/v1/documents', { title });
  const documentId = createResult.data?.document?.document_id;
  if (!documentId) throw new Error('创建文档失败：未获取到文档ID');

  if (content) {
    await feishuApi('POST', `/docx/v1/documents/${documentId}/blocks/${documentId}/children`, {
      children: [{
        block_type: 2,
        text: {
          elements: [{
            text_run: { content: content },
          }],
        },
      }],
    });
  }

  return {
    success: true,
    documentId,
    url: getFeishuWebUrl('docx', documentId),
    title,
  };
}

export async function getDocumentContent(documentId) {
  const result = await feishuApi('GET', `/docx/v1/documents/${documentId}`);
  return result.data;
}

/** 递归读取文档块并提取纯文本，供 AI 阅读 */
export async function readDocumentContent(documentId) {
  async function fetchBlocks(blockId) {
    const result = await feishuApi('GET', `/docx/v1/documents/${documentId}/blocks/${blockId}/children`);
    return result.data?.items || [];
  }

  function extractBlockText(block) {
    const bt = block.block_type;
    const textEls = block.text?.elements || [];
    const text = textEls.map(e => e.text_run?.content || '').join('');
    // 标题加标记
    if (bt >= 3 && bt <= 11) return `\n## ${text}`;
    if (bt === 12) return `- ${text}`;
    if (bt === 13) return `1. ${text}`;
    if (bt === 14) return `\`\`\`\n${text}\n\`\`\``;
    if (bt === 17) return `[ ] ${text}`;
    return text;
  }

  async function readRecursive(parentBlockId) {
    const blocks = await fetchBlocks(parentBlockId);
    let output = '';
    for (const block of blocks) {
      output += extractBlockText(block) + '\n';
      if (block.children?.length > 0) {
        output += await readRecursive(block.block_id);
      }
    }
    return output;
  }

  return (await readRecursive(documentId)).trim();
}

export async function appendDocumentBlocks(documentId, blocks) {
  const result = await feishuApi('POST', `/docx/v1/documents/${documentId}/blocks/${documentId}/children`, {
    children: blocks,
  });
  return result.data;
}

// ─── 多维表格 ─────────────────────────────────────

export async function createBase(name, folderToken) {
  await getFeishuTenantDomain();
  const body = { name };
  if (folderToken) body.folder_token = folderToken;
  const result = await feishuApi('POST', '/bitable/v1/apps', body);
  const appToken = result.data?.app?.app_token;
  if (!result.data?.app?.url && appToken) {
    result.data.app.url = getFeishuWebUrl('base', appToken);
  }
  return result.data;
}

export async function listBaseTables(appToken) {
  const result = await feishuApi('GET', `/bitable/v1/apps/${appToken}/tables`);
  return result.data || { items: [] };
}

export async function addTable(appToken, tableName, fields) {
  const result = await feishuApi('POST', `/bitable/v1/apps/${appToken}/tables`, {
    table: { name: tableName, fields: fields || [] },
  });
  return result.data;
}

export async function searchBaseRecords(appToken, tableId, { pageSize = 50, pageToken, filter, sort } = {}) {
  let path = `/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`;
  const body = {};
  if (pageSize) body.page_size = pageSize;
  if (pageToken) body.page_token = pageToken;
  if (filter) body.filter = filter;
  if (sort) body.sort = sort;
  const result = await feishuApi('POST', path, body);
  return result.data || { items: [] };
}

export async function addBaseRecord(appToken, tableId, fields) {
  const result = await feishuApi('POST', `/bitable/v1/apps/${appToken}/tables/${tableId}/records`, {
    fields,
  });
  return result.data;
}

export async function updateBaseRecord(appToken, tableId, recordId, fields) {
  const result = await feishuApi('PUT', `/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`, {
    fields,
  });
  return result.data;
}

export async function batchAddBaseRecords(appToken, tableId, records) {
  const BATCH_SIZE = 500;
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 1000;

  // 预处理：验证 records 结构，过滤空值
  const validated = records.map((record, idx) => {
    if (!record.fields || typeof record.fields !== 'object') {
      throw new Error(`第${idx + 1}条记录缺少有效的 fields 对象`);
    }
    const cleanFields = {};
    for (const [key, value] of Object.entries(record.fields)) {
      if (value !== undefined && value !== null) {
        cleanFields[key] = value;
      }
    }
    if (Object.keys(cleanFields).length === 0) {
      throw new Error(`第${idx + 1}条记录没有有效字段值`);
    }
    return { fields: cleanFields };
  });

  const allInserted = [];
  let errors = [];

  for (let i = 0; i < validated.length; i += BATCH_SIZE) {
    const chunk = validated.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await feishuApi('POST',
          `/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
          { records: chunk }
        );
        const inserted = result.data?.records || [];
        allInserted.push(...inserted);

        if (inserted.length < chunk.length) {
          console.warn(`[batchAdd] 第${batchNum}批: 请求${chunk.length}条, 实际返回${inserted.length}条`);
        }
        break;
      } catch (e) {
        const errMsg = e.message || '';
        if (attempt < MAX_RETRIES && isRetryableBitableError(errMsg)) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        const fieldHints = parseFieldError(e);
        errors.push(
          `第${batchNum}批(${chunk.length}条): ${errMsg}${fieldHints ? '. 字段提示: ' + fieldHints : ''}`
        );
        break;
      }
    }
  }

  // 写入0条时自动诊断字段结构
  if (allInserted.length === 0 && errors.length > 0) {
    try {
      const fields = await listTableFields(appToken, tableId);
      const fieldNames = (fields?.items || []).map(f => f.field_name).join(', ');
      errors.push(`诊断建议: 表中当前字段为 [${fieldNames}]，请检查records的字段名是否匹配。`);
    } catch {}
  }

  return {
    requested: records.length,
    inserted: allInserted.length,
    batches: Math.ceil(records.length / BATCH_SIZE),
    records: allInserted,
    errors: errors.length > 0 ? errors : undefined,
  };
}

function isRetryableBitableError(errMsg) {
  const retryable = ['timeout', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'socket',
    'network', 'rate limit', 'too many requests', '429', '500', '502', '503',
    'InternalError', 'resource_exhausted', 'deadline_exceeded', 'unavailable'];
  return retryable.some(p => errMsg.toLowerCase().includes(p.toLowerCase()));
}

function parseFieldError(e) {
  const msg = e.message || '';
  const fieldMatch = msg.match(/field[:.\s]*['"]?(\w+)['"]?/i);
  if (fieldMatch) return `字段"${fieldMatch[1]}"可能有问题`;
  if (msg.includes('type') && msg.includes('field')) return '字段类型与值不匹配';
  if (msg.includes('duplicate')) return '存在重复记录';
  return null;
}

// ─── 多维表格字段管理 ────────────────────────────

/** 列出表的全部字段 */
export async function listTableFields(appToken, tableId) {
  const result = await feishuApi('GET', `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`);
  return result.data || { items: [] };
}

/** 批量添加字段 */
export async function addTableFields(appToken, tableId, fields) {
  const result = await feishuApi('POST', `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, { fields });
  return result.data;
}

/** 更新已有字段（名称/类型等） */
export async function updateTableField(appToken, tableId, fieldId, updates) {
  const result = await feishuApi('PUT', `/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${fieldId}`, updates);
  return result.data;
}

/** 删除字段 */
export async function deleteTableField(appToken, tableId, fieldId) {
  const result = await feishuApi('DELETE', `/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${fieldId}`);
  return result.data;
}

// ─── 事件回调 ─────────────────────────────────────

export function onFeishuMessage(callback) {
  messageCallbacks.push(callback);
  return () => {
    const idx = messageCallbacks.indexOf(callback);
    if (idx >= 0) messageCallbacks.splice(idx, 1);
  };
}

export function dispatchFeishuMessage(data) {
  // 自动缓存发送者的 open_id 作为用户身份（收到第一条飞书消息时）
  try {
    if (!localStorage.getItem('cc_feishu_my_open_id')) {
      const senderId = extractSenderOpenId(data);
      if (senderId) {
        localStorage.setItem('cc_feishu_my_open_id', senderId);
        console.log('[Feishu] 自动缓存用户 open_id:', senderId);
      }
    }
  } catch {}

  messageCallbacks.forEach(cb => {
    try { cb(data); } catch {}
  });
}

// ─── 消息提取 ─────────────────────────────────────

/**
 * 从 WebSocket 事件数据提取消息文本
 * SDK可能传递完整schema(含event包装)或去包装后的event对象，双路径兼容
 */
export function extractTextFromEvent(eventData) {
  try {
    const msg = eventData?.event?.message || eventData?.message;
    const content = msg?.content;
    if (!content) return '';
    const parsed = JSON.parse(content);
    if (parsed.text) return parsed.text;
    if (parsed.elements) {
      return parsed.elements.map(e => e.text_run?.content || '').join('');
    }
    return '';
  } catch {
    return '';
  }
}

/** 从文本中提取飞书文档链接（云文档/思维导图/多维表格） */
export function extractFeishuDocUrls(text) {
  if (!text) return [];
  const patterns = [
    { regex: /https:\/\/[a-zA-Z0-9.-]+\.feishu\.cn\/docx\/([A-Za-z0-9_-]+)/g, type: 'docx' },
    { regex: /https:\/\/[a-zA-Z0-9.-]+\.feishu\.cn\/mindnotes\/([A-Za-z0-9_-]+)/g, type: 'mindnote' },
    { regex: /https:\/\/[a-zA-Z0-9.-]+\.feishu\.cn\/base\/([A-Za-z0-9_-]+)/g, type: 'bitable' },
  ];
  const results = [];
  for (const { regex, type } of patterns) {
    for (const match of text.matchAll(regex)) {
      results.push({ url: match[0], docId: match[1], type });
    }
  }
  return results;
}

/**
 * 从 WebSocket 事件提取消息上下文，处理所有消息类型（不再丢弃非文本消息）。
 * 返回 { text, docUrls, imageKey, fileKey, fileName, messageId, messageType, description }
 */
export function extractMessageContext(eventData) {
  try {
    const msg = eventData?.event?.message || eventData?.message;
    if (!msg) return null;
    const msgType = msg.message_type || msg.msg_type || 'unknown';
    const messageId = msg.message_id || '';
    const contentStr = msg.content || '{}';

    let parsed;
    try { parsed = JSON.parse(contentStr); } catch { parsed = {}; }

    const ctx = { messageId, messageType: msgType };

    switch (msgType) {
      case 'text': {
        const text = parsed.text || '';
        ctx.text = text;
        ctx.docUrls = extractFeishuDocUrls(text);
        ctx.description = text;
        break;
      }
      case 'post': {
        const elements = [];
        const flatten = (node) => {
          if (Array.isArray(node)) node.forEach(flatten);
          else if (node?.elements) node.elements.forEach(flatten);
          else if (node?.text_run?.content) elements.push(node.text_run.content);
          else if (node?.content && Array.isArray(node.content)) node.content.forEach(flatten);
        };
        flatten(parsed.content || parsed);
        const text = elements.join('');
        ctx.text = text;
        ctx.docUrls = extractFeishuDocUrls(text);
        ctx.description = text;
        break;
      }
      case 'image':
        ctx.imageKey = parsed.image_key || '';
        ctx.description = `[图片消息]`;
        break;
      case 'file':
        ctx.fileKey = parsed.file_key || '';
        ctx.fileName = parsed.file_name || '未知文件';
        ctx.description = `[文件消息: ${ctx.fileName}]`;
        break;
      case 'media':
        ctx.imageKey = parsed.image_key || '';
        ctx.fileKey = parsed.file_key || '';
        ctx.fileName = parsed.file_name || parsed.image_key || '媒体消息';
        ctx.description = `[媒体消息: ${ctx.fileName}]`;
        break;
      case 'audio':
        ctx.fileKey = parsed.file_key || '';
        ctx.description = `[语音消息]`;
        break;
      case 'sticker':
        ctx.description = `[表情]`;
        break;
      case 'share_chat':
        ctx.description = `[分享了群聊]`;
        break;
      case 'share_user':
        ctx.description = `[分享了联系人]`;
        break;
      default:
        ctx.description = `[消息类型: ${msgType}]`;
    }

    return ctx;
  } catch {
    return null;
  }
}

/** 从 WebSocket 事件数据提取发送者 open_id */
export function extractSenderOpenId(eventData) {
  // 路径1: { event: { sender: { sender_id: { open_id } } } }
  // 路径2: { sender: { sender_id: { open_id } } }
  const sender = eventData?.event?.sender || eventData?.sender;
  return sender?.sender_id?.open_id || '';
}

// ─── 欢迎消息 ─────────────────────────────────────

/** 连接成功后向第一个可用用户发送欢迎消息 */
export async function sendWelcomeMessage() {
  try {
    const users = await getUserList({ pageSize: 1 });
    if (!users?.length) return false;
    const user = users[0];
    await sendMessage(
      'open_id',
      user.open_id,
      '你好！我是 CC助手，已成功连接飞书。有什么需要尽管跟我说！'
    );
    return true;
  } catch (e) {
    console.error('[Feishu] 发送欢迎消息失败:', e?.message || e);
    return false;
  }
}

/** 自动回复收到的飞书消息，支持自定义回复内容 */
export async function replyToMessage(eventData, customReply) {
  const openId = extractSenderOpenId(eventData);
  const text = extractTextFromEvent(eventData);
  if (!openId || !text) return null;

  const reply = customReply || `收到：「${text.slice(0, 80)}」\n\n我是 CC助手，你的桌面 AI 伙伴。`;
  try {
    return await sendMessage('open_id', openId, reply);
  } catch (e) {
    console.error('[Feishu] 自动回复失败:', e?.message || e);
    return null;
  }
}

/**
 * 创建飞书资源后自动向用户发送链接通知。火后即忘，失败不影响主流程。
 * @param {'文档'|'多维表格'|'报告'|'方案'|'思维导图'} type
 * @param {string} title
 * @param {string} url
 */
export async function sendCreationNotification(type, title, url) {
  try {
    if (!url) return;
    const target = await resolveReceiveTarget();
    if (!target) return;
    await sendMessage(target.receiveIdType, target.receiveId, `CC 已为你创建了${type}：${title}\n${url}`);
  } catch { /* 通知失败不影响主流程 */ }
}

// ─── 默认接收上下文（统一飞书会话） ────────────────────

const DEFAULT_RECEIVE_KEY = 'cc_feishu_default_receive';

/**
 * 获取默认接收上下文 —— CC 记住用户首次联系的会话，
 * 后续所有主动通知/消息都发往同一个会话。
 * @returns {{ receiveIdType: string, receiveId: string } | null}
 */
export function getDefaultReceiveContext() {
  try {
    const raw = localStorage.getItem(DEFAULT_RECEIVE_KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw);
    if (ctx.receiveIdType && ctx.receiveId) return ctx;
  } catch {}
  return null;
}

/**
 * 设定默认接收上下文（首次在飞书联系 CC 时自动调用）
 * @param {'chat_id'|'open_id'} receiveIdType
 * @param {string} receiveId
 */
export function setDefaultReceiveContext(receiveIdType, receiveId) {
  try {
    localStorage.setItem(DEFAULT_RECEIVE_KEY, JSON.stringify({
      receiveIdType,
      receiveId,
      source: 'first_message',
      setAt: Date.now(),
    }));
  } catch {}
}

/**
 * 获取默认接收上下文或回退到当前用户 open_id
 */
async function resolveReceiveTarget() {
  const def = getDefaultReceiveContext();
  if (def) return def;
  const myId = await getMyOpenId();
  return myId ? { receiveIdType: 'open_id', receiveId: myId } : null;
}

// ─── 当前用户 ─────────────────────────────────────

let _cachedMyInfo = null;
const MY_OPEN_ID_KEY = 'cc_feishu_my_open_id';

/**
 * 尝试多种方式获取用户的 open_id（回退链）
 * 优先级：用户手动设定 > /contact/v3/users/me > 通讯录首个用户 > 空
 */
export async function getMyOpenId() {
  // 1. 用户手动设定的 open_id
  const manualId = localStorage.getItem(MY_OPEN_ID_KEY);
  if (manualId) return manualId;

  // 2. 尝试 /contact/v3/users/me
  try {
    const info = await getMyUserInfo();
    if (info?.open_id) return info.open_id;
  } catch {}

  // 3. 从通讯录取首个用户（回退方案）
  try {
    const users = await getUserList({ pageSize: 1 });
    if (users?.length && users[0]?.open_id) {
      // 自动缓存，避免重复拉取
      localStorage.setItem(MY_OPEN_ID_KEY, users[0].open_id);
      return users[0].open_id;
    }
  } catch {}

  return '';
}

/**
 * 设定用户的飞书身份（手动搜索并确认后调用）
 */
export function setMyOpenId(openId) {
  localStorage.setItem(MY_OPEN_ID_KEY, openId);
  _cachedMyInfo = null; // 清除旧缓存
}

/**
 * 获取当前飞书用户信息（带缓存）
 */
export async function getMyUserInfo() {
  if (_cachedMyInfo) return _cachedMyInfo;
  try {
    const user = await getUserInfo();
    _cachedMyInfo = user?.user || user;
    return _cachedMyInfo;
  } catch {
    return null;
  }
}

/**
 * 清除用户缓存（重连时调用）
 */
export function clearMyUserInfo() {
  _cachedMyInfo = null;
}

// ─── 权限自检 ─────────────────────────────────────

const PERMISSION_CHECKS = [
  { domain: 'im',       label: '消息/图片/文件', scope: 'im:message, im:chat, im:resource',   test: { method: 'GET', path: '/im/v1/chats?page_size=1' } },
  { domain: 'docx',     label: '云文档',          scope: 'docx:document',                       test: { method: 'GET', path: '/drive/v1/files?page_size=1' } },
  { domain: 'bitable',  label: '多维表格',        scope: 'bitable:app',                         test: { method: 'GET', path: '/drive/v1/files?page_size=1' } },
  { domain: 'contact',  label: '通讯录',          scope: 'contact:contact',                     test: { method: 'GET', path: '/contact/v3/users?page_size=1' } },
  { domain: 'calendar', label: '日历',            scope: 'calendar:calendar',                   test: { method: 'GET', path: '/calendar/v4/calendars' } },
  { domain: 'task',     label: '任务',            scope: 'task:task',                           test: { method: 'GET', path: '/task/v2/tasks?page_size=1' } },
  { domain: 'approval', label: '审批',            scope: 'approval:instance',                   test: { method: 'GET', path: '/approval/v4/instances?page_size=1&user_id_type=open_id' } },
  { domain: 'wiki',     label: '知识库',          scope: 'wiki:wiki',                           test: { method: 'GET', path: '/wiki/v2/spaces?page_size=1' } },
];

// ─── 所需 OAuth Scope 列表（一键复制用）──────────

const REQUIRED_SCOPES = [
  'im:message', 'im:message:send_as_bot', 'im:chat', 'im:chat:readonly', 'im:resource',
  'docx:document', 'docx:document:create', 'bitable:app', 'wiki:wiki',
  'contact:contact', 'contact:user', 'calendar:calendar',
  'approval:instance', 'task:task', 'mail:mail', 'minutes:minute', 'mind_notes:mind_note',
];

export function getRequiredScopes() {
  return [...REQUIRED_SCOPES];
}

export async function copyScopeToClipboard(scope) {
  try {
    await navigator.clipboard.writeText(scope);
  } catch {
    // Electron contextIsolation 下 clipboard API 可能不可用，回退到 execCommand
    const ta = document.createElement('textarea');
    ta.value = scope;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  return scope;
}

export function getFeishuPermissionUrl() {
  const config = getFeishuConfig();
  if (!config?.appId) return 'https://open.feishu.cn';
  return `https://open.feishu.cn/app/${config.appId}/permission`;
}

/**
 * 一次性检测所有飞书 API 权限
 * @returns {Promise<{results: Array<{domain, label, ok, error}>}>}
 */
export async function checkPermissions() {
  const results = await Promise.all(
    PERMISSION_CHECKS.map(async ({ domain, label, scope, test }) => {
      try {
        await feishuApi(test.method, test.path);
        return { domain, label, scope, ok: true };
      } catch (e) {
        return { domain, label, scope, ok: false, error: e.message };
      }
    })
  );
  return { results, allOk: results.every(r => r.ok), okCount: results.filter(r => r.ok).length, total: results.length };
}

// ─── 互动卡片消息 ─────────────────────────────────────

/**
 * 发送飞书互动卡片消息
 * @param {'open_id'|'chat_id'} receiveIdType
 * @param {string} receiveId
 * @param {object} cardJson 飞书卡片 JSON
 */
export async function sendCardMessage(receiveIdType, receiveId, cardJson) {
  const content = JSON.stringify(cardJson);
  // 不需要 double stringify，飞书卡片内容本身就是 string
  const result = await feishuApi('POST', `/im/v1/messages?receive_id_type=${receiveIdType}`, {
    receive_id: receiveId,
    msg_type: 'interactive',
    content,
  });
  return { success: true, messageId: result.data?.message_id, data: result.data };
}

// ─── 文件导入为云文档 ─────────────────────────────────────

export async function importFileToCloudDoc(filePath, targetType) {
  if (!window.electronAPI?.feishuImportToCloudDoc) {
    throw new Error('此功能需要 Electron 环境');
  }
  const result = await window.electronAPI.feishuImportToCloudDoc(filePath, targetType);
  if (!result.success) {
    throw new Error(result.error || '导入失败');
  }
  return result;
}

// ─── 配置指引 ─────────────────────────────────────

export function getSetupGuide() {
  return `## 飞书连接配置指南

### 第一步：创建应用
1. 浏览器打开 https://open.feishu.cn
2. 飞书扫码登录 → 进入开发者后台
3. 点击"创建企业自建应用" → 名称填"CC助手" → 确认

### 第二步：获取凭证
4. 左侧菜单 → "凭证与基础信息"
5. 复制 App ID 和 App Secret
6. 粘贴回 CC 配置面板 → 点击"测试连接"

### 第三步：配置权限（关键！）
连接成功后，CC 会自动检测权限状态。
推荐使用 CC 面板中的「一键打开权限页面」跳转到权限管理页，再逐项点击"复制"按钮复制 scope 到搜索框搜索开通，
或手动在飞书开发者后台 "权限管理" 中搜索并开通以下权限：

**消息与群聊：**
- im:message（收发消息）
- im:message:send_as_bot（以机器人身份发消息）
- im:chat（获取群信息）
- im:chat:readonly（读取群信息）
- im:resource（上传和获取图片/文件资源）

**文档与知识：**
- docx:document（云文档读写）
- docx:document:create（创建云文档）
- bitable:app（多维表格）
- wiki:wiki（知识库）

**通讯录与日历：**
- contact:contact（通讯录）
- contact:user（用户信息）
- calendar:calendar（日历读写）

**高级功能（按需开通）：**
- approval:instance（审批实例）
- task:task（任务读写）
- mail:mail（邮件读写）
- minutes:minute（妙记）
- mind_notes:mind_note（思维导图）

### 第四步：发布应用
7. 左侧菜单 → "版本管理与发布"
8. 点击"创建版本" → 输入版本号（如 1.0.0）→ 保存
9. 点击"申请线上发布" → 等待管理员审批（通常是您自己）

### 第五步：测试连接
10. 回到 CC 配置面板，点击"连接"
11. CC 会自动检测权限状态，显示绿色勾=可用，红色叉=需配置
12. 连接成功后，飞书有人给您发消息，CC 就能收到`;
}
