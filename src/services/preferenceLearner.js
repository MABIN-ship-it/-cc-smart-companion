/**
 * 偏好学习引擎 — CC 越用越聪明
 *
 * 监控用户反馈（点赞/点踩/修改），分析编辑差异，
 * 更新每种任务类型的信任分数，生成个性化提示词片段。
 */
import { getProfile, updateProfile } from './userProfile';
import { addLesson } from './lessonsLearned';

const PREF_KEY = 'cc_task_preferences';
const TRUST_KEY = 'cc_task_trust_scores';

// ─── 反馈类型 ─────────────────────────────────────

export const FEEDBACK_TYPES = {
  like: '用户点赞',
  dislike: '用户点踩',
  edit: '用户修改了CC的输出',
  retry: '用户要求重新生成',
  choose: '用户从多方案中选择',
  ignore: '用户忽略了建议',
  accept: '用户直接接受',
};

// ─── 信任分数管理 ─────────────────────────────────

function loadTrustScores() {
  try {
    return JSON.parse(localStorage.getItem(TRUST_KEY) || '{}');
  } catch { return {}; }
}

function saveTrustScores(scores) {
  localStorage.setItem(TRUST_KEY, JSON.stringify(scores));
}

const DEFAULT_TRUST = 50;

export function getTrustScore(taskType) {
  const scores = loadTrustScores();
  return scores[taskType] ?? DEFAULT_TRUST;
}

/**
 * 更新信任分数
 * @param {string} taskType 任务类型：create_report/create_doc/create_mindmap/approve/reply/fill_base
 * @param {string} feedbackType 反馈类型（FEEDBACK_TYPES的键）
 */
export function updateTrustScore(taskType, feedbackType) {
  const scores = loadTrustScores();
  const current = scores[taskType] ?? DEFAULT_TRUST;

  const deltas = {
    like: +5,
    dislike: -10,
    edit: -3,
    retry: -7,
    choose: +2,
    ignore: -1,
    accept: +3,
  };

  const delta = deltas[feedbackType] || 0;
  scores[taskType] = Math.max(0, Math.min(100, current + delta));
  saveTrustScores(scores);

  return scores[taskType];
}

/**
 * 根据信任分数确定执行模式
 *  > 80 → auto（自动执行）
 *  40-80 → approve（生成草案后审批）
 *  < 40 → suggest（提供多方案，用户选择）
 */
export function getExecutionMode(taskType) {
  const score = getTrustScore(taskType);
  if (score >= 80) return 'auto';
  if (score >= 40) return 'approve';
  return 'suggest';
}

/**
 * 获取所有任务类型的信任摘要
 */
export function getTrustSummary() {
  const scores = loadTrustScores();
  const types = ['create_report', 'create_doc', 'create_mindmap', 'approve', 'reply', 'fill_base'];
  return types.map(t => ({
    type: t,
    label: { create_report: '报告', create_doc: '方案', create_mindmap: '思维导图', approve: '审批', reply: '回复', fill_base: '填表' }[t] || t,
    score: scores[t] ?? DEFAULT_TRUST,
    mode: getExecutionMode(t),
  }));
}

// ─── 编辑差异分析 ─────────────────────────────────

/**
 * 比较CC原始输出与用户编辑后的差异，提取偏好模式
 */
