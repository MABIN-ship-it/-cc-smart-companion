/**
 * 飞书智能任务扫描器 — LLM 驱动的任务发现引擎
 *
 * 从飞书所有数据源（IM消息、多维表格、任务API、审批、日历、邮件）中
 * 自动发现用户被分配的任务，使用AI语义理解替代正则匹配。
 */
import { isFeishuConfigured, getChatList, getMessageList } from './feishu';
import { sendModelRequest, getCurrentModel, getApiKey } from './modelAdapter';
import {
  getTaskList,
  getApprovalList,
  getApprovalPendingList,
  getEvents,
  searchMails,
} from './feishuApiExtended';

const TASK_BOOK_KEY = 'cc_feishu_task_book';
const MAX_TASKS = 50;

// ─── 任务簿持久化 ─────────────────────────────────

function loadTaskBook() {
  try {
    const data = localStorage.getItem(TASK_BOOK_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function saveTaskBook(tasks) {
  try {
    const trimmed = tasks.slice(0, MAX_TASKS);
    localStorage.setItem(TASK_BOOK_KEY, JSON.stringify(trimmed));
  } catch {}
}

// ─── 数据采集层 ─────────────────────────────────────

/**
 * 从全部飞书数据源并行采集上下文
 */
async function collectFeishuContext() {
  const ctx = { messages: [], approvals: [], tasks: [], events: [], errors: [] };

  // IM 消息（前 5 个群，每个 30 条）
  try {
    const chats = await getChatList({ pageSize: 100 });
    const targetChats = (chats || []).slice(0, 5);
    for (const chat of targetChats) {
      try {
        const msgs = await getMessageList(chat.chat_id, 'chat', { pageSize: 30 });
        if (msgs?.items?.length) {
          ctx.messages.push({
            chatName: chat.name || '未知群',
            chatId: chat.chat_id,
            items: msgs.items.map(m => ({
              msgId: m.message_id,
              sender: m.sender?.id || '未知',
              text: extractMsgText(m),
              time: new Date(parseInt(m.create_time) * 1000).toLocaleString(),
            })),
          });
        }
      } catch (e) { ctx.errors.push(`群消息(${chat.name}): ${e.message}`); }
    }
  } catch (e) { ctx.errors.push(`群列表: ${e.message}`); }

  // 待审批
  try {
    const approvals = await getApprovalPendingList({ pageSize: 20 });
    if (approvals?.items?.length) {
      ctx.approvals = approvals.items.map(a => ({
        id: a.instance_id || a.id,
        title: a.title || a.instance_name || '',
        status: a.status || 'pending',
        from: a.originator_name || a.originator_id || '',
        time: a.create_time || '',
      }));
    }
  } catch (e) { ctx.errors.push(`审批: ${e.message}`); }

  // 飞书任务
  try {
    const taskResult = await getTaskList({ pageSize: 20 });
    if (taskResult?.items?.length) {
      ctx.tasks = taskResult.items.map(t => ({
        id: t.id || t.task_id,
        summary: t.summary || '',
        dueDate: t.due_date || '',
        priority: t.priority || 'normal',
        completed: t.completed || false,
      }));
    }
  } catch (e) { ctx.errors.push(`任务API: ${e.message}`); }

  // 日历日程（未来7天）
  try {
    const now = Math.floor(Date.now() / 1000);
    const weekLater = now + 7 * 86400;
    const calendars = await import('./feishuApiExtended').then(m => m.getCalendarList());
    if (calendars?.length) {
      for (const cal of calendars.slice(0, 3)) {
        try {
          const evts = await getEvents(cal.calendar_id, { startTime: String(now), endTime: String(weekLater) });
          if (evts?.items?.length) {
            ctx.events.push(...evts.items.map(e => ({
              calendarName: cal.summary || '',
              summary: e.summary || '',
              start: e.start_time?.date_time || e.start_time?.date || '',
              end: e.end_time?.date_time || e.end_time?.date || '',
              description: (e.description || '').slice(0, 200),
            })));
          }
        } catch {}
      }
    }
  } catch { /* 日历权限可能未配置 */ }

  // 邮件（最近未读）
  try {
    const mails = await searchMails({ pageSize: 10 });
    if (mails?.items?.length) {
      ctx.mails = mails.items.map(m => ({
        id: m.id,
        subject: m.subject || '',
        from: m.from || '',
        time: m.date || '',
        snippet: (m.snippet || m.body || '').slice(0, 200),
      }));
    }
  } catch { /* 邮件权限可能未配置 */ }

  return ctx;
}

function extractMsgText(msg) {
  const body = msg.body?.content || '';
  try {
    const parsed = JSON.parse(body);
    if (parsed.text) return parsed.text;
    if (parsed.elements) return parsed.elements.map(e => e.text_run?.content || '').join('');
    return body.slice(0, 300);
  } catch { return body.slice(0, 300); }
}

// ─── LLM 分析层 ─────────────────────────────────────

/**
 * 使用 LLM 分析飞书上下文，提取待完成任务
 */
async function analyzeWithLLM(contextText) {
  const model = getCurrentModel();
  const apiKey = getApiKey(model);
  if (!apiKey) {
    // 无 API Key 时回退到正则
    return fallbackRegexScan(contextText);
  }

  const prompt = `你是飞书任务分析专家。从以下飞书数据中提取所有与"我"相关的待完成任务。

## 规则
1. 提取所有@我、安排给我、分配给我的任务
2. 识别消息中的截止日期、优先级
3. 识别审批中需要我处理的实例
4. 识别飞书任务API中我负责的未完成任务
5. 识别日历中需要我参加的会议（含议程）
6. 不要提取已经完成的、别人负责的、或泛泛的群公告

## 飞书数据上下文
${contextText.slice(0, 6000)}

## 输出格式（纯JSON数组，不要其他文字）
[
  {
    "title": "任务概述（15字以内）",
    "description": "详细描述",
    "source": "群聊/私聊/审批/飞书任务/日历/邮件",
    "sourceName": "来源群名/审批标题等",
    "senderName": "指派者",
    "deadline": "截止日期（YYYY-MM-DD或'未明确'）",
    "priority": "high/medium/low",
    "suggestedAction": "create_report/create_doc/fill_base/approve/reply/remind/ignore"
  }
]
如果没有任务，返回空数组 []。`;

  try {
    const result = await sendModelRequest({
      model,
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: '你是飞书任务分析专家。只返回JSON数组，不要解释。',
      tools: [],
      maxTokens: 2000,
      temperature: 0.3,
      signal: AbortSignal.timeout(30000),
    });

    const text = result?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch {
    return fallbackRegexScan(contextText);
  }
}

// ─── 回退：正则扫描 ───────────────────────────────

const TASK_PATTERNS = [
  { pattern: /@我\s*(?:帮|请|安排|负责|处理|写|做|完成|提交|整理|汇总|跟进)/, type: 'assignment', priority: 'high' },
  { pattern: /(?:@我|@所有人).*(?:完成|提交|填写|更新|处理|截止|DDL)/, type: 'group_action', priority: 'high' },
  { pattern: /(?:今天|明天|周五|周[一二三四五六日])\s*(?:前|之前|交|提交|完成|做完|截止)/, type: 'deadline', priority: 'medium' },
  { pattern: /(?:帮我|麻烦你|请你|你来)\s*(?:写|做|整理|汇总|分析|回复|处理|跟进|安排)/, type: 'assignment', priority: 'medium' },
  { pattern: /(?:任务|待办|TODO|action\s*item)\s*[:：]/i, type: 'todo', priority: 'medium' },
  { pattern: /(?:审批|申请|报销|请假).*(?:通过|驳回|待处理|审批中)/, type: 'approval', priority: 'medium' },
  { pattern: /(?:日历|日程|会议|开会).*(?:明天|下午|上午|今天|周[一二三四五六日])/, type: 'calendar', priority: 'low' },
];

function fallbackRegexScan(text) {
  const tasks = [];
  const lines = text.split(/[。！？\n]/);
  for (const line of lines) {
    if (line.length < 8) continue;
    for (const { pattern, type, priority } of TASK_PATTERNS) {
      if (pattern.test(line)) {
        const exists = tasks.find(t => t.title === line.trim().slice(0, 30));
        if (!exists) {
          tasks.push({
            title: line.trim().slice(0, 30),
            description: line.trim(),
            source: 'IM消息',
            sourceName: '飞书',
            senderName: '',
            deadline: '未明确',
            priority,
            suggestedAction: type === 'approval' ? 'approve' : type === 'deadline' ? 'create_report' : 'create_doc',
          });
        }
        break;
      }
    }
  }
  return tasks;
}

// ─── 主扫描函数 ─────────────────────────────────────

/**
 * 全量扫描：采集数据 → LLM分析 → 去重 → 保存任务簿
 */
export async function scanAll() {
  if (!isFeishuConfigured()) {
    return { scanned: false, reason: 'not_configured', tasks: [] };
  }

  try {
    const ctx = await collectFeishuContext();

    // 构建上下文字符串
    let contextText = '';

    if (ctx.messages.length > 0) {
      contextText += '\n## IM群聊消息\n';
      for (const chat of ctx.messages) {
        contextText += `\n### ${chat.chatName}\n`;
        for (const m of chat.items) {
          contextText += `[${m.time}] ${m.sender}: ${m.text}\n`;
        }
      }
    }

    if (ctx.approvals.length > 0) {
      contextText += '\n## 待审批\n';
      ctx.approvals.forEach(a => {
        contextText += `- [${a.id}] ${a.title}（来自: ${a.from}）\n`;
      });
    }

    if (ctx.tasks.length > 0) {
      contextText += '\n## 飞书任务\n';
      ctx.tasks.forEach(t => {
        contextText += `- ${t.summary}（截止: ${t.dueDate} 优先级: ${t.priority}）\n`;
      });
    }

    if (ctx.events.length > 0) {
      contextText += '\n## 日历日程\n';
      ctx.events.forEach(e => {
        contextText += `- ${e.start} ${e.summary}（${e.calendarName}）\n`;
      });
    }

    if (ctx.mails?.length > 0) {
      contextText += '\n## 邮件\n';
      ctx.mails.forEach(m => {
        contextText += `- ${m.subject}（来自: ${m.from}）\n`;
      });
    }

    if (!contextText.trim()) {
      return { scanned: true, tasks: [], message: '飞书中暂无新数据' };
    }

    const newTasks = await analyzeWithLLM(contextText);

    // 去重 — 与已有任务簿比对
    const existingTasks = loadTaskBook();
    const merged = mergeTasks(existingTasks, newTasks);
    saveTaskBook(merged);

    return {
      scanned: true,
      tasks: merged.filter(t => t.status !== 'dismissed'),
      count: merged.filter(t => t.status !== 'dismissed').length,
      newCount: newTasks.length,
      errors: ctx.errors,
    };
  } catch (e) {
    return { scanned: true, tasks: loadTaskBook(), error: `扫描异常: ${e.message}` };
  }
}

/**
 * 单条消息实时检测（收到飞书消息时调用）
 */
export async function scanMessage(text, msgContext = {}) {
  if (!text || text.length < 15) return null;

  const contextText = `单条飞书消息:\n发送者: ${msgContext.senderName || '未知'}\n内容: ${text}`;
  const tasks = await analyzeWithLLM(contextText);

  if (tasks?.length > 0) {
    const taskBook = loadTaskBook();
    const merged = mergeTasks(taskBook, tasks);
    saveTaskBook(merged);
    return tasks[0];
  }
  return null;
}

// ─── 任务簿管理 ─────────────────────────────────────

function mergeTasks(existing, newTasks) {
  const merged = [...existing];

  for (const nt of newTasks) {
    const dup = merged.find(t =>
      t.title === nt.title ||
      (t.description && nt.description && similarity(t.description, nt.description) > 0.7)
    );
    if (!dup) {
      merged.push({
        ...nt,
        id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        detectedAt: Date.now(),
        status: 'new',
      });
    }
  }

  return merged;
}

function similarity(a, b) {
  const setA = new Set(a.slice(0, 200).split(''));
  const setB = new Set(b.slice(0, 200).split(''));
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function getTaskBook() {
  return loadTaskBook();
}

export function updateTaskStatus(taskId, status) {
  const tasks = loadTaskBook();
  const task = tasks.find(t => t.id === taskId);
  if (task) { task.status = status; task.updatedAt = Date.now(); }
  saveTaskBook(tasks);
  return tasks;
}

export function dismissTask(taskId) {
  return updateTaskStatus(taskId, 'dismissed');
}

export function acceptTask(taskId) {
  return updateTaskStatus(taskId, 'accepted');
}

// ─── 调度器 ─────────────────────────────────────

const SCAN_HOURS = [9, 11, 15, 17, 19, 24];
let scanTimers = [];

export function startScheduledScan(onTasksDetected) {
  stopScheduledScan();

  // 启动后 10 秒首次扫描
  setTimeout(async () => {
    const result = await scanAll();
    if (result.tasks?.length > 0) onTasksDetected(result.tasks);
  }, 10000);

  // 定时扫描
  scanTimers.push(
    setInterval(async () => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      // 在目标小时的第0-5分钟窗口内触发（避免重复触发）
      if (SCAN_HOURS.includes(hour) && minute < 5) {
        const result = await scanAll();
        if (result.tasks?.length > 0) onTasksDetected(result.tasks);
      }
    }, 5 * 60 * 1000) // 每5分钟检查一次
  );
}

export function stopScheduledScan() {
  scanTimers.forEach(t => clearInterval(t));
  scanTimers = [];
}
