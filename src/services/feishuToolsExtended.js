/**
 * 飞书扩展 AI 工具 — 任务执行、日历、审批、知识库、邮件、妙记
 *
 * 注册到 toolRegistry，让 LLM 能真正替用户完成飞书任务。
 */
import {
  executeCreateReport,
  executeCreateDoc,
  executeCreateMindMap,
  executeApproval,
  executeReplyMessage,
  executeTask,
} from './feishuTaskExecutor';
import {
  getCalendarList, getEvents, createEvent, getBusyTime,
  getTaskList, createTask, updateTask, getTaskDetail,
  getApprovalList, getApprovalPendingList, approveInstance, rejectInstance, transferInstance, getInstanceDetail,
  listWikiSpaces, getWikiNode, searchWiki,
  listMailboxes, searchMails, sendMail,
  searchMinutes, getMinutesInfo, getMinutesAISummary, getMinutesAITodos,
} from './feishuApiExtended';
import { scanAll } from './feishuTaskScanner';
import { isFeishuConfigured, sendCreationNotification } from './feishu';
import { sendModelRequest, getCurrentModel, getApiKey } from './modelAdapter';

// ─── 辅助：检查飞书连接 ───────────────────────────

function ensureConnected() {
  if (!isFeishuConfigured()) {
    return { ok: false, error: '飞书未连接，请先在工具箱中配置飞书凭证' };
  }
  return { ok: true };
}

// ─── 工具：创建报告（日报/周报/月报）────────────────

export async function feishuCreateReport(input) {
  const conn = ensureConnected();
  if (!conn.ok) return conn.error;

  const task = {
    title: input.title || '未命名报告',
    description: input.description || input.content || '',
    sourceName: '用户通过CC创建',
    deadline: input.deadline || '未明确',
    source: 'CC',
    suggestedAction: 'create_report',
  };

  try {
    const result = await executeCreateReport(task);
    sendCreationNotification('报告', result.title, result.url).catch(() => {});
    return `报告已生成！
标题：${result.title}
飞书文档链接：${result.url || '创建失败'}
文档ID：${result.documentId || '无'}`;
  } catch (e) {
    return `报告生成失败: ${e.message}`;
  }
}

// ─── 工具：创建方案文档 ──────────────────────────

export async function feishuCreateProposal(input) {
  const conn = ensureConnected();
  if (!conn.ok) return conn.error;

  const task = {
    title: input.title || '未命名方案',
    description: input.description || input.content || '',
    sourceName: '用户通过CC创建',
    source: 'CC',
    suggestedAction: 'create_doc',
  };

  try {
    const result = await executeCreateDoc(task);
    sendCreationNotification('方案', result.title, result.url).catch(() => {});
    return `方案已生成！
标题：${result.title}
飞书文档链接：${result.url || '创建失败'}
文档ID：${result.documentId || '无'}`;
  } catch (e) {
    return `方案生成失败: ${e.message}`;
  }
}

// ─── 工具：创建思维导图 ──────────────────────────

export async function feishuCreateMindmap(input) {
  const conn = ensureConnected();
  if (!conn.ok) return conn.error;

  const task = {
    title: input.title || '思维导图',
    description: input.description || input.content || '',
    source: 'CC',
    suggestedAction: 'create_mindmap',
  };

  try {
    const result = await executeCreateMindMap(task);
    sendCreationNotification('思维导图', result.title, result.url).catch(() => {});
    return `思维导图已创建！
标题：${result.title}
节点数：${result.nodes?.length || 0}
飞书妙记ID：${result.mindNoteId || '无'}`;
  } catch (e) {
    return `思维导图创建失败: ${e.message}`;
  }
}

// ─── 工具：处理审批 ──────────────────────────────

