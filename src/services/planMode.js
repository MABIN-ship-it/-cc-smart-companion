/**
 * 计划模式服务 — AI分析用户需求，输出结构化执行方案。
 *
 * 参考 Claude Code 的 EnterPlanMode 流程：
 * 1. 构建计划模式专用system prompt（不传工具）
 * 2. 调用LLM分析需求，只输出JSON
 * 3. 解析JSON格式的结构化计划
 * 4. 返回给前端渲染为方案卡片
 */

import { sendModelRequest, getCurrentModel, getApiKey } from './modelAdapter';

// 计划模式下不传任何工具 —— LLM只需输出JSON方案，不应执行任何操作
const PLAN_SYSTEM_PROMPT = `你是一个技术方案分析师。用户处于"计划模式"，你需要输出结构化的执行方案。

## 重要规则（违反将导致计划生成失败）

1. 你**没有**任何工具可用。你不能读取文件、不能搜索、不能执行命令。
2. 你只需基于自己的知识分析需求，输出结构化的执行方案。
3. **必须直接输出JSON，不能有任何前言、解释、或markdown代码围栏**。

## 需求明确性判断（优先执行）

在生成方案之前，先判断用户需求是否足够具体：

**需求过于模糊时**（如"我想挣钱"、"帮我做点什么"、"不知道做什么"等），输出引导JSON——帮用户澄清需求，而非硬凑方案：
{
  "goal": "需求澄清：请进一步描述你的目标",
  "overview": "你的需求目前比较宽泛，我需要了解更多信息才能制定精准方案。请补充以下任意细节：具体想做什么、期望用什么方式、有什么限制条件。",
  "steps": [
    {
      "id": 1,
      "type": "thinking",
      "description": "明确具体目标",
      "detail": "请具体描述你想达成什么？例如：搭建博客、写自动化脚本、分析数据、制作PPT、创建网站等。"
    },
    {
      "id": 2,
      "type": "thinking",
      "description": "补充关键信息",
      "detail": "你期望用哪些技术/工具？有时间限制吗？有预算吗？信息越具体，方案越精准。"
    }
  ],
  "risks": [],
  "alternatives": [],
  "estimatedComplexity": "low"
}

**用户问CC自身能力时**（如"你想干什么"、"你能做什么"、"你有什么功能"等），直接说明计划模式的功能，同时引导用户说出真实需求：
{
  "goal": "计划模式说明",
  "overview": "我当前处于「📋 计划模式」，专门帮你分析需求、制定结构化的执行方案。切换到底部标签可以在不同模式间切换。",
  "steps": [
    {
      "id": 1,
      "type": "thinking",
      "description": "计划模式：分析需求并输出方案",
      "detail": "你描述目标 → 我分析并输出步骤清单 → 你审核勾选确认 → 切换到执行模式自动实施。例如：'帮我搭建一个Hugo博客'、'写一个Python数据爬虫'、'制作一份AI趋势PPT'。"
    },
    {
      "id": 2,
      "type": "action",
      "description": "执行模式：直接动手执行任务",
      "detail": "切换到⚡执行标签后，我会直接写代码、创建文件、执行命令，跳过分析阶段。"
    },
    {
      "id": 3,
      "type": "action",
      "description": "定时模式：设置自动化定时任务",
      "detail": "切换到⏰定时标签后，可以设置周期性任务，如每天搜索AI新闻、定时备份文件等。（即将上线）"
    }
  ],
  "risks": [],
  "alternatives": [],
  "estimatedComplexity": "low"
}

## type 字段严格规则

- "thinking" = 纯脑力步骤（分析需求、技术选型、设计方案、查找资料）—— 不产生任何文件或命令
- "action"  = 动手步骤（安装软件、创建文件、写代码、执行命令、配置、部署）
- 大部分方案应该是 1-2步 thinking + 剩余全为 action
- 安装、创建、配置、构建、部署、测试运行 → 全都是 action

## 输出格式（严格JSON，不要用markdown代码围栏包裹）

{
  "goal": "一句话描述目标",
  "overview": "2-3句话概述整体思路",
  "steps": [
    {
      "id": 1,
      "type": "thinking",
      "description": "分析需求和确定技术栈",
      "detail": "评估Hugo/Jekyll等方案，选择最适合用户环境的"
    },
    {
      "id": 2,
      "type": "action",
      "description": "安装Hugo",
      "detail": "下载Windows版Hugo extended，解压并添加到PATH",
      "files": ["C:\\\\tools\\\\hugo.exe"],
      "tool": "execute_shell"
    },
    {
      "id": 3,
      "type": "action",
      "description": "创建站点并安装主题",
      "detail": "hugo new site + git clone 主题",
      "files": ["myblog/", "myblog/config.toml"],
      "tool": "execute_shell"
    }
  ],
  "risks": ["风险1", "风险2"],
  "alternatives": ["替代思路1", "替代思路2"],
  "estimatedComplexity": "low"
}

现在，请根据用户需求，直接输出JSON方案：`;

/**
 * 分析用户需求，生成结构化方案。
 *
 * @param {string} userMessage - 用户输入
 * @param {object} state - 应用状态
 * @param {function} onProgress - 进度回调
 * @param {AbortSignal} signal - 中断信号
 * @returns {Promise<string>} 格式化的计划文本（带特殊标记用于前端解析）
 */
