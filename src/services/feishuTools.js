/**
 * 飞书 AI 工具 — 注册到 toolRegistry，让 CC 能操作飞书
 *
 * 工具函数设计原则：单一职责、返回结构化结果、错误友好提示
 */
import {
  getFeishuConfig, getTenantAccessToken, feishuApi,
  sendMessage, sendImageMessage, sendFileMessage, getChatList, getUserList, searchContacts,
  createDocument, createBase, getMessageList, listBaseTables, searchBaseRecords,
  addBaseRecord, updateBaseRecord, batchAddBaseRecords,
  addTable, listTableFields, addTableFields,
  getMyOpenId, setMyOpenId, checkPermissions, sendCreationNotification,
  readDocumentContent, extractFeishuDocUrls,
} from './feishu';
import { getWorkspaceContext } from './toolRegistry';

const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis';

// ─── 路径解析 ─────────────────────────────────────

/**
 * 解析文件路径：绝对路径原样返回，相对路径拼接到工作区前面
 */
function resolveFilePath(filePath) {
  if (!filePath) return filePath;
  // 已是绝对路径（Windows 盘符或 Unix / 开头）
  if (/^[a-zA-Z]:[/\\]/.test(filePath) || filePath.startsWith('/') || filePath.startsWith('\\\\')) {
    return filePath.replace(/\\/g, '/');
  }
  // base64 data URI 透传
  if (filePath.startsWith('data:image/')) {
    return filePath;
  }
  // 相对路径 → 拼接工作区
  const workspace = getWorkspaceContext();
  if (workspace) {
    const sep = workspace.endsWith('/') || workspace.endsWith('\\') ? '' : '/';
    return (workspace.replace(/\\/g, '/') + sep + filePath).replace(/\\/g, '/');
  }
  return filePath.replace(/\\/g, '/');
}

/** 获取当前已保存的飞书配置 */
function ensureConfig() {
  const cfg = getFeishuConfig();
  if (!cfg?.appId || !cfg?.appSecret) {
    return { ok: false, error: '飞书未连接，请先在工具箱中配置飞书凭证' };
  }
  return { ok: true, cfg };
}

/** 飞书API请求（保证token有效） */
async function apiCall(method, path, body) {
  const configCheck = ensureConfig();
  if (!configCheck.ok) return configCheck;

  try {
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
      return { ok: false, error: `飞书API错误: ${data.code} - ${data.msg}` };
    }
    return { ok: true, data: data.data };
  } catch (e) {
    return { ok: false, error: `飞书请求失败: ${e.message}` };
  }
}

// ─── 工具：发送消息 ───────────────────────────────

export async function feishuSendMessage(input) {
  let { receive_id_type, receive_id, content } = input;
  if (!content) {
    return '请提供消息内容(content)。例如：{ "content": "你好" }';
  }
  // 如果未指定接收人，自动发给当前用户
  if (!receive_id) {
    try {
      receive_id = await getMyOpenId();
      receive_id_type = 'open_id';
    } catch {
      return '无法获取当前用户ID，请先连接飞书或手动指定 receive_id。';
    }
  }
  try {
    const result = await sendMessage(receive_id_type || 'open_id', receive_id, content);
    return result?.messageId ? `消息已发送到飞书，messageId: ${result.messageId}` : '消息发送失败';
  } catch (e) {
    return `发送失败: ${e.message}`;
  }
}

// ─── 工具：消息总结 ───────────────────────────────

