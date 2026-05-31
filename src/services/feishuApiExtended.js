/**
 * 飞书扩展 API 封装 — 日历/任务/审批/知识库/邮件/妙记/思维导图
 *
 * 全部通过 feishu.js 的 feishuApi() 函数调用，统一 token 管理和错误处理。
 */
import { feishuApi, getFeishuConfig, getFeishuTenantDomain, getFeishuWebUrl } from './feishu';

const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis';

// ─── 日历 (calendar/v4) ─────────────────────────────

export async function getCalendarList() {
  const result = await feishuApi('GET', '/calendar/v4/calendars');
  return result.data?.calendar_list || [];
}

export async function getEvents(calendarId, { startTime, endTime, pageSize = 50, pageToken } = {}) {
  let path = `/calendar/v4/calendars/${calendarId}/events?page_size=${pageSize}`;
  if (startTime) path += `&start_time=${startTime}`;
  if (endTime) path += `&end_time=${endTime}`;
  if (pageToken) path += `&page_token=${pageToken}`;
  const result = await feishuApi('GET', path);
  return result.data || { items: [] };
}

export async function createEvent(calendarId, event) {
  const body = {
    summary: event.summary,
    description: event.description || '',
    start_time: event.startTime,
    end_time: event.endTime,
    attendees: event.attendees || [],
    need_notification: event.needNotification !== false,
    chat_id: event.chatId,
  };
  const result = await feishuApi('POST', `/calendar/v4/calendars/${calendarId}/events`, body);
  return result.data;
}

export async function getBusyTime(userIds, { startTime, endTime } = {}) {
  const body = { user_ids: userIds };
  if (startTime) body.start_time = startTime;
  if (endTime) body.end_time = endTime;
  const result = await feishuApi('POST', '/calendar/v4/freebusy/list', body);
  return result.data?.freebusy_list || [];
}

// ─── 任务 (task/v2) ─────────────────────────────

export async function getTaskList({ pageSize = 50, pageToken, startTime, endTime, completed } = {}) {
  let path = `/task/v2/tasks?page_size=${pageSize}`;
  if (pageToken) path += `&page_token=${pageToken}`;
  if (startTime) path += `&start_time=${startTime}`;
  if (endTime) path += `&end_time=${endTime}`;
  if (completed !== undefined) path += `&completed=${completed}`;
  const result = await feishuApi('GET', path);
  return result.data || { items: [] };
}

export async function createTask(task) {
  const body = {
    summary: task.summary,
    description: task.description || '',
    due_date: task.dueDate || '',
    start_date: task.startDate || '',
    assignee_id: task.assigneeId,
    completed: task.completed || false,
    priority: task.priority || 'normal',
  };
  const result = await feishuApi('POST', '/task/v2/tasks', body);
  return result.data;
}

export async function updateTask(taskId, data) {
  const result = await feishuApi('PATCH', `/task/v2/tasks/${taskId}`, data);
  return result.data;
}

export async function getTaskDetail(taskId) {
  const result = await feishuApi('GET', `/task/v2/tasks/${taskId}`);
  return result.data;
}

// ─── 审批 (approval/v4) ─────────────────────────────

export async function getApprovalList({ pageSize = 50, pageToken } = {}) {
  let path = `/approval/v4/instances?page_size=${pageSize}`;
  if (pageToken) path += `&page_token=${pageToken}`;
  const result = await feishuApi('GET', path);
  return result.data || { items: [] };
}

export async function approveInstance(instanceId, comment = '') {
  const body = { comment };
  const result = await feishuApi('POST', `/approval/v4/instances/${instanceId}/approve`, body);
  return result.data;
}

export async function rejectInstance(instanceId, comment = '') {
  const body = { comment };
  const result = await feishuApi('POST', `/approval/v4/instances/${instanceId}/reject`, body);
  return result.data;
}

export async function transferInstance(instanceId, userId, comment = '') {
  const body = { user_id: userId, comment };
  const result = await feishuApi('POST', `/approval/v4/instances/${instanceId}/transfer`, body);
  return result.data;
}

export async function getInstanceDetail(instanceId) {
  const result = await feishuApi('GET', `/approval/v4/instances/${instanceId}`);
  return result.data;
}

/**
 * 获取用户待审批的实例列表（审批中心）
 */
export async function getApprovalPendingList({ pageSize = 20, pageToken, userId } = {}) {
  const body = { page_size: pageSize };
  if (pageToken) body.page_token = pageToken;
  if (userId) body.user_id = userId;
  const result = await feishuApi('POST', '/approval/v4/tasks/query', body);
  return result.data || { tasks: [] };
}

