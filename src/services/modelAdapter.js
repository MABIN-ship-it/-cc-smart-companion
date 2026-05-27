/**
 * 多模型适配层 — 统一接口，支持 Anthropic 和 OpenAI 两大协议族。
 *
 * 支持模型：DeepSeek / GPT-4o / GPT-4.1 / 小米MiLM / 通义千问 / 智谱GLM / 豆包 等
 * 新增模型只需在注册表中添加一条配置即可，无需修改业务代码。
 */

// ─── 模型注册表 ───────────────────────────────────────────
const MODEL_REGISTRY = {
  // ── DeepSeek ──
  'deepseek-v4-pro': {
    name: 'DeepSeek V4 Pro', endpoint: 'https://api.deepseek.com/anthropic/v1/messages',
    protocol: 'anthropic', defaultMaxTokens: 8192, contextWindow: 1000000, vision: true,
    apiKeyLabel: 'DeepSeek API Key',
    description: '🏆 综合最强，编程/推理/创作全精通，支持图片分析，1M上下文',
  },
  'deepseek-v4-flash': {
    name: 'DeepSeek V4 Flash', endpoint: 'https://api.deepseek.com/anthropic/v1/messages',
    protocol: 'anthropic', defaultMaxTokens: 8192, contextWindow: 1000000, vision: true,
    apiKeyLabel: 'DeepSeek API Key',
    description: '⚡ DeepSeek极速版，速度快价格低，日常对话首选',
  },
  'deepseek-chat': {
    name: 'DeepSeek V3 (旧)', endpoint: 'https://api.deepseek.com/anthropic/v1/messages',
    protocol: 'anthropic', defaultMaxTokens: 4096, contextWindow: 128000,
    apiKeyLabel: 'DeepSeek API Key',
    description: '📦 DeepSeek V3经典版，即将退役，建议升级到V4',
  },
  // ── OpenAI ──
  'gpt-4o': {
    name: 'GPT-4o', endpoint: 'https://api.openai.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 128000, vision: true,
    apiKeyLabel: 'OpenAI API Key',
    description: '🌐 OpenAI旗舰，多模态理解强，图片/文字都能处理',
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini', endpoint: 'https://api.openai.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 128000, vision: true,
    apiKeyLabel: 'OpenAI API Key',
    description: '💰 GPT-4o的轻量版，便宜够用，适合简单任务',
  },
  'gpt-4.1': {
    name: 'GPT-4.1', endpoint: 'https://api.openai.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 1000000,
    apiKeyLabel: 'OpenAI API Key',
    description: '📚 OpenAI最新，100万超长上下文，适合读长文档',
  },
  // ── 通义千问 ──
  'qwen3-max': {
    name: '通义千问 Max', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 262144,
    apiKeyLabel: '阿里云 API Key',
    description: '🇨🇳 阿里千问旗舰，中文理解顶级，适合中文复杂任务',
  },
  'qwen-plus': {
    name: '通义千问 Plus', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 1000000,
    apiKeyLabel: '阿里云 API Key',
    description: '⚖️ 千问均衡版，百万上下文，性价比之选',
  },
  'qwen-flash': {
    name: '通义千问 Flash', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 1000000,
    apiKeyLabel: '阿里云 API Key',
    description: '🏃 千问极速版，速度最快，适合简单问答',
  },
  'qwen3-vl-plus': {
    name: '通义千问 VL Plus', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 131072, vision: true,
    apiKeyLabel: '阿里云 API Key',
    description: '👁️ 千问视觉模型，图片理解能力强',
  },
  'qwq-plus': {
    name: '通义千问 QwQ', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 131072,
    apiKeyLabel: '阿里云 API Key',
    description: '🧠 千问推理专用，深度思考慢但准',
  },
  // ── 豆包 ──
  'doubao-seed-2.0-pro': {
    name: '豆包 Seed 2.0 Pro', endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 262144, vision: true,
    apiKeyLabel: '火山引擎 API Key',
    description: '🔥 豆包旗舰，全模态支持，编程/图片/推理俱佳',
  },
  'doubao-seed-2.0-lite': {
    name: '豆包 Seed 2.0 Lite', endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 262144, vision: true,
    apiKeyLabel: '火山引擎 API Key',
    description: '🎯 豆包均衡版，性能好价格低，推荐日常使用',
  },
  'doubao-seed-1.6-flash': {
    name: '豆包 Seed 1.6 Flash', endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 262144, vision: true,
    apiKeyLabel: '火山引擎 API Key',
    description: '💸 豆包最便宜的视觉模型，快且支持图片',
  },
  // ── 智谱 GLM ──
  'glm-5': {
    name: '智谱 GLM-5', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 200000,
    apiKeyLabel: '智谱 API Key',
    description: '🤖 智谱旗舰Agent，自主工作能力强，适合复杂任务',
  },
  'glm-4.7': {
    name: '智谱 GLM-4.7', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 200000,
    apiKeyLabel: '智谱 API Key',
    description: '💻 智谱编程专精，写代码改bug最强',
  },
  'glm-4v-plus': {
    name: '智谱 GLM-4V', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 128000, vision: true,
    apiKeyLabel: '智谱 API Key',
    description: '👁️ 智谱视觉模型，图片+文字理解',
  },
  // ── Kimi ──
  'kimi-k2.6': {
    name: 'Kimi K2.6', endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 256000, vision: true,
    apiKeyLabel: 'Kimi API Key',
    description: '📖 Kimi最新旗舰，256K上下文，多模态',
  },
  'moonshot-v1-8k': {
    name: 'Moonshot 8K', endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 8000,
    apiKeyLabel: 'Kimi API Key',
    description: '📝 Kimi经典版，8K短文本',
  },
  // ── 小米 MiMo ──
  'mimo-v2.5-pro': {
    name: '小米 MiMo V2.5 Pro', endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 1100000, vision: true,
    apiKeyLabel: '小米MiMo API Key',
    description: '🏅 小米旗舰，1.1M上下文，性能强劲',
  },
  'mimo-v2.5': {
    name: '小米 MiMo V2.5', endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 1100000, vision: true,
    apiKeyLabel: '小米MiMo API Key',
    description: '🔓 小米开源版，MIT协议，可商用',
  },
  'mimo-v2-pro': {
    name: '小米 MiMo V2 Pro', endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 1000000, vision: true,
    apiKeyLabel: '小米MiMo API Key',
    description: '💪 小米上代旗舰，编程市场占有率30%+',
  },
  'mimo-v2-omni': {
    name: '小米 MiMo V2 Omni', endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 256000, vision: true,
    apiKeyLabel: '小米MiMo API Key',
    description: '🎨 小米全模态，图片+语音+文字原生融合',
  },
  'mimo-v2-flash': {
    name: '小米 MiMo V2 Flash', endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 256000, vision: true,
    apiKeyLabel: '小米MiMo API Key',
    description: '⚡ 小米极速版，150 token/s，便宜好用',
  },
  // ── MiniMax ──
  'minimax-m2.5': {
    name: 'MiniMax M2.5', endpoint: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 205000,
    apiKeyLabel: 'MiniMax API Key',
    description: '🔧 MiniMax最新，Agent工作流优化',
  },
  // ── 阶跃星辰 ──
  'step-3.5-flash': {
    name: '阶跃 Step 3.5 Flash', endpoint: 'https://api.stepfun.com/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 8192, contextWindow: 256000,
    apiKeyLabel: '阶跃 API Key',
    description: '✨ 阶跃星辰旗舰，极速生成',
  },
  // ── 百度文心 ──
  'ernie-4.5': {
    name: '百度文心 4.5', endpoint: 'https://qianfan.baidubce.com/v2/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 128000,
    apiKeyLabel: '百度千帆 API Key',
    description: '🏯 百度文心，中文场景深耕',
  },
  // ── 聚合平台 ──
  'siliconflow-deepseek-v3': {
    name: 'SiliconFlow DeepSeek V3', endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    protocol: 'openai', defaultMaxTokens: 4096, contextWindow: 131072,
    apiKeyLabel: 'SiliconFlow API Key',
    description: '🌍 SiliconFlow聚合，部署在硅谷，延迟低',
  },
};

