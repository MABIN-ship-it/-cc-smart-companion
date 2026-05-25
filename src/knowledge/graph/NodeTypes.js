/**
 * NodeTypes — 知识图谱的节点和边类型定义。
 */

/** 节点类型 */
export const NODE_TYPES = {
  PROFILE_FACT: 'profile_fact',
  MEMORY: 'memory',
  LESSON: 'lesson',
  PSYCH_OBSERVATION: 'psych_observation',
  PROJECT_ENTITY: 'project_entity',
  INTEREST_DOMAIN: 'interest_domain',
  CONVERSATION: 'conversation',
};

/** 边类型 */
export const EDGE_TYPES = {
  SUPPORTS: 'SUPPORTS',
  CONTRADICTS: 'CONTRADICTS',
  DERIVED_FROM: 'DERIVED_FROM',
  RELATED_TO: 'RELATED_TO',
  OCCURRED_IN: 'OCCURRED_IN',
  BELONGS_TO: 'BELONGS_TO',
  EVOLVED_TO: 'EVOLVED_TO',
};

/** 节点类型的显示配置 */
export const NODE_DISPLAY = {
  [NODE_TYPES.PROFILE_FACT]: { label: '用户画像', color: '#a855f7', size: 8, icon: '👤' },
  [NODE_TYPES.MEMORY]: { label: '记忆', color: '#3b82f6', size: 6, icon: '🧠' },
  [NODE_TYPES.LESSON]: { label: '经验教训', color: '#f59e0b', size: 6, icon: '📖' },
  [NODE_TYPES.PSYCH_OBSERVATION]: { label: '心理观察', color: '#10b981', size: 7, icon: '🔍' },
  [NODE_TYPES.PROJECT_ENTITY]: { label: '项目', color: '#6b7280', size: 5, icon: '📁' },
  [NODE_TYPES.INTEREST_DOMAIN]: { label: '兴趣', color: '#ec4899', size: 7, icon: '⭐' },
  [NODE_TYPES.CONVERSATION]: { label: '对话', color: '#8b5cf6', size: 4, icon: '💬' },
};

/** 边类型的显示配置 */
export const EDGE_DISPLAY = {
  [EDGE_TYPES.SUPPORTS]: { label: '支撑', color: '#22c55e', width: 2 },
  [EDGE_TYPES.CONTRADICTS]: { label: '矛盾', color: '#ef4444', width: 1.5, dashed: true },
  [EDGE_TYPES.DERIVED_FROM]: { label: '归纳自', color: '#a8a29e', width: 1 },
  [EDGE_TYPES.RELATED_TO]: { label: '关联', color: '#94a3b8', width: 1 },
  [EDGE_TYPES.OCCURRED_IN]: { label: '发生于', color: '#60a5fa', width: 1 },
  [EDGE_TYPES.BELONGS_TO]: { label: '属于', color: '#c084fc', width: 1.5 },
  [EDGE_TYPES.EVOLVED_TO]: { label: '演变为', color: '#fbbf24', width: 1.5 },
};

export default { NODE_TYPES, EDGE_TYPES, NODE_DISPLAY, EDGE_DISPLAY };