export async function feishuMessageSummary(input) {
  const { chat_id, keyword, hours } = input || {};

  // 读取群列表
  let chatList;
  try {
    const listResult = await getChatList();
    chatList = listResult;
  } catch (e) {
    return `获取群列表失败: ${e.message}`;
  }

  if (!chatList?.length) return '未找到任何群聊。请确保飞书应用已加入群聊。';

  // 找到目标群
  let targetChat;
  if (chat_id) {
    targetChat = chatList.find(c => c.chat_id === chat_id);
  }
  if (!targetChat && keyword) {
    targetChat = chatList.find(c => c.name?.includes(keyword));
  }
  if (!targetChat) {
    const names = chatList.map(c => `${c.name}(chat_id:${c.chat_id})`).join(', ');
    return `请指定要总结的群。可用的群：${names}`;
  }

  // 拉取消息
  let messages;
  try {
    messages = await getMessageList(targetChat.chat_id, 'chat', { pageSize: 50 });
  } catch (e) {
    return `无法读取群消息(可能需要群聊消息权限): ${e.message}`;
  }

  if (!messages?.items?.length) {
    return `群"${targetChat.name}"暂无消息`;
  }

  // 格式化消息摘要
  const now = Date.now();
  const timeFilter = hours ? hours * 3600000 : 86400000;
  const recentMessages = messages.items.filter(m => {
    const msgTime = parseInt(m.create_time) * 1000 || 0;
    return now - msgTime < timeFilter;
  });

  const summary = recentMessages.slice(0, 30).map(m => {
    const sender = m.sender?.id || '未知';
    const content = extractMessageText(m);
    return `[${sender}]: ${content}`;
  }).join('\n');

  return `群"${targetChat.name}"最近${hours || 24}小时消息摘要（共${recentMessages.length}条）：\n${summary}`;
}

