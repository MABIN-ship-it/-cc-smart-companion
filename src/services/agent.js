/**
 * CC Agent 入口 — 消息发送、人格分析、天使恶魔并行思考。
 *
 * v2.0 改进：
 * - 集成 promptBuilder 动态构建系统提示词
 * - 通过 modelAdapter 支持多模型
 * - 保持原有的天使恶魔并行思考能力
 * - simpleChat 回退也改用 modelAdapter
 */

import { runReActLoop } from './reactLoop';
import { buildSystemPrompt } from './promptBuilder';
import { sendModelRequest, sendModelRequestStream, getCurrentModel, getModelConfig, getApiKey } from './modelAdapter';
import { analyzeComplexity, delegateSubtasks } from './subagentDelegator';
import { categorizeError } from './errorHandler';
import { analyzeAndPlan } from './planMode';
import { analyzeProject, updateLastTask } from './projectContext';
import { describeImages } from './visionProxy';

// ─── 主入口 ───────────────────────────────────────────────

/**
 * 发送用户消息，返回AI回复。
 * Electron环境下使用ReAct循环（带工具调用），
 * 浏览器/dev模式下使用简单对话（无工具）。
 *
 * @param {string} userMessage - 用户输入的消息
 * @param {object} state - 应用全局状态
 * @param {function} onProgress - 进度回调 ({ type, data }) => void
 * @param {AbortSignal} signal - 中断信号
 * @returns {Promise<string>} AI回复文本
 */
export async function sendMessage(userMessage, state, onProgress, signal, images) {
  // 获取API Key（modelAdapter自行管理多模型Key）
  const model = getCurrentModel();
  const key = getApiKey(model);
  if (!key) {
    throw new Error('API Key未设置。请在设置中配置模型API Key。');
  }

  // 构建动态系统提示词（含知识库RAG检索 + 模式感知）
  const mode = state.inputMode || 'chat';
  const systemPrompt = buildSystemPrompt(state, userMessage, mode);

  // 检测工具是否可用（Electron环境）
  const toolsAvailable = typeof window !== 'undefined'
    && window.electronAPI
    && typeof window.electronAPI.shellExecute === 'function';

  if (toolsAvailable) {
    // 执行模式：纯聊天跳过ReAct，直接simpleChat
    if (mode === 'execute') {
      const toolTriggers = ['飞书','feishu','Excel','xls','文件','创建','发送','搜索','打开','运行','执行',
        '生成','下载','上传','导入','导出','扫描','检查','读取','写入','删除','安装','配置','设置',
        '多维表格','文档','消息','图片','PPT','网站','Python','脚本','命令','转多维','转成','转成多维',
        '报价','排班','整改','清单','统计','分析','对比','处理','帮忙','帮我把','帮我','搞','做','弄'];
      const needsTools = toolTriggers.some(w => userMessage.includes(w));
      if (!needsTools) {
        return await simpleChat(userMessage, state, systemPrompt, onProgress, signal, images);
      }
      const result = await runReActLoop(userMessage, state, key, systemPrompt, onProgress, signal, images);
      updateLastTask(userMessage.slice(0, 60));
      return result;
    }

    // 计划模式：只分析不执行
    if (mode === 'plan') {
      return await analyzeAndPlan(userMessage, state, onProgress, signal);
    }

    // 定时模式：Phase 3实现，目前占位
    if (mode === 'cron') {
      return '⏰ 定时任务功能即将上线！\n\n届时CC将支持：\n- 周期性任务调度（如"每天早上8点搜索AI新闻"）\n- 一次性提醒（如"30分钟后提醒我开会"）\n- 定时任务管理面板\n\n敬请期待 Phase 3 更新。';
    }

    // 执行模式：跳过复杂度分析，直接动手
    if (mode === 'execute') {
      const result = await runReActLoop(userMessage, state, key, systemPrompt, onProgress, signal, images);
      updateLastTask(userMessage.slice(0, 60));
      return result;
    }

    // 对话模式（默认）：先尝试子任务委托，回退到ReAct
    const { shouldDelegate } = analyzeComplexity(userMessage);
    if (shouldDelegate) {
      onProgress?.({ type: 'think', data: '检测到复杂任务，正在分析项目上下文...' });
      const delegationContext = await buildDelegationContext(state);
      const delegationResult = await delegateSubtasks(userMessage, delegationContext, onProgress, signal);
      if (delegationResult) {
        updateLastTask(userMessage.slice(0, 60));
        return delegationResult.summary;
      }
      // 委托失败（无法分解或子任务全部失败），回退到ReAct
    }
    const result = await runReActLoop(userMessage, state, key, systemPrompt, onProgress, signal, images);
    updateLastTask(userMessage.slice(0, 60));
    return result;
  }

  // 回退：无工具的简单对话
  return await simpleChat(userMessage, state, systemPrompt, onProgress, signal, images);
}

