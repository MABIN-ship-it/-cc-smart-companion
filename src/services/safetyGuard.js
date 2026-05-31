/**
 * 安全护栏 — 拦截危险命令。
 * 全自动执行模式下，保留安全底线。
 */

// ─── 危险命令模式库 ───────────────────────────────────────
const DANGEROUS_PATTERNS = [
  // Unix/Linux 毁灭性命令
  { pattern: /rm\s+-rf\s+\//, reason: '禁止删除根目录' },
  { pattern: /rm\s+-rf\s+\/\*/, reason: '禁止删除根目录下所有文件' },
  { pattern: /rm\s+-rf\s+~/, reason: '禁止强制删除用户目录' },
  { pattern: /mkfs/, reason: '禁止格式化文件系统' },
  { pattern: /dd\s+if=/, reason: '禁止直接写入磁盘' },
  { pattern: />\s*\/dev\/sda/, reason: '禁止覆盖磁盘设备' },

  // Fork炸弹
  { pattern: /:\s*\(\)\s*\{/, reason: '疑似Fork炸弹，已拦截' },
  { pattern: /%0\|%0/, reason: '疑似Fork炸弹，已拦截' },

  // Windows 毁灭性命令
  { pattern: /format\s+[a-zA-Z]:/, reason: '禁止格式化磁盘' },
  { pattern: /del\s+\/f\s+\/s\s+\/q\s+[A-Z]:\\/, reason: '禁止强制删除整个磁盘' },
  { pattern: /rd\s+\/s\s+\/q\s+[A-Z]:\\/, reason: '禁止删除整个磁盘目录' },

  // 系统破坏
  { pattern: /shutdown\s+\/s/, reason: '禁止关机操作' },
  { pattern: /shutdown\s+-h/, reason: '禁止关机操作' },
  { pattern: /reboot/, reason: '禁止重启操作' },
  { pattern: /chmod\s+-R\s+777\s+\//, reason: '禁止修改根目录权限为777' },
  { pattern: /chmod\s+777\s+\//, reason: '禁止修改根目录权限为777' },

  // 注册表破坏
  { pattern: /reg\s+delete\s+HKLM/i, reason: '禁止删除系统注册表项' },
  { pattern: /reg\s+delete\s+\/f\s+HKLM/i, reason: '禁止强制删除系统注册表项' },
];

/** 低风险但需警惕的关键词（不拦截，但提醒） */
const CAUTION_PATTERNS = [
  { pattern: /pip\s+uninstall/, note: '注意：正在卸载Python包' },
  { pattern: /npm\s+uninstall/, note: '注意：正在卸载npm包' },
  { pattern: /git\s+push\s+--force/, note: '警告：正在强制推送（force push）' },
  { pattern: /git\s+reset\s+--hard/, note: '警告：正在硬重置（hard reset），未提交的更改将丢失' },
];

// ─── 检测函数 ─────────────────────────────────────────────

/**
 * 检查命令安全性
 * @param {string} command - 要执行的命令
 * @returns {{ safe: boolean, reason?: string, caution?: string }}
 */
export function checkCommandSafety(command) {
  if (!command || typeof command !== 'string') {
    return { safe: true };
  }

  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason };
    }
  }

  // 检查是否需要提醒
  for (const { pattern, note } of CAUTION_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: true, caution: note };
    }
  }

  return { safe: true };
}

/**
 * 检查文件操作安全性
 * @param {string} path - 文件路径
 * @param {string} operation - 操作类型: 'write' | 'delete'
 * @returns {{ safe: boolean, reason?: string, note?: string }}
 */
export function checkFileSafety(path, operation) {
  if (!path) return { safe: true };

  const normalized = path.replace(/\\/g, '/').toLowerCase();

  // 系统关键目录
  const protectedPaths = [
    '/windows/system32',
    '/windows/system',
    '/windows/syswow64',
    '/windows/boot',
    '/windows/efi',
    '/boot',
    '/etc',
    '/bin',
    '/sbin',
    '/usr/bin',
    '/usr/sbin',
    '/usr/lib',
    '/lib',
    '/lib64',
    '/sys',
    '/proc',
    '/dev',
  ];

  for (const pp of protectedPaths) {
    if (normalized.startsWith(pp)) {
      if (operation === 'delete') {
        return { safe: false, reason: `禁止删除系统目录: ${path}` };
      }
      if (operation === 'write') {
        return { safe: false, reason: `禁止写入系统目录: ${path}` };
      }
    }
  }

  // 用户目录下的重要配置
  const importantConfigs = [
    '.ssh/id_rsa', '.ssh/authorized_keys', '.gnupg/', '.aws/credentials',
    '.gitconfig', '.npmrc', '.pypirc',
  ];

  if (operation === 'delete') {
    for (const ic of importantConfigs) {
      if (normalized.includes(ic)) {
        return { safe: true, note: `注意：正在删除重要配置文件: ${path}` };
      }
    }
  }

  return { safe: true };
}
