/**
 * 飞书任务执行引擎 — AI 替用户完成飞书任务
 *
 * 三种执行模式：
 *   auto — 自动执行（低风险任务）
 *   approve — 生成草案→用户审批→执行（重要任务）
 *   suggest — 提供多方案→用户选择→执行（创意任务）
 */
import { createDocument, sendMessage } from './feishu';
import { sendModelRequest, getCurrentModel, getApiKey } from './modelAdapter';
import { createMindNote, approveInstance, rejectInstance } from './feishuApiExtended';

const EXECUTION_LOG_KEY = 'cc_feishu_execution_log';

// ─── 执行记录 ─────────────────────────────────

function logExecution(entry) {
  try {
    const logs = JSON.parse(localStorage.getItem(EXECUTION_LOG_KEY) || '[]');
    logs.unshift({ ...entry, timestamp: Date.now() });
    localStorage.setItem(EXECUTION_LOG_KEY, JSON.stringify(logs.slice(0, 100)));
  } catch {}
}

export function getExecutionLogs() {
  try {
    return JSON.parse(localStorage.getItem(EXECUTION_LOG_KEY) || '[]');
  } catch { return []; }
}

// ─── AI 执行核心 ─────────────────────────────────

async function aiExecute(prompt, { signal, onProgress } = {}) {
  const model = getCurrentModel();
  const apiKey = getApiKey(model);
  if (!apiKey) throw new Error('未配置 AI 模型 API Key');

  const result = await sendModelRequest({
    model,
    messages: [{ role: 'user', content: prompt }],
    systemPrompt: `你是 CC 的执行引擎。根据任务描述直接输出完整成果。不要问用户问题，直接执行。
输出要求：
- 报告/方案类：输出完整Markdown，含标题层级、表格（如需要）、数据引用
- 填表类：输出结构化JSON数据
- 回复消息类：输出简洁自然的中文回复`,
    tools: [],
    maxTokens: 4096,
    temperature: 0.5,
    signal: signal || AbortSignal.timeout(120000),
  });

  return result?.text || '';
}

// ─── 任务执行函数 ─────────────────────────────────

/**
 * 生成报告（日报/周报/月报/项目报告）
 */
export async function executeCreateReport(task, { signal, onProgress } = {}) {
  onProgress?.({ type: 'status', data: '正在收集信息...' });

  const prompt = `请生成一份完整的报告。

## 任务信息
标题：${task.title}
描述：${task.description || '无'}
来源：${task.sourceName || task.source || '飞书'}
截止：${task.deadline || '未明确'}

## 要求
1. 结构完整（标题、摘要、正文、结论）
2. 如涉及数据，使用表格呈现
3. 语言使用中文
4. 如任务信息不完整，合理补充`;

  onProgress?.({ type: 'status', data: '正在起草报告...' });
  const content = await aiExecute(prompt, { signal });

  if (!content) throw new Error('AI 生成报告内容为空');

  onProgress?.({ type: 'status', data: '正在创建飞书文档...' });
  const doc = await createDocument(task.title, content);

  logExecution({ type: 'create_report', task, docId: doc?.documentId, docUrl: doc?.url });

  return {
    type: 'create_report',
    title: task.title,
    content,
    documentId: doc?.documentId,
    url: doc?.url,
  };
}

/**
 * 创建方案文档
 */
export async function executeCreateDoc(task, { signal, onProgress } = {}) {
  onProgress?.({ type: 'status', data: '正在搜索相关资料...' });

  const prompt = `请撰写一份完整的工作方案。

## 任务信息
标题：${task.title}
描述：${task.description || '无'}
来源：${task.sourceName || '飞书'}

## 要求
1. 包含背景分析、目标、执行步骤、时间线、风险评估
2. 使用 Markdown 格式（标题层级、列表、表格）
3. 语言规范专业
4. 逻辑清晰，可落地执行`;

  onProgress?.({ type: 'status', data: '正在撰写方案...' });
  const content = await aiExecute(prompt, { signal });

  if (!content) throw new Error('AI 生成方案内容为空');

  onProgress?.({ type: 'status', data: '正在创建飞书文档...' });
  const doc = await createDocument(task.title, content);

  logExecution({ type: 'create_doc', task, docId: doc?.documentId, docUrl: doc?.url });

  return {
    type: 'create_doc',
    title: task.title,
    content,
    documentId: doc?.documentId,
    url: doc?.url,
  };
}

/**
 * 生成思维导图
 */
