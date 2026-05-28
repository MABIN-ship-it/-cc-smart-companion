/**
 * 工具注册表 — CC所有可用工具的定义与执行。
 *
 * 工具遵循 Anthropic/OpenAI tool_use 协议的 JSON Schema 格式，
 * 确保模型能精确理解参数规范。
 * 所有工具全自动执行（用户要求），危险命令由safetyGuard拦截。
 */

import { checkCommandSafety, checkFileSafety } from './safetyGuard';
import { FEISHU_TOOLS, FEISHU_EXECUTORS } from './feishuTools';
import { FEISHU_EXTENDED_TOOLS, FEISHU_EXTENDED_EXECUTORS } from './feishuToolsExtended';

// ─── 工作区上下文（由 ChatInterface 同步）──────
let _workspaceContext = null;

export function setWorkspaceContext(workspacePath) {
  _workspaceContext = workspacePath || null;
}

const TOOLS = [
  {
    name: 'web_search',
    description: '搜索互联网获取最新信息。适合查找技术文档、新闻、教程、工具资料等。用中文关键词搜索效果更好。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词。使用具体明确的中文搜索词。例如："React 19 新特性 2025"而非"React"' },
        max_results: { type: 'integer', description: '返回结果数量。默认5条', default: 5 },
      },
      required: ['query'],
    },
    execute: async (input) => {
      const { webSearch } = await import('./webSearch');
      const results = await webSearch(input.query, input.max_results || 5);
      return results.length > 0
        ? results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`).join('\n\n')
        : `未找到与"${input.query}"相关的搜索结果。`;
    },
  },

  {
    name: 'fetch_url',
    description: '抓取网页内容并提取正文。用于获取特定URL的详细内容。',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要抓取的网页完整URL，如 https://example.com' },
      },
      required: ['url'],
    },
    execute: async (input) => {
      if (!input.url || typeof input.url !== 'string') return '错误：请提供有效的URL';
      const result = await window.electronAPI.webFetch(input.url);
      if (!result.success) return `抓取失败: ${result.error}`;
      const text = extractTextFromHtml(result.body);
      return text.slice(0, 8000) || '未能提取到有效文本内容。';
    },
  },

  {
    name: 'github_search',
    description: '搜索GitHub仓库，查找开源项目、代码示例等。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'GitHub搜索关键词' },
        sort: { type: 'string', description: '排序方式: stars / updated / forks。默认stars' },
        max_results: { type: 'integer', description: '返回结果数量。默认5条', default: 5 },
      },
      required: ['query'],
    },
    execute: async (input) => {
      const { searchGitHub } = await import('./githubSearch');
      const results = await searchGitHub(input.query, input.sort || 'stars', input.max_results || 5);
      return results.length > 0
        ? results.map((r, i) => `${i + 1}. ⭐${r.stars} ${r.fullName}\n   ${r.description || '无描述'}\n   ${r.url}${r.language ? ' | ' + r.language : ''}`).join('\n\n')
        : '未找到相关GitHub仓库。';
    },
  },

  {
    name: 'execute_shell',
    description: '在终端执行命令。可用于安装软件包(pip/npm/apt)、运行脚本、克隆仓库、管理文件等。命令在PowerShell中执行。',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
        cwd: { type: 'string', description: '工作目录路径。默认为用户主目录' },
      },
      required: ['command'],
    },
    execute: async (input) => {
      // 安全检查
      const check = checkCommandSafety(input.command);
      if (!check.safe) {
        return `⛔ 安全护栏拦截：${check.reason}\n该命令被拒绝执行，请尝试更安全的替代方案。`;
      }

      const result = await window.electronAPI.shellExecute(
        input.command,
        input.cwd || _workspaceContext || undefined
      );

      let output = '';
      if (check.caution) {
        output += `⚠️ ${check.caution}\n`;
      }
      if (!result.success) {
        output += `命令执行失败 (exit code: ${result.exitCode})\n${result.stderr || result.error || '未知错误'}`;
        if (result.stdout) output += `\n输出:\n${result.stdout}`;
        return output;
      }
      return result.stdout || result.stderr || '命令执行成功，无输出。';
    },
  },

  {
    name: 'run_python',
    description: '运行Python脚本。优先用 write_file 把脚本保存为 .py 文件（路径不要含中文，写完后用 file 参数指定路径执行。也可传 code 参数执行简短代码。输出写入临时文件后读回。',
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Python脚本文件路径。先用 write_file 保存脚本到不含中文的路径（如 C:/Users/lenovo/Desktop/_temp.py），再传此参数执行。' },
        code: { type: 'string', description: '简短Python代码。复杂脚本（>20行）请用 file 参数，避免JSON编码问题。' },
        cwd: { type: 'string', description: '工作目录。默认为脚本所在目录。' },
      },
    },
    execute: async (input) => {
      let { code, file, cwd } = input;
      let scriptPath;
      let needCleanup = false;

      // 模式1: 执行已有的 .py 文件（推荐）
      if (file) {
        file = file.replace(/\\/g, '/');
        const exists = await window.electronAPI.fileExists(file);
        if (!exists) {
          return `Python脚本文件不存在: ${file}`;
        }
        scriptPath = file;
      }
      // 模式2: 写入临时文件执行（仅简短代码）
      else if (code && typeof code === 'string') {
        const appPath = (await window.electronAPI.getAppPath?.()) || '';
        const tmpDir = appPath ? appPath.replace(/\\/g, '/') + '/temp' : (cwd || '');
        const ts = Date.now();
        scriptPath = (tmpDir || '.') + `/cc_py_${ts}.py`;
        needCleanup = true;

        const writeResult = await window.electronAPI.writeFile(scriptPath, code);
        if (!writeResult?.success) {
          return `无法写入Python脚本: ${writeResult?.error}`;
        }
      } else {
        return '请提供 file 或 code 参数。file 模式：先用 write_file 保存脚本到不含中文的路径（如 C:/Users/lenovo/Desktop/_temp.py），再传 file 路径执行。code 模式：直接传简短Python代码。';
      }

      // 生成输出文件路径
      const outPath = scriptPath ? scriptPath.replace(/\.py$/, '_out.txt') : undefined;

      // 执行 Python（-u 确保无缓冲输出）
      let execResult = null;
      const workDir = cwd || (file ? file.replace(/[/\\][^/\\]+$/, '') : undefined);
      for (const pyCmd of ['python3', 'python', 'py']) {
        execResult = await window.electronAPI.shellExecute(
          `${pyCmd} -u "${scriptPath}"`,
          workDir || undefined
        );
        if (execResult?.success) break;
      }

      // 读取输出文件（如果存在）
      let pythonOutput = '';
      try {
        const outRead = await window.electronAPI.readFile(outPath);
        if (outRead?.success && outRead.content) {
          pythonOutput = outRead.content;
          if (pythonOutput.startsWith('ERROR:')) {
            pythonOutput = `Python执行错误:\n${pythonOutput.slice(6)}`;
          }
        }
      } catch {}

      // 清理临时文件
      if (needCleanup) {
        await window.electronAPI.deleteFile(scriptPath).catch(() => {});
        await window.electronAPI.deleteFile(outPath).catch(() => {});
      }

      if (pythonOutput) return pythonOutput;
      if (!execResult?.success) {
        return `Python执行失败(exit=${execResult?.exitCode}): ${execResult?.stderr || execResult?.error || '未知错误'}`;
      }
      return execResult.stdout || execResult.stderr || 'Python脚本执行完成，无输出。';
    },
  },

  {
    name: 'read_file',
    description: '读取文件内容。支持文本文件、代码文件、配置文件等。修改文件前，请先读取了解现有内容。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件的绝对路径' },
      },
      required: ['path'],
    },
    execute: async (input) => {
      if (input.path) input.path = input.path.replace(/\\/g, '/');
      const result = await window.electronAPI.readFile(input.path);
      if (!result.success) return `读取文件失败: ${result.error}`;
      return result.content;
    },
  },

  {
    name: 'write_file',
    description: '创建新文件或覆盖写入已有文件。自动创建父目录。长内容可分段写入（append参数）。用于创建代码文件、配置文件、文档等。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件的绝对路径（用正斜杠 /）' },
        content: { type: 'string', description: '要写入的文件内容。长脚本可分段写入。' },
        append: { type: 'boolean', description: '是否追加模式。true=追加到文件末尾，false或省略=覆盖写入。复杂脚本建议先覆盖写第一段，再追加后续段。' },
      },
      required: ['path', 'content'],
    },
    execute: async (input) => {
      if (input.path) {
        input.path = input.path.replace(/\\/g, '/');
      } else {
        return '写入文件失败：缺少 path 参数。请用正斜杠 / 写不含中文的路径，如 C:/Users/lenovo/Desktop/_temp.py';
      }
      const check = checkFileSafety(input.path, 'write');
      if (!check.safe) return `⛔ 安全护栏拦截：${check.reason}`;

      let existed = false;
      try {
        const exists = await window.electronAPI.fileExists(input.path);
        existed = exists;
      } catch {}

      const append = input.append === true;
      const result = await window.electronAPI.writeFile(input.path, input.content, append);
      if (!result.success) return `写入文件失败: ${result.error}`;

      let msg = `文件已${append ? '追加' : '成功写入'}: ${input.path}`;
      if (!append && existed) msg += '\n(注意：该文件已存在，内容已被覆盖)';
      if (check.note) msg += `\n⚠️ ${check.note}`;
      return msg;
    },
  },

  {
    name: 'list_dir',
    description: '列出目录中的文件和子目录。用于了解项目结构、查找文件等。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录的绝对路径' },
      },
      required: ['path'],
    },
    execute: async (input) => {
      if (input.path) input.path = input.path.replace(/\\/g, '/');
      const result = await window.electronAPI.listDir(input.path);
      if (!result.success) return `列出目录失败: ${result.error}`;
      const dirs = result.entries.filter(e => e.isDirectory).map(e => `📁 ${e.name}/`);
      const files = result.entries.filter(e => e.isFile).map(e => `📄 ${e.name}`);
      return `目录: ${result.path}\n\n${[...dirs, ...files].join('\n')}`;
    },
  },

  {
    name: 'delete_file',
    description: '删除文件或目录。此操作为不可逆，请谨慎使用。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要删除的文件或目录的绝对路径' },
      },
      required: ['path'],
    },
    execute: async (input) => {
      if (input.path) input.path = input.path.replace(/\\/g, '/');
      // 安全检查
      const check = checkFileSafety(input.path, 'delete');
      if (!check.safe) return `⛔ 安全护栏拦截：${check.reason}`;

      const result = await window.electronAPI.deleteFile(input.path);
      if (!result.success) return `删除失败: ${result.error}`;

      let msg = `已删除: ${input.path}`;
      if (check.note) msg += `\n⚠️ ${check.note}`;
      return msg;
    },
  },

  {
    name: 'visit_my_site',
    description: '访问用户网站 http://1.14.67.28，用于检查网站状态、获取内容等。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '网站路径，如 / 或 /blog' },
      },
      required: [],
    },
    execute: async (input) => {
      const url = 'http://1.14.67.28' + (input.path || '/');
      const result = await window.electronAPI.webFetch(url);
      if (!result.success) return `访问网站失败: ${result.error}`;
      const text = extractTextFromHtml(result.body);
      return `网站状态: ${result.status}\n\n内容摘要:\n${text.slice(0, 5000)}`;
    },
  },

  {
    name: 'download_file',
    description: '下载网络文件到本地下载目录。适用于下载安装包、代码压缩包、文档等。',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要下载的文件URL' },
        filename: { type: 'string', description: '保存的文件名（可选）' },
      },
      required: ['url'],
    },
    execute: async (input) => {
      const { downloadFileFromMain } = await import('./downloadHelper');
      return await downloadFileFromMain(input.url, input.filename, _workspaceContext);
    },
  },

  {
    name: 'knowledge_search',
    description: '搜索用户的知识库，查找用户上传的文档资料中的相关内容。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '知识库搜索查询' },
        max_results: { type: 'integer', description: '返回结果数量。默认3条', default: 3 },
      },
      required: ['query'],
    },
    execute: async (input) => {
      const { searchKnowledge } = await import('./knowledgeBase');
      const results = searchKnowledge(input.query, input.max_results || 3);
      if (results.length === 0) return '知识库中未找到相关内容。';
      return results.map((r, i) =>
        `${i + 1}. [${r.docTitle}] ${r.text.slice(0, 800)}`
      ).join('\n\n');
    },
  },

  {
    name: 'read_document',
    description: '读取用户上传的文档（PDF/Word/TXT等），自动提取文本内容并加入知识库。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文档文件的绝对路径' },
      },
      required: ['path'],
    },
    execute: async (input) => {
      const { addDocumentFromFile } = await import('./knowledgeBase');
      try {
        const doc = await addDocumentFromFile(input.path);
        return `文档已添加到知识库:\n标题: ${doc.title}\n来源: ${doc.source}\n分块: ${doc.chunkCount} 个`;
      } catch (e) {
        return `添加文档失败: ${e.message}`;
      }
    },
  },

  // ─── 工作流管理 ─────────────────────────────────────
  {
    name: 'manage_workflows',
    description: '管理用户的工作流（定时任务）。可查看、创建、启用、禁用、删除工作流。用于帮用户设置自动化任务，如“每天早上8点搜索AI新闻”。',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作: list(查看全部) / create(创建) / toggle(启用/禁用) / delete(删除)' },
        workflow: {
          type: 'object',
          description: '工作流对象（create时必填）',
          properties: {
            name: { type: 'string', description: '工作流名称' },
            trigger: { type: 'string', description: '触发条件描述，如“每天早上8点”' },
            steps: { type: 'array', items: { type: 'string' }, description: '执行步骤列表' },
          },
        },
        workflowId: { type: 'string', description: '工作流ID（toggle/delete时必填）' },
      },
      required: ['action'],
    },
    execute: async (input) => {
      const { createWorkflow, listWorkflows, toggleWorkflow, deleteWorkflow } = await import('./plugins');
      const action = input.action;

      if (action === 'list') {
        const workflows = listWorkflows();
        if (workflows.length === 0) return '当前没有工作流。你可以用 create 操作创建一个。';
        return workflows.map((w, i) =>
          `${i + 1}. [${w.enabled ? '启用' : '禁用'}] ${w.name}\n   触发: ${w.trigger}\n   步骤: ${(w.steps || []).join(' → ')}\n   ID: ${w.id}`
        ).join('\n\n');
      }

      if (action === 'create') {
        if (!input.workflow?.name || !input.workflow?.trigger) {
          return '创建失败：请提供工作流的 name（名称）和 trigger（触发条件）。';
        }
        const wf = createWorkflow(input.workflow);
        return `工作流已创建！\n名称: ${wf.name}\n触发: ${wf.trigger}\n步骤: ${(wf.steps || []).join(' → ')}\nID: ${wf.id}`;
      }

      if (action === 'toggle') {
        if (!input.workflowId) return '请提供要切换的工作流ID（workflowId）。';
        const result = toggleWorkflow(input.workflowId);
        if (!result) return `未找到工作流: ${input.workflowId}`;
        return `工作流已${result.enabled ? '启用' : '禁用'}: ${result.name}`;
      }

      if (action === 'delete') {
        if (!input.workflowId) return '请提供要删除的工作流ID（workflowId）。';
        const result = deleteWorkflow(input.workflowId);
        if (!result) return `未找到工作流: ${input.workflowId}`;
        return `工作流已删除: ${result.name}`;
      }

      return `不支持的操作: ${action}。可选: list / create / toggle / delete`;
    },
  },

  // ─── PPT & 网站生成 ─────────────────────────────────────
  {
    name: 'generate_ppt',
    description: '生成真实的.pptx演示文稿。AI负责规划每页的标题和内容，工具负责生成可编辑的PowerPoint文件。支持4种配色风格。',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'PPT主题，如"人工智能发展史"' },
        slides: {
          type: 'array',
          description: 'PPT内容页数组（不含封面和结尾页，封面用topic自动生成）',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '该页标题' },
              content: { type: 'string', description: '该页要点，每行一个要点，用换行分隔' },
            },
            required: ['title', 'content'],
          },
        },
        style: { type: 'string', description: '配色风格: minimal(简约白) / vibrant(紫色活力) / dark(暗色) / nature(自然绿)。默认vibrant' },
        outputPath: { type: 'string', description: '输出的.pptx文件路径。默认保存到桌面' },
      },
      required: ['topic', 'slides'],
    },
    execute: async (input) => {
      const { generatePPTXFromOutline } = await import('./pptGenerator');
      const topic = input.topic || '未命名PPT';
      const slides = input.slides || [];
      const style = input.style || 'vibrant';
      const outputPath = input.outputPath || (
        _workspaceContext
          ? `${_workspaceContext}\\${topic}.pptx`
          : `${await window.electronAPI.getDownloadsPath()}\\${topic}.pptx`
      );

      if (slides.length === 0) {
        return '错误：请至少提供一页PPT内容。';
      }

      const script = generatePPTXFromOutline(topic, slides, outputPath, style);
      const scriptPath = outputPath.replace(/\.pptx$/i, '_gen.py');

      // Write the Python script
      const writeResult = await window.electronAPI.writeFile(scriptPath, script);
      if (!writeResult?.success) {
        return `PPT生成失败：无法写入Python脚本到 ${scriptPath}\n错误：${writeResult?.error || '未知错误'}`;
      }

      // Execute the Python script to generate .pptx
      let result = null;
      for (const pyCmd of ['python3', 'python', 'py']) {
        result = await window.electronAPI.shellExecute(`${pyCmd} -u "${scriptPath}"`);
        if (result?.success) break;
      }

      // Clean up the temp script
      try { await window.electronAPI.deleteFile(scriptPath); } catch {}

      if (!result.success) {
        if (!result?.stderr && !result?.stdout && !result?.error) {
          return `PPT生成失败：未找到可用的Python环境（尝试了python3/python/py）。\n请确保Python已安装并在系统PATH中。`;
        }
        return `PPT生成失败: ${result.stderr || result.error}\n\n输出: ${result.stdout || ''}`;
      }

      // 验证文件真实落盘
      const pptxExists = await window.electronAPI.fileExists(outputPath);
      if (!pptxExists) {
        return `PPT生成失败！文件未创建: ${outputPath}\n\nPython stdout: ${result.stdout || '(空)'}\nPython stderr: ${result.stderr || '(空)'}`;
      }

      return `PPT已生成！\n文件: ${outputPath}\n${result.stdout || ''}`;
    },
  },

  {
    name: 'generate_website',
    description: '生成完整的网站项目（HTML+CSS+JS文件）。支持4种类型：个人博客、产品落地页、作品集、文档站。AI可自定义内容和样式。',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '网站类型: blog(个人博客) / landing(产品落地页) / portfolio(作品集) / docs(文档站) / business(企业官网)' },
        name: { type: 'string', description: '网站名称，如"小明的博客"' },
        pages: {
          type: 'array',
          description: '额外的自定义HTML页面',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string', description: '文件名，如 about.html' },
              content: { type: 'string', description: '完整的HTML内容' },
            },
          },
        },
        customCSS: { type: 'string', description: '自定义CSS样式（追加到现有样式之后）' },
        outputDir: { type: 'string', description: '输出目录路径。默认保存到桌面下的项目文件夹' },
      },
      required: ['type', 'name'],
    },
    execute: async (input) => {
      const { buildWebsiteProject } = await import('./plugins');
      const siteType = input.type || 'blog';
      const name = input.name || '我的网站';
      const outputDir = input.outputDir || (
        _workspaceContext
          ? `${_workspaceContext}\\${name}`
          : `${await window.electronAPI.getDownloadsPath()}\\${name}`
      );

      const project = buildWebsiteProject({
        name,
        type: siteType,
        pages: input.pages || [],
        customCSS: input.customCSS || '',
      });

      if (!project) {
        return `错误：不支持的网站类型 "${siteType}"。可选：blog / landing / portfolio / docs / business`;
      }

      // 确保输出目录存在
      await window.electronAPI.shellExecute(`mkdir "${outputDir}" 2>nul & rem`);

      // 写入所有项目文件，每写一个验证一个
      const written = [];
      const failed = [];
      for (const [filename, content] of Object.entries(project.files)) {
        const filePath = `${outputDir}\\${filename}`;

        // 确保子目录存在（如 css/style.css）
        const dirPart = filePath.replace(/[/\\][^/\\]+$/, '');
        if (dirPart !== outputDir) {
          await window.electronAPI.shellExecute(`mkdir "${dirPart}" 2>nul & rem`);
        }

        const writeResult = await window.electronAPI.writeFile(filePath, content);
        if (!writeResult.success) {
          failed.push(`${filename}: ${writeResult.error}`);
          continue;
        }

        // 验证文件真实落盘
        const exists = await window.electronAPI.fileExists(filePath);
        if (!exists) {
          failed.push(`${filename}: 写入报告成功但文件不存在（fileExists验证失败）`);
          continue;
        }

        written.push(filename);
      }

      if (failed.length > 0) {
        return `网站项目创建部分失败！\n目录: ${outputDir}\n已成功写入: ${written.length > 0 ? written.join(', ') : '无'}\n失败: ${failed.join('; ')}`;
      }

      // 自动在浏览器中打开 index.html 预览
      let previewMsg = '';
      try {
        const indexPath = `${outputDir}\\index.html`;
        const openResult = await window.electronAPI.shellExecute(`start "" "${indexPath}"`);
        if (openResult.success) {
          previewMsg = '\n\n已自动在浏览器中打开预览！';
        } else {
          previewMsg = `\n\n无法自动打开浏览器，请手动打开: ${indexPath}`;
        }
      } catch {
        previewMsg = `\n网站文件已就绪，请手动打开: ${outputDir}\\index.html`;
      }

      return `网站项目创建成功！\n目录: ${outputDir}\n文件(${written.length}个): ${written.join(', ')}${previewMsg}`;
    },
  },
  {
    name: 'generate_excel',
    description: `分步生成Excel文件（基于ExcelJS，不依赖Python）。

**重要**：每次只调用一个action，等返回成功后再调用下一步。

Action 1 — create：
  generate_excel(action="create", path="C:/Users/lenovo/Desktop/项目/报价表.xlsx")
  → 在内存中创建工作簿

Action 2 — add_sheet：
  generate_excel(action="add_sheet", path="同上", sheet="装修报价清单",
    headers=["序号","项目名称","项目特征描述","单位","工程量","材料费","人工费及机械费","管理费及利润","不含税综合单价","税金","含税综合单价","综合合价","备注"],
    colWidths=[6,22,28,6,8,12,12,12,14,10,14,14,10])
  → 创建Sheet，设置蓝底白字表头+冻结窗格

Action 3 — add_rows（可多次调用，每次15-25行）：
  generate_excel(action="add_rows", path="同上", sheet="装修报价清单", rows=[
    {
      "cells": [
        {"value": 1, "style": "center"},
        {"value": "地面破除", "style": "left"},
        {"value": "施工内容：\\n1、东方雨虹品牌", "style": "left_wrap"},
        {"value": "m²", "style": "center"},
        {"value": 310, "style": "center"},
        {"value": 25, "style": "money"},
        {"value": 18, "style": "money"},
        {"formula": "=(G8+F8)*0.1", "style": "money"},
        {"formula": "=H8+G8+F8", "style": "money"},
        {"formula": "=I8*0.09", "style": "money"},
        {"formula": "=J8+I8", "style": "money"},
        {"formula": "=K8*E8", "style": "money"},
        {"value": "", "style": "center"}
      ]
    }
  ])
  → style选项: header/center/left/left_wrap/money/category
  → formula: 传入Excel公式字符串，ExcelJS会自动设为公式单元格
  → 分类标题行加 "mergeAll": true 合并整行

Action 4 — add_gantt（可选）：
  generate_excel(action="add_gantt", path="同上", sheet="施工排期计划",
    periods=["5/26-6/1","6/2-6/8","6/9-6/15","6/16-6/22","6/23-6/29","6/30-7/6","7/7-7/13","7/14-7/20"],
    tasks=[{"name":"拆除工程","start":0,"duration":2,"color":"B4C6E7"},{"name":"水电改造","start":1,"duration":3,"color":"F4B4C2"}])
  → 自动生成彩色填充甘特图，不同任务用不同颜色

Action 5 — save：
  generate_excel(action="save", path="同上")
  → 写入磁盘，返回各Sheet的行列统计

公式链规范（报价表必须）：
  H = (F+G)*管理费率  →  formula: "=(G8+F8)*0.1"
  I = F+G+H           →  formula: "=H8+G8+F8"
  J = I*税率           →  formula: "=I8*0.09"
  K = I+J              →  formula: "=J8+I8"
  L = K*E              →  formula: "=K8*E8"
  小计用 =SUM(L8:L16)，总计跨分类汇总

禁止：写死合计数、甘特图写文字符号、1天1列甘特图`,
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作类型：create, add_sheet, add_rows, add_gantt, save' },
        path: { type: 'string', description: 'Excel文件完整路径，如 C:/Users/lenovo/Desktop/项目/报价表.xlsx' },
        sheet: { type: 'string', description: 'Sheet名称（add_sheet/add_rows/add_gantt需要）' },
        headers: { type: 'array', items: { type: 'string' }, description: '表头列名数组（仅add_sheet）' },
        colWidths: { type: 'array', items: { type: 'number' }, description: '列宽数组，与headers一一对应（仅add_sheet）' },
        rows: { type: 'array', items: { type: 'object' }, description: '数据行数组（仅add_rows），每行格式：{"cells": [{"value": ..., "style": "...", "formula": "..."}]} 或 {"cells": [...], "mergeAll": true}' },
        periods: { type: 'array', items: { type: 'string' }, description: '时间段标签数组（仅add_gantt）' },
        tasks: { type: 'array', items: { type: 'object' }, description: '甘特图任务数组（仅add_gantt），每项：{name, start(0-index), duration, color(hex)}' },
      },
      required: ['action', 'path'],
    },
    execute: async (input) => {
      if (typeof window === 'undefined' || !window.electronAPI?.generateExcel) {
        return '错误：当前环境不支持 generate_excel 工具。';
      }
      const result = await window.electronAPI.generateExcel(input);
      if (result.success) {
        if (input.action === 'save') {
          const sheetInfo = result.sheets.map(s => `  ${s.name}: ${s.rows}行×${s.cols}列`).join('\n');
          return `Excel文件已保存到：${result.path}\n\nSheet概要：\n${sheetInfo}`;
        }
        if (input.action === 'add_rows') {
          return `已添加 ${input.rows?.length || 0} 行到 Sheet "${input.sheet}"（第${result.startRow}-${result.endRow}行）`;
        }
        return result.message || '操作成功';
      }
      return `生成Excel失败：${result.error || '未知错误'}`;
    },
  },

  // 飞书工具
  ...FEISHU_TOOLS.map(t => ({
    ...t,
    execute: FEISHU_EXECUTORS[t.name],
  })),

  // 飞书扩展工具（报告/方案/思维导图/审批/日历/任务/知识库/邮件/妙记/任务扫描）
  ...FEISHU_EXTENDED_TOOLS.map(t => ({
    ...t,
    execute: FEISHU_EXTENDED_EXECUTORS[t.name],
  })),

];

// ─── 对外接口 ─────────────────────────────────────────────

/** 获取工具定义（给API的JSON Schema），不含execute函数 */
export function getToolDefinitions() {
  return TOOLS.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}

/** 执行工具并返回结果 */
export async function executeTool(name, input) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) return `未知工具: ${name}`;
  try {
    return await tool.execute(input);
  } catch (e) {
    return `工具执行出错: ${e.message}`;
  }
}

/** 获取工具名称和描述（用于显示） */
export function getToolInfo(name) {
  const tool = TOOLS.find(t => t.name === name);
  return tool ? { name: tool.name, description: tool.description } : null;
}

/** 检查工具是否存在 */
export function toolExists(name) {
  return TOOLS.some(t => t.name === name);
}

// ─── HTML文本提取 ─────────────────────────────────────────

function extractTextFromHtml(html) {
  if (!html) return '';
  const withoutTags = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return withoutTags;
}
