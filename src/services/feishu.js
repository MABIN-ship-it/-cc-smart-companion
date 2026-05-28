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

// ─── 通用 API 请求 ─────────────────────────────────────

export async function feishuApi(method, path, body = null) {
  const token = await getTenantAccessToken();
  const url = `${FEISHU_BASE_URL}${path}`;

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
  };

  if (body && method !== 'GET') options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  const data = await response.json();

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
  return result.data || [];
}

export async function getUserInfo() {
  const result = await feishuApi('GET', '/contact/v3/users/me');
  return result.data;
}

// ─── 云文档 ─────────────────────────────────────

export async function createDocument(title, content) {
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
    url: `https://bytedance.feishu.cn/docx/${documentId}`,
    title,
  };
}

export async function getDocumentContent(documentId) {
  const result = await feishuApi('GET', `/docx/v1/documents/${documentId}`);
  return result.data;
}

export async function appendDocumentBlocks(documentId, blocks) {
  const result = await feishuApi('POST', `/docx/v1/documents/${documentId}/blocks/${documentId}/children`, {
    children: blocks,
  });
  return result.data;
}

// ─── 多维表格 ─────────────────────────────────────

export async function createBase(name, folderToken) {
  const body = { name };
  if (folderToken) body.folder_token = folderToken;
  const result = await feishuApi('POST', '/bitable/v1/apps', body);
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
  const result = await feishuApi('POST', `/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`, {
    records,
  });
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
    // 路径1: 完整schema { event: { message: { content } } }
    // 路径2: 去包装后 { message: { content } }
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
  { domain: 'im', label: '消息', test: { method: 'GET', path: '/im/v1/chats?page_size=1' } },
  { domain: 'docx', label: '云文档', test: { method: 'GET', path: '/docx/v1/documents?page_size=1' } },
  { domain: 'bitable', label: '多维表格', test: { method: 'GET', path: '/bitable/v1/apps?page_size=1' } },
  { domain: 'contact', label: '通讯录', test: { method: 'GET', path: '/contact/v3/users?page_size=1' } },
  { domain: 'calendar', label: '日历', test: { method: 'GET', path: '/calendar/v4/calendars' } },
  { domain: 'task', label: '任务', test: { method: 'GET', path: '/task/v2/tasks?page_size=1' } },
  { domain: 'approval', label: '审批', test: { method: 'GET', path: '/approval/v4/instances?page_size=1' } },
  { domain: 'wiki', label: '知识库', test: { method: 'GET', path: '/wiki/v2/spaces?page_size=1' } },
  { domain: 'mail', label: '邮件', test: { method: 'GET', path: '/mail/v1/user_mailboxes' } },
  { domain: 'minutes', label: '妙记', test: { method: 'GET', path: '/minutes/v1/minutes/search?page_size=1' } },
  { domain: 'mind_notes', label: '思维导图', test: { method: 'GET', path: '/mind_notes/v1/mind_notes?page_size=1' } },
];

/**
 * 一次性检测所有飞书 API 权限
 * @returns {Promise<{results: Array<{domain, label, ok, error}>}>}
 */
export async function checkPermissions() {
  const results = await Promise.all(
    PERMISSION_CHECKS.map(async ({ domain, label, test }) => {
      try {
        await feishuApi(test.method, test.path);
        return { domain, label, ok: true };
      } catch (e) {
        return { domain, label, ok: false, error: e.message };
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
请在飞书开发者后台 "权限管理" 中搜索并开通以下权限：

**消息与群聊：**
- im:message（收发消息）
- im:message:send_as_bot（以机器人身份发消息）
- im:chat（获取群信息）
- im:chat:readonly（读取群信息）

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
