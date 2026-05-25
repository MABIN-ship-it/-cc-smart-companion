/**
 * 多模型适配层 — 统一接口，支持 Anthropic 和 OpenAI 两大协议族。
 *
 * 支持模型：DeepSeek / GPT-4o / GPT-4.1 / 小米MiLM / 通义千问 / 智谱GLM / 豆包 等
 * 新增模型只需在注册表中添加一条配置即可，无需修改业务代码。
 */

// ─── 模型注册表 ───────────────────────────────────────────
const MODEL_REGISTRY = {
  // Anthropic Messages API 协议族
  'deepseek-chat': {
    name: 'DeepSeek',
    modelName: 'deepseek-chat',
    modelOptions: ['deepseek-chat', 'deepseek-reasoner'],
    endpoint: 'https://api.deepseek.com/anthropic/v1/messages',
    protocol: 'anthropic',
    defaultMaxTokens: 4096,
    contextWindow: 128000,
    apiKeyLabel: 'DeepSeek API Key',
    registerUrl: 'https://platform.deepseek.com/api_keys',
    note: '',
  },
  // OpenAI Chat Completions API 协议族
  'gpt-4o': {
    name: 'OpenAI',
    modelName: 'gpt-4o',
    modelOptions: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o3-mini'],
    endpoint: 'https://api.openai.com/v1/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 128000,
    apiKeyLabel: 'OpenAI API Key',
    registerUrl: 'https://platform.openai.com/api-keys',
    note: '',
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 128000,
    apiKeyLabel: 'OpenAI API Key',
    registerUrl: 'https://platform.openai.com/api-keys',
    note: '',
    hidden: true,
  },
  'gpt-4.1': {
    name: 'GPT-4.1',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 1000000,
    apiKeyLabel: 'OpenAI API Key',
    registerUrl: 'https://platform.openai.com/api-keys',
    note: '',
    hidden: true,
  },
  'qwen-plus': {
    name: '通义千问',
    modelName: 'qwen-plus',
    modelOptions: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-flash', 'qwen3-235b-a22b'],
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 131072,
    apiKeyLabel: '阿里云 API Key',
    registerUrl: 'https://dashscope.console.aliyun.com/apiKey',
    note: '',
  },
  'glm-4': {
    name: '智谱 GLM',
    modelName: 'glm-4',
    modelOptions: ['glm-4', 'glm-4-flash', 'glm-4-plus', 'glm-4v-plus'],
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 128000,
    apiKeyLabel: '智谱 API Key',
    registerUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    note: '',
  },
  'doubao-pro': {
    name: '豆包',
    modelName: 'doubao-pro-256k',
    modelOptions: ['doubao-pro-256k', 'doubao-lite-128k', 'doubao-pro-32k', 'doubao-vision-pro-32k'],
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 256000,
    apiKeyLabel: '火山引擎 API Key',
    registerUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    note: '',
  },
  'kimi': {
    name: 'Kimi',
    modelName: 'kimi-k2.6',
    modelOptions: ['kimi-k2.6', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 256000,
    apiKeyLabel: 'Kimi API Key',
    registerUrl: 'https://platform.moonshot.cn/console/api-keys',
    note: '256K上下文',
  },
  'minimax': {
    name: 'MiniMax',
    modelName: 'MiniMax-M2.7',
    modelOptions: ['MiniMax-M2.7', 'MiniMax-Text-01', 'abab7-chat'],
    endpoint: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 245760,
    apiKeyLabel: 'MiniMax API Key',
    registerUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    note: '最新旗舰',
  },
  'stepfun': {
    name: '阶跃星辰',
    modelName: 'step-3.5-flash',
    modelOptions: ['step-3.5-flash', 'step-3-flash', 'step-2-16k', 'step-2v-16k'],
    endpoint: 'https://api.stepfun.com/v1/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 131072,
    apiKeyLabel: '阶跃 API Key',
    registerUrl: 'https://platform.stepfun.com/interface-key',
    note: '主力模型',
  },
  'mimo': {
    name: '小米 MiMo',
    modelName: 'mimo-v2.5',
    modelOptions: ['mimo-v2.5', 'mimo-v2.5-flash'],
    endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 131072,
    apiKeyLabel: '小米MiMo API Key',
    registerUrl: 'https://mimo.xiaomi.com/',
    note: 'Key以tp-开头',
  },
  'baidu-ernie': {
    name: '百度文心',
    modelName: 'ernie-speed-128k',
    modelOptions: ['ernie-speed-128k', 'ernie-speed-pro-128k', 'ernie-4.0-turbo-8k', 'ernie-4.5-8k', 'deepseek-v3', 'deepseek-r1'],
    endpoint: 'https://qianfan.baidubce.com/v2/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 128000,
    apiKeyLabel: '百度千帆 API Key',
    registerUrl: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application',
    note: '需appid',
    extraHeaderFields: ['appid'],
  },
  'bailian': {
    name: '阿里百炼',
    modelName: '',
    modelOptions: ['qwen3-235b-a22b', 'qwen-max', 'qwen-plus', 'deepseek-v3', 'deepseek-r1'],
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 131072,
    apiKeyLabel: '阿里云 API Key',
    registerUrl: 'https://bailian.console.aliyun.com/',
    note: '聚合平台',
  },
  'hunyuan': {
    name: '腾讯混元',
    modelName: '',
    modelOptions: ['hunyuan-turbo', 'hunyuan-pro', 'hunyuan-standard', 'hunyuan-lite', 'deepseek-v3', 'deepseek-r1'],
    endpoint: 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 131072,
    apiKeyLabel: '腾讯混元 API Key',
    registerUrl: 'https://console.cloud.tencent.com/hunyuan',
    note: '聚合平台',
  },
  'siliconflow': {
    name: 'SiliconFlow',
    modelName: '',
    modelOptions: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen3-235B-A22B', 'Pro/Llama-4-Maverick', 'Pro/Qwen-Qwen3-235B-A22B-Thinking'],
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 131072,
    apiKeyLabel: 'SiliconFlow API Key',
    registerUrl: 'https://cloud.siliconflow.cn/account/ak',
    note: '聚合平台',
  },
  'modelscope': {
    name: 'ModelScope',
    modelName: '',
    modelOptions: ['Qwen/Qwen3-235B-A22B', 'deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/QwQ-32B'],
    endpoint: 'https://api-inference.modelscope.cn/v1/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 131072,
    apiKeyLabel: 'ModelScope API Key',
    registerUrl: 'https://modelscope.cn/my/overview',
    note: '聚合平台',
  },
  'aihubmix': {
    name: 'AiHubMix',
    modelName: '',
    modelOptions: ['deepseek-v3', 'deepseek-r1', 'gpt-4o', 'claude-sonnet-4-6', 'gemini-2.5-pro'],
    endpoint: 'https://aihubmix.com/v1/chat/completions',
    protocol: 'openai',
    defaultMaxTokens: 4096,
    contextWindow: 131072,
    apiKeyLabel: 'AiHubMix API Key',
    registerUrl: 'https://aihubmix.com/',
    note: '聚合平台',
  },
};

// ─── 模型管理 ─────────────────────────────────────────────

/** 获取所有已注册模型（含自定义供应商），hasKey的排前面，hidden条目不显示 */
export function getAvailableModels() {
  const builtin = Object.entries(MODEL_REGISTRY)
    .filter(([, cfg]) => !cfg.hidden)
    .map(([id, cfg]) => ({
    id,
    name: cfg.name,
    protocol: cfg.protocol,
    contextWindow: cfg.contextWindow,
    apiKeyLabel: cfg.apiKeyLabel,
    registerUrl: cfg.registerUrl || '',
    note: cfg.note || '',
    modelName: cfg.modelName || getUserModelName(id) || '',
    modelOptions: cfg.modelOptions || (cfg.modelName ? [cfg.modelName] : []),
    extraHeaderFields: cfg.extraHeaderFields || [],
    isCustom: false,
    hasKey: hasApiKey(id),
  }));

  const custom = getCustomProviders().map(p => ({
    id: p.name,
    name: p.name,
    protocol: 'openai',
    contextWindow: 131072,
    apiKeyLabel: p.name + ' API Key',
    registerUrl: '',
    note: '自定义',
    modelName: p.modelName || '',
    extraHeaderFields: [],
    isCustom: true,
    hasKey: !!getApiKey(p.name),
    endpoint: p.endpoint,
  }));

  return [...builtin, ...custom].sort((a, b) => (b.hasKey ? 1 : 0) - (a.hasKey ? 1 : 0));
}

/** 获取模型配置（含自定义供应商） */
export function getModelConfig(modelId) {
  const cfg = MODEL_REGISTRY[modelId];
  if (cfg) return cfg;
  const custom = getCustomProviders().find(p => p.name === modelId);
  if (custom) {
    return {
      name: custom.name,
      endpoint: custom.endpoint,
      protocol: 'openai',
      defaultMaxTokens: 4096,
      contextWindow: 131072,
      apiKeyLabel: custom.name + ' API Key',
      isCustom: true,
    };
  }
  throw new Error(`未注册的模型: ${modelId}`);
}

/** 获取用户当前选择的模型ID */
export function getCurrentModel() {
  try {
    return localStorage.getItem('cc_current_model') || 'deepseek-chat';
  } catch {
    return 'deepseek-chat';
  }
}

/** 设置用户当前选择的模型ID */
export function setCurrentModel(modelId) {
  if (!MODEL_REGISTRY[modelId] && !getCustomProviders().some(p => p.name === modelId)) {
    throw new Error(`未知模型: ${modelId}`);
  }
  try {
    localStorage.setItem('cc_current_model', modelId);
  } catch {}
}

/** 检查模型是否已配置Key（仅检查模型专属key，不回退通用key） */
export function hasApiKey(modelId) {
  const keyName = `cc_api_key_${modelId}`;
  try {
    return !!localStorage.getItem(keyName);
  } catch {
    return false;
  }
}

/** 获取用户的API Key（支持多模型独立Key，回退到通用key用于实际调用） */
export function getApiKey(modelId) {
  const keyName = `cc_api_key_${modelId}`;
  try {
    return localStorage.getItem(keyName) || localStorage.getItem('cc_api_key') || null;
  } catch {
    return null;
  }
}

/** 设置用户的API Key */
export function setApiKey(modelId, key) {
  const keyName = `cc_api_key_${modelId}`;
  try {
    localStorage.setItem(keyName, key);
  } catch {}
}

// ─── 自定义供应商 ─────────────────────────────────────────

export function getCustomProviders() {
  try {
    return JSON.parse(localStorage.getItem('cc_custom_providers') || '[]');
  } catch { return []; }
}

export function saveCustomProvider(provider) {
  const providers = getCustomProviders();
  const idx = providers.findIndex(p => p.name === provider.name);
  if (idx >= 0) providers[idx] = provider;
  else providers.push(provider);
  localStorage.setItem('cc_custom_providers', JSON.stringify(providers));
}

export function deleteCustomProvider(name) {
  const providers = getCustomProviders().filter(p => p.name !== name);
  localStorage.setItem('cc_custom_providers', JSON.stringify(providers));
}

// ─── 模型名映射 ─────────────────────────────────────────

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

// ─── 额外请求头（如百度appid） ──────────────────────────

export function getExtraHeader(modelId, field) {
  try {
    const headers = JSON.parse(localStorage.getItem('cc_extra_headers') || '{}');
    return (headers[modelId] || {})[field] || '';
  } catch { return ''; }
}

export function setExtraHeader(modelId, field, value) {
  try {
    const headers = JSON.parse(localStorage.getItem('cc_extra_headers') || '{}');
    if (!headers[modelId]) headers[modelId] = {};
    if (value) headers[modelId][field] = value;
    else delete headers[modelId][field];
    localStorage.setItem('cc_extra_headers', JSON.stringify(headers));
  } catch {}
}

/** 解析实际使用的模型名：cfg.modelName > 用户覆盖 > modelId fallback */
function resolveModelName(model, modelCfg) {
  if (modelCfg.modelName) return modelCfg.modelName;
  const userOverride = getUserModelName(model);
  if (userOverride) return userOverride;
  return model;
}

// ─── 协议转换核心 ─────────────────────────────────────────

/**
 * 将 CC 内部消息格式转换为 Anthropic Messages API 格式
 */
function toAnthropicFormat({ model, modelCfg, messages, systemPrompt, tools, maxTokens, temperature }) {
  const actualModel = resolveModelName(model, modelCfg);
  return {
    url: modelCfg.endpoint,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(model),
      'anthropic-version': '2023-06-01',
    },
    body: {
      model: actualModel,
      max_tokens: maxTokens || modelCfg.defaultMaxTokens,
      temperature: temperature ?? 0.7,
      system: systemPrompt,
      messages,
      ...(tools?.length ? { tools } : {}),
    },
  };
}

