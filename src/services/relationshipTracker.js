/**
 * Relationship Tracker — tracks conversation stats and relationship level.
 *
 * Lv1 陌生人: 1 conversation
 * Lv2 认识:   3 conversations
 * Lv3 朋友:   10 conversations + 2h total
 * Lv4 密友:   30 conversations + 10h total
 * Lv5 伙伴:   60 conversations + 30h total
 *
 * Persisted to localStorage as 'cc_relationship'.
 */

const STORAGE_KEY = 'cc_relationship';

const LEVELS = [
  { level: 1, name: '陌生人', conversations: 1,  hours: 0,  emoji: '👋', unlock: '基础聊天' },
  { level: 2, name: '认识',   conversations: 3,  hours: 0,  emoji: '🤝', unlock: '记住名字' },
  { level: 3, name: '朋友',   conversations: 10, hours: 2,  emoji: '😊', unlock: '轻松语气' },
  { level: 4, name: '密友',   conversations: 30, hours: 10, emoji: '💜', unlock: '主动发起话题' },
  { level: 5, name: '伙伴',   conversations: 60, hours: 30, emoji: '🌟', unlock: '纪念日庆祝' },
];

const LEVEL_QUESTIONS = {
  2: '对了，你希望我怎么称呼你？',
  3: '我想更了解你——你的生日是哪天？我想记住这个特别的日子 🎂',
  4: '我们认识有段时间了，你最近在做什么项目？有什么我可以帮上忙的吗？',
  5: '我们认识这么久了，你觉得我有什么需要改进的地方吗？我很想成为更好的伙伴 🫶',
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return getDefault();
}

function save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function getDefault() {
  return {
    totalConversations: 0,
    totalDurationMinutes: 0,
    firstMeeting: null,
    currentLevel: 1,
    userInfo: { name: '', birthday: '', interests: [] },
    askedQuestions: [],
    lastConversationDate: null,
  };
}

export function getRelationship() {
  return load();
}

export function getLevelInfo(level) {
  return LEVELS.find(l => l.level === level) || LEVELS[0];
}

export function getNextLevelInfo(level) {
  return LEVELS.find(l => l.level === level + 1) || null;
}

/**
 * Call after each user message (not system/proactive messages).
 * Returns { leveledUp: boolean, question: string|null, newLevel: number }.
 */
export function recordConversation() {
  const data = load();
  const today = new Date().toDateString();

  // Count as new conversation if different day
  if (data.lastConversationDate !== today) {
    data.totalConversations++;
    data.lastConversationDate = today;

    if (!data.firstMeeting) {
      data.firstMeeting = new Date().toISOString().slice(0, 10);
    }
  }

  save(data);

  return checkLevelUp(data);
}

/**
 * Call periodically to update session duration.
 * Returns { leveledUp: boolean, question: string|null, newLevel: number }.
 */
export function addSessionMinute() {
  const data = load();
  data.totalDurationMinutes++;

  save(data);
  return checkLevelUp(data);
}

function checkLevelUp(data) {
  const nextLevel = LEVELS.find(l => l.level === data.currentLevel + 1);
  if (!nextLevel) return { leveledUp: false, question: null, newLevel: data.currentLevel };

  if (data.totalConversations >= nextLevel.conversations
      && data.totalDurationMinutes / 60 >= nextLevel.hours) {

    const oldLevel = data.currentLevel;
    data.currentLevel = nextLevel.level;
    save(data);

    // Check if we should ask a question for this new level
    let question = null;
    if (!data.askedQuestions.includes(nextLevel.level)) {
      question = LEVEL_QUESTIONS[nextLevel.level] || null;
      if (question) {
        data.askedQuestions.push(nextLevel.level);
        save(data);
      }
    }

    return { leveledUp: true, oldLevel, newLevel: nextLevel.level, question };
  }

  return { leveledUp: false, question: null, newLevel: data.currentLevel };
}

/** Save user info when CC learns something about the user. */
export function saveUserInfo(updates) {
  const data = load();
  data.userInfo = { ...data.userInfo, ...updates };
  save(data);
}

/** Get a relationship summary text for system prompt injection. */
export function getRelationshipContext() {
  const data = load();
  const info = getLevelInfo(data.currentLevel);
  let ctx = `\n## 与用户的关系\n- 关系等级: Lv${data.currentLevel} ${info.name} ${info.emoji}`;
  ctx += `\n- 对话次数: ${data.totalConversations} 次`;
  ctx += `\n- 累计相处: ${Math.round(data.totalDurationMinutes / 60 * 10) / 10} 小时`;
  if (data.userInfo.name) ctx += `\n- 用户称呼: ${data.userInfo.name}`;
  if (data.userInfo.birthday) ctx += `\n- 用户生日: ${data.userInfo.birthday}`;
  if (data.userInfo.interests.length > 0) ctx += `\n- 用户兴趣: ${data.userInfo.interests.join(', ')}`;
  if (data.firstMeeting) ctx += `\n- 初次相遇: ${data.firstMeeting}`;

  // Tone suggestion based on level
  if (data.currentLevel >= 4) {
    ctx += '\n\n你们的关系已经很亲密了，交流可以更随意自然，像老朋友一样。';
  } else if (data.currentLevel >= 3) {
    ctx += '\n\n你们是朋友关系，交流可以轻松一些，适当开开玩笑。';
  } else if (data.currentLevel >= 2) {
    ctx += '\n\n你们开始熟悉了，可以主动了解对方。';
  }

  return ctx;
}
