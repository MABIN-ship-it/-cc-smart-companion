/**
 * 用户画像系统 — 动态字段模型。
 *
 * AI 从对话中自动增量提取用户信息（姓名、偏好、兴趣、技能、对CC感受等），
 * 存储为自由的 key-value Map。不设固定 schema，AI 可自主创建新字段。
 */

const STORAGE_KEY = 'cc_user_profile';

// ─── 读写 ────────────────────────────────────────────────

/**
 * @typedef {{ fields: Record<string, any>, updatedAt: number }} UserProfile
 * @typedef {{ add?: Record<string, any>, update?: Record<string, any>, append?: Record<string, any>, remove?: string[] }} ProfileDiff
 */

/**
 * @returns {UserProfile}
 */
export function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { fields: {}, updatedAt: 0 };
  } catch {
    return { fields: {}, updatedAt: 0 };
  }
}

function saveProfile(profile) {
  profile.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

// ─── 字段操作 ──────────────────────────────────────────────

/** @param {string} key @returns {any|null} */
export function getField(key) {
  const profile = loadProfile();
  return profile.fields[key] ?? null;
}

/** @param {string} key @param {any} value */
export function setField(key, value) {
  const profile = loadProfile();
  if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    delete profile.fields[key];
  } else {
    profile.fields[key] = value;
  }
  saveProfile(profile);
}

/** @param {string} key */
export function deleteField(key) {
  const profile = loadProfile();
  delete profile.fields[key];
  saveProfile(profile);
}

/** @returns {Record<string, any>} */
export function getAllFields() {
  return loadProfile().fields;
}

// ─── 增量 DIFF ────────────────────────────────────────────

/**
 * 应用增量变更。
 * diff: { add?: {key: value}, update?: {key: value}, append?: {key: value}, remove?: [key] }
 * - add: 新增 key 或设置单值；若 key 已存在且为数组则追加
 * - update: 覆盖单值字段
 * - append: 向数组字段尾部追加单项（字符串自动包装为单元素数组）
 * - remove: 删除 key
 */
/** @param {ProfileDiff} diff */
export function applyDiff(diff) {
  if (!diff) return;
  const profile = loadProfile();
  const fields = profile.fields;

  // add
  if (diff.add) {
    for (const [key, value] of Object.entries(diff.add)) {
      if (fields[key] && Array.isArray(fields[key]) && Array.isArray(value)) {
        // 合并数组，去重
        const exist = new Set(fields[key]);
        for (const v of value) exist.add(v);
        fields[key] = [...exist];
      } else if (fields[key] && Array.isArray(fields[key]) && typeof value === 'string') {
        if (!fields[key].includes(value)) fields[key].push(value);
      } else {
        fields[key] = value;
      }
    }
  }

  // update
  if (diff.update) {
    for (const [key, value] of Object.entries(diff.update)) {
      fields[key] = value;
    }
  }

  // append — 专门用于数组字段追加单项保留历史
  if (diff.append) {
    for (const [key, value] of Object.entries(diff.append)) {
      const v = typeof value === 'string' ? [value] : value;
      if (!fields[key]) {
        fields[key] = Array.isArray(v) ? v : [v];
      } else if (Array.isArray(fields[key])) {
        for (const item of (Array.isArray(v) ? v : [v])) {
          if (!fields[key].includes(item)) fields[key].push(item);
        }
      } else {
        // 原有是单值，转为数组
        fields[key] = [fields[key]];
        for (const item of (Array.isArray(v) ? v : [v])) {
          if (!fields[key].includes(item)) fields[key].push(item);
        }
      }
    }
  }

  // remove
  if (diff.remove) {
    for (const key of diff.remove) {
      delete fields[key];
    }
  }

  saveProfile(profile);
}

// ─── 从对话提取画像增量 ────────────────────────────────────

/**
 * 从用户消息 + AI 回复中提取画像信息。
 * 返回 diff 对象（增量），由调用方 apply 或存入 state。
 *
 * 提取模式（正则 + 关键词上下文）：
 *   - 自我介绍：我是/我叫/我做/我在...工作
 *   - 偏好表达：我喜欢/我习惯/我常用/我偏好/我不喜欢
 *   - 对CC评价：觉得CC/CC你/你的回答/太.../很.../CC太...
 *   - 技能透露：我会/我擅长/我主要用/我的技术栈
 *   - 兴趣透露：我平时/我业余/我的爱好
 */
/**
 * @param {string} userMsg
 * @param {string} aiResp
 * @returns {ProfileDiff|null}
 */
