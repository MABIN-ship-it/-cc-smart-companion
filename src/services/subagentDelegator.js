/**
 * 子任务委托器 — 将复杂任务拆分为独立的子任务并行/串行处理。
 *
 * 核心思路：
 * 当用户请求过于复杂（如"帮我搭建一个完整的Flask博客系统"），
 * 主Agent分析任务 → 制定子任务清单 → 并行/串行委托 → 整合结果。
 *
 * 每个子任务是独立的API调用，带更聚焦的系统提示词。
 * 最多3个并行子任务，每个有独立的5轮执行预算。
 */

import { sendModelRequest, getCurrentModel, getApiKey } from './modelAdapter';
import { getToolDefinitions, executeTool } from './toolRegistry';

const MAX_SUB_ITERATIONS = 5; // 每个子任务最多5轮ReAct

/**
 * 分析用户请求，判断是否需要拆分为子任务。
 *
 * @returns {{ shouldDelegate: boolean, subtasks: Array<{title:string, prompt:string}> }}
 */
export function analyzeComplexity(userMessage) {
  // 复杂任务关键词
  const complexPatterns = [
    /搭建.*系统/, /创建.*项目/, /做一个.*(网站|博客|应用|系统|平台)/,
    /帮我(写|做|建|搭|开发|创建).*(完整|整个)/,
    /同时.*(和|与|以及|并且)/,
    /(先|然后|接着|最后).*(再|接着|然后)/, // 多步骤
    /(安装|配置|创建|写|测试|部署).*(安装|配置|创建|写|测试|部署)/, // 多操作
    /全栈|前后端/, /从零开始/, /完整项目/,
  ];

  let shouldDelegate = false;
  for (const pattern of complexPatterns) {
    if (pattern.test(userMessage)) {
      shouldDelegate = true;
      break;
    }
  }

  // 消息长度超过200字也考虑委托（说明需求复杂）
  if (userMessage.length > 200) {
    shouldDelegate = true;
  }

  return { shouldDelegate, subtasks: shouldDelegate ? [] : null };
}

/**
 * 将复杂任务拆分为子任务。
 * 用一次轻量API调用来做任务分解。
 */
export async function decomposeTask(userMessage, signal) {
  const model = getCurrentModel();
  const key = getApiKey(model);
  if (!key) return null;

  const decomposePrompt = `你是一个任务分解专家。请将用户的任务拆分为2-4个独立的子任务。
每个子任务应该是一个独立可执行的操作。

返回格式（严格JSON）：
{
  "subtasks": [
    {"title": "子任务名称", "description": "具体要做什么，一句话描述"},
    ...
  ]
}

只返回JSON，不要其他文字。`;

  const timeoutSignal = AbortSignal.timeout(15000);
  const fetchSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  try {
    const result = await sendModelRequest({
      model,
      messages: [{ role: 'user', content: `用户任务：${userMessage}\n\n请将它拆分为子任务。` }],
      systemPrompt: decomposePrompt,
      tools: [],
      maxTokens: 800,
      temperature: 0.3,
      signal: fetchSignal,
    });

    if (result.text) {
      // 提取JSON
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.subtasks || null;
      }
    }
  } catch {}

  return null;
}

/**
 * 执行单个子任务（独立ReAct循环）。
 *
 * @param {object} subtask - { title, description }
 * @param {object} context - 全局上下文（环境信息等）
 * @param {AbortSignal} signal
 * @returns {Promise<string>} 子任务结果
 */
async function executeSubtask(subtask, context, signal) {
  const model = getCurrentModel();
  const tools = getToolDefinitions();

  const systemPrompt = `你是CC的子任务执行器。你当前只负责一个具体子任务。

## 子任务
${subtask.title}：${subtask.description}

## 上下文
${context}

## 规则
- 只做这个子任务，不要管其他的
- 直接动手，不要问用户
- 完成后用一句话报告结果
- 如果遇到无法解决的问题，说明遇到了什么困难`;

  const messages = [
    { role: 'user', content: `请完成：${subtask.description}` },
  ];

  let iteration = 0;
  let finalResult = '';

  while (iteration < MAX_SUB_ITERATIONS) {
    if (signal?.aborted) return `${subtask.title}: 已中断`;
    iteration++;

    const timeoutSignal = AbortSignal.timeout(45000);
    const fetchSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    let result;
    try {
      result = await sendModelRequest({
        model,
        messages,
        systemPrompt,
        tools,
        maxTokens: 4096,
        temperature: 0.7,
        signal: fetchSignal,
      });
    } catch (e) {
      return `${subtask.title}: 请求失败 - ${e.message}`;
    }

    if (result.error) {
      return `${subtask.title}: API错误 - ${result.error}`;
    }

    if (!result.toolUses?.length) {
      finalResult = result.text || `${subtask.title}: 已完成`;
      break;
    }

    // 执行工具
    const toolResultMessages = [];
    for (const tu of result.toolUses) {
      try {
        const toolResult = await executeTool(tu.name, tu.input);
        toolResultMessages.push({
          role: 'user',
          content: JSON.stringify([{
            type: 'tool_result',
            tool_use_id: tu.id,
            content: typeof toolResult === 'string' ? toolResult.slice(0, 2000) : toolResult,
          }]),
        });
      } catch (e) {
        toolResultMessages.push({
          role: 'user',
          content: JSON.stringify([{
            type: 'tool_result',
            tool_use_id: tu.id,
            content: `执行失败: ${e.message}`,
          }]),
        });
      }
    }

    // 添加assistant消息
    const assistantBlocks = [];
    if (result.text) assistantBlocks.push({ type: 'text', text: result.text });
    for (const tu of result.toolUses) {
      assistantBlocks.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
    }
    messages.push({ role: 'assistant', content: JSON.stringify(assistantBlocks) });
    messages.push(...toolResultMessages);
  }

  return `${subtask.title}：${finalResult || '已执行完毕'}`;
}

/**
 * 委托执行子任务（并行最多3个）。
 *
 * @param {string} userMessage - 用户原始消息
 * @param {object} context - 环境上下文
 * @param {function} onProgress - 进度回调
 * @param {AbortSignal} signal
 * @returns {Promise<{results: string[], method: 'parallel'|'serial'}>}
 */
export async function delegateSubtasks(userMessage, context, onProgress, signal) {
  // 尝试自动分解任务
  const subtasks = await decomposeTask(userMessage, signal);

  if (!subtasks || subtasks.length === 0) {
    return null; // 无法分解，回退到主ReAct循环
  }

  onProgress?.({
    type: 'delegate',
    data: { subtasks: subtasks.map(s => s.title) },
  });

  // 并行执行最多3个子任务
  const batchSize = 3;
  const allResults = [];

  for (let i = 0; i < subtasks.length; i += batchSize) {
    const batch = subtasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(subtask => executeSubtask(subtask, context, signal))
    );
    allResults.push(...batchResults);

    onProgress?.({
      type: 'delegate_progress',
      data: { completed: Math.min(i + batchSize, subtasks.length), total: subtasks.length },
    });
  }

  // 整合结果
  const summary = `## 任务完成报告\n\n${allResults.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;

  return {
    results: allResults,
    summary,
    method: subtasks.length <= 3 ? 'parallel' : 'batch_parallel',
  };
}
