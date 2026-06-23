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
  ollama: {
    id: 'ollama', name: '一键部署本地模型',
    note: '本地运行的模型（Ollama / llama.cpp），无需联网零费用。点下方「检测硬件并推荐模型」一键部署',
    registerUrl: 'https://ollama.com/download',
    apiKeyLabel: 'API Key（留空即可）',
    defaultModel: 'ollama-custom',
    isLocal: true,
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
  // ── Ollama 本地模型（通过上方一键部署或一键扫描添加）──
  'ollama-custom': {
    supplier: 'ollama',
    name: 'Ollama (自定义模型名)',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    modelName: '',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 32768,
    description: '🏠 使用你已下载的其他Ollama模型。请在模型名称里填入 ollama list 显示的完整名称（如 llama3.2:3b）',
  },
};

// ─── 本地模型推荐表（一键部署用）────────────────────────────────
export const LOCAL_MODEL_RECOMMENDATIONS = [
  // ⬛ 代码类
  { vramMB: 2048,  model:'qwen2.5-coder:0.5b',      sizeGB:0.3,  label:'AI编程·0.5B'},
  { vramMB: 2048,  model:'qwen2.5-coder:1.5b',      sizeGB:0.9,  label:'AI编程·1.5B'},
  { vramMB: 3072,  model:'qwen2.5-coder:3b',        sizeGB:1.8,  label:'AI编程·3B'},
  { vramMB: 6144,  model:'qwen2.5-coder:7b',        sizeGB:4.2,  label:'AI编程·7B'},
  { vramMB:12288,  model:'qwen2.5-coder:14b',       sizeGB:8.4,  label:'AI编程·14B'},
  { vramMB:16384,  model:'codellama:7b',            sizeGB:4.2,  label:'Meta编程·7B'},
  { vramMB:16384,  model:'codellama:13b',           sizeGB:7.8,  label:'Meta编程·13B'},
  { vramMB:24576,  model:'codellama:34b',           sizeGB:20,   label:'Meta编程·34B'},
  { vramMB:32768,  model:'deepseek-coder-v2:16b',   sizeGB:9.6,  label:'DS编程·16B'},
  { vramMB: 2048,  model:'starcoder2:3b',           sizeGB:1.8,  label:'StarCoder·3B'},
  // ⬛ 数学推理
  { vramMB: 2048,  model:'qwen2.5-math:1.5b',       sizeGB:1.4,  label:'数学·1.5B'},
  { vramMB: 6144,  model:'qwen2.5-math:7b',         sizeGB:4.2,  label:'数学·7B'},
  // ⬛ VL多模态
  { vramMB: 4096,  model:'qwen2.5-vl:3b',           sizeGB:4.2,  label:'视觉理解·3B'},
  { vramMB: 8192,  model:'qwen2.5-vl:7b',           sizeGB:8.6,  label:'视觉理解·7B'},
  { vramMB: 8192,  model:'minicpm-v:8b',            sizeGB:4.8,  label:'端侧视觉·8B'},
  { vramMB: 4096,  model:'llava:7b',                sizeGB:4.2,  label:'LLaVA视觉·7B'},
  { vramMB:12288,  model:'llava:13b',               sizeGB:7.8,  label:'LLaVA视觉·13B'},
  // ⬛ 超轻量 < 1GB
  { vramMB: 1024,  model:'qwen3:0.6b',              sizeGB:0.4,  label:'中文迷你·0.6B'},
  { vramMB: 1024,  model:'qwen2.5:0.5b',            sizeGB:0.3,  label:'极致轻量·0.5B'},
  { vramMB: 1024,  model:'smollm2:360m',            sizeGB:0.2,  label:'微型·360M'},
  { vramMB: 1024,  model:'llama3.2:1b',             sizeGB:0.6,  label:'Meta入门·1B'},
  { vramMB: 1024,  model:'qwen2.5-coder:0.5b',      sizeGB:0.3,  label:'迷你编程·0.5B'},
  { vramMB: 1024,  model:'granite3.1-dense:2b',     sizeGB:1.2,  label:'IBM轻量·2B'},
  // ⬛ 轻量 1-3GB
  { vramMB: 2048,  model:'qwen3:1.7b',              sizeGB:1.0,  label:'中文轻量·1.7B'},
  { vramMB: 2048,  model:'deepseek-r1:1.5b',        sizeGB:0.9,  label:'推理入门·1.5B'},
  { vramMB: 2048,  model:'llama3.2:3b',             sizeGB:2.0,  label:'Meta轻量·3B'},
  { vramMB: 2048,  model:'gemma2:2b',               sizeGB:1.2,  label:'Google轻量·2B'},
  { vramMB: 2048,  model:'gemma3:1b',               sizeGB:0.6,  label:'Google迷你·1B'},
  { vramMB: 2048,  model:'smollm2:1.7b',            sizeGB:1.0,  label:'轻量·1.7B'},
  { vramMB: 2048,  model:'qwen2.5:1.5b',            sizeGB:0.9,  label:'经典轻量·1.5B'},
  // ⬛ 中量 3-6GB
  { vramMB: 4096,  model:'qwen3:4b',                sizeGB:2.4,  label:'中文入门·4B'},
  { vramMB: 4096,  model:'gemma3:4b',               sizeGB:2.4,  label:'Google均衡·4B'},
  { vramMB: 4096,  model:'phi-4-mini:3.8b',         sizeGB:2.8,  label:'微软轻量·3.8B'},
  { vramMB: 4096,  model:'qwen2.5:3b',              sizeGB:1.8,  label:'中文经典·3B'},
  { vramMB: 4096,  model:'gemma2:9b',               sizeGB:5.4,  label:'Google中量·9B'},
  { vramMB: 4096,  model:'mistral-nemo:12b',        sizeGB:7.2,  label:'Mistral中层·12B'},
  { vramMB: 4096,  model:'phi3:mini',               sizeGB:2.8,  label:'微软3代·3.8B'},
  // ⬛ 主流 6-10GB
  { vramMB: 6144,  model:'qwen3:8b',                sizeGB:4.8,  label:'🔥中文首选·8B'},
  { vramMB: 6144,  model:'llama3.1:8b',             sizeGB:4.8,  label:'Meta旗舰·8B'},
  { vramMB: 6144,  model:'deepseek-r1:8b',          sizeGB:4.8,  label:'🔥推理王者·8B'},
  { vramMB: 6144,  model:'mistral:7b',              sizeGB:4.2,  label:'欧洲首选·7B'},
  { vramMB: 6144,  model:'glm4:9b',                 sizeGB:5.4,  label:'智谱清言·9B'},
  { vramMB: 6144,  model:'qwen2.5:7b',              sizeGB:4.2,  label:'中文经典·7B'},
  { vramMB: 6144,  model:'yi:9b',                   sizeGB:5.9,  label:'零一万物·9B'},
  { vramMB: 6144,  model:'gemma3:12b',              sizeGB:7.2,  label:'Google主力·12B'},
  { vramMB: 6144,  model:'command-r:35b',           sizeGB:21,   label:'Cohere·35B'},
  { vramMB: 8192,  model:'llama3.1:70b',            sizeGB:42,   label:'Meta70B'},
  // ⬛ 重量 10-16GB
  { vramMB:12288,  model:'qwen3:14b',               sizeGB:8.4,  label:'🔥中文强力·14B'},
  { vramMB:12288,  model:'deepseek-r1:14b',         sizeGB:8.4,  label:'推理进阶·14B'},
  { vramMB:12288,  model:'phi-4:14b',               sizeGB:8.4,  label:'微软旗舰·14B'},
  { vramMB:12288,  model:'mistral-small:22b',       sizeGB:13,   label:'欧主力·22B'},
  { vramMB:12288,  model:'mistral-small:24b',       sizeGB:14,   label:'欧主力·24B'},
  { vramMB:12288,  model:'qwen2.5:14b',             sizeGB:8.4,  label:'中文强力·14B'},
  { vramMB:12288,  model:'llama3.2:11b',            sizeGB:6.6,  label:'Meta视觉·11B'},
  // ⬛ 超重量 16-24GB
  { vramMB:16384,  model:'gpt-oss:20b',             sizeGB:14,   label:'OpenAI开源·20B'},
  { vramMB:16384,  model:'deepseek-r1:32b',         sizeGB:19,   label:'🔥旗舰推理·32B'},
  { vramMB:16384,  model:'qwen3:32b',               sizeGB:19,   label:'🔥中文旗舰·32B'},
  { vramMB:16384,  model:'qwen2.5:32b',             sizeGB:19,   label:'中文旗舰·32B'},
  { vramMB:16384,  model:'qwq:32b',                 sizeGB:19,   label:'Qwen思考·32B'},
  { vramMB:16384,  model:'gemma3:27b',              sizeGB:16,   label:'Google全能·27B'},
  { vramMB:16384,  model:'deepseek-coder-v2:16b',   sizeGB:9.6,  label:'DS编程·16B'},
  { vramMB:24576,  model:'deepseek-r1:70b',         sizeGB:42,   label:'终极推理·70B'},
  { vramMB:24576,  model:'llama3.3:70b',            sizeGB:42,   label:'Meta超大杯·70B'},
  { vramMB:24576,  model:'qwen2.5:72b',             sizeGB:43,   label:'中文巨无霸·72B'},
  { vramMB:24576,  model:'command-r-plus:104b',     sizeGB:62,   label:'Cohere·104B'},
  // ⬛ 巨无霸 24GB+
  { vramMB:32768,  model:'mixtral:8x7b',            sizeGB:33,   label:'MistralMoE·56B'},
  { vramMB:32768,  model:'mixtral:8x22b',           sizeGB:105,  label:'MistralMoE·176B'},
  { vramMB:32768,  model:'llama3.1:405b',           sizeGB:243,  label:'Meta巅峰·405B'},
  { vramMB:32768,  model:'nemotron:70b',            sizeGB:42,   label:'NVIDIA·70B'},
  { vramMB:49152,  model:'deepseek-v3:671b',        sizeGB:403,  label:'世界之巅·671B'},
  // ⬛ 嵌入模型
  { vramMB: 2048,  model:'nomic-embed-text',         sizeGB:0.3,  label:'嵌入向量·文本'},
  { vramMB: 2048,  model:'mxbai-embed-large',        sizeGB:0.7,  label:'嵌入向量·大型'},
];