export async function feishuApprovalHandle(input) {
  const conn = ensureConnected();
  if (!conn.ok) return conn.error;

  const { action, instance_id, comment } = input || {};

  // 查询模式：列出待审批
  if (action === 'list' || action === 'pending') {
    try {
      const result = await getApprovalPendingList({ pageSize: 20 });
      const items = result?.tasks || result?.data?.tasks || [];
      if (items.length === 0) return '当前没有待处理的审批。';
      return `待处理审批（共${items.length}条）：\n${items.map((a, i) =>
        `${i + 1}. [${a.id || a.instance_id}] ${a.title || a.instance_name || '未知'} — 来自: ${a.originator_name || a.originator_id || '未知'}`
      ).join('\n')}`;
    } catch (e) {
      return `获取审批列表失败: ${e.message}`;
    }
  }

  // 分析模式：AI 分析审批
  if (action === 'analyze') {
    if (!instance_id) return '请提供审批实例ID（instance_id）';
    try {
      const detail = await getInstanceDetail(instance_id);
      const task = {
        title: detail?.title || detail?.instance_name || '审批',
        description: JSON.stringify(detail || {}),
        sourceName: '飞书审批',
        suggestedAction: 'approve',
      };
      const analysis = await executeApproval(task);
      return `审批分析：
建议：${analysis.suggestion === 'approve' ? '✅ 通过' : '❌ 拒绝'}
理由：${analysis.reason}
（请使用 action=approve 或 action=reject 执行）`;
    } catch (e) {
      return `审批分析失败: ${e.message}`;
    }
  }

  // 执行模式
  if (action === 'approve' || action === 'reject' || action === 'transfer') {
    if (!instance_id) return '请提供审批实例ID（instance_id）';
    try {
      if (action === 'approve') {
        await approveInstance(instance_id, comment || '同意');
        return `审批已通过：${instance_id}`;
      }
      if (action === 'reject') {
        await rejectInstance(instance_id, comment || '拒绝');
        return `审批已拒绝：${instance_id}`;
      }
      if (action === 'transfer') {
        const { user_id } = input;
        if (!user_id) return '转交审批需要提供 user_id';
        await transferInstance(instance_id, user_id, comment || '');
        return `审批已转交：${instance_id} → ${user_id}`;
      }
    } catch (e) {
      return `审批操作失败: ${e.message}`;
    }
  }

  // 无操作模式：AI 分析并自动执行（用户要求全自动）
  if (!action) {
    if (!instance_id) return '请提供 action (list/analyze/approve/reject/transfer) 或 instance_id';
    try {
      const detail = await getInstanceDetail(instance_id);
      const task = {
        title: detail?.title || detail?.instance_name || '审批',
        description: JSON.stringify(detail || {}),
        sourceName: '飞书审批',
        suggestedAction: 'approve',
      };
      const analysis = await executeApproval(task);

      // 自动执行
      if (analysis.suggestion === 'approve') {
        await approveInstance(instance_id, `CC自动审批：${analysis.reason}`);
        return `审批已自动通过：${instance_id}\n理由：${analysis.reason}`;
      } else {
        await rejectInstance(instance_id, `CC自动拒绝：${analysis.reason}`);
        return `审批已自动拒绝：${instance_id}\n理由：${analysis.reason}`;
      }
    } catch (e) {
      return `自动审批失败: ${e.message}`;
    }
  }

  return `不支持的操作: ${action}。可选: list / analyze / approve / reject / transfer`;
}

// ─── 工具：日历管理 ──────────────────────────────