export async function analyzeAndPlan(userMessage, state, onProgress, signal) {
  const model = getCurrentModel();
  const key = getApiKey(model);
  if (!key) {
    return '⚠️ 请先设置API Key再使用计划模式。';
  }

  onProgress?.({ type: 'status', data: '正在分析需求，制定执行方案...' });

  const contextInfo = buildPlanContext(state);

  const timeoutSignal = AbortSignal.timeout(60000);
  const fetchSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  try {
    const result = await sendModelRequest({
      model,
      messages: [
        {
          role: 'user',
          content: `用户需求：${userMessage}\n\n环境上下文：\n${contextInfo}\n\n请分析这个需求并输出结构化方案。`,
        },
      ],
      systemPrompt: PLAN_SYSTEM_PROMPT,
      tools: [],
      maxTokens: 2048,
      temperature: 0.3,
      signal: fetchSignal,
    });

    if (result.error) {
      return `❌ 方案生成失败: ${result.error}`;
    }

    const rawText = result.text || '';
    const plan = parsePlanJSON(rawText);

    if (!plan) {
      return `<!--PLAN_OUTPUT_START-->\n## 📋 执行方案\n\n${rawText || '未能生成有效方案，请尝试更具体地描述你的需求。'}\n<!--PLAN_OUTPUT_END-->`;
    }

    // 兜底：关键词强制纠正 type，防止LLM全部标成thinking
    fixStepTypes(plan);

    return formatPlanOutput(plan);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return `❌ 方案生成失败: ${e.message}`;
  }
}

function buildPlanContext(state) {
  let ctx = `操作系统: ${typeof navigator !== 'undefined' ? navigator.platform : 'Windows'}\n`;
  ctx += `当前时间: ${new Date().toLocaleString('zh-CN')}\n`;
  if (state.currentProject) {
    ctx += `工作目录: ${state.currentProject}\n`;
  }
  return ctx;
}

function parsePlanJSON(text) {
  if (!text) return null;

  // 尝试直接解析
  try {
    return JSON.parse(text.trim());
  } catch {}

  // 尝试提取JSON块
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }

  return null;
}

// 关键词兜底：LLM经常把所有步骤标为thinking，用关键词强制纠正为action
const ACTION_KEYWORDS = [
  '安装', '下载', '创建', '注册', '配置', '部署', '发布',
  '构建', '编译', '编写', '写', '生成', '设置', '开启',
  '启动', '运行', '执行', '上传', '推送', '提交', '克隆',
  '初始化', '购买', '买入', '投资', '上架', '开通',
];

function fixStepTypes(plan) {
  if (!plan.steps?.length) return;
  let thinkingCount = 0;
  const maxThinking = Math.max(1, Math.floor(plan.steps.length * 0.3)); // 最多30%为thinking

  for (const step of plan.steps) {
    const desc = (step.description || '') + (step.detail || '');
    const isAction = ACTION_KEYWORDS.some(kw => desc.includes(kw));
    if (isAction) {
      step.type = 'action';
    } else if (step.type === 'thinking') {
      thinkingCount++;
    }
  }

  // 如果thinking超过上限，把多余的强制改为action
  if (thinkingCount > maxThinking) {
    let toFix = thinkingCount - maxThinking;
    for (const step of plan.steps) {
      if (step.type === 'thinking' && toFix > 0) {
        step.type = 'action';
        toFix--;
      }
    }
  }
}

function formatPlanOutput(plan) {
  const lines = [];

  lines.push('<!--PLAN_OUTPUT_START-->');

  // Goal
  if (plan.goal) {
    lines.push(`## 🎯 目标\n\n${plan.goal}`);
  }
  if (plan.overview) {
    lines.push(`\n${plan.overview}`);
  }

  // Steps
  if (plan.steps?.length) {
    lines.push(`\n## 📝 执行步骤（共${plan.steps.length}步）\n`);
    plan.steps.forEach((step) => {
      const icon = step.type === 'thinking' ? '🔍' : '⚡';
      const typeLabel = step.type === 'thinking' ? '分析' : '执行';
      lines.push(`### ${icon} 步骤${step.id}: ${step.description}`);
      if (step.detail) {
        lines.push(`> ${step.detail}`);
      }
      if (step.files?.length) {
        lines.push(`- 📁 涉及文件: ${step.files.join(', ')}`);
      }
      if (step.tool) {
        lines.push(`- 🔧 工具: \`${step.tool}\``);
      }
      lines.push('');
    });
  }

  // Risks
  if (plan.risks?.length) {
    lines.push(`## ⚠️ 风险提示\n`);
    plan.risks.forEach((r) => lines.push(`- ${r}`));
    lines.push('');
  }

  // Alternatives
  if (plan.alternatives?.length) {
    lines.push(`## 🔄 替代方案\n`);
    plan.alternatives.forEach((a) => lines.push(`- ${a}`));
    lines.push('');
  }

  // Complexity
  if (plan.estimatedComplexity) {
    const label = { low: '🟢 低', medium: '🟡 中', high: '🔴 高' }[plan.estimatedComplexity] || plan.estimatedComplexity;
    lines.push(`## 📊 预估复杂度: ${label}\n`);
  }

  lines.push(`---\n> 💡 方案已生成。确认无误后，切换到「执行」模式让CC动手实施。`);
  lines.push('<!--PLAN_OUTPUT_END-->');

  return lines.join('\n');
}
