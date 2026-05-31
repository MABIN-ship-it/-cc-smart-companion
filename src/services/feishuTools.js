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
  getDefaultReceiveContext, getFeishuTenantDomain,
} from './feishu';
import { getWorkspaceContext } from './toolRegistry';
import { feishuCliCommand, executeCommandSequence } from './feishuCli';

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
  // 如果未指定接收人：优先默认会话 → 回退到当前用户
  if (!receive_id) {
    try {
      const def = getDefaultReceiveContext();
      if (def) {
        receive_id = def.receiveId;
        receive_id_type = def.receiveIdType;
      } else {
        receive_id = await getMyOpenId();
        receive_id_type = 'open_id';
      }
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

/** 字段类型名 → 飞书数字类型（完整映射） */
const FIELD_TYPE_MAP = {
  // 基础类型
  text: 1,            // 多行文本
  number: 2,          // 数字
  single_select: 3,   // 单选
  select: 3,          // 单选（别名）
  multi_select: 4,    // 多选
  datetime: 5,        // 日期时间
  date: 5,            // 日期（别名）
  checkbox: 7,        // 复选框
  // 人员与群组
  user: 10,           // 人员
  group_chat: 30,     // 群聊
  created_user: 31,   // 创建人
  modified_user: 32,  // 修改人
  // 富媒体
  attachment: 11,     // 附件
  image: 12,          // 图片
  // 链接与关联
  url: 13,            // 链接
  link: 15,           // 单向关联
  duplex_link: 14,    // 双向关联
  // 高级字段
  rating: 18,         // 评分
  formula: 20,        // 公式
  lookup: 21,         // 查找引用
  currency: 22,       // 货币
  phone: 23,          // 电话号码
  email: 24,          // 邮箱
  location: 25,       // 地理位置
  barcode: 29,        // 条码
  // 自动字段
  auto_number: 26,    // 自动编号
  created_time: 27,   // 创建时间
  modified_time: 28,  // 修改时间
  // 其他
  progress: 1001,     // 进度
  percent: 1001,      // 百分比（别名）
};

/** 反向映射: 数字类型 → 类型名 */
const FIELD_TYPE_REVERSE = Object.fromEntries(
  Object.entries(FIELD_TYPE_MAP).map(([name, code]) => [code, name])
);

/** 类型到示例值的映射（用于提示） */
const FIELD_TYPE_EXAMPLES = {
  text: '示例文本',
  number: 123,
  select: '选项A',
  multi_select: '选项A,选项B',
  date: '2026-01-01',
  checkbox: true,
  attachment: 'file_token_xxx',
  image: 'img_xxx',
  url: 'https://example.com',
  rating: 5,
  currency: 100.00,
  phone: '13800138000',
  email: 'user@example.com',
  location: '上海市浦东新区',
  progress: 50,
  auto_number: 1,
  barcode: '6901234567890',
};

function normalizeFields(rawFields) {
  return (rawFields || []).map(f => ({
    field_name: f.field_name || f.name || '',
    type: typeof f.type === 'number' ? f.type : (FIELD_TYPE_MAP[f.type] || 1),
  }));
}

/**
 * 根据样本值自动推断字段类型
 * @param {string} fieldName 字段名
 * @param {Array} sampleValues 样本值数组
 * @returns {string} 推断的类型名
 */
export function inferFieldType(fieldName, sampleValues) {
  const values = sampleValues.filter(v => v !== null && v !== undefined && v !== '');
  if (values.length === 0) return 'text';

  const nameLower = (fieldName || '').toLowerCase();

  // 名称启发式 → 中文关键词
  if (/电话|phone|手机|tel|mobile|座机/i.test(nameLower)) return 'phone';
  if (/邮箱|email|邮件|mail/i.test(nameLower)) return 'email';
  if (/链接|url|网址|link/i.test(nameLower)) return 'url';
  if (/日期|时间|date|time|日/i.test(nameLower)) return 'date';
  if (/金额|价格|费用|金额|price|amount|cost|money/i.test(nameLower)) return 'currency';
  if (/进度|完成|progress|百分比|percent/i.test(nameLower)) return 'progress';
  if (/评分|rating|star|星级/i.test(nameLower)) return 'rating';
  if (/位置|地址|location|addr/i.test(nameLower)) return 'location';
  if (/负责人|创建人|修改人|owner|creator|updater|user/i.test(nameLower)) return 'user';
  if (/选项|状态|select|status/i.test(nameLower)) return 'select';
  if (/多选|标签|tags|multi/i.test(nameLower)) return 'multi_select';
  if (/图片|image|photo|照片|头像|avatar/i.test(nameLower)) return 'image';
  if (/附件|attachment|文件|file|文档/i.test(nameLower)) return 'attachment';
  if (/编号|number|id|序号|auto/i.test(nameLower)) return 'number';

  // 值启发式
  const allNumbers = values.every(v => !isNaN(Number(v)) && v !== '' && typeof v !== 'boolean');
  if (allNumbers) {
    const nums = values.map(v => Number(v));
    // 全是0-100的整数，可能是进度
    if (nums.every(n => Number.isInteger(n) && n >= 0 && n <= 100)) return 'number';
    // 小数点可能是货币
    if (nums.some(n => !Number.isInteger(n))) return 'number';
    return 'number';
  }

  // 日期格式检测
  if (values.some(v => String(v).match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/))) return 'date';
  if (values.some(v => String(v).match(/\d{1,2}[-/]\d{1,2}[-/]\d{4}/))) return 'date';

  // URL检测
  if (values.some(v => String(v).match(/^https?:\/\//))) return 'url';

  // 邮箱检测
  if (values.some(v => String(v).match(/^[\w.-]+@[\w.-]+\.\w+$/))) return 'email';

  // 手机号检测
  if (values.some(v => String(v).match(/^1[3-9]\d{9}$/))) return 'phone';

  // 布尔检测
  const truthy = ['是', '否', 'true', 'false', 'yes', 'no'];
  const uniqueLower = [...new Set(values.map(v => String(v).toLowerCase().trim()))];
  if (uniqueLower.length <= 3 && uniqueLower.every(v => truthy.includes(v) || v === '1' || v === '0')) return 'checkbox';

  return 'text';
}

/** 获取所有支持的字段类型列表 */
export function getSupportedFieldTypes() {
  return Object.entries(FIELD_TYPE_MAP).map(([name, code]) => ({
    name, code, example: FIELD_TYPE_EXAMPLES[name] || '',
  }));
}

/** 验证字段类型值是否合法 */
export function isValidFieldType(type) {
  return FIELD_TYPE_MAP[type] !== undefined || Object.values(FIELD_TYPE_MAP).includes(type);
}

/** 解析中文日期格式为 ISO 日期字符串（毫秒时间戳） */
function parseChineseDate(raw) {
  const s = String(raw).trim();
  // 已经是 ISO 格式: 2024-01-15
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  // 2024/1/15
  const slash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slash) return `${slash[1]}-${String(slash[2]).padStart(2,'0')}-${String(slash[3]).padStart(2,'0')}`;
  // 2024年1月15日
  const cn = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?/);
  if (cn) return `${cn[1]}-${String(cn[2]).padStart(2,'0')}-${String(cn[3]).padStart(2,'0')}`;
  // 1月15日 (无年份)
  const md = s.match(/^(\d{1,2})月(\d{1,2})日?$/);
  if (md) return `${new Date().getFullYear()}-${String(md[1]).padStart(2,'0')}-${String(md[2]).padStart(2,'0')}`;
  // Excel 日期序列号（整数）
  if (/^\d{5}$/.test(s)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ts = excelEpoch + parseInt(s) * 86400000;
    const dt = new Date(ts);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }
  return null;
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
    if (!app_token || !table_id || !record) return '请提供 app_token、table_id 和 record(字段对象)';
    try {
      // 自动标准化：接受 {fields:{...}} 或 直接的 {...}
      const fields = record.fields || record;
      const result = await addBaseRecord(app_token, table_id, fields);
      return `记录已添加，record_id: ${result.record?.record_id || 'unknown'}`;
    } catch (e) {
      return `添加记录失败: ${e.message}。请先用 list_fields 确认表中字段名。`;
    }
  }

  if (operation === 'add_records') {
    if (!app_token || !table_id) return '请提供 app_token 和 table_id';
    const { records } = input || {};
    if (!records?.length) return '请提供 records 数组';
    try {
      const normalized = records.map(r => ({ fields: r.fields || r }));
      const result = await batchAddBaseRecords(app_token, table_id, normalized);
      const batchInfo = result.batches > 1 ? `（分${result.batches}批写入）` : '';
      if (result.inserted === 0) {
        const errDetail = result.errors?.length ? ` 错误详情: ${result.errors.join('; ')}` : '';
        const suggestion = !errDetail ? ' 建议先用 list_fields 操作确认表中字段名和类型是否匹配。' : '';
        return `批量添加失败：请求了 ${result.requested} 条，实际写入 0 条。${errDetail}${suggestion}`;
      }
      if (result.inserted < result.requested) {
        const errDetail = result.errors?.length ? ` 部分错误: ${result.errors.join('; ')}` : '';
        return `部分写入成功${batchInfo}：请求 ${result.requested} 条，实际写入 ${result.inserted} 条（${result.requested - result.inserted} 条失败）。${errDetail}`;
      }
      return `成功写入全部 ${result.inserted} 条记录${batchInfo}。`;
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
    // 优先默认会话 → 回退到当前用户 open_id
    const def = getDefaultReceiveContext();
    let receiveIdType, receiveId;
    if (def) {
      receiveIdType = def.receiveIdType;
      receiveId = def.receiveId;
    } else {
      const myId = await getMyOpenId();
      if (!myId) {
        return '无法确定你的飞书身份。请尝试以下方法：\n'
          + '1. 在工具箱→飞书配置→点击"搜索我的飞书号"\n'
          + '2. 或者告诉我你的飞书名字，我帮你搜索，例如"搜索飞书联系人 张三"\n'
          + '3. 找到后告诉我"设定我的飞书身份为XXX"';
      }
      receiveIdType = 'open_id';
      receiveId = myId;
    }
    const result = await sendMessage(receiveIdType, receiveId, content);
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

    // 本地文件路径先验证文件存在
    if (!file_path.startsWith('data:image/')) {
      const exists = await window.electronAPI.fileExists?.(file_path);
      if (!exists) return `图片文件不存在: ${file_path}`;
    }

    let uploadResult;
    if (file_path.startsWith('data:image/')) {
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

    // 验证文件落盘
    const fileExists = await window.electronAPI.fileExists?.(result.filePath);
    if (!fileExists) return `下载失败: 文件未能保存到磁盘 (${result.filePath})`;
    if (result.fileSize === 0) return `下载的文件为空 (${result.fileName})`;

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

// ─── 工具：Excel转为多维表格 ────────────────────────

export async function feishuConvertExcelToBitable(input) {
  const { file_path, base_name, folder_token } = input || {};
  if (!file_path) return '请提供Excel文件路径(file_path)。';

  const resolvedPath = resolveFilePath(file_path);
  const { parseExcelForBitable } = await import('./excelParser');

  const parseResult = await parseExcelForBitable(resolvedPath);
  if (!parseResult.success) return `Excel解析失败: ${parseResult.error}`;
  if (parseResult.sheets.length === 0) return 'Excel文件中没有可读取的工作表。';

  const baseName = base_name || resolvedPath.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '');
  let appToken;
  try {
    const baseResult = await createBase(baseName, folder_token);
    appToken = baseResult.app?.app_token;
    if (!appToken) return '创建多维表格失败：未获取到app_token。';
  } catch (e) {
    return `创建多维表格失败: ${e.message}`;
  }

  const results = [];
  for (let i = 0; i < parseResult.sheets.length; i++) {
    const sheet = parseResult.sheets[i];
    const tableName = sheet.name || `Sheet${i + 1}`;

    try {
      const fieldsToCreate = sheet.fields.slice(0, 100);
      const normalizedFields = normalizeFields(fieldsToCreate);
      const tableResult = await addTable(appToken, tableName, normalizedFields);
      const tableId = tableResult?.table?.table_id;
      if (!tableId) {
        const apiErr = tableResult?.msg || tableResult?.error || JSON.stringify(tableResult).slice(0, 100);
        results.push(`表"${tableName}": 创建失败 (API返回: ${apiErr})`);
        continue;
      }

      const recordsToWrite = sheet.records.slice(0, 5000);
      if (recordsToWrite.length > 0) {
        // 获取表的字段类型用于值清洗
        let fieldTypes = {};
        try {
          const fieldResult = await listTableFields(appToken, tableId);
          (fieldResult?.items || []).forEach(f => {
            fieldTypes[f.field_name] = f.type;
          });
        } catch {}

        // 值清洗：根据字段类型转换值
        const cleanedRecords = recordsToWrite.map(record => {
          const cleanFields = {};
          for (const [key, value] of Object.entries(record.fields || {})) {
            const raw = String(value ?? '').trim();
            if (!raw || raw === 'undefined' || raw === 'null' || raw === 'NaN') continue;

            const fieldType = fieldTypes[key];
            if (!fieldType) { cleanFields[key] = raw; continue; }

            // 根据字段类型清洗值
            switch (fieldType) {
              case 2: // number
              case 22: // currency
                const num = parseFloat(raw.replace(/[¥$€£,\s]/g, ''));
                cleanFields[key] = isNaN(num) ? raw : num;
                break;
              case 5: // date
                // 尝试解析中文日期格式如 "2024年1月"、"2024/1/1"、"1月1日"
                const d = parseChineseDate(raw);
                if (d) { cleanFields[key] = d; } else { cleanFields[key] = raw; }
                break;
              case 18: // rating
                const rating = parseInt(raw);
                cleanFields[key] = (rating >= 0 && rating <= 5) ? rating : raw;
                break;
              case 1001: // progress
                const pct = parseFloat(raw);
                cleanFields[key] = (pct >= 0 && pct <= 100) ? pct : raw;
                break;
              case 7: // checkbox
                const t = raw.toLowerCase();
                if (t === 'true' || t === '是' || t === 'yes' || t === '1' || t === '✓' || t === '√') cleanFields[key] = true;
                else if (t === 'false' || t === '否' || t === 'no' || t === '0' || t === '✗' || t === '×') cleanFields[key] = false;
                else cleanFields[key] = raw;
                break;
              default:
                cleanFields[key] = raw;
            }
          }
          return Object.keys(cleanFields).length > 0 ? { fields: cleanFields } : null;
        }).filter(Boolean);

        const batchResult = await batchAddBaseRecords(appToken, tableId, cleanedRecords);
        results.push(`表"${tableName}": ${batchResult.inserted}/${batchResult.requested} 条记录${batchResult.errors ? ' (部分失败)' : ''}`);
      } else {
        results.push(`表"${tableName}": 创建成功（无数据行）`);
      }
    } catch (e) {
      results.push(`表"${tableName}": 失败 - ${e.message}`);
    }
  }

  let tenantDomain;
  try { tenantDomain = await getFeishuTenantDomain(); } catch { tenantDomain = 'bytedance'; }
  const url = `https://${tenantDomain}.feishu.cn/base/${appToken}`;
  sendCreationNotification('多维表格', baseName, url).catch(() => {});

  let response = `Excel已转换为飞书多维表格！\n名称：${baseName}\n链接：${url}\n\n各表结果：\n${results.map(r => `- ${r}`).join('\n')}`;
  if (parseResult.sheets.length > 1) response += `\n共 ${parseResult.sheets.length} 个工作表。`;
  return response;
}

// ─── 工具：创建视图 ───────────────────────────────

export async function feishuCreateViews(input) {
  const { app_token, table_id, view_types, group_field, date_field } = input || {};
  if (!app_token || !table_id) return '请提供 app_token 和 table_id';

  let types = view_types;
  if (!types || types.length === 0) {
    try {
      const { createDefaultViews, listTableFields, recommendViewTypes } = await import('./feishu');
      const fieldResult = await listTableFields(app_token, table_id);
      types = recommendViewTypes(fieldResult?.items || []);
    } catch { types = ['grid']; }
  }

  try {
    const { createDefaultViews, getFieldIdMap, listTableFields } = await import('./feishu');

    let groupFieldId = group_field;
    let dateFieldId = date_field;

    if (types.includes('kanban') && !groupFieldId) {
      const fieldResult = await listTableFields(app_token, table_id);
      const selectField = (fieldResult?.items || []).find(f => f.type === 3 || f.type === 4);
      groupFieldId = selectField?.field_id;
    }
    if (types.includes('calendar') && !dateFieldId) {
      const fieldResult = await listTableFields(app_token, table_id);
      const dateField = (fieldResult?.items || []).find(f => f.type === 5);
      dateFieldId = dateField?.field_id;
    }

    const viewResult = await createDefaultViews(app_token, table_id, {
      viewTypes: types, groupFieldId, dateFieldId,
    });

    let response = `视图创建结果：\n`;
    response += viewResult.created.map(v => `✅ ${v}视图`).join('\n');
    if (viewResult.errors.length > 0) {
      response += '\n' + viewResult.errors.map(e => `⚠️ ${e}`).join('\n');
    }
    return response;
  } catch (e) {
    return `创建视图失败: ${e.message}`;
  }
}

// ─── 工具：业务场景识别 ─────────────────────────────

export async function feishuDetectBusinessScene(input) {
  const { file_path } = input || {};
  if (!file_path) return '请提供文件路径(file_path)';

  const resolvedPath = resolveFilePath(file_path);
  try {
    const { parseExcelForBitable } = await import('./excelParser');
    const { detectBusinessScene } = await import('./bitableTemplates');

    const parseResult = await parseExcelForBitable(resolvedPath);
    if (!parseResult.success) return `文件解析失败: ${parseResult.error}`;

    const sceneResult = detectBusinessScene(parseResult.sheets);
    const firstSheet = parseResult.sheets[0];

    let response = `文件分析结果：\n`;
    response += `- 工作表数: ${parseResult.sheets.length}\n`;
    if (firstSheet) {
      response += `- 表头字段(${firstSheet.headerRow.length}个): ${firstSheet.headerRow.join(', ')}\n`;
      response += `- 数据行数: ${firstSheet.rowCount}\n`;
    }
    response += `\n业务场景识别：\n`;
    if (sceneResult.confidence >= 0.3) {
      response += `- 最可能: ${sceneResult.name}（置信度 ${Math.round(sceneResult.confidence * 100)}%）\n`;
      response += `- 匹配关键词: ${sceneResult.matchedKeywords.join(', ')}\n`;
      if (sceneResult.template) {
        response += `- 推荐视图: ${sceneResult.template.views.join(', ')}\n`;
      }
      if (sceneResult.suggestions.length > 1) {
        response += `- 其他可能: ${sceneResult.suggestions.slice(1).map(s => s.scene + '(' + Math.round(s.confidence * 100) + '%)').join(', ')}`;
      }
    } else {
      response += `- 未匹配到特定业务场景，使用通用表格模板\n`;
    }
    return response;
  } catch (e) {
    return `场景识别失败: ${e.message}`;
  }
}

// ─── 工具：创建仪表盘 ──────────────────────────────

export async function feishuCreateDashboard(input) {
  const { app_token, table_id, dashboard_name } = input || {};
  if (!app_token || !table_id) return '请提供 app_token 和 table_id';

  try {
    const { createDashboard, generateDefaultDashboardComponents, listTableFields, getFieldIdMap } = await import('./feishu');
    const fieldResult = await listTableFields(app_token, table_id);
    const fields = fieldResult?.items || [];
    if (fields.length === 0) return '数据表没有字段，无法创建仪表盘。请先添加字段和数据。';

    const components = generateDefaultDashboardComponents(fields, table_id);
    const result = await createDashboard(app_token, table_id, dashboard_name || '数据概览', components);

    if (result.success && result.dashboardId) {
      const componentTypes = components.map(c => c.type === 'statistic' ? '统计卡片' : c.config?.chart_type === 'pie' ? '饼图' : '柱状图');
      return `仪表盘"${dashboard_name || '数据概览'}"已创建！\ndashboard_id: ${result.dashboardId}\n自动生成了 ${components.length} 个组件: ${componentTypes.join(', ')}`;
    }
    return `创建仪表盘失败: ${result.error || '未知错误'}`;
  } catch (e) {
    return `创建仪表盘失败: ${e.message}`;
  }
}

// ─── 新工具：CLI调度 ─────────────────────────

export async function feishuCliExecute(input) {
  const { command } = input || {};
  if (!command) return '请提供 command 参数。';
  try {
    const result = await feishuCliCommand({ command });
    if (result.success) {
      const data = result.data || result.text || '';
      return typeof data === 'string' ? data : JSON.stringify(data, null, 2).slice(0, 4000);
    }
    return `CLI执行失败: ${result.error}`;
  } catch (e) {
    return `CLI异常: ${e.message}`;
  }
}

export async function feishuCreateBitable(input) {
  const { name, description, fields, records } = input || {};
  if (!name && !description) return '请提供表格名称(name)或描述(description)。';

  try {
    const tableName = name || (description || '').split(/[,，、\n]/)[0].slice(0, 50).replace(/[建創]一个?|表[格單]|帮我|请[求你]?/g, '').trim() || '数据表';

    // 1. 建多维表格（CLI，纯字符串参数稳定）
    let bt;
    try {
      const r = await feishuCliCommand({ command: ['base', '+base-create', '--name', tableName] });
      bt = (r.data?.data || r.data)?.base?.base_token;
    } catch {}
    if (!bt) {
      // 回退：原生API建表
      const r = await createBase(tableName);
      bt = r?.app?.app_token || r?.data?.app?.app_token;
    }
    if (!bt) return '创建多维表格失败，请重试。';

    // 2. 原生API建表+字段（不走CLI，JSON可靠性100%）
    const fieldDefs = fields || buildFieldsFromDescription(description || name || '');
    const normalizedFields = normalizeFields(fieldDefs);

    let tid;
    try {
      const tableRes = await feishuApi('POST', `/bitable/v1/apps/${bt}/tables`, {
        table: { name: tableName, fields: normalizedFields },
      });
      tid = tableRes?.data?.table?.table_id || tableRes?.data?.table_id;
    } catch {}
    if (!tid) return `创建数据表失败。多维表格已建: https://{feishu_tenant}/base/${bt}`;

    // 3. 删默认空表（可选）
    try {
      const existing = await feishuApi('GET', `/bitable/v1/apps/${bt}/tables`);
      const items = existing?.data?.items || [];
      for (const t of items) {
        if (t.table_id !== tid && t.name === '数据表') {
          await feishuApi('DELETE', `/bitable/v1/apps/${bt}/tables/${t.table_id}`).catch(()=>{});
        }
      }
    } catch {}

    // 4. 批量写数据
    let recs = records;
    if (typeof recs === 'string') { try { recs = JSON.parse(recs); } catch {} }
    if (typeof fields === 'string') { try { fields = JSON.parse(fields); } catch {} }

    let wroteCount = 0;
    if (recs && Array.isArray(recs) && recs.length > 0) {
      try {
        const normalized = recs.map(r => ({ fields: r.fields || r }));
        const batchResult = await batchAddBaseRecords(bt, tid, normalized);
        wroteCount = batchResult?.inserted || 0;
        if (batchResult?.errors) console.warn('[feishu_create_bitable] 写入异常:', batchResult.errors);
      } catch (e) {
        console.error('[feishu_create_bitable] 批量写入失败:', e.message);
      }
    }

    // 5. 创建默认视图
    feishuCliCommand({ command: ['base', '+view-create', '--base-token', bt, '--table-id', tid, '--name', '表格视图', '--type', 'grid'] }).catch(()=>{});

    const url = `https://{feishu_tenant}/base/${bt}`;
    const recInfo = wroteCount > 0 ? `，${wroteCount}条记录已导入` : '';
    return `多维表格已创建！\n📊 ${tableName}\n🔗 ${url}${recInfo}`;
  } catch (e) {
    return `创建失败: ${e.message}`;
  }
}

// ─── 工具：批量写记录到已有表 ────────────────

export async function feishuWriteRecords(input) {
  const { app_token, table_id, records } = input || {};
  if (!app_token || !table_id) return '请提供 app_token 和 table_id';
  if (!records) return '请提供 records 数组';

  try {
    let recs = records;
    if (typeof recs === 'string') { try { recs = JSON.parse(recs); } catch {} }
    if (!Array.isArray(recs) || recs.length === 0) return 'records 格式错误，需要数组';

    const normalized = recs.map(r => ({ fields: r.fields || r }));
    const result = await batchAddBaseRecords(app_token, table_id, normalized);
    if (result.inserted === 0) {
      const err = result.errors?.join('; ') || '未知错误';
      return `写入失败：${result.requested}条请求，0条成功。错误: ${err}`;
    }
    return `✅ ${result.inserted}/${result.requested} 条记录写入成功`;
  } catch (e) {
    return `写入异常: ${e.message}`;
  }
}

function buildFieldsFromDescription(desc) {
  // 从描述中提取关键词映射到字段类型
  const keywordMap = [
    { pattern: /电话|手机|tel|phone/i, type: 'text' },
    { pattern: /邮箱|email|邮件|mail/i, type: 'text' },
    { pattern: /日期|时间|date|time/i, type: 'datetime' },
    { pattern: /金额|价格|费用|金额|price|amount|cost|money/i, type: 'number' },
    { pattern: /进度|完成|progress|百分比|percent/i, type: 'number' },
    { pattern: /状态|阶段|status|stage/i, type: 'select' },
    { pattern: /负责人|人员|user|owner|assignee/i, type: 'user' },
    { pattern: /附件|文件|file|attachment/i, type: 'attachment' },
    { pattern: /链接|url|link|网址/i, type: 'text' },
    { pattern: /备注|说明|描述|note|desc|remark/i, type: 'text' },
  ];

  const items = desc.split(/[,，、\n;；]+/).filter(s => s.trim().length > 1 && s.trim().length < 20);
  const fields = items.map(item => {
    const fname = item.replace(/[含包]有?|字段|列/g, '').trim();
    if (!fname || fname.length > 20) return null;
    const matched = keywordMap.find(k => k.pattern.test(fname));
    return { field_name: fname, type: matched ? matched.type : 'text' };
  }).filter(Boolean);

  if (fields.length === 0) {
    fields.push({ field_name: '名称', type: 'text' });
  }
  return JSON.stringify(fields);
}

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
    description: '查看飞书多维表格（只读诊断）。创建/建表/加字段/批量写数据等写操作请用 feishu_cli 或 feishu_create_bitable。',
    input_schema: {
      type: 'object',
      properties: {
        operation: { type: 'string', description: '操作类型：list_tables(查看表列表) / list_fields(查看字段) / search(搜索记录) / add_record(添加单条记录) / update_record(更新记录)。注意：建表/加字段/批量写请用feishu_cli' },
        app_token: { type: 'string', description: '多维表格的app_token' },
        table_id: { type: 'string', description: '数据表的table_id' },
        record: { type: 'object', description: '单条记录的fields对象（add_record/update_record时用）' },
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
    description: '将已下载到本地的文件导入为飞书云文档（如将.xls/.xlsx导入为飞书电子表格，将.docx导入为飞书文档）。⚠️ 老xls文件的GBK/GB2312编码问题用此工具解决——飞书服务器自动处理编码转换，比你写Python解析强100倍。参数是file_path（本地路径），不是file_key。需要先通过feishu_download_resource下载文件拿到filePath。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '已下载文件的本地路径（从feishu_download_resource返回的filePath获取）' },
        target_type: { type: 'string', description: '目标云文档类型：sheet(电子表格) 或 docx(文档)。不填则根据文件扩展名自动判断。' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'feishu_create_dashboard',
    description: '为多维表格数据表自动创建仪表盘，包含统计卡片、图表等组件。当用户说"生成仪表盘"、"创建统计面板"时调用。',
    input_schema: {
      type: 'object',
      properties: {
        app_token: { type: 'string', description: '多维表格的app_token' },
        table_id: { type: 'string', description: '数据表的table_id' },
        dashboard_name: { type: 'string', description: '仪表盘名称（可选，默认"数据概览"）' },
      },
      required: ['app_token', 'table_id'],
    },
  },
  {
    name: 'feishu_write_records',
    description: '向已有飞书多维表格批量写入记录。建完表后数据写不进去时用这个，别再逐条写或用CLI。',
    input_schema: {
      type: 'object',
      properties: {
        app_token: { type: 'string', description: '多维表格app_token' },
        table_id: { type: 'string', description: '数据表table_id' },
        records: { type: 'array', items: { type: 'object' }, description: '记录数组 [{fields:{字段名:值}}]' },
      },
      required: ['app_token', 'table_id', 'records'],
    },
  },
  {
    name: 'feishu_cli',
    description: `飞书官方 CLI 工具。可操作多维表格/文档/日历/消息/知识库等全部飞书资源。
【硬规则-必须遵守】
1. 所有多维表格命令以 base 开头，禁止写成 table/field/record/view
2. +record-batch-create 的 --json 必须用 {"records":[...]} 格式
3. 建表用 base +table-create --fields 一步创建表+字段
4. 完成任务后只输出总结+链接，不逐条展示中间命令输出

常用命令:
  建多维表格: base +base-create --name "名称"
  一键建表(含字段): base +table-create --base-token X --name "表名" --fields '[{"field_name":"字段","type":"text"}]'
  列字段: base +field-list --base-token X --table-id X
  加字段: base +field-create --base-token X --table-id X --json '{"field_name":"名","type":"text"}'
  批量写: base +record-batch-create --base-token X --table-id X --json '[{"fields":{}}]'
  搜索记录: base +record-search --base-token X --table-id X --json '{}'
  建视图: base +view-create --base-token X --table-id X --name "名" --type grid
  建仪表盘: base +dashboard-create --base-token X --name "名"
  写文档(Markdown): docs +create --title "标题" --markdown "# 内容"
  搜文档: docs +search --query "关键词" --as user
  发消息: im +messages-send --receive-id-type open_id --receive-id ou_xxx --msg-type text --content '{"text":"消息"}'
  通用API: api POST /open-apis/xxx --data '{}'
字段类型(字符串): text number select datetime checkbox user attachment link formula lookup auto_number
所有操作均用Bot身份。输出默认JSON。可用--help查看完整选项。`,
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'CLI命令(不含lark-cli前缀)，如 base +base-create --name "表格"' },
      },
      required: ['command'],
    },
  },
  {
    name: 'feishu_create_bitable',
    description: `创建飞书多维表格并导入数据，一步到位返回链接。支持自然语言描述或结构化字段。
字段类型: text number select datetime checkbox user attachment link formula lookup auto_number`,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '表格名称' },
        description: { type: 'string', description: '表格需求描述（自然语言，自动解析字段类型）。电话→text, 日期→datetime, 金额→number, 状态→select, 负责人→user等' },
        fields: { type: 'array', items: { type: 'object' }, description: '字段数组 [{field_name:"名称",type:"text"}]，已有结构化数据时传' },
        records: { type: 'array', items: { type: 'object' }, description: '记录数组 [{fields:{...}}]，已有数据时传' },
      },
      required: [],
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
  feishu_cli: feishuCliExecute,
  feishu_create_bitable: feishuCreateBitable,
  feishu_write_records: feishuWriteRecords,
};
