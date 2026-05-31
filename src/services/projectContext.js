/**
 * 项目上下文服务 — 自动分析工作区结构、技术栈、git状态
 *
 * 存储键: cc_project_context (localStorage)
 * 在 MemoryPanel 的项目记忆标签页展示，并注入 promptBuilder 系统提示词
 */

const STORAGE_KEY = 'cc_project_context';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save(ctx) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...ctx, lastAnalyzed: Date.now() }));
}

/** 检测项目类型和技术栈 */
function detectProjectType(files, dirs) {
  const allNames = [...files, ...dirs].map(f => f.toLowerCase());
  const types = [];
  const tech = [];

  if (allNames.some(n => n === 'package.json')) { types.push('Node.js/前端'); tech.push('Node.js'); }
  if (allNames.some(n => n === 'tsconfig.json')) tech.push('TypeScript');
  if (allNames.some(n => n === 'vite.config.js' || n === 'vite.config.ts')) tech.push('Vite');
  if (allNames.some(n => n.includes('.py'))) { types.push('Python'); tech.push('Python'); }
  if (allNames.some(n => n === 'requirements.txt' || n === 'pyproject.toml')) tech.push('Python');
  if (allNames.some(n => n === 'go.mod')) { types.push('Go'); tech.push('Go'); }
  if (allNames.some(n => n === 'cargo.toml')) { types.push('Rust'); tech.push('Rust'); }
  if (allNames.some(n => n === 'pom.xml' || n === 'build.gradle')) { types.push('Java'); tech.push('Java'); }
  if (allNames.some(n => n.endsWith('.csproj') || n.endsWith('.sln'))) { types.push('.NET'); tech.push('.NET'); }
  if (allNames.some(n => n === 'dockerfile' || n === 'docker-compose.yml')) tech.push('Docker');
  if (allNames.some(n => n === '.gitignore')) tech.push('Git');
  if (allNames.some(n => n.includes('.jsx') || n.includes('.tsx'))) tech.push('React');
  if (allNames.some(n => n.includes('.vue'))) tech.push('Vue');
  if (allNames.some(n => n === 'next.config.js' || n === 'next.config.ts')) tech.push('Next.js');
  if (allNames.some(n => n === 'electron' || n === 'main.js')) {
    if (tech.includes('React') || tech.includes('Vite')) tech.push('Electron');
  }

  return {
    projectType: types.length > 0 ? types.join('/') : '未识别',
    techStack: [...new Set(tech)],
  };
}

/** 分析项目目录 */
export async function analyzeProject(projectPath) {
  if (!projectPath) return null;

  const ctx = load() || {};
  ctx.path = projectPath;
  ctx.name = projectPath.split(/[\\/]/).pop();

  // 通过 electronAPI 获取目录结构
  if (window.electronAPI?.listProjectFiles) {
    try {
      const proj = await window.electronAPI.listProjectFiles(projectPath);
      if (proj.success) {
        const dirs = proj.topDirs || [];
        const files = proj.topFiles || [];
        ctx.structure = dirs.map(d => `${d}/`).concat(files).join(', ');
        ctx.dirCount = proj.dirCount;
        ctx.fileCount = proj.fileCount;

        const { projectType, techStack } = detectProjectType(files, dirs);
        ctx.projectType = projectType;
        ctx.techStack = techStack;

        // 识别关键文件
        const keyPatterns = [
          { match: name => /^index\.(html|jsx?|tsx?)$/i.test(name), role: '入口文件' },
          { match: name => /^app\.(jsx?|tsx?)$/i.test(name), role: '根组件' },
          { match: name => /^package\.json$/i.test(name), role: '依赖配置' },
          { match: name => /^vite\.config/i.test(name), role: '构建配置' },
          { match: name => /^electron/i.test(name), role: 'Electron主进程' },
          { match: name => /^main\.(py|js|go|rs)$/i.test(name), role: '程序入口' },
          { match: name => /^readme/i.test(name), role: '项目说明' },
        ];
        ctx.keyFiles = [];
        for (const f of files) {
          for (const p of keyPatterns) {
            if (p.match(f)) {
              ctx.keyFiles.push({ path: f, role: p.role });
              break;
            }
          }
        }
      }
    } catch {}
  }

  // 获取git状态
  if (window.electronAPI?.gitBranch) {
    try {
      const branch = await window.electronAPI.gitBranch(projectPath);
      if (branch.success && branch.output) {
        ctx.gitBranch = branch.output.trim();
      }
      const status = await window.electronAPI.gitStatus(projectPath);
      if (status.success) {
        ctx.gitStatus = status.output?.trim() || '(clean)';
      }
    } catch {}
  }

  save(ctx);
  return ctx;
}

/** 更新上次任务描述 */
export function updateLastTask(taskDescription) {
  const ctx = load();
  if (!ctx) return;
  ctx.lastTask = taskDescription;
  ctx.lastTaskAt = Date.now();
  save(ctx);
}

/** 添加待办任务 */
export function addPendingTask(task) {
  const ctx = load();
  if (!ctx) return;
  if (!ctx.pendingTasks) ctx.pendingTasks = [];
  ctx.pendingTasks.push(task);
  save(ctx);
}

/** 移除待办任务 */
export function removePendingTask(index) {
  const ctx = load();
  if (!ctx?.pendingTasks) return;
  ctx.pendingTasks.splice(index, 1);
  save(ctx);
}

/** 添加用户笔记 */
export function addNote(note) {
  const ctx = load();
  if (!ctx) return;
  if (!ctx.notes) ctx.notes = [];
  ctx.notes.push({ text: note, time: Date.now() });
  save(ctx);
}

/** 移除笔记 */
export function removeNote(index) {
  const ctx = load();
  if (!ctx?.notes) return;
  ctx.notes.splice(index, 1);
  save(ctx);
}

/** 获取项目上下文（注入提示词） */
export function getProjectContext() {
  const ctx = load();
  if (!ctx) return '';

  const lines = [];
  lines.push('\n## 项目上下文');
  lines.push(`- 项目目录：${ctx.path}`);
  if (ctx.projectType) lines.push(`- 项目类型：${ctx.projectType}`);
  if (ctx.techStack?.length) lines.push(`- 技术栈：${ctx.techStack.join(', ')}`);
  if (ctx.gitBranch) lines.push(`- Git分支：${ctx.gitBranch}`);
  if (ctx.gitStatus && ctx.gitStatus !== '(clean)') lines.push(`- Git状态：有未提交变更`);
  if (ctx.structure) lines.push(`- 目录结构：${ctx.structure}`);
  if (ctx.lastTask) lines.push(`- 上次任务：${ctx.lastTask}`);
  if (ctx.pendingTasks?.length) lines.push(`- 待办：${ctx.pendingTasks.join('、')}`);
  if (ctx.keyFiles?.length) lines.push('- 关键文件：' + ctx.keyFiles.map(f => `${f.path}(${f.role})`).join(', '));

  // 工具使用提示
  if (ctx.path) {
    lines.push(`\n工具执行时默认使用此项目目录作为工作目录。`);
  }

  return lines.join('\n');
}

/** 获取完整上下文对象（MemoryPanel使用） */
export function getProjectContextData() {
  return load();
}

/** 清除项目上下文 */
export function clearProjectContext() {
  localStorage.removeItem(STORAGE_KEY);
}
