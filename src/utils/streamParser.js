/**
 * SSE (Server-Sent Events) 流解析器。
 *
 * 用于解析模型API的流式响应（Anthropic SSE 和 OpenAI SSE格式）。
 * 两种协议都用 SSE (text/event-stream)，但事件格式略有不同。
 */

/**
 * 解析Anthropic流式SSE事件
 *
 * Anthropic格式：
 * event: message_start
 * data: {"message": {...}}
 *
 * event: content_block_delta
 * data: {"delta": {"type": "text_delta", "text": "..."}, "index": 0}
 *
 * event: message_stop
 * data: {}
 */
export async function* parseAnthropicStream(reader) {
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let currentData = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 保留最后不完整的行

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6).trim();
      } else if (line === '' && currentData) {
        // 空行表示一个事件的结束
        try {
          const parsed = JSON.parse(currentData);
          yield { event: currentEvent, data: parsed };
        } catch {
          // 跳过无法解析的事件
        }
        currentEvent = '';
        currentData = '';
      }
    }
  }

  // 处理最后一个未完成的事件
  if (currentData) {
    try {
      const parsed = JSON.parse(currentData);
      yield { event: currentEvent, data: parsed };
    } catch {}
  }
}

/**
 * 解析OpenAI流式SSE事件
 *
 * OpenAI格式：
 * data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"..."},"index":0}]}
 * ...
 * data: [DONE]
 */
export async function* parseOpenAIStream(reader) {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          yield { event: 'done', data: null };
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          yield { event: 'delta', data: parsed };
        } catch {}
      }
    }
  }
}

/**
 * 流式处理响应。
 * 自动检测Anthropic或OpenAI格式。
 *
 * @param {Response} response - fetch的Response对象
 * @param {string} protocol - 'anthropic' 或 'openai'
 * @param {object} callbacks - 回调函数集合
 * @param {function} callbacks.onText - 收到文本增量时调用 (text: string, accumulated: string)
 * @param {function} callbacks.onToolUse - 收到完整tool_use时调用 (toolUse: object)
 * @param {function} callbacks.onDone - 流结束时调用 (fullResult: object)
 * @param {AbortSignal} signal - 中断信号
 */
export async function streamResponse(response, protocol, callbacks, signal) {
  if (!response.ok || !response.body) {
    throw new Error('流式响应不可用');
  }

  const reader = response.body.getReader();
  const parser = protocol === 'anthropic'
    ? parseAnthropicStream(reader)
    : parseOpenAIStream(reader);

  // 累积结果
  let accumulatedText = '';
  let stopReason = null;
  const contentBlocks = []; // 按index存储content blocks
  let currentBlock = null;

  try {
    for await (const frame of parser) {
      if (signal?.aborted) {
        reader.cancel();
        throw new DOMException('Aborted', 'AbortError');
      }

      if (protocol === 'anthropic') {
        // Anthropic SSE 事件处理
        switch (frame.event) {
          case 'message_start':
            // 消息开始
            break;
          case 'content_block_start': {
            const block = frame.data?.content_block;
            if (block) {
              currentBlock = block;
              contentBlocks[frame.data?.index || 0] = block;
            }
            break;
          }
          case 'content_block_delta': {
            const delta = frame.data?.delta;
            const index = frame.data?.index || 0;
            if (!delta) break;

            if (delta.type === 'text_delta' && delta.text) {
              accumulatedText += delta.text;
              callbacks.onText?.(delta.text, accumulatedText);
            } else if (delta.type === 'input_json_delta' && delta.partial_json) {
              // tool_use的参数增量（积累在content block中）
              const idx = frame.data?.index || 0;
              if (!contentBlocks[idx]) {
                contentBlocks[idx] = { type: 'tool_use', input: {} };
              }
              const blk = contentBlocks[idx];
              blk._rawArgs = (blk._rawArgs || '') + delta.partial_json;
              try {
                blk.input = JSON.parse(blk._rawArgs);
              } catch (e) {
                // 模型可能输出未转义的反斜杠（如Windows路径 C:\Users\...\中文\）
                // 将 \X（X不是合法JSON转义字符）修复为 \\X
                try {
                  const fixed = blk._rawArgs.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
                  blk.input = JSON.parse(fixed);
                } catch (e2) {
                  console.error('[streamParser] JSON.parse failed for tool_use args:', e2.message, 'rawArgs tail:', blk._rawArgs?.slice(-200));
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
              callbacks.onToolUse?.(block);
            }
            break;
          }
          case 'message_delta':
            stopReason = frame.data?.delta?.stop_reason || null;
            break;
          case 'message_stop':
            break;
        }
      } else {
        // OpenAI SSE 事件处理
        if (frame.event === 'done') {
          break;
        }

        if (frame.event === 'delta') {
          const choice = frame.data?.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          if (delta?.content) {
            accumulatedText += delta.content;
            callbacks.onText?.(delta.content, accumulatedText);
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
                };
              }
              if (tc.function?.arguments) {
                // 参数可能分多次返回，需要累积
                const block = contentBlocks[idx];
                block._rawArgs = (block._rawArgs || '') + tc.function.arguments;
                try {
                  block.input = JSON.parse(block._rawArgs);
                } catch {}
              }
            }
          }

          if (choice.finish_reason) {
            stopReason = choice.finish_reason;
            // 流结束时处理完整的tool_use
            for (const block of contentBlocks) {
              if (block?.type === 'tool_use' && block.name) {
                // 清理临时字段
                delete block._rawArgs;
                callbacks.onToolUse?.(block);
              }
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  // 构建最终结果（与非流式格式一致）
  const toolUses = contentBlocks
    .filter(b => b?.type === 'tool_use' && b.name)
    .map(b => ({ id: b.id, name: b.name, input: b.input || {} }));

  const fullResult = {
    text: accumulatedText,
    toolUses,
    stopReason,
  };

  callbacks.onDone?.(fullResult);
  return fullResult;
}