export function extractProfileDiff(userMsg, aiResp) {
  const text = (userMsg || '') + ' ' + (aiResp || '');
  const diff = { add: {}, append: {}, remove: [] };

  // ── 自我介绍 ──
  const nameMatch = text.match(/(?:我叫|我是|我叫作)(.{1,20}?)(?:，|。|,|\.|\s|$)/);
  if (nameMatch) diff.add['姓名'] = nameMatch[1].trim();

  const genderMatch = text.match(/(?:我是[一个位名]{0,2})(男[生孩]|女[生孩])/);
  if (genderMatch) diff.add['性别'] = genderMatch[1].trim();

  const cityMatch = text.match(/(?:我(?:在|住|住在|生活在))([一-龥]{2,6}(?:市|省|区|县)?)(?:，|。|,|\.|\s|$)/);
  if (cityMatch && cityMatch[1].length >= 2) diff.add['城市'] = cityMatch[1].trim();

  const workMatch = text.match(/(?:我(?:是|做|在|从事))(?:一[个名位])?(.{2,30}?)(?:的)?(?:工作|工程师|设计师|产品|运营|开发|程序员|PM)(?:，|。|,|\.|\s|$|等)/);
  if (workMatch) diff.add['工作'] = workMatch[0].trim().replace(/^我(?:是|做|在|从事)(?:一[个名位])?/, '');

  // ── 偏好表达 ──
  const likePatterns = [
    { regex: /我(?:喜欢|习惯|常用|偏好|一般会)(.{2,20}?)(?:，|。|,|\.|\s|$)/g, field: '偏好' },
    { regex: /我(?:不喜欢|讨厌|受不了|不喜欢别人)(.{2,20}?)(?:，|。|,|\.|\s|$)/g, field: '偏好' },
  ];
  for (const { regex, field } of likePatterns) {
    let m;
    while ((m = regex.exec(text)) !== null) {
      const val = m[1].trim();
      if (val.length >= 2 && val.length <= 25) {
        if (!diff.append[field]) diff.append[field] = [];
        diff.append[field].push(val);
      }
    }
  }

  // ── 回复风格偏好 ──
  const conciseMatch = text.match(/(?:太啰嗦|太长了|不要这么长|说简单点|简洁点|少说|别废话|言简意赅|短一点|精简)/);
  if (conciseMatch) diff.append['偏好'] = ['回复简洁'];

  const detailMatch = text.match(/(?:说详细点|多讲点|展开|具体|详细说|不够)/);
  if (detailMatch) diff.append['偏好'] = ['喜欢详细解释'];

  const tableMatch = text.match(/(?:表格|对比|列出来|清单|列一下|汇总)/);
  if (tableMatch) diff.append['偏好'] = ['喜欢表格/对比格式'];

  // ── 对CC的感受 ──
  const ccFeelMatch = text.match(/(?:CC|你)(?:真|太|好|很|有点)(.{1,15}?)(?:，|。|,|\.|！|!|\s|$)/g);
  if (ccFeelMatch) {
    for (const m of ccFeelMatch) {
      const feel = m.trim();
      if (feel.length >= 2 && feel.length <= 20 && !feel.includes('?')) {
        if (!diff.append['对CC的感受']) diff.append['对CC的感受'] = [];
        diff.append['对CC的感受'].push(feel);
      }
    }
  }

  const ccAttitude = text.match(/(?:觉得?CC|觉得?你|认为CC|CC很|你很)(.{1,20}?)(?:，|。|,|\.|\s|$)/);
  if (ccAttitude) {
    if (!diff.append['对CC的感受']) diff.append['对CC的感受'] = [];
    diff.append['对CC的感受'].push(('觉得CC' + ccAttitude[1]).trim());
  }

  // ── 技能透露 ──
  const skillMatch = text.match(/(?:我会|我擅长|我主要用|我的技术栈|我使?用的?技术)(.{2,40}?)(?:，|。|,|\.|\s|$|等)/);
  if (skillMatch) {
    const skills = skillMatch[1].split(/[、,，\s]+/).filter(s => s.length > 1 && s.length < 20);
    if (skills.length > 0) diff.append['技能'] = skills;
  }

  // ── 兴趣透露 ──
  const hobbyMatch = text.match(/(?:我平时|我业余|我的爱好|我喜欢|我经常)(.{2,30}?)(?:，|。|,|\.|\s|$)/);
  if (hobbyMatch && !hobbyMatch[1].includes('不')) {
    const hobbies = hobbyMatch[1].split(/[、,，\s]+/).filter(s => s.length > 1 && s.length < 15);
    if (hobbies.length > 0) diff.append['兴趣'] = hobbies;
  }

  // 清理空分类
  if (Object.keys(diff.add).length === 0) delete diff.add;
  if (Object.keys(diff.append).length === 0) delete diff.append;

  // 没有有效变更
  if (!diff.add && !diff.append && !diff.update) return null;
  return diff;
}

// ─── 上下文生成 ────────────────────────────────────────────

/**
 * 生成注入系统提示词的画像摘要。
 * 单值字段一行，数组字段展开。
 */
export function getProfileContext() {
  const { fields } = loadProfile();
  const keys = Object.keys(fields);
  if (keys.length === 0) return '';

  const lines = ['## 用户画像'];
  for (const key of keys) {
    const val = fields[key];
    if (Array.isArray(val)) {
      lines.push(`- ${key}：${val.join('、')}`);
    } else {
      lines.push(`- ${key}：${val}`);
    }
  }
  return lines.join('\n');
}