export async function feishuCalendarSchedule(input) {
  const conn = ensureConnected();
  if (!conn.ok) return conn.error;

  const { action, calendar_id, start_time, end_time, summary, description, attendees } = input || {};

  if (action === 'list_calendars') {
    try {
      const calendars = await getCalendarList();
      if (calendars.length === 0) return '未找到日历。';
      return `日历列表（共${calendars.length}个）：\n${calendars.map((c, i) =>
        `${i + 1}. ${c.summary || '未命名'}（ID: ${c.calendar_id}）`
      ).join('\n')}`;
    } catch (e) {
      return `获取日历列表失败: ${e.message}`;
    }
  }

  if (action === 'view_events') {
    if (!calendar_id) return '请提供日历ID（calendar_id）。先用 list_calendars 获取。';
    try {
      const result = await getEvents(calendar_id, {
        startTime: start_time || String(Math.floor(Date.now() / 1000)),
        endTime: end_time || String(Math.floor(Date.now() / 1000) + 7 * 86400),
      });
      const items = result?.items || [];
      if (items.length === 0) return '该日历在指定时间范围内无日程。';
      return `日程列表（共${items.length}条）：\n${items.map((e, i) =>
        `${i + 1}. ${e.summary || '未命名'}\n   时间：${e.start_time?.date_time || e.start_time?.date || ''} → ${e.end_time?.date_time || e.end_time?.date || ''}\n   描述：${(e.description || '无').slice(0, 100)}`
      ).join('\n')}`;
    } catch (e) {
      return `获取日程失败: ${e.message}`;
    }
  }

  if (action === 'create_event') {
    if (!calendar_id) return '请提供日历ID（calendar_id）';
    if (!summary) return '请提供日程标题（summary）';
    if (!start_time || !end_time) return '请提供开始时间（start_time）和结束时间（end_time）';
    try {
      const event = { summary, description: description || '', startTime: start_time, endTime: end_time, attendees: attendees || [] };
      const result = await createEvent(calendar_id, event);
      return `日程已创建：${summary}\n时间：${start_time} → ${end_time}\nID：${result?.event_id || '未知'}`;
    } catch (e) {
      return `创建日程失败: ${e.message}`;
    }
  }

  if (action === 'busy_time') {
    const { user_ids } = input || {};
    if (!user_ids?.length) return '请提供要查询的用户ID列表（user_ids）';
    try {
      const busyList = await getBusyTime(user_ids, { startTime: start_time, endTime: end_time });
      return `忙闲查询结果：\n${JSON.stringify(busyList, null, 2)}`;
    } catch (e) {
      return `忙闲查询失败: ${e.message}`;
    }
  }

  return '请指定操作（action）：list_calendars / view_events / create_event / busy_time';
}

// ─── 工具：飞书任务管理 ──────────────────────────

export async function feishuTaskManage(input) {
  const conn = ensureConnected();
  if (!conn.ok) return conn.error;

  const { action, task_id, summary, description, due_date, priority, assignee_id } = input || {};

  if (action === 'list') {
    try {
      const result = await getTaskList({ pageSize: 30, completed: false });
      const items = result?.items || [];
      if (items.length === 0) return '当前没有未完成的飞书任务。';
      return `飞书任务列表（共${items.length}条）：\n${items.map((t, i) =>
        `${i + 1}. ${t.summary || '未命名'} [${t.priority || 'normal'}]\n   截止：${t.due_date || '无'} | ID：${t.id || t.task_id}`
      ).join('\n')}`;
    } catch (e) {
      return `获取任务列表失败: ${e.message}`;
    }
  }

  if (action === 'create') {
    if (!summary) return '请提供任务标题（summary）';
    try {
      const task = { summary, description: description || '', dueDate: due_date || '', priority: priority || 'normal', assigneeId: assignee_id };
      const result = await createTask(task);
      return `飞书任务已创建：${summary}\nID：${result?.task?.id || result?.id || '未知'}`;
    } catch (e) {
      return `创建任务失败: ${e.message}`;
    }
  }

  if (action === 'update') {
    if (!task_id) return '请提供任务ID（task_id）';
    try {
      await updateTask(task_id, { summary, description, due_date, priority });
      return `任务已更新：${task_id}`;
    } catch (e) {
      return `更新任务失败: ${e.message}`;
    }
  }

  if (action === 'detail') {
    if (!task_id) return '请提供任务ID（task_id）';
    try {
      const detail = await getTaskDetail(task_id);
      return `任务详情：\n${JSON.stringify(detail, null, 2)}`;
    } catch (e) {
      return `获取任务详情失败: ${e.message}`;
    }
  }

  return '请指定操作（action）：list / create / update / detail';
}

// ─── 工具：知识库搜索 ─────────────────────────────

