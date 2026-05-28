/**
 * 多模型适配层 — 统一接口，支持 Anthropic 和 OpenAI 两大协议族。
 *
 * v3.0 重构：供应商分组结构
 * - SUPPLIER_REGISTRY：供应商（卡片展示）
 * - MODEL_REGISTRY：具体模型（芯片展示），通过 supplier 字段关联供应商
 * - 同供应商下所有模型共享 API Key
 */

// ─── 供应商注册表 ─────────────────────────────────────────
const SUPPLIER_REGISTRY = {
  deepseek: {
    id: 'deepseek', name: 'DeepSeek',
    note: '国产AI顶流，编程推理一流，1M超长上下文',
    registerUrl: 'https://platform.deepseek.com/api_keys',
    apiKeyLabel: 'DeepSeek API Key',
    defaultModel: 'deepseek-v4-pro',
  },
  openai: {
    id: 'openai', name: 'OpenAI',
    note: '全球AI标杆，多模态理解业界最强',
    registerUrl: 'https://platform.openai.com/api-keys',
    apiKeyLabel: 'OpenAI API Key',
    defaultModel: 'gpt-4o',
  },
  tongyi: {
    id: 'tongyi', name: '通义千问',
    note: '阿里云出品，中文理解顶级，百万上下文',
    registerUrl: 'https://dashscope.console.aliyun.com/apiKey',
    apiKeyLabel: '阿里云 API Key',
    defaultModel: 'qwen-plus',
  },
  doubao: {
    id: 'doubao', name: '豆包',
    note: '字节跳动出品，全模态支持，性价比炸裂',
    registerUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    apiKeyLabel: '火山引擎 API Key',
    defaultModel: 'doubao-seed-2.0-pro',
  },
  zhipu: {
    id: 'zhipu', name: '智谱 GLM',
    note: '智谱AI，Agent自主工作能力强，编程专精',
    registerUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    apiKeyLabel: '智谱 API Key',
    defaultModel: 'glm-5',
  },
  kimi: {
    id: 'kimi', name: 'Kimi',
    note: '月之暗面出品，长文档阅读神器，256K上下文',
    registerUrl: 'https://platform.moonshot.cn/console/api-keys',
    apiKeyLabel: 'Kimi API Key',
    defaultModel: 'kimi-k2.6',
  },
  xiaomi: {
    id: 'xiaomi', name: '小米 MiMo',
    note: '小米大模型，开源可商用(MIT)，1.1M上下文',
    registerUrl: 'https://mimo.xiaomi.com/',
    apiKeyLabel: '小米MiMo API Key',
    defaultModel: 'mimo-v2.5-pro',
  },
  minimax: {
    id: 'minimax', name: 'MiniMax',
    note: 'MiniMax，Agent工作流专项优化',
    registerUrl: 'https://platform.minimax.chat/',
    apiKeyLabel: 'MiniMax API Key',
    defaultModel: 'minimax-m2.5',
  },
  stepfun: {
    id: 'stepfun', name: '阶跃星辰',
    note: '国产新锐，生成速度极快，中文能力扎实',
    registerUrl: 'https://platform.stepfun.com/',
    apiKeyLabel: '阶跃 API Key',
    defaultModel: 'step-3.5-flash',
  },
  baidu: {
    id: 'baidu', name: '百度文心',
    note: '百度出品，中文传统文化理解最深',
    registerUrl: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application',
    apiKeyLabel: '百度千帆 API Key',
    defaultModel: 'ernie-4.5',
    extraFields: ['appid'],
  },
  siliconflow: {
    id: 'siliconflow', name: 'SiliconFlow',
    note: '聚合平台，硅谷部署延迟低，多模型一站访问',
    registerUrl: 'https://cloud.siliconflow.cn/account/ak',
    apiKeyLabel: 'SiliconFlow API Key',
    defaultModel: 'siliconflow-deepseek-v3',
  },
  custom: {
    id: 'custom', name: '+ 自定义供应商',
    note: '兼容 OpenAI/Anthropic 协议的任意 API 端点',
    registerUrl: '',
    apiKeyLabel: '自定义 API Key',
    defaultModel: null,
    isCustom: true,
  },
};