/**
 * 将 CC 内部消息格式转换为 OpenAI Chat Completions API 格式
 */
function toOpenAIFormat({ model, modelCfg, messages, systemPrompt, tools, maxTokens, temperature }) {
  const actualModel = resolveModelName(model, modelCfg);
  // OpenAI 将 system prompt 作为消息数组的第一条
  const openaiMessages = [];
  if (systemPrompt) {
    openaiMessages.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            openaiMessages.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: typeof block.content === 'string'
                ? block.content
                : JSON.stringify(block.content),
            });
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
            function: {
              name: b.name,
              arguments: JSON.stringify(b.input),
            },
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

  // OpenAI tools 格式
  const openaiTools = tools?.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  return {
    url: modelCfg.endpoint,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey(model)}`,
    },
    body: {
      model: actualModel,
      max_tokens: maxTokens || modelCfg.defaultMaxTokens,
      temperature: temperature ?? 0.7,
      messages: openaiMessages,
      ...(openaiTools?.length ? { tools: openaiTools, tool_choice: 'auto' } : {}),
    },
  };
}

// ─── 响应解析 ─────────────────────────────────────────────

/**
 * 解析 Anthropic 格式响应 → CC内部统一格式
 */
function parseAnthropicResponse(data) {
  if (data.error) {
    return { error: data.error.message || JSON.stringify(data.error) };
  }

  const content = data.content;
  if (!content || !Array.isArray(content)) {
    if (data.choices) {
      // OpenAI格式兜底
      return {
        text: data.choices[0]?.message?.content || '',
        toolUses: [],
      };
    }
    return { error: 'API返回格式异常' };
  }

  const textParts = [];
  const thinkingParts = [];
  const toolUses = [];

  for (const block of content) {
    if (block.type === 'text' && block.text) {
      textParts.push(block.text);
    }
    if (block.type === 'thinking' && block.thinking) {
      thinkingParts.push(block.thinking);
    }
    if (block.type === 'tool_use') {
      toolUses.push({
        id: block.id,
        name: block.name,
        input: block.input || {},
      });
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

/**
 * 解析 OpenAI 格式响应 → CC内部统一格式
 */
function parseOpenAIResponse(data) {
  if (data.error) {
    return { error: data.error.message || JSON.stringify(data.error) };
  }

  const choice = data.choices?.[0];
  if (!choice) {
    return { error: 'API返回格式异常' };
  }

  const message = choice.message || {};
  const text = message.content || '';
  const thinking = message.reasoning_content || undefined;
  const toolUses = [];

  if (message.tool_calls?.length) {
    for (const tc of message.tool_calls) {
      let input = {};
      try {
        input = JSON.parse(tc.function.arguments || '{}');
      } catch (e) {
        try {
          const fixed = (tc.function.arguments || '{}').replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
          input = JSON.parse(fixed);
        } catch (e2) {
          console.error('[modelAdapter] JSON.parse failed for tool call:', e2.message, 'args:', tc.function.arguments?.slice(-200));
        }
      }
      toolUses.push({
        id: tc.id,
        name: tc.function.name,
        input,
      });
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

/**
 * 发送消息到模型API（统一入口）
 *
 * @param {object} params
 * @param {string} params.model - 模型ID
 * @param {Array} params.messages - 消息数组
 * @param {string} params.systemPrompt - 系统提示词
 * @param {Array} params.tools - 工具定义（JSON Schema格式）
 * @param {number} params.maxTokens - 最大输出tokens
 * @param {number} params.temperature - 温度参数
 * @param {AbortSignal} params.signal - 中断信号
 * @returns {Promise<{text:string, toolUses:Array, stopReason:string, usage:object}>}
 */
export async function sendModelRequest({
  model,
  messages,
  systemPrompt,
  tools,
  maxTokens,
  temperature,
  signal,
}) {
  const modelCfg = getModelConfig(model);
  const apiKey = getApiKey(model);

  if (!apiKey) {
    throw new Error(`未设置 ${modelCfg.name} 的API Key`);
  }

  // 根据协议构建请求
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

  // 根据协议解析响应
  let result;
  if (modelCfg.protocol === 'anthropic') {
    result = parseAnthropicResponse(data);
  } else {
    result = parseOpenAIResponse(data);
  }

  // 附带HTTP状态码用于上层错误处理
  result._httpStatus = res.status;

  return result;
}

// ─── 流式请求 ─────────────────────────────────────────────

/**
 * 流式发送消息到模型API，返回异步生成器。
 * 支持 Anthropic SSE 和 OpenAI SSE 两种流式格式。
 *
 * @returns {AsyncGenerator<{type:string, text?:string, toolUse?:object, done?:boolean}>}
 */
export async function* sendModelRequestStream({
  model,
  messages,
  systemPrompt,
  tools,
  maxTokens,
  temperature,
  signal,
}) {
  const modelCfg = getModelConfig(model);
  const apiKey = getApiKey(model);

  if (!apiKey) {
    yield { type: 'error', error: `未设置 ${modelCfg.name} 的API Key` };
    return;
  }

  // 构建请求（与非流式一致，但加上 stream: true）
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

  // 使用流解析器
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
            if (block) contentBlocks.push(block);
            break;
          }
          case 'content_block_delta': {
            const delta = frame.data?.delta;
            if (delta?.type === 'text_delta' && delta.text) {
              accumulatedText += delta.text;
              yield { type: 'text', text: delta.text, accumulated: accumulatedText };
            } else if (delta?.type === 'thinking_delta' && delta.thinking) {
              accumulatedThinking += delta.thinking;
              yield { type: 'think', text: delta.thinking, accumulated: accumulatedThinking };
            } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
              // 累积 tool_use 参数的 JSON 片段
              const idx = frame.data?.index || 0;
              if (!contentBlocks[idx]) {
                contentBlocks[idx] = { type: 'tool_use', input: {} };
              }
              const blk = contentBlocks[idx];
              blk._rawArgs = (blk._rawArgs || '') + delta.partial_json;
              try {
                blk.input = JSON.parse(blk._rawArgs);
              } catch {
                try {
                  const fixed = blk._rawArgs.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
                  blk.input = JSON.parse(fixed);
                } catch {
                  // 流式传输中 JSON 片段不完整属于正常现象，content_block_stop 时才完整
                }
              }
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
        // OpenAI SSE
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
                try {
                  block.input = JSON.parse(block._rawArgs);
                } catch {}
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

/**
 * 构建合并的工具结果消息 — 将同一 assistant 消息的所有 tool_result 合并到单条 user 消息中。
 * Anthropic API 要求：每个 tool_use block 必须在其紧接的 user 消息中找到对应的 tool_result。
 * @param {Array<{tool_use_id: string, content: string}>} toolResults
 */
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

/**
 * 构建单个工具结果消息（Anthropic格式 — 作为下一轮API调用的user消息）
 */
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

/**
 * 构建assistant的tool_use消息（存入消息历史）
 */
export function buildToolUseMessage(contentBlocks) {
  return {
    role: 'assistant',
    content: contentBlocks,
  };
}