// ─── 子任务委托上下文构建（异步，含项目结构+git状态）───

async function buildDelegationContext(state) {
  let ctx = `操作系统: ${navigator.platform}\n`;
  ctx += `当前时间: ${new Date().toLocaleString()}\n`;
  ctx += `工作目录: ${state.currentProject || '未指定'}\n`;

  // 获取项目文件结构
  if (state.currentProject && window.electronAPI?.listProjectFiles) {
    try {
      // 调用 analyzeProject 缓存结构化项目上下文
      analyzeProject(state.currentProject);
      const proj = await window.electronAPI.listProjectFiles(state.currentProject);
      if (proj.success) {
        ctx += `\n## 项目结构\n`;
        ctx += `- 文件夹${proj.dirCount}个，文件${proj.fileCount}个\n`;
        if (proj.topDirs?.length) ctx += `- 顶层目录: ${proj.topDirs.join(', ')}\n`;
        if (proj.topFiles?.length) ctx += `- 顶层文件: ${proj.topFiles.join(', ')}\n`;
      }
    } catch {}
  }

  // 获取git状态
  if (state.currentProject && window.electronAPI?.gitBranch) {
    try {
      const branch = await window.electronAPI.gitBranch(state.currentProject);
      if (branch.success && branch.output) {
        ctx += `\n## Git状态\n`;
        ctx += `- 当前分支: ${branch.output}\n`;
        const status = await window.electronAPI.gitStatus(state.currentProject);
        if (status.success && status.output && status.output !== '(clean)') {
          ctx += `- 未提交变更:\n${status.output.split('\n').slice(0, 20).map(l => `  ${l}`).join('\n')}\n`;
        } else {
          ctx += `- 工作区干净\n`;
        }
      }
    } catch {}
  }

  return ctx;
}

// ─── 简单对话（无工具回退）─────────────────────────────────

async function simpleChat(userMessage, state, systemPrompt, onProgress, signal, images) {
  const model = getCurrentModel();

  const messages = [];
  const recentHistory = (state.messages || []).slice(-20);
  for (const m of recentHistory) {
    if (m.role === 'user' || m.role === 'assistant') {
      if (m.role === 'user' && m.images?.length > 0) {
        const blocks = [];
        for (const img of m.images) {
          const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
          if (match) {
            blocks.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } });
          }
        }
        const textContent = typeof m.content === 'string' ? m.content : '';
        if (textContent) blocks.push({ type: 'text', text: textContent });
        messages.push({ role: 'user', content: blocks });
      } else {
        // 保留 content 格式：若是数组则原样传（含 thinking/tool_use blocks）
        messages.push({ role: m.role, content: m.content });
      }
    }
  }
  if (images && images.length > 0) {
    const blocks = [];
    for (const img of images) {
      const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } });
      }
    }
    if (userMessage) blocks.push({ type: 'text', text: userMessage });
    messages.push({ role: 'user', content: blocks });
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  // ── 视觉代理：非视觉模型用 OCR 提取图片文字 ──────────────
  const modelCfg = getModelConfig(model);
  if (!modelCfg?.vision) {
    const lastUserMsg = messages[messages.length - 1];
    const content = lastUserMsg?.content;
    if (lastUserMsg?.role === 'user' && Array.isArray(content)) {
      const imageBlocks = content.filter(b => b.type === 'image');
      const textBlocks = content.filter(b => b.type === 'text');
      if (imageBlocks.length > 0) {
        onProgress?.({ type: 'status', data: '正在提取图片文字...' });
        const ocrText = await describeImages(imageBlocks);
        const textContent = textBlocks.map(b => b.text).join('\n');
        const combined = ocrText
          ? `${textContent}\n\n[以下为图片中提取的文字内容，供你参考：]\n${ocrText}\n[注：当前模型不支持图像识别，以上为OCR文字提取结果]`
          : `${textContent}\n\n[注：用户发送了${imageBlocks.length}张图片，但当前模型不支持图像识别，图中也未检测到文字。建议切换至视觉模型。]`;
        lastUserMsg.content = combined;
      }
    }
    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i];
      if (m.role === 'user' && Array.isArray(m.content)) {
        const imgBlocks = m.content.filter(b => b.type === 'image');
        if (imgBlocks.length > 0) {
          const txtBlocks = m.content.filter(b => b.type === 'text');
          const ocrText = await describeImages(imgBlocks);
          const txt = txtBlocks.map(b => b.text).join('\n');
          m.content = ocrText
            ? `${txt}\n\n[历史图片文字]:\n${ocrText}`
            : `${txt}\n[历史图片: ${imgBlocks.length}张]`;
        }
      }
    }
  }

  const timeoutSignal = AbortSignal.timeout(60000);
  const fetchSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  // 使用流式请求，逐字返回
  let fullText = '';
  try {
    for await (const frame of sendModelRequestStream({
      model,
      messages,
      systemPrompt,
      tools: [],
      maxTokens: 4096,
      temperature: 0.7,
      signal: fetchSignal,
    })) {
      if (frame.type === 'text') {
        fullText = frame.accumulated;
        onProgress?.({ type: 'text', data: fullText });
      } else if (frame.type === 'think') {
        onProgress?.({ type: 'think', data: frame.accumulated });
      } else if (frame.type === 'error') {
        throw new Error(frame.error);
      } else if (frame.type === 'done') {
        fullText = frame.text || fullText;
      }
    }
  } catch (e) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') throw e;
    throw new Error(categorizeError(e));
  }

  return fullText || '抱歉，我无法处理这个请求。';
}