// ─── 模型注册表 ───────────────────────────────────────────
const MODEL_REGISTRY = {
  // ── DeepSeek ──
  'deepseek-v4-pro': {
    supplier: 'deepseek',
    name: 'DeepSeek V4 Pro',
    endpoint: 'https://api.deepseek.com/anthropic/v1/messages',
    protocol: 'anthropic', vision: true, defaultMaxTokens: 8192, contextWindow: 1000000,
    description: '🏆 综合最强——编程、推理、写作、分析样样精通。支持图片识别，一次能读100万字（约3本小说）。缺点：高峰期偶尔排队。适合：日常对话+专业工作，首选推荐',
  },
  'deepseek-v4-flash': {
    supplier: 'deepseek',
    name: 'DeepSeek V4 Flash',
    endpoint: 'https://api.deepseek.com/anthropic/v1/messages',
    protocol: 'anthropic', vision: true, defaultMaxTokens: 8192, contextWindow: 1000000,
    description: '⚡ 速度飞快，价格只有Pro的1/3。日常聊天、翻译、摘要等轻量任务绰绰有余。缺点：复杂逻辑推理不如Pro。适合：高频简单任务，省钱首选',
  },
  'deepseek-chat': {
    supplier: 'deepseek',
    name: 'DeepSeek V3 (旧)',
    endpoint: 'https://api.deepseek.com/anthropic/v1/messages',
    protocol: 'anthropic', defaultMaxTokens: 4096, contextWindow: 128000,
    description: '📦 上代经典版，稳定可靠。缺点：不支持图片，上下文只有Pro的1/8，官方即将退役。不推荐新用户选择',
  },
  // ── OpenAI ──
  'gpt-4o': {
    supplier: 'openai',
    name: 'GPT-4o',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 128000, vision: true,
    description: '🌐 全球标杆，多模态理解业界最强——图片、文字、代码都能深度分析。缺点：价格较高，国内需要科学上网。适合：对质量要求极高的专业场景',
  },
  'gpt-4o-mini': {
    supplier: 'openai',
    name: 'GPT-4o Mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 128000, vision: true,
    description: '💰 4o的轻量版，70%的性能、30%的价格。聊聊天、写写文案完全够用。缺点：深度分析能力有限。适合：预算有限但想要GPT品质',
  },
  'gpt-4.1': {
    supplier: 'openai',
    name: 'GPT-4.1',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 1000000,
    description: '📚 OpenAI最新力作，100万字超长上下文，一口气读完整本书。缺点：API刚出不久，稳定性待观察。适合：需要处理超长文档的场景',
  },
  // ── 通义千问 ──
  'qwen3-max': {
    supplier: 'tongyi',
    name: '通义千问 Max',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 262144,
    description: '🇨🇳 阿里旗舰，中文理解能力顶级——诗词、成语、中文语境理解无人能及。缺点：英文和代码能力不如DeepSeek和GPT。适合：纯中文深度任务',
  },
  'qwen-plus': {
    supplier: 'tongyi',
    name: '通义千问 Plus',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 1000000,
    description: '⚖️ 均衡之选，百万字上下文+扎实中文能力+亲民价格。缺点：创造力中等，不会给你惊喜也不会让你失望。适合：中文日常使用，性价比最高',
  },
  'qwen-flash': {
    supplier: 'tongyi',
    name: '通义千问 Flash',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 1000000,
    description: '🏃 极速响应，比Max快3倍，价格只要零头。简单问答、翻译、总结秒回。缺点：复杂任务容易翻车。适合：对速度要求高的简单对话',
  },
  'qwen3-vl-plus': {
    supplier: 'tongyi',
    name: '通义千问 VL Plus',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 131072, vision: true,
    description: '👁️ 千问的视觉版——看图写文案、分析图表、识别照片内容非常出色。缺点：纯文字对话不如Max。适合：经常需要分析图片的用户',
  },
  'qwq-plus': {
    supplier: 'tongyi',
    name: '通义千问 QwQ',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 131072,
    description: '🧠 千问的"慢思考"版本——遇到数学题、逻辑推理会像人类一样慢慢想、一步步推。缺点：速度慢，简单问题也喜欢绕弯子。适合：数学/逻辑/编程难题',
  },
  // ── 豆包 ──
  'doubao-seed-2.0-pro': {
    supplier: 'doubao',
    name: '豆包 Seed 2.0 Pro',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 262144, vision: true,
    description: '🔥 字节跳动旗舰模型，全模态——文字、图片、编程一把抓，中文能力对标千问，编程不输DeepSeek。缺点：品牌知名度偏低。适合：想体验大厂旗舰又不想折腾网络',
  },
  'doubao-seed-2.0-lite': {
    supplier: 'doubao',
    name: '豆包 Seed 2.0 Lite',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 262144, vision: true,
    description: '🎯 Pro的轻量版，85%的性能、一半的价格。日常使用和Pro体验差别不大。缺点：极限场景（超长推理）不如Pro。适合：豆包系日常首选',
  },
  'doubao-seed-1.6-flash': {
    supplier: 'doubao',
    name: '豆包 Seed 1.6 Flash',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 262144, vision: true,
    description: '💸 最便宜的视觉模型，支持图片识别还能省到极致。缺点：整体能力偏弱，不太适合复杂任务。适合：只需要基础图片识别+对话',
  },
  // ── 智谱 GLM ──
  'glm-5': {
    supplier: 'zhipu',
    name: '智谱 GLM-5',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 200000,
    description: '🤖 智谱最新旗舰，自主工作能力强——给它一个目标能自己拆任务、找工具、完成工作。缺点：响应速度中等。适合：需要AI独立完成多步骤任务的场景',
  },
  'glm-4.7': {
    supplier: 'zhipu',
    name: '智谱 GLM-4.7',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 200000,
    description: '💻 编程能力专精强化版，写代码、改Bug、做Code Review非常出色。缺点：通用聊天和知识广度不如GLM-5。适合：程序员的代码助手',
  },
  'glm-4v-plus': {
    supplier: 'zhipu',
    name: '智谱 GLM-4V Plus',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 128000, vision: true,
    description: '👁️ 智谱视觉模型，图表分析、OCR识别、图片理解都不错。缺点：纯文字任务不如GLM-4.7。适合：需要图片+文字混合处理',
  },
  // ── Kimi ──
  'kimi-k2.6': {
    supplier: 'kimi',
    name: 'Kimi K2.6',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 256000, vision: true,
    description: '📖 月之暗面最新旗舰，25万字上下文+多模态支持，读长文、分析报告一把好手。缺点：价格偏高。适合：经常需要分析长文档',
  },
  'moonshot-v1-8k': {
    supplier: 'kimi',
    name: 'Moonshot 8K',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 8000,
    description: '📝 Kimi早期版本，只有8000字上下文（约4页纸）。缺点：上下文太短，已被K2.6全面超越。不推荐新用户选择',
  },
  // ── 小米 MiMo ──
  'mimo-v2.5-pro': {
    supplier: 'xiaomi',
    name: '小米 MiMo V2.5 Pro',
    endpoint: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 1100000, vision: true,
    description: '🏅 小米旗舰，110万字超长上下文+强编程能力，性能对标一线模型。缺点：小米AI生态刚起步，周边工具不如大厂。适合：小米用户、追求超长上下文',
  },
  'mimo-v2.5': {
    supplier: 'xiaomi',
    name: '小米 MiMo V2.5',
    endpoint: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 1100000, vision: true,
    description: '🔓 开源旗舰，MIT协议完全免费商用——你可以把它部署在自己服务器上不花一分钱。缺点：API版性能稍逊Pro。适合：关注隐私或想自部署的用户',
  },
  'mimo-v2-pro': {
    supplier: 'xiaomi',
    name: '小米 MiMo V2 Pro',
    endpoint: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 1000000, vision: true,
    description: '💪 上一代旗舰，编程能力曾被市场广泛验证。缺点：已被V2.5全面超越。适合：对V2.5稳定性有顾虑时的备选',
  },
  'mimo-v2-omni': {
    supplier: 'xiaomi',
    name: '小米 MiMo V2 Omni',
    endpoint: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 256000, vision: true,
    description: '🎨 全模态融合——图片、语音、文字原生混合理解，不是"贴上去"的多模态。缺点：纯文本能力不如Pro。适合：需要语音+图片+文字混合交互',
  },
  'mimo-v2-flash': {
    supplier: 'xiaomi',
    name: '小米 MiMo V2 Flash',
    endpoint: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 256000, vision: true,
    description: '⚡ 极速版，每秒150字输出，便宜又快速。缺点：深度思考能力有限。适合：追求响应速度的日常对话',
  },
  // ── MiniMax ──
  'minimax-m2.5': {
    supplier: 'minimax',
    name: 'MiniMax M2.5',
    endpoint: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 205000,
    description: '🔧 MiniMax最新版，对Agent工作流做了专门优化——多步骤任务执行流畅。缺点：通用知识储备不如DeepSeek/GPT。适合：需要AI自动完成多步骤操作',
  },
  // ── 阶跃星辰 ──
  'step-3.5-flash': {
    supplier: 'stepfun',
    name: '阶跃 Step 3.5 Flash',
    endpoint: 'https://api.stepfun.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 256000,
    description: '✨ 阶跃星辰旗舰，生成速度极快，中文能力不错。缺点：生态尚在建设，社区资源较少。适合：追求速度、想尝试新兴国产模型',
  },
  // ── 百度文心 ──
  'ernie-4.5': {
    supplier: 'baidu',
    name: '百度文心 4.5',
    endpoint: 'https://qianfan.baidubce.com/v2/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 128000,
    description: '🏯 百度最新旗舰，中文古诗词、传统文化、国内资讯理解深度无人能及。缺点：英文和编程不如DeepSeek，需要额外配置AppID。适合：中文文化类内容创作',
  },
  // ── 聚合平台 ──
  'siliconflow-deepseek-v3': {
    supplier: 'siliconflow',
    name: 'SiliconFlow DeepSeek V3',
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 131072,
    description: '🌍 硅谷部署的DeepSeek V3，通过SiliconFlow平台访问——国内直连延迟低。缺点：第三方平台，服务稳定性依赖上游。适合：想要DeepSeek品质+更低延迟',
  },
};