function extractMessageText(msg) {
  const body = msg.body?.content || '';
  try {
    const parsed = JSON.parse(body);
    if (parsed.text) return parsed.text;
    if (parsed.elements) {
      return parsed.elements.map(e => e.text_run?.content || '').join('');
    }
    return body.slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
}

// ─── 工具：创建飞书文档 ───────────────────────────────

export async function feishuCreateDoc(input) {
  const { title, content } = input || {};
  if (!title) return '请提供文档标题。例如：{ "title": "项目复盘", "content": "..." }';

  try {
    const result = await createDocument(title, content || '');
    sendCreationNotification('文档', result.title, result.url).catch(() => {});
    return `飞书文档已创建：${result.title}\n链接：${result.url}\n文档ID：${result.documentId}`;
  } catch (e) {
    return `创建文档失败: ${e.message}`;
  }
}

// ─── 工具：操作多维表格 ───────────────────────────────

/** 字段类型名 → 飞书数字类型 */
const FIELD_TYPE_MAP = {
  text: 1, number: 2, select: 3, multi_select: 4, date: 5,
  checkbox: 7, attachment: 11, url: 13, rating: 18, currency: 22,
  phone: 23, email: 24, location: 25, progress: 1001,
  user: 10, created_time: 27, modified_time: 28, auto_number: 26,
};

function normalizeFields(rawFields) {
  return (rawFields || []).map(f => ({
    field_name: f.field_name || f.name || '',
    type: typeof f.type === 'number' ? f.type : (FIELD_TYPE_MAP[f.type] || 1),
  }));
}

export async function feishuBaseOperation(input) {
  const { operation, app_token, table_id, record } = input || {};

  if (operation === 'create_base') {
    const { name, folder_token } = input || {};
    if (!name) return '请提供多维表格名称。例如：{ "operation": "create_base", "name": "项目进度表" }';
    try {
      const result = await createBase(name, folder_token);
      const url = result.app?.url;
      if (url) sendCreationNotification('多维表格', name, url).catch(() => {});
      return `多维表格已创建：${name}\napp_token: ${result.app?.app_token || 'unknown'}\n链接: ${url || '无'}`;
    } catch (e) {
      return `创建多维表格失败: ${e.message}`;
    }
  }

  if (operation === 'list_tables') {
    if (!app_token) return '请提供多维表格的 app_token。';
    try {
      const tables = await listBaseTables(app_token);
      if (tables?.items) {
        return `多维表格 ${app_token} 包含以下数据表：\n${tables.items.map(t => `- ${t.name}(table_id: ${t.table_id})`).join('\n')}`;
      }
      return '未找到数据表';
    } catch (e) {
      return `获取表格失败: ${e.message}`;
    }
  }

  if (operation === 'add_table') {
    if (!app_token) return '请提供多维表格的 app_token';
    const { table_name, fields } = input || {};
    if (!table_name) return '请提供新表名称(table_name)';
    try {
      const normalized = normalizeFields(fields);
      const result = await addTable(app_token, table_name, normalized);
      const fieldNames = normalized.map(f => f.field_name).join(', ');
      return `数据表"${table_name}"已创建，共 ${normalized.length} 个字段：${fieldNames}\ntable_id: ${result.table?.table_id || 'unknown'}`;
    } catch (e) {
      return `创建数据表失败: ${e.message}`;
    }
  }

  if (operation === 'list_fields') {
    if (!app_token || !table_id) return '请提供 app_token 和 table_id';
    try {
      const result = await listTableFields(app_token, table_id);
      const items = result?.items || [];
      if (!items.length) return '该表暂无字段';
      return `数据表字段（共${items.length}个）：\n${items.map(f => `- ${f.field_name}（ID: ${f.field_id}, 类型: ${f.type}）`).join('\n')}`;
    } catch (e) {
      return `获取字段列表失败: ${e.message}`;
    }
  }

  if (operation === 'add_fields') {
    if (!app_token || !table_id) return '请提供 app_token 和 table_id';
    const { fields } = input || {};
    if (!fields?.length) return '请提供要添加的字段数组(fields)，每项含 field_name 和 type';
    try {
      const normalized = normalizeFields(fields);
      await addTableFields(app_token, table_id, normalized);
      const fieldNames = normalized.map(f => f.field_name).join(', ');
      return `已添加 ${normalized.length} 个字段：${fieldNames}`;
    } catch (e) {
      return `添加字段失败: ${e.message}`;
    }
  }

  if (operation === 'search') {
    if (!app_token || !table_id) return '请提供 app_token 和 table_id';
    try {
      const records = await searchBaseRecords(app_token, table_id);
      if (records?.items) {
        return `表格中共 ${records.total || records.items.length} 条记录：\n${JSON.stringify(records.items.slice(0, 10), null, 2)}`;
      }
      return '未找到记录';
    } catch (e) {
      return `搜索记录失败: ${e.message}`;
    }
  }

  if (operation === 'add_record') {
    if (!app_token || !table_id || !record) return '请提供 app_token、table_id 和 record(fields对象，字段名必须与表中已有字段一致)';
    try {
      const result = await addBaseRecord(app_token, table_id, record);
      return `记录已添加，record_id: ${result.record?.record_id || 'unknown'}`;
    } catch (e) {
      return `添加记录失败: ${e.message}。提示：请先用 list_fields 确认表中已有字段名，record的字段名必须完全匹配。`;
    }
  }

  if (operation === 'add_records') {
    if (!app_token || !table_id) return '请提供 app_token 和 table_id';
    const { records } = input || {};
    if (!records?.length) return '请提供 records 数组，每项为 { fields: {...} }';
    try {
      const result = await batchAddBaseRecords(app_token, table_id, records);
      return `已批量添加 ${records.length} 条记录`;
    } catch (e) {
      return `批量添加失败: ${e.message}`;
    }
  }

  if (operation === 'update_record') {
    if (!app_token || !table_id || !record?.record_id) return '请提供 app_token、table_id 和 record(含record_id 和 fields)';
    try {
      await updateBaseRecord(app_token, table_id, record.record_id, record.fields || {});
      return '记录已更新';
    } catch (e) {
      return `更新记录失败: ${e.message}`;
    }
  }

  return `请指定操作类型(operation)：
create_base — 创建多维表格
add_table — 新建数据表（带自定义字段）
list_tables — 查看所有数据表
list_fields — 查看数据表字段
add_fields — 为已有表添加字段
search — 搜索记录
add_record — 添加单条记录
add_records — 批量添加记录
update_record — 更新记录`;
}

// ─── 工具：搜索联系人 ───────────────────────────────

export async function feishuSearchContacts(input) {
  const { query } = input || {};
  if (!query) return '请提供搜索关键词。例如：{ "query": "张三" }';

  try {
    const contacts = await searchContacts(query);
    const items = contacts?.items || contacts?.users || [];
    if (Array.isArray(contacts) && contacts.length) {
      return `找到${contacts.length}个联系人：\n${contacts.map(c => `- ${c.name || c.display_name || c.user_id || c.id}（ID: ${c.open_id || c.user_id || c.id}）`).join('\n')}`;
    }
    if (items.length) {
      return `找到${items.length}个联系人：\n${items.map(c => `- ${c.name || c.display_name || c.user_id || c.id}（ID: ${c.open_id || c.user_id || c.id}）`).join('\n')}`;
    }
    return `未找到与"${query}"相关的联系人`;
  } catch (e) {
    return `搜索联系人失败: ${e.message}`;
  }
}

// ─── 工具：给自己发消息 ───────────────────────────────

export async function feishuSendToMe(input) {
  const { content } = input || {};
  if (!content) return '请提供消息内容(content)';
  try {
    const myId = await getMyOpenId();
    if (!myId) {
      return '无法确定你的飞书身份。请尝试以下方法：\n'
        + '1. 在工具箱→飞书配置→点击"搜索我的飞书号"\n'
        + '2. 或者告诉我你的飞书名字，我帮你搜索，例如"搜索飞书联系人 张三"\n'
        + '3. 找到后告诉我"设定我的飞书身份为XXX"';
    }
    const result = await sendMessage('open_id', myId, content);
    return result?.messageId ? `消息已发送到你的飞书聊天窗口，messageId: ${result.messageId}` : '消息发送失败';
  } catch (e) {
    return `发送失败: ${e.message}`;
  }
}

// ─── 工具：搜索并设定自己的飞书身份 ───────────────

export async function feishuSetMyIdentity(input) {
  const { query } = input || {};
  if (!query) return '请提供你的飞书名字或关键词来搜索，例如"设定我的飞书身份为 张三"';

  try {
    const contacts = await searchContacts(query);
    if (!contacts?.items?.length) {
      return `未找到与"${query}"相关的联系人。请尝试更准确的姓名。`;
    }

    // 如果只有一个结果，直接设定
    if (contacts.items.length === 1) {
      const user = contacts.items[0];
      setMyOpenId(user.open_id || user.id);
      return `已设定你的飞书身份为：${user.name || user.id}（open_id: ${user.open_id || user.id}）`;
    }

    // 多个结果，列出让用户选择
    const list = contacts.items.map((c, i) =>
      `${i + 1}. ${c.name || c.id}（${c.department || ''}）`
    ).join('\n');
    return `找到 ${contacts.items.length} 个匹配的联系人：\n${list}\n\n请告诉我是第几个，例如"选第1个"。`;
  } catch (e) {
    return `搜索失败: ${e.message}`;
  }
}

/**
 * 通过序号选定身份
 */
export async function feishuSelectIdentity(input) {
  const { query, index } = input || {};
  if (!query || index === undefined) return '请提供搜索关键词(query)和序号(index)';

  try {
    const contacts = await searchContacts(query);
    if (!contacts?.items?.length || !contacts.items[index - 1]) {
      return '未找到匹配的联系人或序号无效。';
    }
    const user = contacts.items[index - 1];
    setMyOpenId(user.open_id || user.id);
    return `已设定你的飞书身份为：${user.name || user.id}`;
  } catch (e) {
    return `设定失败: ${e.message}`;
  }
}

// ─── 工具：权限自检 ───────────────────────────────

export async function feishuCheckPermissions() {
  try {
    const { results, allOk, okCount, total } = await checkPermissions();
    const lines = results.map(r =>
      `${r.ok ? '✅' : '❌'} ${r.label}（${r.domain}）${!r.ok ? ' — 请在飞书开发者后台配置此权限' : ''}`
    );
    const summary = `飞书权限检测结果（${okCount}/${total} 已开通）：`;
    return [summary, ...lines].join('\n');
  } catch (e) {
    return `权限检测失败: ${e.message}`;
  }
}

// ─── 工具定义（给 LLM 的 schema） ──────────────────────

// ─── 工具：发送图片到飞书 ──────────────────────────

export async function feishuSendImage(input) {
  let { file_path, receive_id_type, receive_id } = input || {};
  if (!file_path) return '请提供图片文件路径(file_path)。';
  file_path = resolveFilePath(file_path);

  try {
    if (!window.electronAPI) {
      return '图片上传失败: Electron环境未就绪，请重启应用。';
    }

    let uploadResult;
    if (file_path.startsWith('data:image/')) {
      // 粘贴截图 → base64 → 主进程解码上传
      uploadResult = await window.electronAPI.feishuUploadImageBase64?.(file_path);
    } else {
      uploadResult = await window.electronAPI.feishuUploadImage?.(file_path);
    }

    if (!uploadResult) {
      return '图片上传失败: 上传接口不可用，请检查飞书是否已连接。';
    }
    if (!uploadResult.success) {
      return `图片上传失败: ${uploadResult.error || '服务器返回错误，请检查飞书配置和网络。'}`;
    }
    if (!uploadResult.imageKey) {
      return '图片上传失败: 上传成功但未获取到image_key，飞书接口返回异常。';
    }

    const recvType = receive_id_type || 'open_id';
    const recvId = receive_id || await getMyOpenId();
    if (!recvId) return '无法确定接收人，请先设定飞书身份。';

    const sendResult = await sendImageMessage(recvType, recvId, uploadResult.imageKey);
    return sendResult?.messageId
      ? `图片已发送到飞书，messageId: ${sendResult.messageId}`
      : `图片上传成功(imageKey: ${uploadResult.imageKey})但发送消息失败，请检查飞书消息权限。`;
  } catch (e) {
    return `发送图片异常: ${e.message || e}`;
  }
}

// ─── 工具：发送文件到飞书 ──────────────────────────

export async function feishuSendFile(input) {
  let { file_path, file_name, receive_id_type, receive_id } = input || {};
  if (!file_path) return '请提供文件路径(file_path)。';
  file_path = resolveFilePath(file_path);

  try {
    if (!window.electronAPI) {
      return '文件上传失败: Electron环境未就绪，请重启应用。';
    }

    const uploadResult = await window.electronAPI.feishuUploadFile?.(file_path, file_name || undefined);

    if (!uploadResult) {
      return '文件上传失败: 上传接口不可用，请检查飞书是否已连接。';
    }
    if (!uploadResult.success) {
      return `文件上传失败: ${uploadResult.error || '服务器返回错误(code=unknown)，请检查:\n1. 飞书配置是否正确\n2. 文件是否存在\n3. 网络连接是否正常'}`;
    }
    if (!uploadResult.fileKey) {
      return '文件上传失败: 上传成功但未获取到file_key，可能飞书不支持此文件类型。';
    }

    const recvType = receive_id_type || 'open_id';
    const recvId = receive_id || await getMyOpenId();
    if (!recvId) return '无法确定接收人，请先设定飞书身份。';

    const sendResult = await sendFileMessage(recvType, recvId, uploadResult.fileKey, uploadResult.fileName || file_name);
    return sendResult?.messageId
      ? `文件已发送到飞书，messageId: ${sendResult.messageId}`
      : `文件上传成功(fileKey: ${uploadResult.fileKey})但发送消息失败，请检查飞书消息权限。`;
  } catch (e) {
    return `发送文件异常: ${e.message || e}`;
  }
}

// ─── 工具：读取飞书云文档 ──────────────────────────

export async function feishuReadDocument(input) {
  const { url, document_id } = input || {};
  let docId = document_id;
  if (!docId && url) {
    const extracted = extractFeishuDocUrls(url);
    if (extracted.length) docId = extracted[0].docId;
  }
  if (!docId) return '请提供飞书文档链接(url)或文档ID(document_id)。';

  try {
    const text = await readDocumentContent(docId);
    if (!text) return `文档 ${docId} 内容为空或读取失败，请确认文档存在且 CC 有权限访问。`;
    return `文档内容（${docId}）：\n\n${text.slice(0, 8000)}`;
  } catch (e) {
    return `读取文档失败: ${e.message}`;
  }
}

// ─── 工具：下载飞书消息中的文件/图片 ──────────────

export async function feishuDownloadResource(input) {
  const { message_id, file_key, type, file_name } = input || {};
  if (!message_id || !file_key) return '请提供 message_id 和 file_key（从飞书消息上下文中获取）。';
  const resourceType = type === 'image' ? 'image' : 'file';

  try {
    if (!window.electronAPI?.feishuDownloadResource) {
      return '文件下载功能不可用，请重启应用。';
    }
    const result = await window.electronAPI.feishuDownloadResource(message_id, file_key, resourceType, file_name);
    if (!result?.success) return `下载失败: ${result?.error || '未知错误'}`;

    let response = `文件已下载到: ${result.filePath}（${result.fileName}, ${(result.fileSize / 1024).toFixed(1)}KB）`;
    if (result.base64Preview) {
      response += `\n[图片已就绪，可发送到飞书: ${result.filePath}]`;
    }
    if (result.textContent) {
      response += `\n\n文件内容预览：\n${result.textContent.slice(0, 4000)}`;
    }
    return response;
  } catch (e) {
    return `下载文件异常: ${e.message || e}`;
  }
}

// ─── 导入文件为云文档 ─────────────────────────────────────

export async function feishuImportToCloudDoc(input) {
  const { file_path, target_type } = input || {};
  if (!file_path) return '请提供文件路径 file_path（从之前 feishu_download_resource 的返回结果中获取）。';

  try {
    const result = await window.electronAPI.feishuImportToCloudDoc(file_path, target_type || null);
    if (!result?.success) return `导入失败: ${result?.error || '未知错误'}`;

    const typeName = result.type === 'sheet' ? '电子表格' : result.type === 'docx' ? '文档' : result.type;
    return `文件「${result.fileName}」已成功导入为飞书${typeName}！\n链接: ${result.url}`;
  } catch (e) {
    return `导入文件异常: ${e.message || e}`;
  }
}

// ─── 工具定义 ─────────────────────────────────────

export const FEISHU_TOOLS = [
  {
    name: 'feishu_send_message',
    description: '发送消息到飞书用户或群聊。如不指定接收人，自动发给自己。',
    input_schema: {
      type: 'object',
      properties: {
        receive_id_type: { type: 'string', description: '接收者类型：open_id/chat_id/user_id' },
        receive_id: { type: 'string', description: '接收者ID（可选，不填则发给自己）' },
        content: { type: 'string', description: '消息内容' },
      },
      required: ['content'],
    },
  },
  {
    name: 'feishu_message_summary',
    description: '总结飞书群聊消息。用户说"总结群消息"时调用此工具。',
    input_schema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: '群ID（可选）' },
        keyword: { type: 'string', description: '群名称关键词（可选）' },
        hours: { type: 'number', description: '提取最近多少小时的消息，默认24' },
      },
    },
  },
  {
    name: 'feishu_create_doc',
    description: '在飞书创建文档。用户说"写个文档"或"生成报告"时调用。',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '文档标题' },
        content: { type: 'string', description: '文档内容（支持文本）' },
      },
      required: ['title'],
    },
  },
  {
    name: 'feishu_base_operation',
    description: '操作飞书多维表格：新建表格、管理字段、搜索/添加/批量添加/更新记录。支持字段类型：text(文本)、number(数字)、select(单选)、date(日期)、checkbox(复选框)、url(链接)、email(邮箱)、phone(电话)、currency(货币)、progress(进度)、attachment(附件)、rating(评分)、user(用户)、location(位置)等。',
    input_schema: {
      type: 'object',
      properties: {
        operation: { type: 'string', description: '操作类型：create_base(创建多维表格) / add_table(新建数据表+字段) / list_tables(查看表列表) / list_fields(查看字段) / add_fields(给已有表添加字段) / search(搜索记录) / add_record(添加单条记录) / add_records(批量添加记录) / update_record(更新记录)' },
        name: { type: 'string', description: '新建多维表格时的名称（create_base时用）' },
        table_name: { type: 'string', description: '新建数据表的名称（add_table时用）' },
        folder_token: { type: 'string', description: '新建时的文件夹token（可选）' },
        app_token: { type: 'string', description: '多维表格的app_token' },
        table_id: { type: 'string', description: '数据表的table_id' },
        fields: { type: 'array', items: { type: 'object' }, description: '字段数组，每项{ field_name: "字段名", type: "text/number/email等" }。add_table和add_fields时使用' },
        record: { type: 'object', description: '单条记录的fields对象，字段名须与表中字段一致（add_record/update_record时用）' },
        records: { type: 'array', items: { type: 'object' }, description: '批量记录数组，每项{ fields: {...} }（add_records时用）' },
      },
      required: ['operation'],
    },
  },
  {
    name: 'feishu_search_contacts',
    description: '搜索飞书通讯录中的联系人。',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: '搜索关键词' } },
      required: ['query'],
    },
  },
  {
    name: 'feishu_send_to_me',
    description: '发送消息到当前用户在飞书的聊天窗口。用户说"给我发消息"、"发到飞书"、"通知我"时调用此工具。无需指定接收人。',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '要发送的消息内容' },
      },
      required: ['content'],
    },
  },
  {
    name: 'feishu_check_permissions',
    description: '检测飞书应用的所有权限状态，列出哪些API可用、哪些需要配置。用户问"飞书能做什么"或连接有问题时调用。',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'feishu_set_my_identity',
    description: '搜索并设定用户的飞书身份。当CC不知道用户的飞书open_id时调用此工具搜索。用户说"设定我的飞书身份"、"我是飞书上的XXX"时调用。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '用户名或关键词搜索飞书通讯录' },
      },
      required: ['query'],
    },
  },
  {
    name: 'feishu_select_identity',
    description: '从搜索结果中选择一个联系人作为用户的飞书身份。搜索返回多个结果时，用户选择第几个就调用此工具。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '之前搜索的关键词（用于重新搜索）' },
        index: { type: 'number', description: '选择的序号（1-based）' },
      },
      required: ['query', 'index'],
    },
  },
  {
    name: 'feishu_send_image',
    description: '上传图片并发送到飞书。用户说"把这个图片发到飞书"、"发这张图给我"时调用。支持：1)本地图片文件路径 2)data:image开头的base64数据URI 3)上下文中的截图临时文件路径。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '本地图片文件路径，如 C:/Users/lenovo/Desktop/photo.jpg' },
        receive_id_type: { type: 'string', description: '接收者类型：open_id/chat_id（可选，默认发给自己）' },
        receive_id: { type: 'string', description: '接收者ID（可选，默认发给自己）' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'feishu_send_file',
    description: '上传本地文件并发送到飞书。用户说"把这个文件发到飞书"、"发这份文档给我"时调用。需要先知道文件路径。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '本地文件路径' },
        file_name: { type: 'string', description: '文件名（可选，默认取路径中的文件名）' },
        receive_id_type: { type: 'string', description: '接收者类型：open_id/chat_id（可选）' },
        receive_id: { type: 'string', description: '接收者ID（可选）' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'feishu_read_document',
    description: '读取飞书云文档的完整内容。用户发来飞书文档链接或要求查看文档时调用。支持云文档(docx)、思维导图(mindnote)。传入文档URL自动解析，也可直接传document_id。',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '飞书文档链接，如 https://xxx.feishu.cn/docx/ABCD' },
        document_id: { type: 'string', description: '文档ID，如已知可直接传入' },
      },
    },
  },
  {
    name: 'feishu_download_resource',
    description: '从飞书消息中下载文件或图片。当用户通过飞书发送文件/图片给CC，CC需要查看内容时调用。需要提供消息的message_id和file_key（可从飞书消息上下文中获取）。file_name从消息上下文中的fileName获取。',
    input_schema: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: '飞书消息ID' },
        file_key: { type: 'string', description: '文件/图片的file_key' },
        type: { type: 'string', description: '类型：file 或 image' },
        file_name: { type: 'string', description: '原始文件名，从消息上下文的fileName获取（如"报告.xlsx"），用于保留正确的中文文件名' },
      },
      required: ['message_id', 'file_key'],
    },
  },
  {
    name: 'feishu_import_to_cloud_doc',
    description: '将已下载到本地的文件导入为飞书云文档（如将.xls/.xlsx导入为飞书电子表格，将.docx导入为飞书文档）。当用户要求"转为云文档"、"导入飞书"、"转换为在线文档"时调用。需要先通过feishu_download_resource下载文件，然后将返回的filePath传给此工具。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '已下载文件的本地路径（从feishu_download_resource返回的filePath获取）' },
        target_type: { type: 'string', description: '目标云文档类型：sheet(电子表格) 或 docx(文档)。不填则根据文件扩展名自动判断。' },
      },
      required: ['file_path'],
    },
  },
];

export const FEISHU_EXECUTORS = {
  feishu_send_message: feishuSendMessage,
  feishu_message_summary: feishuMessageSummary,
  feishu_create_doc: feishuCreateDoc,
  feishu_base_operation: feishuBaseOperation,
  feishu_search_contacts: feishuSearchContacts,
  feishu_send_to_me: feishuSendToMe,
  feishu_check_permissions: feishuCheckPermissions,
  feishu_set_my_identity: feishuSetMyIdentity,
  feishu_select_identity: feishuSelectIdentity,
  feishu_send_image: feishuSendImage,
  feishu_send_file: feishuSendFile,
  feishu_read_document: feishuReadDocument,
  feishu_download_resource: feishuDownloadResource,
  feishu_import_to_cloud_doc: feishuImportToCloudDoc,
};