export function analyzeEditDiff(original, userEdited) {
  if (!original || !userEdited) return null;
  if (original === userEdited) return { changed: false };

  const diffs = { changed: true, patterns: [] };

  // 长度变化
  const origLen = original.length;
  const editLen = userEdited.length;
  if (editLen < origLen * 0.6) {
    diffs.patterns.push('用户大幅精简了内容，偏好更简洁');
    diffs.preferShorter = true;
  } else if (editLen > origLen * 1.4) {
    diffs.patterns.push('用户补充了大量内容，期望更详细');
    diffs.preferDetailed = true;
  }

  // 表格偏好
  const origTableCount = (original.match(/\|.*\|/g) || []).length;
  const editTableCount = (userEdited.match(/\|.*\|/g) || []).length;
  if (editTableCount > origTableCount * 1.5) {
    diffs.patterns.push('用户增加了表格，偏好用表格呈现数据');
    diffs.preferTables = true;
  }

  // 标题层级变化
  const origHCount = (original.match(/^#{1,3}\s/gm) || []).length;
  const editHCount = (userEdited.match(/^#{1,3}\s/gm) || []).length;
  if (editHCount > origHCount * 1.5) {
    diffs.patterns.push('用户增加了更多标题层级，偏好层次分明的结构');
    diffs.preferStructured = true;
  }

  // 列表偏好
  const origListCount = (original.match(/^[-*]\s/gm) || []).length;
  const editListCount = (userEdited.match(/^[-*]\s/gm) || []).length;
  if (editListCount > origListCount * 1.5) {
    diffs.patterns.push('用户增加了列表项，偏好列表式呈现');
    diffs.preferLists = true;
  }

  // 语言风格变化（中英文标点）
  const origChinesePunc = (original.match(/[，。；：、？！]/g) || []).length;
  const editChinesePunc = (userEdited.match(/[，。；：、？！]/g) || []).length;
  if (origLen > 50 && origChinesePunc > 0 && editChinesePunc === 0) {
    diffs.patterns.push('用户改用了英文标点风格');
    diffs.preferEnglishPunctuation = true;
  }

  // 称呼变化
  if (original.includes('您') && !userEdited.includes('您')) {
    diffs.patterns.push('用户去掉了"您"，偏好亲切自然的称呼');
    diffs.preferCasualTone = true;
  }

  return diffs;
}

// ─── 任务偏好持久化 ──────────────────────────────

function loadPreferences() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
  } catch { return {}; }
}

function savePreferences(prefs) {
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}

/**
 * 记录用户对某次任务执行的反馈
 */
export function recordTaskFeedback({ taskType, originalOutput, userEditedOutput, feedbackType, taskTitle }) {
  // 1. 更新信任分数
  const newScore = updateTrustScore(taskType, feedbackType);

  // 2. 分析编辑差异（如果是 edit 类型）
  let diffAnalysis = null;
  if (feedbackType === 'edit' && originalOutput && userEditedOutput) {
    diffAnalysis = analyzeEditDiff(originalOutput, userEditedOutput);
  }

  // 3. 保存任务偏好
  const prefs = loadPreferences();
  if (!prefs[taskType]) {
    prefs[taskType] = {
      editDiffs: [],
      feedbackCount: 0,
      likes: 0,
      dislikes: 0,
    };
  }
  prefs[taskType].feedbackCount++;
  if (feedbackType === 'like' || feedbackType === 'accept') prefs[taskType].likes++;
  if (feedbackType === 'dislike') prefs[taskType].dislikes++;

  if (diffAnalysis) {
    prefs[taskType].editDiffs.push({
      patterns: diffAnalysis.patterns,
      timestamp: Date.now(),
      taskTitle: taskTitle || '',
    });
    // 保留最近10条编辑差异
    prefs[taskType].editDiffs = prefs[taskType].editDiffs.slice(-10);
  }

  savePreferences(prefs);

  // 4. 记录到 lessonsLearned
  if (feedbackType === 'dislike' || feedbackType === 'retry') {
    addLesson({
      context: `飞书任务-${taskType}`,
      approach: originalOutput ? originalOutput.slice(0, 100) : '自动执行方式',
      result: feedbackType === 'dislike' ? '用户不满意此输出' : '用户要求重新生成',
      isMistake: true,
    });
  } else if (feedbackType === 'like' || feedbackType === 'accept') {
    addLesson({
      context: `飞书任务-${taskType}`,
      approach: 'CC自动执行任务',
      result: `用户${FEEDBACK_TYPES[feedbackType]}`,
      isMistake: false,
    });
  }

  return {
    newTrustScore: newScore,
    newMode: getExecutionMode(taskType),
    diffAnalysis,
  };
}

// ─── 个性化提示词生成 ─────────────────────────────

/**
 * 从偏好数据生成个性化提示词片段
 * 注入到 AI 系统提示词中，影响后续任务执行
 */
export function getPersonalizedPrompt() {
  const prefs = loadPreferences();
  const trust = loadTrustScores();
  const taskTypes = Object.keys(prefs);

  if (taskTypes.length === 0) return '';

  const hints = [];

  // 聚合所有编辑差异中的模式
  const allPatterns = [];
  for (const type of taskTypes) {
    const diffs = prefs[type]?.editDiffs || [];
    for (const d of diffs) {
      allPatterns.push(...(d.patterns || []));
    }
  }

  // 去重并取最常见的模式
  const patternCounts = {};
  for (const p of allPatterns) {
    patternCounts[p] = (patternCounts[p] || 0) + 1;
  }
  const topPatterns = Object.entries(patternCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p]) => p);

  if (topPatterns.length > 0) {
    hints.push('## 用户偏好（从历史编辑中学习）');
    hints.push(...topPatterns.map(p => `- ${p}`));
  }

  // 信任分数摘要
  const trustHints = [];
  for (const [type, score] of Object.entries(trust)) {
    const labels = {
      create_report: '报告', create_doc: '方案', create_mindmap: '思维导图',
      approve: '审批', reply: '回复', fill_base: '填表',
    };
    const label = labels[type] || type;
    const mode = score >= 80 ? '全自动' : score >= 40 ? '审批后执行' : '用户选择后执行';
    trustHints.push(`${label}: 信任${score}%（${mode}）`);
  }

  if (trustHints.length > 0) {
    hints.push('\n## 各任务信任度');
    hints.push(...trustHints.map(h => `- ${h}`));
  }

  // 点赞/点踩统计
  const feedbackSummary = [];
  for (const type of taskTypes) {
    const p = prefs[type];
    if (p && p.feedbackCount > 0) {
      const label = {
        create_report: '报告', create_doc: '方案', create_mindmap: '思维导图',
        approve: '审批', reply: '回复', fill_base: '填表',
      }[type] || type;
      feedbackSummary.push(`${label}: ${p.likes}赞/${p.dislikes}踩（共${p.feedbackCount}次反馈）`);
    }
  }

  if (feedbackSummary.length > 0) {
    hints.push('\n## 用户反馈统计');
    hints.push(...feedbackSummary.map(s => `- ${s}`));
  }

  return hints.join('\n');
}

/**
 * 获取某类型的偏好摘要
 */
export function getTaskTypePreferences(taskType) {
  const prefs = loadPreferences();
  const typePrefs = prefs[taskType];
  if (!typePrefs) return null;

  const allPatterns = [];
  for (const d of (typePrefs.editDiffs || [])) {
    allPatterns.push(...(d.patterns || []));
  }
  const uniquePatterns = [...new Set(allPatterns)];

  return {
    taskType,
    feedbackCount: typePrefs.feedbackCount,
    likes: typePrefs.likes,
    dislikes: typePrefs.dislikes,
    trustScore: getTrustScore(taskType),
    executionMode: getExecutionMode(taskType),
    learnedPatterns: uniquePatterns.slice(0, 5),
  };
}

export default {
  FEEDBACK_TYPES,
  updateTrustScore,
  getTrustScore,
  getExecutionMode,
  getTrustSummary,
  analyzeEditDiff,
  recordTaskFeedback,
  getPersonalizedPrompt,
  getTaskTypePreferences,
};