// ─── 模型管理 ─────────────────────────────────────────────

/** 获取所有供应商列表（含旗下模型子列表） */
export function getSuppliers() {
  const result = [];
  for (const [supplierId, sc] of Object.entries(SUPPLIER_REGISTRY)) {
    if (sc.isCustom) continue;
    const models = Object.entries(MODEL_REGISTRY)
      .filter(([, cfg]) => cfg.supplier === supplierId)
      .map(([id, cfg]) => ({
        id,
        name: cfg.name,
        description: cfg.description || '',
        contextWindow: cfg.contextWindow,
        vision: !!cfg.vision,
        protocol: cfg.protocol,
      }));
    const hasKey = models.some(m => {
      try {
        return !!localStorage.getItem(`cc_api_key_${supplierId}`);
      } catch { return false; }
    });
    result.push({ ...sc, models, hasKey, modelCount: models.length });
  }
  // 已配置的供应商排到最前面
  result.sort((a, b) => (b.hasKey ? 1 : 0) - (a.hasKey ? 1 : 0));
  return result;
}

/** 获取某个供应商下的模型 ID 列表 */
export function getSupplierModelIds(supplierId) {
  return Object.entries(MODEL_REGISTRY)
    .filter(([, cfg]) => cfg.supplier === supplierId)
    .map(([id]) => id);
}

