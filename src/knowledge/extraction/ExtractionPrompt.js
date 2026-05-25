/**
 * ExtractionPrompt — 构建知识提取的 LLM 提示词。
 *
 * 核心设计原则：
 * 1. 明确告诉LLM不要提取什么（问候语、感叹词、非信息性内容）
 * 2. 提供当前已有画像作为上下文，避免重复提取
 * 3. 要求结构化JSON输出，附带置信度和证据
 */

/**
 * 构建提取提示词的系统部分。
 * @param {object} options
 * @param {object} options.currentProfile - 当前用户画像（避免重复提取）
 * @param {string} options.currentProject - 当前项目路径（可选）
 * @returns {string}
 */
export function buildExtractionSystemPrompt({ currentProfile = {}, currentProject = '' } = {}) {
  const profileContext = Object.keys(currentProfile).length > 0
    ? `\n## 当前已知用户画像（避免重复提取）\n${JSON.stringify(currentProfile, null, 2)}\n`
    : '';

  const projectContext = currentProject
    ? `\n用户当前工作区: ${currentProject}`
    : '';

  return `你是CC的知识提取器。你的任务是从用户与AI的对话中提取结构化的知识信息。

## 核心原则

1. **质量优先**：只提取有实际信息价值的内容。不要提取问候语（"你好""再见"）、感叹词（"哈哈""嗯嗯"）、过渡语、单纯的道谢等无信息量的内容。
2. **置信度评估**：对每条提取给出 0.0-1.0 的置信度。用户明确陈述（"我叫张三"）→ 0.9+；从上下文推断（用户多次用Python写代码）→ 0.5-0.7；模糊暗示 → 0.3以下不提取。
3. **原文证据**：每条提取必须包含 evidence 字段，引用原文中的具体语句。
4. **避免重复**：参考"当前已知用户画像"，如果信息已经存在且没有变化，不要重复提取。

## 提取维度

### 1. profile_updates — 用户画像更新
应提取：姓名、称呼偏好、所在地、职业、技能、兴趣、偏好（喜欢/不喜欢/需要/讨厌）、对CC的具体评价（仅当用户明确表达了对CC的态度或感受，日常问候如"你好""嗨"不是评价）、健康相关信息
不要提取：日常问候（"你好""嗨"）、无信息量感叹（"哈哈""好棒"）、过渡语句
重要：key必须使用英文snake_case，禁止使用中文作为key。如必须用 "name" 而非 "姓名"，用 "location" 而非 "所在地"，用 "occupation" 而非 "职业"。
	另外，每条profile_update必须提供label字段，即该字段的中文显示名（如 key="workplace" → label="工作地点"）。label让UI能正确显示中文标签。

### 2. memories — 记忆
应提取：用户计划/目标、重要事件、截止日期、人际关系、有价值的事实信息
不要提取：闲聊内容、24小时内会自动过期的琐事
importance评估：涉及用户目标/计划的 → high；有价值但非关键的 → medium；背景信息 → low

### 3. lessons — 经验教训
用户的正负反馈模式。关注用户表达不满（"太啰嗦""不对""不准确""太慢"）或满意（"对""很好""正是我想要的""比上次好"）的时机。注意：单纯的礼貌用语（"谢谢""感谢""不客气""多谢"）不是经验教训，不要提取。经验教训必须描述具体的交互模式或行为规律，而非泛泛的礼貌表达。

### 4. psychological_observations — 心理维度观察
从对话中观察用户的心理特征和沟通模式。维度包括：
- communication_style: 简洁/啰嗦、直接/委婉、正式/随意、使用emoji频率
- emotional_pattern: 压力的触发点、积极情绪的来源、情绪表达程度
- cognitive_style: 系统化/直觉化思考、关注大局/细节、学习偏好
- motivation: 短期目标、长期追求、职业领域、价值观
- wellbeing: 健康关注（仅在用户主动提及时）
仅当 confidence >= 0.5 时才输出此类观察。

### 5. project_updates — 项目更新${projectContext ? '\n参考当前工作区，提取对项目文件/模块的讨论。' : '\n如果不知道该对话的工作区，忽略此维度。'}

### 6. conversation_summary — 对话总结
一句话总结（不超过50字）+ 情绪基调（positive/neutral/negative/stressed/excited）

${profileContext}
${projectContext}

你需要输出JSON格式。确保所有字符串使用用户原始语言。`;
}

/**
 * 构建单轮提取的用户消息（包含需要分析的对话对）。
 * @param {object} messagePair
 * @param {string} messagePair.userMessage - 用户消息
 * @param {string} messagePair.aiResponse - AI回复
 * @returns {string}
 */
export function buildExtractionUserMessage({ userMessage, aiResponse }) {
  return `请从以下对话中提取结构化知识：

<用户消息>
${userMessage}
</用户消息>

<AI回复>
${aiResponse}
</AI回复>

请输出JSON。`;
}

/**
 * 构建批量提取的用户消息
 * @param {Array<{userMessage: string, aiResponse: string}>} pairs
 * @returns {string}
 */
export function buildBatchExtractionMessage(pairs) {
  let msg = '请从以下多轮对话中提取结构化知识：\n\n';
  for (let i = 0; i < pairs.length; i++) {
    msg += `## 第${i + 1}轮\n`;
    msg += `<用户>${pairs[i].userMessage}</用户>\n`;
    msg += `<AI>${pairs[i].aiResponse}</AI>\n\n`;
  }
  msg += '请输出JSON。';
  return msg;
}

export default { buildExtractionSystemPrompt, buildExtractionUserMessage, buildBatchExtractionMessage };
