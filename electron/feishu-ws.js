/**
 * 飞书 WebSocket 长连接客户端
 * 使用 @larksuiteoapi/node-sdk WSClient 接收飞书事件
 */
const { WSClient, EventDispatcher } = require('@larksuiteoapi/node-sdk');

let wsClient = null;
let messageHandler = null;
let statusCallback = null;
let isRunning = false;
let diagnosticLog = [];
const MAX_DIAG_LOG = 100;

function diag(msg) {
  const entry = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log('[FeishuWS]', msg);
  diagnosticLog.push(entry);
  if (diagnosticLog.length > MAX_DIAG_LOG) diagnosticLog.shift();
}

// 自定义 logger — 将 SDK 日志同时输出到主进程和诊断数组
const customLogger = {
  error: (...args) => { console.error('[SDK:error]', ...args); diag('[SDK:error] ' + args.join(' ')); },
  warn: (...args) =>  { console.warn('[SDK:warn]', ...args);  diag('[SDK:warn] ' + args.join(' ')); },
  info: (...args) =>  { console.info('[SDK:info]', ...args);  diag('[SDK:info] ' + args.join(' ')); },
  debug: (...args) => { console.debug('[SDK:debug]', ...args); diag('[SDK:debug] ' + args.join(' ')); },
  trace: (...args) => { console.debug('[SDK:trace]', ...args); diag('[SDK:trace] ' + args.join(' ')); },
};

function start(appId, appSecret, onMessage, onStatus) {
  stop();
  messageHandler = onMessage;
  statusCallback = onStatus || null;
  diag(`启动连接, appId=${appId.slice(0, 8)}...`);

  try {
    wsClient = new WSClient({
      appId,
      appSecret,
      loggerLevel: 4, // DEBUG
      logger: customLogger,
    });

    const dispatcher = new EventDispatcher({ loggerLevel: 4, logger: customLogger }).register({
      'im.message.receive_v1': (data) => {
        diag('>>> 收到 im.message.receive_v1 事件');
        diag('data keys: ' + JSON.stringify(Object.keys(data || {})));
        diag('data.message: ' + JSON.stringify(data?.message).slice(0, 300));
        diag('data.sender: ' + JSON.stringify(data?.sender).slice(0, 200));
        if (messageHandler) {
          try {
            messageHandler(data);
            diag('>>> 已转发到主进程');
          } catch (e) {
            diag('>>> 转发失败: ' + (e?.message || e));
          }
        } else {
          diag('>>> 错误: messageHandler为空');
        }
      },
    });

    wsClient.onReady = () => {
      isRunning = true;
      diag('WebSocket已连接(Ready)');
      if (statusCallback) statusCallback({ running: true, event: 'ready' });
    };

    wsClient.onError = (e) => {
      diag('连接错误: ' + (e?.message || e));
      if (statusCallback) statusCallback({ running: isRunning, event: 'error', error: e?.message || 'unknown' });
    };

    wsClient.onReconnecting = () => {
      diag('重连中...');
      if (statusCallback) statusCallback({ running: false, event: 'reconnecting' });
    };

    wsClient.onReconnected = () => {
      isRunning = true;
      diag('重连成功');
      if (statusCallback) statusCallback({ running: true, event: 'reconnected' });
    };

    wsClient.start({ eventDispatcher: dispatcher });
    diag('start()已调用，等待连接...');

    return { success: true, status: 'connecting' };
  } catch (e) {
    diag('启动异常: ' + e.message);
    isRunning = false;
    return { success: false, error: e.message };
  }
}

function stop() {
  diag('停止');
  isRunning = false;
  if (wsClient) {
    try { wsClient.close({ force: true }); } catch (e) { diag('关闭WSClient异常: ' + e.message); }
    wsClient = null;
  }
  messageHandler = null;
  statusCallback = null;
  return { success: true };
}

function getStatus() {
  return { running: isRunning };
}

function getDiagnosticLog() {
  return diagnosticLog;
}

module.exports = { start, stop, getStatus, getDiagnosticLog };