/** 获取某个供应商的默认模型 ID */
export function getSupplierDefaultModel(supplierId) {
  return SUPPLIER_REGISTRY[supplierId]?.defaultModel || null;
}

/** 获取已保存的自定义供应商 */
export function getCustomProviders() {
  try {
    return JSON.parse(localStorage.getItem('cc_custom_providers') || '[]');
  } catch {
    return [];
  }
}

/** 保存自定义供应商 */
export function saveCustomProvider(provider) {
  const existing = getCustomProviders();
  const idx = existing.findIndex(p => p.name === provider.name);
  if (idx >= 0) existing[idx] = provider;
  else existing.push(provider);
  try { localStorage.setItem('cc_custom_providers', JSON.stringify(existing)); } catch {}
}

/** 删除自定义供应商 */
export function deleteCustomProvider(name) {
  const existing = getCustomProviders().filter(p => p.name !== name);
  try { localStorage.setItem('cc_custom_providers', JSON.stringify(existing)); } catch {}
}

export function getUserModelName(modelId) {
  try {
    const names = JSON.parse(localStorage.getItem('cc_model_names') || '{}');
    return names[modelId] || '';
  } catch { return ''; }
}

export function setUserModelName(modelId, modelName) {
  try {
    const names = JSON.parse(localStorage.getItem('cc_model_names') || '{}');
    if (modelName) names[modelId] = modelName;
    else delete names[modelId];
    localStorage.setItem('cc_model_names', JSON.stringify(names));
  } catch {}
}