export async function executeCreateMindMap(task, { signal, onProgress } = {}) {
  onProgress?.({ type: 'status', data: '正在分析内容结构...' });

  const prompt = `请将以下内容结构化，输出为JSON格式的思维导图节点树。每个节点包含 "text" 和 "children" 字段。

## 任务信息
标题：${task.title}
描述：${task.description || '无'}

## 输出格式（纯JSON，不要其他文字）
{
  "title": "主题",
  "nodes": [
    {"text": "分支1", "children": [{"text": "子节点1"}, {"text": "子节点2"}]},
    {"text": "分支2", "children": [...]}
  ]
}`;

  const content = await aiExecute(prompt, { signal });
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 未生成有效的思维导图结构');

  const mindData = JSON.parse(jsonMatch[0]);
  const nodes = mindData.nodes || mindData.children || [];

  onProgress?.({ type: 'status', data: '正在创建思维导图...' });
  const result = await createMindNote(mindData.title || task.title, nodes);

  logExecution({ type: 'create_mindmap', task, mindData });

  return {
    type: 'create_mindmap',
    title: mindData.title || task.title,
    nodes,
    mindNoteId: result?.mind_note?.mind_note_id,
    url: result?.url,
  };
}

/**
 * 处理审批
 */
export async function executeApproval(task, { signal, onProgress } = {}) {
  onProgress?.({ type: 'status', data: '正在分析审批内容...' });

  const prompt = `分析以下审批并给出建议。

## 审批信息
标题：${task.title}
描述：${task.description || '无'}
来源：${task.sourceName || '飞书'}

## 请分析
1. 审批类型和风险等级
2. 建议通过还是拒绝
3. 给出理由

## 输出格式
{ "action": "approve"|"reject", "reason": "理由" }`;

  const content = await aiExecute(prompt, { signal });
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { action: 'approve', reason: '自动分析' };

  // 注意：实际审批需要用户确认，这里只返回分析建议
  logExecution({ type: 'approve', task, analysis });

  return {
    type: 'approve',
    suggestion: analysis.action,
    reason: analysis.reason,
    requiresConfirmation: true,
  };
}

/**
 * 起草消息回复
 */
export async function executeReplyMessage(task, { signal, onProgress } = {}) {
  const prompt = `请为以下消息起草回复。

## 原始消息
${task.description || task.title}

## 要求
1. 自然、友好、专业
2. 针对消息内容做有意义的回复
3. 中文，50-150字`;

  const reply = await aiExecute(prompt, { signal });

  return {
    type: 'reply',
    reply: reply?.trim() || `收到「${task.title.slice(0, 50)}」，我会尽快处理。`,
  };
}

// ─── 任务分发器 ─────────────────────────────────

const EXECUTOR_MAP = {
  create_report: executeCreateReport,
  create_doc: executeCreateDoc,
  create_mindmap: executeCreateMindMap,
  approve: executeApproval,
  reply: executeReplyMessage,
  fill_base: null, // 需 app_token 和 table_id，LLM 调用 feishu_base_operation
  remind: null,    // 简单提醒，不需要执行引擎
  ignore: null,    // 忽略
};

/**
 * 根据任务类型自动执行
 * @returns 执行结果，或 null（如果无法自动执行）
 */
export async function executeTask(task, options = {}) {
  const executor = EXECUTOR_MAP[task.suggestedAction];
  if (!executor) {
    return {
      type: 'skipped',
      reason: `任务类型 "${task.suggestedAction}" 暂不支持自动执行`,
      suggestion: '建议让 LLM 通过 feishuTools 手动处理此任务',
    };
  }

  try {
    const result = await executor(task, options);
    return { success: true, ...result };
  } catch (e) {
    logExecution({ type: 'error', task, error: e.message });
    return { success: false, error: e.message, task };
  }
}

/**
 * 获取任务执行建议（给 LLM 看）
 */
export function getTaskExecutionHints() {
  return {
    create_report: '调用 execute_create_report → 自动生成报告 → 创建飞书文档',
    create_doc: '调用 execute_create_doc → 自动撰写方案 → 创建飞书文档',
    create_mindmap: '调用 execute_create_mindmap → 自动结构化 → 创建思维导图',
    approve: '调用 execute_approve → AI分析 → 建议通过/拒绝',
    reply: '调用 execute_reply → AI起草回复',
    fill_base: '调用 feishu_base_operation 工具手动操作多维表格',
    remind: '通知用户即可，无需执行',
  };
}
