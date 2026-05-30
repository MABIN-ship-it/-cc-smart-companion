/**
 * CC 飞书 CLI 调度层
 * CLI优先，失败自动降级到 feishuApi()
 * 零外部依赖，仅用 Node.js 内置模块
 */
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CC_DIR = path.join(os.homedir(), '.cc');
const CLI_BIN = path.join(CC_DIR, 'node_modules', '@larksuite', 'cli', 'bin', 'lark-cli.exe');
const CLI_VERSION = '1.0.44';
const LOG_FILE = path.join(CC_DIR, 'cli-error.log');

// ═══ 本地安装 CLI ═══
async function ensureCliInstalled() {
  if (!fs.existsSync(CLI_BIN)) {
    fs.mkdirSync(CC_DIR, { recursive: true });
    console.log(`[CC] 安装飞书CLI v${CLI_VERSION}...`);
    await new Promise((resolve, reject) => {
      execFile('npm', ['install', `@larksuite/cli@${CLI_VERSION}`, '--no-save', '--prefix', CC_DIR],
        { cwd: CC_DIR }, (err) => { if (err) reject(err); else resolve(); });
    });
    console.log('[CC] CLI安装完成');
  }
  return CLI_BIN;
}

// ═══ 解析命令字符串为参数数组（保留引号内的内容） ═══
function parseArgs(cmdStr) {
  const args = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  for (const ch of cmdStr) {
    if (inQuote) {
      if (ch === quoteChar) { inQuote = false; }
      else { current += ch; }
    } else if (ch === '"' || ch === "'") {
      inQuote = true; quoteChar = ch;
    } else if (ch === ' ') {
      if (current) { args.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

// ═══ 执行 CLI 命令 ═══
function runCli(args, timeout = 30000) {
  const argArr = typeof args === 'string' ? parseArgs(args) : args;
  const cmdStr = argArr.join(' ');
  console.log(`[CLI] ▶ ${cmdStr.slice(0, 200)}`);

  return new Promise((resolve) => {
    execFile(CLI_BIN, argArr, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const errLog = `[${new Date().toISOString()}] ${cmdStr}\n  error: ${err.message}\n  stderr: ${(stderr || '').slice(0, 500)}\n\n`;
        try { fs.appendFileSync(LOG_FILE, errLog); } catch {}
        return resolve({ success: false, error: err.message, stderr: (stderr || '').slice(0, 1000) });
      }
      console.log(`[CLI] ✓ ${(stdout || '').slice(0, 200)}`);
      try {
        resolve({ success: true, data: JSON.parse(stdout) });
      } catch {
        resolve({ success: true, text: (stdout || '').slice(0, 5000) });
      }
    });
  });
}

// ═══ 命令缓存（仅缓存查询类命令） ═══
const cache = new Map();
const NO_CACHE = [
  '+base-create', '+table-create', '+table-delete', '+field-create', '+field-delete',
  '+record-create', '+record-batch-create', '+record-update', '+record-delete',
  '+view-create', '+view-delete', '+dashboard-create', '+dashboard-delete',
  'docs +create', 'docs +update', 'im +messages-send',
];

/**
 * 执行 CLI 命令（CLI优先→失败降级到原生API）
 * @param {object} input
 * @param {string} input.command - CLI命令
 * @param {Function|null} input.fallbackApi - 降级回调
 */
export async function feishuCliCommand({ command, fallbackApi = null }) {
  if (!command) return { success: false, error: '缺少命令' };

  // 确保 CLI 已安装
  try { await ensureCliInstalled(); } catch (e) {
    if (fallbackApi) {
      try { return { success: true, data: await fallbackApi() }; } catch {}
    }
    return { success: false, error: `CLI安装失败: ${e.message}` };
  }

  // 缓存检查（仅查询命令）
  const cacheKey = typeof command === 'string' ? command : command.join(' ');
  const shouldCache = !NO_CACHE.some(p => cacheKey.includes(p));
  if (shouldCache && cache.has(cacheKey)) {
    const c = cache.get(cacheKey);
    if (Date.now() - c.ts < 60000) return c.result;
  }

  // 执行（支持字符串或数组）
  const args = typeof command === 'string' ? parseArgs(command) : command;
  const result = await runCli(args);
  if (result.success && shouldCache) cache.set(cacheKey, { result, ts: Date.now() });
  if (result.success) return result;

  // CLI失败 → 降级到原生API
  if (fallbackApi) {
    console.warn(`[CC] CLI降级: ${command.slice(0, 50)}...`);
    try {
      return { success: true, data: await fallbackApi() };
    } catch (e) {
      return { success: false, error: `CLI和API均失败: ${e.message}` };
    }
  }
  return result;
}

/**
 * 原子执行命令序列（失败自动回滚）
 * @param {string[]} commands - 命令数组，支持 {base_token} 和 {table_id} 变量
 */
export async function executeCommandSequence(commands) {
  let baseToken = null, tableId = null;
  const results = [];

  for (let cmd of commands) {
    cmd = cmd.replace(/{base_token}/g, baseToken || '').replace(/{table_id}/g, tableId || '');
    const result = await feishuCliCommand({ command: cmd });
    if (!result.success) {
      if (tableId && baseToken) {
        console.log(`[CC] 回滚: 删除表 ${tableId}`);
        await feishuCliCommand({ command: `base +table-delete --base-token ${baseToken} --table-id ${tableId}` });
      }
      return { success: false, error: result.error, results };
    }
    const d = result.data?.data || result.data;
    if (d?.base?.base_token) baseToken = d.base.base_token;
    if (d?.table?.table_id) tableId = d.table.table_id;
    if (d?.table?.id) tableId = d.table.id;
    if (d?.tables) { const tbl = d.tables[0]; if (tbl?.id) tableId = tbl.id; }
    results.push({ cmd, result });
  }
  return { success: true, baseToken, tableId, results };
}