export async function feishuWikiSearch(input) {
  const conn = ensureConnected();
  if (!conn.ok) return conn.error;

  const { action, query, space_id, node_token } = input || {};

  if (action === 'list_spaces') {
    try {
      const spaces = await listWikiSpaces();
      if (spaces.length === 0) return '未找到知识空间。';
      return `知识空间列表（共${spaces.length}个）：\n${spaces.map((s, i) =>
        `${i + 1}. ${s.name || '未命名'}（ID：${s.space_id}）`
      ).join('\n')}`;
    } catch (e) {
      return `获取知识空间列表失败: ${e.message}`;
    }
  }

  if (action === 'search') {
    if (!query) return '请提供搜索关键词（query）';
    try {
      const results = await searchWiki(query, space_id);
      if (results.length === 0) return `未找到与"${query}"相关的知识库内容。`;
      return `搜索结果（共${results.length}条）：\n${results.map((r, i) =>
        `${i + 1}. ${r.title || '无标题'}\n   ${(r.content || r.snippet || '').slice(0, 150)}`
      ).join('\n')}`;
    } catch (e) {
      return `搜索知识库失败: ${e.message}`;
    }
  }

  if (action === 'get_node') {
    if (!node_token) return '请提供节点token（node_token）';
    try {
      const node = await getWikiNode(node_token);
      return `知识库节点内容：\n${JSON.stringify(node, null, 2)}`;
    } catch (e) {
      return `获取节点失败: ${e.message}`;
    }
  }

  return '请指定操作（action）：list_spaces / search / get_node';
}

// ─── 工具：发送邮件 ──────────────────────────────

export async function feishuMailSend(input) {
  const conn = ensureConnected();
  if (!conn.ok) return conn.error;

  const { action, to, subject, body, cc, query } = input || {};

  if (action === 'list_mailboxes') {
    try {
      const mailboxes = await listMailboxes();
      if (mailboxes.length === 0) return '未找到可用的邮箱。';
      return `可用邮箱：\n${mailboxes.map((m, i) =>
        `${i + 1}. ${m.email || m.name || '未知'}`
      ).join('\n')}`;
    } catch (e) {
      return `获取邮箱列表失败: ${e.message}`;
    }
  }

  if (action === 'search') {
    try {
      const result = await searchMails({ query, pageSize: 20 });
      const items = result?.items || [];
      if (items.length === 0) return query ? `未找到与"${query}"相关的邮件。` : '未找到邮件。';
      return `邮件列表（共${items.length}条）：\n${items.map((m, i) =>
        `${i + 1}. ${m.subject || '无主题'} — 来自: ${m.from || '未知'}（${m.date || ''}）`
      ).join('\n')}`;
    } catch (e) {
      return `搜索邮件失败: ${e.message}`;
    }
  }

  // 发送邮件
  if (!to) return '请提供收件人（to）、主题（subject）和正文（body）';
  if (!subject) return '请提供邮件主题（subject）';
  if (!body) return '请提供邮件正文（body）';

  try {
    await sendMail({ to: Array.isArray(to) ? to : [to], subject, body, cc: cc || [] });
    return `邮件已发送！
收件人：${Array.isArray(to) ? to.join(', ') : to}
主题：${subject}`;
  } catch (e) {
    return `发送邮件失败: ${e.message}`;
  }
}

// ─── 工具：妙记搜索与分析 ─────────────────────────

export async function feishuMinutesSearch(input) {
  const conn = ensureConnected();
  if (!conn.ok) return conn.error;

  const { action, query, minute_id } = input || {};

  if (action === 'search') {
    if (!query) return '请提供搜索关键词（query）';
    try {
      const minutes = await searchMinutes({ query, pageSize: 20 });
      if (minutes.length === 0) return `未找到与"${query}"相关的妙记。`;
      return `妙记搜索结果（共${minutes.length}条）：\n${minutes.map((m, i) =>
        `${i + 1}. ${m.topic || m.title || '无标题'}（ID：${m.minute_id || m.id}）`
      ).join('\n')}`;
    } catch (e) {
      return `搜索妙记失败: ${e.message}`;
    }
  }

  if (action === 'get_info') {
    if (!minute_id) return '请提供妙记ID（minute_id）';
    try {
      const info = await getMinutesInfo(minute_id);
      return `妙记详情：\n${JSON.stringify(info, null, 2)}`;
    } catch (e) {
      return `获取妙记详情失败: ${e.message}`;
    }
  }

  if (action === 'get_summary') {
    if (!minute_id) return '请提供妙记ID（minute_id）';
    try {
      const summary = await getMinutesAISummary(minute_id);
      return `妙记AI总结：\n${summary.summary || summary.content || JSON.stringify(summary)}`;
    } catch (e) {
      return `获取妙记总结失败: ${e.message}`;
    }
  }

  if (action === 'get_todos') {
    if (!minute_id) return '请提供妙记ID（minute_id）';
    try {
      const todos = await getMinutesAITodos(minute_id);
      if (!todos?.todos?.length && !todos?.items?.length) return '该妙记中未找到待办事项。';
      const items = todos.todos || todos.items || [];
      return `妙记待办事项：\n${items.map((t, i) =>
        `${i + 1}. ${t.content || t.text || JSON.stringify(t)}`
      ).join('\n')}`;
    } catch (e) {
      return `获取妙记待办失败: ${e.message}`;
    }
  }

  return '请指定操作（action）：search / get_info / get_summary / get_todos';
}