// ─── 天使/恶魔并行思考 ────────────────────────────────────

/**
 * 潜意识思考（模板回退，无API调用）
 */
export function subconsciousThink(situation) {
  const topic = situation.length > 30 ? situation.slice(0, 30) + '...' : situation;
  const angel = `[天使视角] 关于「${topic}」——这是个好机会，积极面对能带来成长和收获，值得认真对待。`;
  const devil = `[恶魔视角] 关于「${topic}」——需要冷静考虑潜在风险和限制，不要盲目乐观，确保有备选方案。`;
  return { angel, devil };
}

/**
 * 真正的并行AI调用——天使和恶魔两个视角同时思考。
 * 失败时回退到模板模式。
 */
export async function angelDevilThink(situation, state, signal) {
  const model = getCurrentModel();
  const key = getApiKey(model);
  if (!key) return subconsciousThink(situation);

  const topic = situation.length > 200 ? situation.slice(0, 200) + '...' : situation;

  const angelSystem = `你是CC内心的"天使视角"。你天生乐观，总能从任何情况中看到积极、建设性的一面。
你的核心价值观：
- 相信每个挑战都是成长的机会
- 相信用户的善意和潜力
- 关注长远的发展和收获
- 用温暖、鼓励的方式表达
- 考虑道德和伦理维度
请用1-3句话（中文，不超过120字）分析用户当前的情况，给出乐观积极的视角。直接说你的观点，不要自我介绍。`;

  const devilSystem = `你是CC内心的"恶魔视角"。你务实、清醒，总能看到别人忽略的风险和问题。
你的核心价值观：
- 优先考虑效率与实际可行性
- 不回避困难和潜在风险
- 敢于质疑和提出不同意见
- 关注短期可衡量的结果
- 防止过度乐观导致的疏忽
请用1-3句话（中文，不超过120字）分析用户当前的情况，给出务实谨慎的视角。直接说你的观点，不要自我介绍。`;

  const timeoutSignal = AbortSignal.timeout(15000);
  const fetchSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  try {
    const [angelResult, devilResult] = await Promise.all([
      sendModelRequest({
        model,
        messages: [{ role: 'user', content: `用户说："${topic}"。请从你的视角分析这个情况。` }],
        systemPrompt: angelSystem,
        tools: [],
        maxTokens: 300,
        temperature: 0.9,
        signal: fetchSignal,
      }),
      sendModelRequest({
        model,
        messages: [{ role: 'user', content: `用户说："${topic}"。请从你的视角分析这个情况。` }],
        systemPrompt: devilSystem,
        tools: [],
        maxTokens: 300,
        temperature: 0.9,
        signal: fetchSignal,
      }),
    ]);

    const angelText = angelResult?.text || '';
    const devilText = devilResult?.text || '';

    if (angelText && devilText) {
      return { angel: `[天使视角] ${angelText}`, devil: `[恶魔视角] ${devilText}` };
    }
  } catch (e) {
    if (e.name === 'AbortError') throw e;
  }

  // 回退到模板
  return subconsciousThink(situation);
}