export function getModelRecommendations(vramMB) {
  return LOCAL_MODEL_RECOMMENDATIONS
    .map(r => ({
      ...r,
      compatible: vramMB >= r.vramMB,
      tier: vramMB >= r.vramMB * 1.5 ? 'best' : vramMB >= r.vramMB ? 'ok' : 'no'
    }))
    .sort((a, b) => (a.compatible === b.compatible) ? a.sizeGB - b.sizeGB : (a.compatible ? -1 : 1));
}

export function getOllamaAutoConfig(modelName) {
  const modelId = 'ollama-' + modelName.replace(/[:.]/g, '-');
  return {
    supplier: 'ollama',
    name: 'Ollama: ' + modelName,
    endpoint: 'http://localhost:11434/v1/chat/completions',
    protocol: 'openai',
    modelName: modelName,
    defaultMaxTokens: 8192,
    contextWindow: 32768,
    description: '🏠 本地模型 ' + modelName + '（一键部署）',
  };
}

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
  // 同时注册自定义模型
  const modelId = 'custom-' + provider.name.replace(/[^a-zA-Z0-9一-鿿]/g, '-');
  const modelName = provider.modelName || provider.name;
  const customModels = JSON.parse(localStorage.getItem('cc_custom_models') || '{}');
  customModels[modelId] = {
    supplier: 'custom',
    name: provider.name + ' - ' + modelName,
    endpoint: provider.endpoint,
    protocol: provider.protocol,
    modelName: modelName,
    defaultMaxTokens: 8192,
    contextWindow: 32768,
    description: '自定义供应商：' + provider.endpoint,
  };
  try { localStorage.setItem('cc_custom_models', JSON.stringify(customModels)); } catch {}
  return modelId;
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
  // 追加自定义模型
  let custom = [];
  try {
    const cm = JSON.parse(localStorage.getItem('cc_custom_models') || '{}');
    custom = Object.entries(cm).map(([id, cfg]) => ({
      id,
      name: cfg.name,
      protocol: cfg.protocol,
      contextWindow: cfg.contextWindow,
      apiKeyLabel: '',
      vision: false,
      description: cfg.description || '',
      supplier: cfg.supplier || 'ollama',
    }));
  } catch {}
  return [...builtin, ...custom];
}

