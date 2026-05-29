/**
 * 多维表格业务场景模板库
 * 根据Excel内容自动识别业务场景，推荐字段配置和视图
 */

const BUSINESS_SCENES = {
  project_management: {
    name: '项目管理',
    keywords: ['项目', '任务', '进度', '负责人', '截止日期', '开始日期', '优先级', '状态'],
    fields: [
      { field_name: '项目/任务名称', type: 'text' },
      { field_name: '负责人', type: 'user' },
      { field_name: '优先级', type: 'select' },
      { field_name: '状态', type: 'select' },
      { field_name: '开始日期', type: 'date' },
      { field_name: '截止日期', type: 'date' },
      { field_name: '进度', type: 'progress' },
    ],
    views: ['grid', 'kanban', 'calendar', 'gantt'],
  },
  crm: {
    name: '客户管理',
    keywords: ['客户', '联系人', '公司', '电话', '邮箱', '跟进', '来源', '阶段'],
    fields: [
      { field_name: '客户名称', type: 'text' },
      { field_name: '联系人', type: 'text' },
      { field_name: '电话', type: 'phone' },
      { field_name: '邮箱', type: 'email' },
      { field_name: '公司', type: 'text' },
      { field_name: '跟进阶段', type: 'select' },
      { field_name: '负责人', type: 'user' },
      { field_name: '最近联系日期', type: 'date' },
    ],
    views: ['grid', 'kanban', 'calendar'],
  },
  inventory: {
    name: '库存管理',
    keywords: ['库存', '数量', '仓库', '入库', '出库', 'SKU', '单价', '供应商', '品类'],
    fields: [
      { field_name: '商品名称', type: 'text' },
      { field_name: 'SKU编号', type: 'text' },
      { field_name: '品类', type: 'select' },
      { field_name: '数量', type: 'number' },
      { field_name: '单价', type: 'currency' },
      { field_name: '总价值', type: 'currency' },
      { field_name: '供应商', type: 'text' },
      { field_name: '最近入库日期', type: 'date' },
    ],
    views: ['grid', 'gallery'],
  },
  hr_roster: {
    name: 'HR花名册',
    keywords: ['姓名', '工号', '部门', '职位', '入职日期', '身份证', '性别', '学历'],
    fields: [
      { field_name: '姓名', type: 'text' },
      { field_name: '工号', type: 'text' },
      { field_name: '部门', type: 'select' },
      { field_name: '职位', type: 'text' },
      { field_name: '手机号', type: 'phone' },
      { field_name: '邮箱', type: 'email' },
      { field_name: '入职日期', type: 'date' },
      { field_name: '状态', type: 'select' },
    ],
    views: ['grid', 'kanban'],
  },
  finance: {
    name: '财务管理',
    keywords: ['金额', '收入', '支出', '账户', '类别', '日期', '预算', '报销', '发票'],
    fields: [
      { field_name: '日期', type: 'date' },
      { field_name: '类别', type: 'select' },
      { field_name: '项目', type: 'text' },
      { field_name: '金额', type: 'currency' },
      { field_name: '类型', type: 'select' },
      { field_name: '备注', type: 'text' },
      { field_name: '经办人', type: 'user' },
    ],
    views: ['grid', 'calendar'],
  },
  schedule: {
    name: '日程管理',
    keywords: ['日期', '时间', '地点', '参与人', '主题', '会议', '行程', '提醒'],
    fields: [
      { field_name: '主题', type: 'text' },
      { field_name: '开始时间', type: 'date' },
      { field_name: '结束时间', type: 'date' },
      { field_name: '地点', type: 'location' },
      { field_name: '参与人', type: 'user' },
      { field_name: '类型', type: 'select' },
      { field_name: '备注', type: 'text' },
    ],
    views: ['grid', 'calendar'],
  },
};

/** 根据Excel表头识别业务场景 */
export function detectBusinessScene(sheets) {
  if (!sheets || sheets.length === 0) return { scene: 'general', name: '通用表格', confidence: 0, suggestions: [] };

  const sheet = sheets[0];
  const headers = (sheet.headerRow || sheet.headers || []).map(h => String(h).toLowerCase());
  const headerText = headers.join(' ');

  const scores = [];
  for (const [key, scene] of Object.entries(BUSINESS_SCENES)) {
    let score = 0;
    const matchedKeywords = [];
    for (const kw of scene.keywords) {
      if (headerText.includes(kw.toLowerCase())) { score += 1; matchedKeywords.push(kw); }
    }
    scores.push({ scene: key, name: scene.name, score: score / scene.keywords.length, matchedKeywords, template: scene });
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  if (best.score >= 0.3) {
    return {
      scene: best.scene, name: best.name, confidence: best.score,
      matchedKeywords: best.matchedKeywords, template: best.template,
      suggestions: scores.slice(0, 3).map(s => ({ scene: s.name, confidence: s.score })),
    };
  }
  return { scene: 'general', name: '通用表格', confidence: 0, suggestions: [], template: null };
}

/** 获取场景推荐字段 */
export function getSceneFieldTemplate(sceneName) {
  const scene = BUSINESS_SCENES[sceneName];
  return scene ? [...scene.fields] : [];
}

/** 获取场景推荐视图 */
export function getSceneViewTemplate(sceneName) {
  const scene = BUSINESS_SCENES[sceneName];
  return scene ? { views: [...scene.views] } : { views: ['grid'] };
}

/** 合并用户字段和模板字段 */
export function mergeWithSceneTemplate(userFields, sceneName) {
  const template = BUSINESS_SCENES[sceneName];
  if (!template) return userFields;
  const userNames = new Set(userFields.map(f => (f.field_name || f.name || '').toLowerCase()));
  const merged = [...userFields];
  for (const tf of template.fields) {
    if (!userNames.has(tf.field_name.toLowerCase())) merged.push({ ...tf });
  }
  return merged;
}

export { BUSINESS_SCENES };
