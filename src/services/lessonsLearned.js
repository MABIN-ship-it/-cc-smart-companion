/**
 * 经验教训追踪 — 从用户反馈中学习，优化后续行为
 *
 * 存储键: cc_lessons_learned (localStorage)
 * 在 ChatInterface 中检测用户正/负反馈，自动记录经验。
 */

const STORAGE_KEY = 'cc_lessons_learned';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(lessons) {
  // 最多保留100条
  const trimmed = lessons.slice(-100);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/** 添加一条经验 */
export function addLesson(lesson) {
  const lessons = load();
  lessons.push({
    id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    context: lesson.context || '',
    approach: lesson.approach || '',
    result: lesson.result || '',
    isMistake: !!lesson.isMistake,
    taskType: lesson.taskType || null,
    originalOutput: lesson.originalOutput || null,
    userEditedOutput: lesson.userEditedOutput || null,
    executionTime: lesson.executionTime || null,
    createdAt: Date.now(),
  });
  save(lessons);
  return lessons[lessons.length - 1];
}

/** 获取最近 n 条经验 */
export function getRecentLessons(n = 20) {
  return load().slice(-n).reverse();
}

/** 获取所有错误上下文（去重） */
export function getMistakeContexts() {
  return [...new Set(load().filter(l => l.isMistake).map(l => l.context))];
}

/** 获取成功经验 */
export function getSuccessContexts() {
  return [...new Set(load().filter(l => !l.isMistake).map(l => l.context))];
}

/** 获取注入提示词的摘要（最近5条，优先错误） */
export function getLessonsContext() {
  const all = load();
  if (all.length === 0) return '';

  const mistakes = all.filter(l => l.isMistake).slice(-3);
  const successes = all.filter(l => !l.isMistake).slice(-3);

  let text = '\n## 过去的经验教训\n';

  if (mistakes.length > 0) {
    text += '### 需要避免的错误\n';
    for (const m of mistakes) {
      text += `- 场景「${m.context}」→ 错误做法：${m.approach} → 用户反馈：${m.result}\n`;
    }
  }

  if (successes.length > 0) {
    text += '### 做得好的方式\n';
    for (const s of successes) {
      text += `- 场景「${s.context}」→ 做法：${s.approach} → 用户反馈：${s.result}\n`;
    }
  }

  // 错误模式摘要
  const mistakePatterns = [...new Set(mistakes.map(m => m.result))];
  if (mistakePatterns.length > 0) {
    text += `\n注意：用户曾对以下行为表示不满——${mistakePatterns.join('、')}。请调整回复策略。\n`;
  }

  return text;
}

/** 从用户消息中检测反馈并自动记录 */
export function detectUserFeedback(userMessage, lastAiResponse) {
  if (!userMessage) return null;

  const msg = userMessage.trim();

  // 负反馈模式
  const negativePatterns = [
    { regex: /(?:不对|不是|错了|错误|搞错|弄错)/, keyword: '指出错误' },
    { regex: /(?:太啰嗦|太长了|太复杂|说太多|别废话|简洁点|说重点)/, keyword: '太啰嗦' },
    { regex: /(?:看不懂|看不明白|没看懂|听不懂|不理解|没理解)/, keyword: '解释不清' },
    { regex: /(?:别搜了|别查了|不用搜|不要搜索|少搜索)/, keyword: '过度搜索' },
    { regex: /(?:没回答|没回答到|不是问这个|答非所问|跑题)/, keyword: '答非所问' },
    { regex: /(?:慢|太慢了|等太久|半天)/, keyword: '响应太慢' },
    { regex: /(?:不需要工具|直接告诉我|别动手|不要操作)/, keyword: '不该用工具' },
    { regex: /(?:你又来了|老样子|又是这|每次都|总是)/, keyword: '重复模式' },
  ];

  for (const { regex, keyword } of negativePatterns) {
    if (regex.test(msg)) {
      return {
        context: keyword,
        approach: lastAiResponse ? lastAiResponse.slice(0, 100) : '上次回复方式',
        result: msg.slice(0, 80),
        isMistake: true,
      };
    }
  }

  // 正反馈模式
  const positivePatterns = [
    { regex: /(?:对的|很好|太棒了|非常好|完美|就是这样|没错|是的)/, keyword: '认可' },
    { regex: /(?:谢谢|多谢|感谢|辛苦了|good|thanks)/i, keyword: '感谢' },
    { regex: /(?:清楚了|明白了|懂了|理解了|知道了|了解了)/, keyword: '解释清晰' },
    { regex: /(?:快|很快|效率|速度|迅速)/, keyword: '高效' },
    { regex: /(?:继续|接着|下一步|然后)/, keyword: '继续推进' },
  ];

  for (const { regex, keyword } of positivePatterns) {
    if (regex.test(msg)) {
      return {
        context: keyword,
        approach: lastAiResponse ? lastAiResponse.slice(0, 100) : '上次回复方式',
        result: msg.slice(0, 80),
        isMistake: false,
      };
    }
  }

  return null;
}

/** 获取经验统计 */
export function getLessonsStats() {
  const all = load();
  return {
    total: all.length,
    mistakes: all.filter(l => l.isMistake).length,
    successes: all.filter(l => !l.isMistake).length,
  };
}

/** 删除经验 */
export function removeLesson(id) {
  const lessons = load().filter(l => l.id !== id);
  save(lessons);
}

/** 清空经验 */
export function clearLessons() {
  save([]);
}

// ─── 任务执行偏好分析 ─────────────────────────────

/**
 * 提取任务执行相关的偏好模式
 * @param {string} taskType 可选，限定任务类型
 */
export function getTaskPreferences(taskType) {
  const all = load();
  const relevant = taskType ? all.filter(l => l.taskType === taskType) : all.filter(l => l.taskType);

  if (relevant.length === 0) return null;

  const mistakes = relevant.filter(l => l.isMistake);
  const successes = relevant.filter(l => !l.isMistake);

  return {
    taskType: taskType || 'all',
    total: relevant.length,
    mistakes: mistakes.length,
    successes: successes.length,
    recentMistakes: mistakes.slice(-5).map(l => ({ context: l.context, result: l.result })),
    recentSuccesses: successes.slice(-5).map(l => ({ context: l.context, result: l.result })),
  };
}

/**
 * 获取不该做的事（失败模式）
 */
export function getFailedPatterns(taskType) {
  const all = load();
  const mistakes = taskType
    ? all.filter(l => l.isMistake && l.taskType === taskType)
    : all.filter(l => l.isMistake);

  const patterns = {};
  for (const m of mistakes) {
    const key = m.result?.slice(0, 60) || m.context;
    if (key) patterns[key] = (patterns[key] || 0) + 1;
  }

  return Object.entries(patterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pattern, count]) => ({ pattern, count }));
}

/**
 * 获取该继续做的事（成功模式）
 */
export function getSuccessPatterns(taskType) {
  const all = load();
  const successes = taskType
    ? all.filter(l => !l.isMistake && l.taskType === taskType)
    : all.filter(l => !l.isMistake);

  const patterns = {};
  for (const s of successes) {
    const key = s.approach?.slice(0, 60) || s.context;
    if (key) patterns[key] = (patterns[key] || 0) + 1;
  }

  return Object.entries(patterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pattern, count]) => ({ pattern, count }));
}
