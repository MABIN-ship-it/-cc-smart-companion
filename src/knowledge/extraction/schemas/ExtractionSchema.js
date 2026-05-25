/**
 * ExtractionSchema — 定义 LLM 知识提取的结构化输出格式。
 *
 * 每次提取调用返回一个包含5个维度的JSON对象，
 * 空数组表示该维度本轮无新发现。
 */

/**
 * @typedef {object} ProfileUpdate
 * @property {string} key - 字段名（如 "name", "skill", "preference_detail_level"）
 * @property {string} value - 字段值
 * @property {string} [label] - 该字段的中文显示名（如 key="workplace" → label="工作地点"），未提供时UI回退到字典翻译
 * @property {number} confidence - 置信度 0.0-1.0
 * @property {string} evidence - 支撑该提取的原文引用
 * @property {'identity'|'preference'|'skill'|'interest'|'cc_perception'|'health'|'general'} category
 */

/**
 * @typedef {object} MemoryItem
 * @property {string} content - 记忆内容
 * @property {'high'|'medium'|'low'} importance
 * @property {'event'|'fact'|'goal'|'preference'|'relationship'} type
 * @property {string|null} expires_at - ISO 8601 过期时间，null表示永不过期
 * @property {string[]} related_entities - 关联的现有实体ID（如有）
 */

/**
 * @typedef {object} LessonItem
 * @property {string} pattern - 观察到的模式描述
 * @property {'communication_style'|'technical'|'information_seeking'|'tool_usage'|'clarity'|'general'} category
 * @property {'negative_feedback'|'positive_feedback'|'observed_pattern'} type
 * @property {string} trigger_condition - 触发此模式的条件描述
 */

/**
 * @typedef {object} PsychObservation
 * @property {'communication_style'|'emotional_pattern'|'cognitive_style'|'motivation'|'wellbeing'} dimension
 * @property {string} trait - 观察到的具体特质
 * @property {number} confidence - 置信度 0.0-1.0
 * @property {string} evidence - 支撑证据
 */

/**
 * @typedef {object} ProjectUpdate
 * @property {string} entity - 项目实体（文件路径/模块名/功能名）
 * @property {'discussed'|'modified'|'created'|'important'|'dependency'} relationship
 * @property {string} context - 讨论/修改的上下文
 */

/**
 * 完整提取结果结构。
 *
 * @typedef {object} ExtractionResult
 * @property {ProfileUpdate[]} profile_updates
 * @property {MemoryItem[]} memories
 * @property {LessonItem[]} lessons
 * @property {PsychObservation[]} psychological_observations
 * @property {ProjectUpdate[]} project_updates
 * @property {{ summary: string, sentiment: 'positive'|'neutral'|'negative'|'stressed'|'excited' }} conversation_summary
 */

/**
 * 构建 JSON Schema 用于结构化输出（OpenAI/Anthropic tool calling）。
 * @returns {object}
 */
export function buildExtractionSchema() {
  return {
    type: 'object',
    properties: {
      profile_updates: {
        type: 'array',
        description: '用户画像的增量更新。仅当本轮对话揭示了新信息时才添加。常见key（必须英文snake_case，禁止中文）: name, preferred_name, location, occupation, skills, interests, cc_perception（仅用户明确评价CC时）, 以及prefer_/need_/dislike_开头的偏好字段。不要记录问候语、语气词、过渡语等无信息量的内容。',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: '字段名' },
            value: { type: 'string', description: '字段值' },
            confidence: { type: 'number', minimum: 0, maximum: 1, description: '置信度' },
            evidence: { type: 'string', description: '原文依据' },
            label: { type: 'string', description: '该字段的中文显示名，用于UI展示。如 key="workplace" → label="工作地点"，key="project_focus" → label="项目重点"' },
            category: {
              type: 'string',
              enum: ['identity', 'preference', 'skill', 'interest', 'cc_perception', 'health', 'general'],
            },
          },
          required: ['key', 'value', 'confidence', 'evidence', 'category'],
        },
      },
      memories: {
        type: 'array',
        description: '从对话中提取的有价值记忆。不包括问候、寒暄、无信息量的闲聊。',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: '记忆内容，简洁完整的一句话' },
            importance: { type: 'string', enum: ['high', 'medium', 'low'] },
            type: { type: 'string', enum: ['event', 'fact', 'goal', 'preference', 'relationship'] },
            expires_at: { type: ['string', 'null'], description: 'ISO8601过期时间' },
            related_entities: {
              type: 'array',
              items: { type: 'string' },
              description: '关联的现有实体ID列表',
            },
          },
          required: ['content', 'importance', 'type'],
        },
      },
      lessons: {
        type: 'array',
        description: '从用户反馈或交互模式中提取的经验教训。仅提取描述具体行为模式的内容，不提取单纯的礼貌用语（谢谢、感谢、不客气等）。',
        items: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: '观察到的模式' },
            category: {
              type: 'string',
              enum: ['communication_style', 'technical', 'information_seeking', 'tool_usage', 'clarity', 'general'],
            },
            type: { type: 'string', enum: ['negative_feedback', 'positive_feedback', 'observed_pattern'] },
            trigger_condition: { type: 'string', description: '触发条件' },
          },
          required: ['pattern', 'category', 'type'],
        },
      },
      psychological_observations: {
        type: 'array',
        description: '对用户心理维度、沟通习惯、认知风格的观察。仅在有一定把握(confidence>=0.5)时添加。',
        items: {
          type: 'object',
          properties: {
            dimension: {
              type: 'string',
              enum: ['communication_style', 'emotional_pattern', 'cognitive_style', 'motivation', 'wellbeing'],
            },
            trait: { type: 'string', description: '观察到的特质' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            evidence: { type: 'string' },
          },
          required: ['dimension', 'trait', 'confidence', 'evidence'],
        },
      },
      project_updates: {
        type: 'array',
        description: '项目相关的更新。仅当用户设置了项目工作区时关注。',
        items: {
          type: 'object',
          properties: {
            entity: { type: 'string', description: '文件路径或模块名' },
            relationship: { type: 'string', enum: ['discussed', 'modified', 'created', 'important', 'dependency'] },
            context: { type: 'string', description: '讨论上下文' },
          },
          required: ['entity', 'relationship', 'context'],
        },
      },
      conversation_summary: {
        type: 'object',
        description: '对本次对话的简要总结',
        properties: {
          summary: { type: 'string', description: '一句话总结（不超过50字）' },
          sentiment: {
            type: 'string',
            enum: ['positive', 'neutral', 'negative', 'stressed', 'excited'],
          },
        },
        required: ['summary', 'sentiment'],
      },
    },
    required: ['profile_updates', 'memories', 'lessons', 'psychological_observations', 'project_updates', 'conversation_summary'],
  };
}

export default { buildExtractionSchema };