// ─── 知识库 (wiki/v2) ─────────────────────────────

export async function listWikiSpaces({ pageSize = 50, pageToken } = {}) {
  let path = `/wiki/v2/spaces?page_size=${pageSize}`;
  if (pageToken) path += `&page_token=${pageToken}`;
  const result = await feishuApi('GET', path);
  return result.data?.items || [];
}

export async function getWikiNode(nodeToken) {
  const result = await feishuApi('GET', `/wiki/v2/spaces/get_node?token=${nodeToken}`);
  return result.data;
}

export async function searchWiki(query, spaceId) {
  const body = { query, space_id: spaceId };
  const result = await feishuApi('POST', '/wiki/v2/search', body);
  return result.data?.items || [];
}

// ─── 邮件 (mail/v1) ─────────────────────────────

export async function listMailboxes() {
  const result = await feishuApi('GET', '/mail/v1/user_mailboxes');
  return result.data?.items || [];
}

export async function searchMails({ query, pageSize = 20, pageToken } = {}) {
  let path = `/mail/v1/user_mailboxes/-/search?page_size=${pageSize}`;
  if (query) path += `&query=${encodeURIComponent(query)}`;
  if (pageToken) path += `&page_token=${pageToken}`;
  const result = await feishuApi('GET', path);
  return result.data || { items: [] };
}

export async function sendMail(mailData) {
  const body = {
    to: mailData.to,
    subject: mailData.subject,
    body: mailData.body,
    cc: mailData.cc || [],
    is_html: mailData.isHtml || false,
  };
  const result = await feishuApi('POST', '/mail/v1/user_mailboxes/-/mails', body);
  return result.data;
}

// ─── 妙记 (minutes/v1) ─────────────────────────────

export async function searchMinutes({ query, pageSize = 20, pageToken } = {}) {
  let path = `/minutes/v1/minutes/search?page_size=${pageSize}`;
  if (query) path += `&query=${encodeURIComponent(query)}`;
  if (pageToken) path += `&page_token=${pageToken}`;
  const result = await feishuApi('GET', path);
  return result.data?.minutes || [];
}

export async function getMinutesInfo(minuteId) {
  const result = await feishuApi('GET', `/minutes/v1/minutes/${minuteId}`);
  return result.data;
}

export async function getMinutesArtifacts(minuteId) {
  const result = await feishuApi('GET', `/minutes/v1/minutes/${minuteId}/artifacts`);
  return result.data || {};
}

/**
 * 获取妙记AI产物：总结、待办事项、章节
 */
export async function getMinutesAISummary(minuteId) {
  const result = await feishuApi('GET', `/minutes/v1/minutes/${minuteId}/artifacts/summary`);
  return result.data || {};
}

export async function getMinutesAITodos(minuteId) {
  const result = await feishuApi('GET', `/minutes/v1/minutes/${minuteId}/artifacts/todos`);
  return result.data || {};
}

// ─── 思维导图 (mind_notes/v1) ─────────────────────────────

/**
 * 创建飞书思维导图
 * @param {string} title 标题
 * @param {Array} nodes 节点列表 [{ text, children: [...] }]
 */
export async function createMindNote(title, nodes = []) {
  function toMindNodes(list) {
    return (list || []).map(n => ({
      content: { text: n.text || n.content || '' },
      children: n.children?.length ? toMindNodes(n.children) : [],
    }));
  }
  const body = {
    title,
    content: { children: toMindNodes(nodes) },
  };
  await getFeishuTenantDomain();
  const result = await feishuApi('POST', '/mind_notes/v1/mind_notes', body);
  const mindNoteId = result.data?.mind_note?.mind_note_id;
  return {
    ...result.data,
    url: mindNoteId ? getFeishuWebUrl('mindnotes', mindNoteId) : undefined,
  };
}

export async function getMindNote(mindNoteId) {
  const result = await feishuApi('GET', `/mind_notes/v1/mind_notes/${mindNoteId}`);
  return result.data;
}

// ─── 导出所有 ─────────────────────────────────────
export default {
  // 日历
  getCalendarList, getEvents, createEvent, getBusyTime,
  // 任务
  getTaskList, createTask, updateTask, getTaskDetail,
  // 审批
  getApprovalList, getApprovalPendingList, approveInstance, rejectInstance, transferInstance, getInstanceDetail,
  // 知识库
  listWikiSpaces, getWikiNode, searchWiki,
  // 邮件
  listMailboxes, searchMails, sendMail,
  // 妙记
  searchMinutes, getMinutesInfo, getMinutesArtifacts, getMinutesAISummary, getMinutesAITodos,
  // 思维导图
  createMindNote, getMindNote,
};
