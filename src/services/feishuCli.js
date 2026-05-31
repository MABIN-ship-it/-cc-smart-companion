/**
 * CC 飞书 CLI 调度层
 * 渲染进程通过 IPC → 主进程执行 CLI
 */
const isElectron = typeof window !== 'undefined' && window.electronAPI;

// ═══ 命令缓存（仅缓存查询类命令） ═══
const cache = new Map();
const NO_CACHE = [
  '+base-create', '+table-create', '+table-delete', '+field-create', '+field-delete',
  '+record-create', '+record-batch-create', '+record-delete',
  '+view-create', '+view-delete', '+dashboard-create',
  'docs +create', 'im +messages-send',
];

/**
 * 执行 CLI 命令（IPC→主进程执行）
 * @param {object} input
 * @param {string|string[]} input.command - 命令字符串或参数数组
 * @param {Function|null} input.fallbackApi - 降级回调（CLI失败时调用）
 */
export async function feishuCliCommand({ command, fallbackApi = null }) {
  if (!command) return { success: false, error: '缺少命令' };

  if (!isElectron) return { success: false, error: 'CLI仅在Electron环境可用' };

  const cacheKey = typeof command === 'string' ? command : command.join(' ');
  const shouldCache = !NO_CACHE.some(p => cacheKey.includes(p));
  if (shouldCache && cache.has(cacheKey)) {
    const c = cache.get(cacheKey);
    if (Date.now() - c.ts < 60000) return c.result;
  }

  try {
    const result = await window.electronAPI.feishuCliCommand(command);
    if (result.success && shouldCache) cache.set(cacheKey, { result, ts: Date.now() });
    if (result.success) return result;

    // CLI失败 → 降级
    if (fallbackApi) {
      try { return { success: true, data: await fallbackApi() }; } catch {}
    }
    return result;
  } catch (e) {
    if (fallbackApi) {
      try { return { success: true, data: await fallbackApi() }; } catch {}
    }
    return { success: false, error: e.message };
  }
}

/**
 * 原子执行命令序列（失败自动回滚）
 */
export async function executeCommandSequence(commands) {
  let baseToken = null, tableId = null;
  const results = [];

  for (let cmd of commands) {
    cmd = cmd.replace(/{base_token}/g, baseToken || '').replace(/{table_id}/g, tableId || '');
    const result = await feishuCliCommand({ command: cmd });
    if (!result.success) {
      if (tableId && baseToken) {
        await feishuCliCommand({ command: ['base', '+table-delete', '--base-token', baseToken, '--table-id', tableId] });
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