/** 获取模型配置 */
export function getModelConfig(modelId) {
  const cfg = MODEL_REGISTRY[modelId];
  if (cfg) return cfg;
  // 查找自定义模型
  try {
    const cm = JSON.parse(localStorage.getItem('cc_custom_models') || '{}');
    if (cm[modelId]) return cm[modelId];
  } catch {}
  throw new Error(`未注册的模型: ${modelId}`);
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
  // 允许内置模型和自定义模型
  const isBuiltin = !!MODEL_REGISTRY[modelId];
  let isCustom = false;
  try {
    const cm = JSON.parse(localStorage.getItem('cc_custom_models') || '{}');
    isCustom = !!cm[modelId];
  } catch {}
  if (!isBuiltin && !isCustom) throw new Error(`未知模型: ${modelId}`);
  try {
    localStorage.setItem('cc_current_model', modelId);
  } catch {}
}

/** 获取用户的API Key（同供应商共享） */
export function getApiKey(modelId) {
  let supplier = (MODEL_REGISTRY[modelId] || {}).supplier;
  if (!supplier) {
    try { const cm = JSON.parse(localStorage.getItem('cc_custom_models')||'{}'); if (cm[modelId]) supplier = cm[modelId].supplier; } catch {}
  }
  if (supplier === 'ollama') return 'ollama';
  if (!supplier) return null;
  try { return localStorage.getItem(`cc_api_key_${supplier}`) || null; } catch { return null; }
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

  const isLocal = SUPPLIER_REGISTRY[modelCfg.supplier]?.isLocal;
  const headers = { 'Content-Type': 'application/json' };
  if (!isLocal) headers['Authorization'] = `Bearer ${getApiKey(model)}`;

  return {
    url: modelCfg.endpoint,
    headers,
    body: {
      model: modelCfg.modelName || model,
      max_tokens: maxTokens || modelCfg.defaultMaxTokens,
      temperature: temperature ?? (isLocal ? undefined : 0.7),
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
  let modelCfg = getModelConfig(model);
  const apiKey = getApiKey(model);
  const isLocalModel = SUPPLIER_REGISTRY[modelCfg.supplier]?.isLocal;
  if (!apiKey && !isLocalModel) {
    throw new Error(`未设置 ${modelCfg.name} 的API Key`);
  }

  // 本地模型非流式请求也走 /api/chat
  if (isLocalModel) {
    const nativeBody = {
      model: modelCfg.modelName,
      messages: messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' })),
      stream: false,
      keep_alive: -1
    };
    if (systemPrompt) nativeBody.messages.unshift({ role: 'system', content: systemPrompt.slice(0, 200) });
    const url = modelCfg.endpoint.replace('/v1/chat/completions', '/api/chat');
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(nativeBody), signal });
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(errorText || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return { text: data?.message?.content || '', _httpStatus: res.status };
  }

  let request;
  if (modelCfg.protocol === 'anthropic') {
    request = toAnthropicFormat({ model, modelCfg, messages, systemPrompt, tools, maxTokens, temperature });
  } else {
    request = toOpenAIFormat({ model, modelCfg, messages, systemPrompt, tools, maxTokens, temperature });
  }

  // 本地模型走主进程代理（同 curl，零多余头）
  const res = await fetch(request.url, { method:'POST', headers:request.headers, body:JSON.stringify(request.body), signal });

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
  let modelCfg = getModelConfig(model);
  const apiKey = getApiKey(model);
  const isLocalModel2 = SUPPLIER_REGISTRY[modelCfg.supplier]?.isLocal;

  if (!apiKey && !isLocalModel2) {
    yield { type: 'error', error: `未设置 ${modelCfg.name} 的API Key` };
    return;
  }


  // ── 本地模型走 Ollama 原生 /api/chat 流式，绕过 v1 翻译层 ──
  if (isLocalModel2) {
    // 本地模型极简系统提示词：截断到 200 字符，避免首 token 延迟
    const localSystemPrompt = systemPrompt ? systemPrompt.slice(0, 200) : '';
    const nativeBody = {
      model: modelCfg.modelName,
      messages: messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? (m.content.map(b => b.text || b.type || '').join(' ')) : (m.content || '')) })),
      stream: true,
      keep_alive: -1
    };
    if (localSystemPrompt) nativeBody.messages.unshift({ role: 'system', content: localSystemPrompt });

    // 本地模型：仅保留最近 12 条消息避免上下文爆炸导致 token/s 暴跌
    if (nativeBody.messages.length > 13) {
      const sys = nativeBody.messages[0]?.role === 'system' ? [nativeBody.messages[0]] : [];
      nativeBody.messages = [...sys, ...nativeBody.messages.slice(-12)];
    }

    const url = modelCfg.endpoint.replace('/v1/chat/completions', '/api/chat');
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(nativeBody), signal });
    if (!res.ok) {
      const errorText = await res.text().catch(() => '未知错误');
      yield { type: 'error', error: `HTTP ${res.status}: ${errorText}` };
      return;
    }

    // NDJSON 流式解析——每行一个 JSON chunk；只 yield 增量 token
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let thinkingActive = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) { reader.cancel(); break; }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          const msg = chunk?.message || {};
          const token = msg.content || '';
          // Ollama 原生 /api/chat 用 'thinking' 字段，v1/chat/completions 用 'reasoning_content'
          const thinkToken = msg.thinking || msg.reasoning_content || '';
          if (thinkToken) { thinkingActive = true; yield { type: 'think', token: thinkToken }; }
          if (token) {
            if (thinkingActive) { yield { type: 'think_end' }; thinkingActive = false; }
            yield { type: 'text', token };
          }
          if (chunk.done) { yield { type: 'done', text: msg.content || '' }; return; }
        } catch { /* NDJSON 行截断或异常 JSON，跳过 */ }
      }
    }
    yield { type: 'done', text: '' };
    return;
  }

  // ── 非本地模型：原有流式逻辑 ──
  let request;
  if (modelCfg.protocol === 'anthropic') {
    request = toAnthropicFormat({ model, modelCfg, messages, systemPrompt, tools, maxTokens, temperature });
    request.body.stream = true;
  } else {
    request = toOpenAIFormat({ model, modelCfg, messages, systemPrompt, tools, maxTokens, temperature });
    request.body.stream = true;
  }

  const res = await fetch(request.url, { method:'POST', headers:request.headers, body:JSON.stringify(request.body), signal });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '未知错误');
    yield { type: 'error', error: `HTTP ${res.status}: ${errorText}` };
    return;
  }
  // 本地非流式：全文直接解析（必须在 reader 声明前 return）
  if (isLocalModel2) {
    const data = await res.json();
    const r = parseOpenAIResponse(data);
    if (r.error) { yield { type: 'error', error: r.error }; return; }
    yield { type: 'text', text: r.text, thinking: r.thinking };
    yield { type: 'done' };
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
