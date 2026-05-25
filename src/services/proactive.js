import { loadMemories } from './memory';
import { addSessionMinute } from './relationshipTracker';

let intervalId = null;
let sessionTimer = null;
let sessionMinutes = 0;
let didShareToday = false;
let lastShareDate = '';

export function startProactiveEngine(callbacks) {
  sessionTimer = setInterval(() => {
    sessionMinutes++;
    // Update relationship tracker duration
    addSessionMinute();
  }, 60000);

  // 5-minute checks for reminders, wellbeing, sharing
  intervalId = setInterval(() => {
    checkReminders(callbacks.onReminder);
    checkUserWellbeing(callbacks.onWellbeing);
    checkDailyShare(callbacks.onShare);
  }, 5 * 60 * 1000);

  return () => {
    clearInterval(intervalId);
    clearInterval(sessionTimer);
  };
}

function checkReminders(callback) {
  if (!callback) return;
  const memories = loadMemories();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  for (const mem of memories) {
    if (mem.type === 'date') {
      const reason = mem.reason ? `（${mem.reason}）` : '';
      if (mem.content.includes(todayStr) || (mem.dateValue && mem.dateValue === todayStr)) {
        callback(`📅 今天是 ${(mem.content.includes('|') ? mem.content.split('|')[1] || mem.content : mem.content).replace('📅 ', '').trim()}${reason}，别忘了哦！`);
      } else if (mem.content.includes(tomorrowStr) || (mem.dateValue && mem.dateValue === tomorrowStr)) {
        callback(`📅 明天是 ${(mem.content.includes('|') ? mem.content.split('|')[1] || mem.content : mem.content).replace('📅 ', '').trim()}${reason}，记得提前准备！`);
      }
    }
  }
}

function checkUserWellbeing(callback) {
  if (!callback) return;
  const hour = new Date().getHours();

  // Long session (>3 hours)
  if (sessionMinutes > 180 && sessionMinutes % 180 < 5) {
    callback('你已经连续工作3小时了，休息一下吧。起来走走，喝杯水～ 🍵');
  }

  // Late night (23:00-06:00)
  if (hour >= 23 || hour < 6) {
    if (sessionMinutes > 30 && sessionMinutes % 60 < 5) {
      callback('这么晚了还在工作？注意身体，早点休息吧 🌙');
    }
  }
}

function checkDailyShare(callback) {
  if (!callback) return;
  const today = new Date().toDateString();
  if (today === lastShareDate) return;
  if (didShareToday) return;

  const hour = new Date().getHours();
  if (hour < 9 || hour > 21) return;

  // One share per day
  didShareToday = true;
  lastShareDate = today;

  const shares = [
    '今天天气看起来不错，适合出去走走 ☀️',
    '每天学习一点新东西，积少成多 📚',
    '记得按时吃饭哦，身体健康最重要 🍜',
    '有什么想做的项目吗？我可以帮你！💪',
  ];
  const share = shares[Math.floor(Math.random() * shares.length)];
  callback(share);
}

export function resetSessionTimer() {
  sessionMinutes = 0;
}

export function getSessionDuration() {
  return sessionMinutes;
}