/** 获取所有已注册模型（扁平列表，向后兼容） */
export function getAvailableModels() {
  const builtin = Object.entries(MODEL_REGISTRY).map(([id, cfg]) => ({
    id,
    name: cfg.name,
    protocol: cfg.protocol,
    contextWindow: cfg.contextWindow,
    apiKeyLabel: SUPPLIER_REGISTRY[cfg.supplier]?.apiKeyLabel || '',
    vision: !!cfg.vision,
    description: cfg.description || '',
    supplier: cfg.supplier,
  }));
  return builtin;
}

/** 获取模型配置 */
export function getModelConfig(modelId) {
  const cfg = MODEL_REGISTRY[modelId];
  if (!cfg) throw new Error(`未注册的模型: ${modelId}`);
  return cfg;
}

/** 获取用户当前选择的模型ID */
export function getCurrentModel() {
  try {
    return localStorage.getItem('cc_current_model') || 'deepseek-v4-pro';
  } catch {
    return 'deepseek-v4-pro';
  }
}

/** 判断模型是否支持视觉/图片输入 */
export function isVisionModel(modelId) {
  return !!MODEL_REGISTRY[modelId]?.vision;
}

/** 设置用户当前选择的模型ID */
export function setCurrentModel(modelId) {
  if (!MODEL_REGISTRY[modelId]) throw new Error(`未知模型: ${modelId}`);
  try {
    localStorage.setItem('cc_current_model', modelId);
  } catch {}
}

/** 获取用户的API Key（同供应商共享） */
export function getApiKey(modelId) {
  const cfg = MODEL_REGISTRY[modelId];
  if (!cfg) return null;
  const supplierKeyName = cfg.supplier ? `cc_api_key_${cfg.supplier}` : null;
  const modelKeyName = `cc_api_key_${modelId}`;
  try {
    return (supplierKeyName && localStorage.getItem(supplierKeyName))
      || localStorage.getItem(modelKeyName)
      || null;
  } catch {
    return null;
  }
}