// ─── 工具：手动触发任务扫描 ──────────────────────

export async function feishuScanTasks() {
  const conn = ensureConnected();
  if (!conn.ok) return conn.error;

  try {
    const result = await scanAll();
    if (!result.scanned) return `扫描未执行：${result.reason || '未知原因'}`;

    const activeTasks = result.tasks || [];
    if (activeTasks.length === 0) {
      return '扫描完成！飞书中暂未检测到新的待处理任务。';
    }

    const highTasks = activeTasks.filter(t => t.priority === 'high');
    const mediumTasks = activeTasks.filter(t => t.priority === 'medium');

    let output = `扫描完成！检测到 ${activeTasks.length} 个任务：\n`;
    if (highTasks.length > 0) {
      output += `\n🔴 高优先级（${highTasks.length}个）：\n`;
      highTasks.forEach((t, i) => {
        output += `${i + 1}. ${t.title} [${t.suggestedAction}]\n   来源：${t.sourceName || t.source} | 截止：${t.deadline || '未明确'}\n`;
      });
    }
    if (mediumTasks.length > 0) {
      output += `\n🟡 中优先级（${mediumTasks.length}个）：\n`;
      mediumTasks.forEach((t, i) => {
        output += `${i + 1}. ${t.title} [${t.suggestedAction}]\n   来源：${t.sourceName || t.source} | 截止：${t.deadline || '未明确'}\n`;
      });
    }

    return output;
  } catch (e) {
    return `任务扫描失败: ${e.message}`;
  }
}

// ─── 工具定义（给 LLM 的 schema）─────────────────

