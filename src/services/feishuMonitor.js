/**
 * 飞书主动监测引擎
 *
 * CC 持续监听飞书消息流 → 识别任务 → 能力匹配 → 主动询问用户
 *
 * 定时扫描：
 *   - 每日 11:00 / 15:00 / 19:00 自动扫描
 *   - 每次飞书连接建立时立即扫描
 */

import { getFeishuConfig, isFeishuConfigured, getChatList, getMessageList } from './feishu';

const SCAN_SCHEDULE = [11, 15, 19]; // 小时

// 任务检测关键词模式
const TASK_PATTERNS = [
  { pattern: /(?:周五|周[一二三四五六日]|明天|后天|下周|下月|本周末)\s*(?:前|之前|之前|交|提交|完成|做完)/, type: 'deadline' },
  { pattern: /(?:帮我|麻烦|请|安排|负责|跟进|处理|写|做|整理|汇总).*(?:报告|文档|方案|表格|记录|分析|复盘|总结|汇报)/, type: 'assignment' },
  { pattern: /@所有人.*(?:完成|提交|填写|更新|处理)/, type: 'group_action' },
  { pattern: /(?:任务|待办|TODO|action\s*item).*(?:完成|截止|DDL)/i, type: 'todo' },
  { pattern: /(?:审批|申请|报销|请假).*(?:通过|驳回|待处理)/, type: 'approval' },
  { pattern: /(?:日历|日程|会议|开会).*(?:明天|下午|上午|今天|周[一二三四五六日])/, type: 'calendar' },
];

// 能力匹配 → CC能做什么
function matchCapability(text) {
  const capabilities = [];
  if (/(?:报告|文档|方案|复盘|总结|汇报|纪要|记录|初稿|大纲)/.test(text)) {
    capabilities.push('create_doc');
  }
  if (/(?:表格|填写|更新|进度|记录|录入|新增)/.test(text)) {
    capabilities.push('update_base');
  }
  if (/(?:查找|搜索|找一下|找找|有没有|在哪里).*(?:文件|文档|消息|聊天|记录)/.test(text)) {
    capabilities.push('search_info');
  }
  if (/(?:通知|提醒|告知|发送|转发|传达).*(?:大家|团队|群里|所有人)/.test(text)) {
    capabilities.push('send_notification');
  }
  if (/(?:总结|概括|摘要|梳理|归纳).*(?:消息|讨论|聊天|内容)/.test(text)) {
    capabilities.push('summarize');
  }
  return capabilities;
}

function getCapabilityLabel(cap) {
  const labels = {
    create_doc: '创建飞书文档并生成初稿',
    update_base: '更新多维表格数据',
    search_info: '搜索相关信息',
    send_notification: '发送通知到飞书群',
    summarize: '总结消息内容',
  };
  return labels[cap] || cap;
}

// 提取任务描述
function extractTaskDescription(message) {
  // 尝试提取关键句
  const sentences = message.split(/[。！？\n]/);
  for (const s of sentences) {
    for (const { pattern, type } of TASK_PATTERNS) {
      if (pattern.test(s)) {
        return { description: s.trim(), type };
      }
    }
  }
  // fallback: 返回整条消息的前100字
  return { description: message.slice(0, 100), type: 'unknown' };
}

// 提取发送者名称
function extractSenderName(msg) {
  if (msg.sender?.sender_id?.name) return msg.sender.sender_id.name;
  if (msg.sender?.id) return msg.sender.id;
  return '未知';
}

// 主扫描函数
export async function scanForTasks() {
  if (!isFeishuConfigured()) {
    return { scanned: false, reason: 'not_configured' };
  }

  const results = [];
  try {
    // 获取群列表
    const chats = await getChatList({ pageSize: 100 });
    if (!chats?.length) {
      return { scanned: true, tasks: [], message: '没有找到群聊' };
    }

    // 对每个群拉取最近消息（限前5个群，减少API调用）
    const targetChats = chats.slice(0, 5);
    for (const chat of targetChats) {
      try {
        const messages = await getMessageList(chat.chat_id, 'chat', { pageSize: 30 });
        if (!messages?.items?.length) continue;

        for (const msg of messages.items) {
          const text = extractMessageText(msg);
          if (!text || text.length < 10) continue;

          const capabilities = matchCapability(text);
          if (capabilities.length === 0) continue;

          // 确认是任务类消息
          const isTask = TASK_PATTERNS.some(({ pattern }) => pattern.test(text));
          if (!isTask) continue;

          const { description, type } = extractTaskDescription(text);
          const senderName = extractSenderName(msg);

          results.push({
            id: `task_${msg.message_id}`,
            chatId: chat.chat_id,
            chatName: chat.name || '未知群',
            messageId: msg.message_id,
            senderName,
            description,
            type,
            capabilities,
            rawText: text.slice(0, 300),
            detectedAt: Date.now(),
          });
        }
      } catch {
        // 单群失败不影响其他群
      }
    }
  } catch {
    return { scanned: true, tasks: [], error: '扫描异常' };
  }

  return { scanned: true, tasks: results, count: results.length };
}

function extractMessageText(msg) {
  const body = msg.body?.content || '';
  try {
    const parsed = JSON.parse(body);
    if (parsed.text) return parsed.text;
    if (parsed.elements) {
      return parsed.elements.map(e => e.text_run?.content || '').join('');
    }
    return body;
  } catch {
    return body;
  }
}

// 定时任务调度
let scanTimers = [];

export function startScheduledScan(onTasksDetected) {
  stopScheduledScan();

  // 连接时立即扫描
  setTimeout(() => {
    scanForTasks().then(result => {
      if (result.tasks?.length > 0) onTasksDetected(result.tasks);
    });
  }, 5000); // 连接后5秒扫描

  // 设置每日定时扫描
  SCAN_SCHEDULE.forEach(hour => {
    const now = new Date();
    const scheduled = new Date(now);
    scheduled.setHours(hour, 0, 0, 0);
    if (scheduled <= now) scheduled.setDate(scheduled.getDate() + 1);

    const delay = scheduled.getTime() - now.getTime();
    // 先设置一个初始定时器
    const timerId = setInterval(() => {
      const currentHour = new Date().getHours();
      if (currentHour === hour) {
        scanForTasks().then(result => {
          if (result.tasks?.length > 0) onTasksDetected(result.tasks);
        });
      }
    }, 60 * 60 * 1000); // 每小时检查一次

    scanTimers.push(timerId);
  });
}

export function stopScheduledScan() {
  scanTimers.forEach(t => clearInterval(t));
  scanTimers = [];
}