// ─── 模型管理 ─────────────────────────────────────────────

/** 获取所有已注册模型 */
export function getAvailableModels() {
  return Object.entries(MODEL_REGISTRY).map(([id, cfg]) => ({
    id,
    name: cfg.name,
    protocol: cfg.protocol,
    contextWindow: cfg.contextWindow,
    apiKeyLabel: cfg.apiKeyLabel,
    vision: !!cfg.vision,
    description: cfg.description || '',
  }));
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

/** 获取用户的API Key（支持多模型独立Key） */
export function getApiKey(modelId) {
  const cfg = MODEL_REGISTRY[modelId];
  if (!cfg) return null;
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

// ─── 协议转换核心 ─────────────────────────────────────────

/**
 * 将 CC 内部消息格式转换为 Anthropic Messages API 格式
 */
function toAnthropicFormat({ model, modelCfg, messages, systemPrompt, tools, maxTokens, temperature }) {
  return {
    url: modelCfg.endpoint,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(model),
      'anthropic-version': '2023-06-01',
    },
    body: {
      model,
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
  // OpenAI 将 system prompt 作为消息数组的第一条
  const openaiMessages = [];
  if (systemPrompt) {
    openaiMessages.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (Array.isArray(msg.content)) {
        // 检查是否是工具结果（tool_result blocks）
        const hasToolResults = msg.content.some(b => b.type === 'tool_result');
        if (hasToolResults) {
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
          // 非工具结果：可能是图片+文本混合内容 → OpenAI vision 格式
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
      model,
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
  const toolUses = [];

  for (const block of content) {
    if (block.type === 'text' && block.text) {
      textParts.push(block.text);
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
  const toolUses = [];

  if (message.tool_calls?.length) {
    for (const tc of message.tool_calls) {
      let input = {};
      try {
        input = JSON.parse(tc.function.arguments || '{}');
      } catch {}
      toolUses.push({
        id: tc.id,
        name: tc.function.name,
        input,
      });
    }
  }

  return {
    text: text.trim(),
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
              } catch {}
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