/** 设置用户的API Key（按供应商存储，同厂商共享） */
export function setApiKey(modelId, key) {
  const cfg = MODEL_REGISTRY[modelId];
  if (!cfg) return;
  const keyName = cfg.supplier
    ? `cc_api_key_${cfg.supplier}`
    : `cc_api_key_${modelId}`;
  try {
    localStorage.setItem(keyName, key);
  } catch {}
}

// ─── 额外字段（百度appid等）─────────────────────────────────

export function getExtraHeader(modelId, field) {
  const cfg = MODEL_REGISTRY[modelId];
  const supplierId = cfg?.supplier;
  if (!supplierId) return '';
  try {
    return localStorage.getItem(`cc_extra_${supplierId}_${field}`) || '';
  } catch { return ''; }
}

export function setExtraHeader(modelId, field, value) {
  const cfg = MODEL_REGISTRY[modelId];
  const supplierId = cfg?.supplier;
  if (!supplierId) return;
  try {
    localStorage.setItem(`cc_extra_${supplierId}_${field}`, value);
  } catch {}
}

// ─── 协议转换核心 ─────────────────────────────────────────

function toAnthropicFormat({ model, modelCfg, messages, systemPrompt, tools, maxTokens, temperature }) {
  return {
    url: modelCfg.endpoint,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(model),
      'anthropic-version': '2023-06-01',
    },
    body: {
      model: modelCfg.modelName || model,
      max_tokens: maxTokens || modelCfg.defaultMaxTokens,
      thinking: { type: 'enabled', budget_tokens: 4000 },
      temperature: temperature ?? 0.7,
      system: systemPrompt,
      messages,
      ...(tools?.length ? { tools } : {}),
    },
  };
}

