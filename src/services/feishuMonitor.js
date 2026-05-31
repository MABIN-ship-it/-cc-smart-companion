/**
 * 飞书主动监测引擎（v2.0）
 *
 * 委托 feishuTaskScanner 进行 LLM 驱动的任务发现。
 * 保留定时扫描调度 + 消息实时检测接口。
 *
 * 扫描时刻：每日 9:00 / 11:00 / 15:00 / 17:00 / 19:00 / 24:00
 */
import { isFeishuConfigured } from './feishu';
import { scanAll, scanMessage, startScheduledScan as startScanScheduler, stopScheduledScan as stopScanScheduler } from './feishuTaskScanner';

const SCAN_HOURS = [9, 11, 15, 17, 19, 24];

// ─── 兼容旧接口 ─────────────────────────────────

/**
 * 全量扫描（供 ChatInterface 和定时器调用）
 */
export async function scanForTasks() {
  if (!isFeishuConfigured()) {
    return { scanned: false, reason: 'not_configured' };
  }
  return await scanAll();
}

/**
 * 实时消息检测（收到飞书消息时调用）
 */
export async function detectTaskFromMessage(text, msgContext) {
  if (!isFeishuConfigured() || !text || text.length < 15) return null;
  return await scanMessage(text, msgContext);
}

/**
 * 启动定时扫描（供 ChatInterface useEffect 调用）
 */
export function startScheduledScan(onTasksDetected) {
  startScanScheduler(onTasksDetected);
}

/**
 * 停止定时扫描
 */
export function stopScheduledScan() {
  stopScanScheduler();
}

export { SCAN_HOURS };