export const FEISHU_EXTENDED_TOOLS = [
  {
    name: 'feishu_create_report',
    description: '在飞书自动生成报告（日报/周报/月报/项目报告）。AI自动搜集信息、起草内容、创建飞书文档。用户说"写周报"、"生成报告"时调用。',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '报告标题，如"Q2项目周报"' },
        description: { type: 'string', description: '报告要求、范围、重点等补充说明' },
        deadline: { type: 'string', description: '截止日期（可选）' },
      },
      required: ['title'],
    },
  },
  {
    name: 'feishu_create_proposal',
    description: '在飞书自动撰写工作方案/提案文档。AI自动分析背景、制定执行步骤、评估风险、创建飞书文档。用户说"写方案"、"做个提案"时调用。',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '方案标题，如"新功能上线方案"' },
        description: { type: 'string', description: '方案背景、目标、要求等补充说明' },
      },
      required: ['title'],
    },
  },
  {
    name: 'feishu_create_mindmap',
    description: '在飞书创建思维导图。AI自动将内容结构化，生成节点树。用户说"画思维导图"、"整理成脑图"时调用。',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '思维导图主题' },
        content: { type: 'string', description: '要结构化呈现的内容' },
        description: { type: 'string', description: '补充说明（与content二选一即可）' },
      },
      required: ['title'],
    },
  },
  {
    name: 'feishu_approval_handle',
    description: '处理飞书审批：查看待审批列表、分析审批内容、通过/拒绝/转交审批。用户说"处理审批"、"通过那个申请"时调用。不传action时自动分析并执行。',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作：list(查看待审批) / analyze(AI分析建议) / approve(通过) / reject(拒绝) / transfer(转交)' },
        instance_id: { type: 'string', description: '审批实例ID（analyze/approve/reject/transfer需要）' },
        comment: { type: 'string', description: '审批意见（可选）' },
        user_id: { type: 'string', description: '转交目标用户ID（仅transfer需要）' },
      },
    },
  },
  {
    name: 'feishu_calendar_schedule',
    description: '管理飞书日历：查看日历列表、查看日程、创建日程、查询忙闲。用户说"看下我的日历"、"帮我约个会"、"明天有什么安排"时调用。',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作：list_calendars(日历列表) / view_events(查看日程) / create_event(创建日程) / busy_time(忙闲查询)' },
        calendar_id: { type: 'string', description: '日历ID（view_events/create_event需要）' },
        start_time: { type: 'string', description: '开始时间，Unix时间戳字符串' },
        end_time: { type: 'string', description: '结束时间，Unix时间戳字符串' },
        summary: { type: 'string', description: '日程标题（create_event需要）' },
        description: { type: 'string', description: '日程描述' },
        attendees: { type: 'array', items: { type: 'string' }, description: '参与者ID列表' },
        user_ids: { type: 'array', items: { type: 'string' }, description: '要查询忙闲的用户ID列表（busy_time需要）' },
      },
    },
  },
  {
    name: 'feishu_task_manage',
    description: '管理飞书任务：查看任务列表、创建任务、更新任务、查看任务详情。用户说"看下我的飞书任务"、"创建个任务"时调用。',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作：list(查看任务列表) / create(创建任务) / update(更新任务) / detail(查看详情)' },
        task_id: { type: 'string', description: '任务ID（update/detail需要）' },
        summary: { type: 'string', description: '任务标题（create需要）' },
        description: { type: 'string', description: '任务描述' },
        due_date: { type: 'string', description: '截止日期，格式YYYY-MM-DD' },
        priority: { type: 'string', description: '优先级：high/medium/low/normal' },
        assignee_id: { type: 'string', description: '负责人ID' },
      },
    },
  },
  {
    name: 'feishu_wiki_search',
    description: '搜索飞书知识库：列出知识空间、搜索内容、获取节点详情。用户说"搜索知识库"、"查一下公司Wiki"时调用。',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作：list_spaces(知识空间列表) / search(搜索) / get_node(获取节点内容)' },
        query: { type: 'string', description: '搜索关键词（search需要）' },
        space_id: { type: 'string', description: '知识空间ID（search可选，限定范围）' },
        node_token: { type: 'string', description: '节点token（get_node需要）' },
      },
    },
  },
  {
    name: 'feishu_mail_send',
    description: '管理飞书邮件：查看邮箱、搜索邮件、发送邮件。用户说"发邮件"、"查邮件"时调用。',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作：list_mailboxes(查看邮箱) / search(搜索邮件) 或不传(发送邮件)' },
        to: { type: 'array', items: { type: 'string' }, description: '收件人邮箱列表（发送需要）' },
        subject: { type: 'string', description: '邮件主题（发送需要）' },
        body: { type: 'string', description: '邮件正文（发送需要）' },
        cc: { type: 'array', items: { type: 'string' }, description: '抄送人邮箱列表' },
        query: { type: 'string', description: '搜索关键词（search需要）' },
      },
    },
  },
  {
    name: 'feishu_minutes_search',
    description: '搜索与分板飞书妙记（会议录制）：搜索妙记、查看详情、获取AI总结/待办。用户说"找下会议记录"、"上周的会议总结一下"时调用。',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作：search(搜索) / get_info(查看详情) / get_summary(获取AI总结) / get_todos(获取待办事项)' },
        query: { type: 'string', description: '搜索关键词（search需要）' },
        minute_id: { type: 'string', description: '妙记ID（get_info/get_summary/get_todos需要）' },
      },
    },
  },
  {
    name: 'feishu_scan_tasks',
    description: '扫描飞书所有数据源（群聊、审批、任务、日历、邮件），AI自动发现用户被分配的任务。用户说"扫描任务"、"看看飞书有什么要我做的"时调用。',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

export const FEISHU_EXTENDED_EXECUTORS = {
  feishu_create_report: feishuCreateReport,
  feishu_create_proposal: feishuCreateProposal,
  feishu_create_mindmap: feishuCreateMindmap,
  feishu_approval_handle: feishuApprovalHandle,
  feishu_calendar_schedule: feishuCalendarSchedule,
  feishu_task_manage: feishuTaskManage,
  feishu_wiki_search: feishuWikiSearch,
  feishu_mail_send: feishuMailSend,
  feishu_minutes_search: feishuMinutesSearch,
  feishu_scan_tasks: feishuScanTasks,
};