function toOpenAIFormat({ model, modelCfg, messages, systemPrompt, tools, maxTokens, temperature }) {
  const openaiMessages = [];
  if (systemPrompt) {
    openaiMessages.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (Array.isArray(msg.content)) {
        const hasToolResults = msg.content.some(b => b.type === 'tool_result');
        if (hasToolResults) {
          for (const block of msg.content) {
            if (block.type === 'tool_result') {
              openaiMessages.push({
                role: 'tool',
                tool_call_id: block.tool_use_id,
                content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
              });
            }
          }
        } else {
          const parts = [];
          for (const block of msg.content) {
            if (block.type === 'image') {
              parts.push({
                type: 'image_url',
                image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` }
              });
            } else if (block.type === 'image_url') {
              parts.push(block);
            } else if (block.type === 'text') {
              parts.push(block);
            }
          }
          if (parts.length > 0) {
            openaiMessages.push({ role: 'user', content: parts });
          }
        }
      } else {
        openaiMessages.push({ role: 'user', content: msg.content });
      }
    } else if (msg.role === 'assistant') {
      if (Array.isArray(msg.content)) {
        const blocks = msg.content;
        const textParts = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');
        const toolCalls = blocks
          .filter(b => b.type === 'tool_use')
          .map(b => ({
            id: b.id,
            type: 'function',
            function: { name: b.name, arguments: JSON.stringify(b.input) },
          }));
        openaiMessages.push({
          role: 'assistant',
          content: textParts || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        });
      } else {
        openaiMessages.push({ role: 'assistant', content: msg.content });
      }
    }
  }

  const openaiTools = tools?.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  return {
    url: modelCfg.endpoint,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey(model)}`,
    },
    body: {
      model: modelCfg.modelName || model,
      max_tokens: maxTokens || modelCfg.defaultMaxTokens,
      temperature: temperature ?? 0.7,
      messages: openaiMessages,
      ...(openaiTools?.length ? { tools: openaiTools, tool_choice: 'auto' } : {}),
    },
  };
}

// ─── 响应解析 ─────────────────────────────────────────────

function parseAnthropicResponse(data) {
  if (data.error) {
    return { error: data.error.message || JSON.stringify(data.error) };
  }
  const content = data.content;
  if (!content || !Array.isArray(content)) {
    if (data.choices) {
      return { text: data.choices[0]?.message?.content || '', toolUses: [] };
    }
    return { error: 'API返回格式异常' };
  }
  const textParts = [];
  const thinkingParts = [];
  const toolUses = [];
  for (const block of content) {
    if (block.type === 'text' && block.text) textParts.push(block.text);
    if (block.type === 'thinking' && block.thinking) thinkingParts.push(block.thinking);
    if (block.type === 'tool_use') {
      toolUses.push({ id: block.id, name: block.name, input: block.input || {} });
    }
  }
  return {
    text: textParts.join('').trim(),
    thinking: thinkingParts.join('').trim() || undefined,
    toolUses,
    stopReason: data.stop_reason || null,
    usage: data.usage || null,
  };
}

function parseOpenAIResponse(data) {
  if (data.error) {
    return { error: data.error.message || JSON.stringify(data.error) };
  }
  const choice = data.choices?.[0];
  if (!choice) return { error: 'API返回格式异常' };
  const message = choice.message || {};
  const text = message.content || '';
  const thinking = message.reasoning_content || undefined;
  const toolUses = [];
  if (message.tool_calls?.length) {
    for (const tc of message.tool_calls) {
      let input = {};
      try { input = JSON.parse(tc.function.arguments || '{}'); } catch {}
      toolUses.push({ id: tc.id, name: tc.function.name, input });
    }
  }
  return {
    text: text.trim(),
    thinking,
    toolUses,
    stopReason: choice.finish_reason || null,
    usage: data.usage || null,
  };
}

// ─── 对外接口 ─────────────────────────────────────────────

export async function sendModelRequest({ model, messages, systemPrompt, tools, maxTokens, temperature, signal }) {
  const modelCfg = getModelConfig(model);
  const apiKey = getApiKey(model);
  if (!apiKey) {
    throw new Error(`未设置 ${modelCfg.name} 的API Key`);
  }

  let request;
  if (modelCfg.protocol === 'anthropic') {
    request = toAnthropicFormat({ model, modelCfg, messages, systemPrompt, tools, maxTokens, temperature });
  } else {
    request = toOpenAIFormat({ model, modelCfg, messages, systemPrompt, tools, maxTokens, temperature });
  }

  const res = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal,
  });

  const data = await res.json();

  let result;
  if (modelCfg.protocol === 'anthropic') {
    result = parseAnthropicResponse(data);
  } else {
    result = parseOpenAIResponse(data);
  }

  result._httpStatus = res.status;
  return result;
}

// ─── 流式请求 ─────────────────────────────────────────────

export async function* sendModelRequestStream({ model, messages, systemPrompt, tools, maxTokens, temperature, signal }) {
  const modelCfg = getModelConfig(model);
  const apiKey = getApiKey(model);

  if (!apiKey) {
    yield { type: 'error', error: `未设置 ${modelCfg.name} 的API Key` };
    return;
  }

  let request;
  if (modelCfg.protocol === 'anthropic') {
    request = toAnthropicFormat({ model, modelCfg, messages, systemPrompt, tools, maxTokens, temperature });
    request.body.stream = true;
  } else {
    request = toOpenAIFormat({ model, modelCfg, messages, systemPrompt, tools, maxTokens, temperature });
    request.body.stream = true;
  }

  const res = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '未知错误');
    yield { type: 'error', error: `HTTP ${res.status}: ${errorText}` };
    return;
  }

  const reader = res.body.getReader();
  const { parseAnthropicStream, parseOpenAIStream } = await import('../utils/streamParser');

  const parser = modelCfg.protocol === 'anthropic'
    ? parseAnthropicStream(reader)
    : parseOpenAIStream(reader);

  const contentBlocks = [];
  let accumulatedText = '';
  let accumulatedThinking = '';

  try {
    for await (const frame of parser) {
      if (signal?.aborted) {
        reader.cancel();
        yield { type: 'error', error: '已取消' };
        return;
      }

      if (modelCfg.protocol === 'anthropic') {
        switch (frame.event) {
          case 'content_block_start': {
            const block = frame.data?.content_block;
            if (block) {
              contentBlocks[frame.data?.index || 0] = block;
            }
            break;
          }
          case 'content_block_delta': {
            const delta = frame.data?.delta;
            const idx = frame.data?.index || 0;
            const blockType = contentBlocks[idx]?.type;
            if (delta?.type === 'text_delta' && delta.text) {
              if (blockType === 'thinking') {
                accumulatedThinking += delta.text;
                yield { type: 'think', text: delta.text, accumulated: accumulatedThinking };
              } else {
                accumulatedText += delta.text;
                yield { type: 'text', text: delta.text, accumulated: accumulatedText };
              }
            } else if (delta?.type === 'thinking_delta' && delta.thinking) {
              accumulatedThinking += delta.thinking;
              yield { type: 'think', text: delta.thinking, accumulated: accumulatedThinking };
            } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
              const idx = frame.data?.index || 0;
              if (!contentBlocks[idx]) {
                contentBlocks[idx] = { type: 'tool_use', input: {} };
              }
              const blk = contentBlocks[idx];
              blk._rawArgs = (blk._rawArgs || '') + delta.partial_json;
              try { blk.input = JSON.parse(blk._rawArgs); } catch {}
            }
            break;
          }
          case 'content_block_stop': {
            const index = frame.data?.index || 0;
            const block = contentBlocks[index];
            if (block?.type === 'tool_use') {
              delete block._rawArgs;
              yield { type: 'tool_use', toolUse: block };
            }
            break;
          }
          case 'message_stop':
            yield { type: 'done', text: accumulatedText, stopReason: 'end_turn' };
            break;
        }
      } else {
        if (frame.event === 'done') {
          yield { type: 'done', text: accumulatedText, stopReason: 'stop' };
          break;
        }
        if (frame.event === 'delta') {
          const choice = frame.data?.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta;
          if (delta?.content) {
            accumulatedText += delta.content;
            yield { type: 'text', text: delta.content, accumulated: accumulatedText };
          }
          if (delta?.reasoning_content) {
            accumulatedThinking += delta.reasoning_content;
            yield { type: 'think', text: delta.reasoning_content, accumulated: accumulatedThinking };
          }
          if (delta?.tool_calls?.length) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index || 0;
              if (!contentBlocks[idx]) {
                contentBlocks[idx] = {
                  type: 'tool_use',
                  id: tc.id || `tool_${idx}`,
                  name: tc.function?.name || '',
                  input: {},
                  _rawArgs: '',
                };
              }
              if (tc.function?.arguments) {
                const block = contentBlocks[idx];
                block._rawArgs += tc.function.arguments;
                try { block.input = JSON.parse(block._rawArgs); } catch {}
              }
            }
          }
          if (choice.finish_reason) {
            for (const block of contentBlocks) {
              if (block?.type === 'tool_use' && block.name) {
                delete block._rawArgs;
                yield { type: 'tool_use', toolUse: block };
              }
            }
            yield { type: 'done', text: accumulatedText, stopReason: choice.finish_reason };
          }
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

// ─── 工具结果消息构建 ──────────────────────────────────────

export function buildToolResultsMessage(toolResults) {
  return {
    role: 'user',
    content: toolResults.map(tr => ({
      type: 'tool_result',
      tool_use_id: tr.tool_use_id,
      content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
    })),
  };
}

export function buildToolResultMessage(toolUseId, resultContent) {
  return {
    role: 'user',
    content: [{
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent),
    }],
  };
}

export function buildToolUseMessage(contentBlocks) {
  return { role: 'assistant', content: contentBlocks };
}
