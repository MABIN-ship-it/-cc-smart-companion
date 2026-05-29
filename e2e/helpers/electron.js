/**
 * Playwright Electron 测试工具
 * 通过 CDP 连接 Electron（兼容任意 Electron 应用）
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ELECTRON_PATH = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
let portCounter = 9223;

function getFreePort() {
  return portCounter++;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function launchApp(options = {}) {
  const { timeout = 30000 } = options;
  const debugPort = getFreePort();

  if (!fs.existsSync(ELECTRON_PATH)) {
    throw new Error(`Electron 文件不存在: ${ELECTRON_PATH}`);
  }

  const child = spawn(ELECTRON_PATH, [
    'electron/main.js',
    `--remote-debugging-port=${debugPort}`,
  ], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });

  // 等待 CDP 就绪
  let debugUrl = null;
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const list = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
      if (list && list.length > 0) {
        for (const item of list) {
          if (item.type === 'page' && item.url && !item.url.includes('chrome://')) {
            debugUrl = item.webSocketDebuggerUrl;
            break;
          }
        }
        if (debugUrl) break;
      }
    } catch {}
  }

  if (!debugUrl) {
    child.kill();
    throw new Error(`CDP 在 ${timeout}ms 内未就绪 (端口 ${debugPort})`);
  }

  // 用 CDP 连接
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const page = browser.contexts()[0]?.pages()[0];
  if (!page) throw new Error('无法获取页面');

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  return { browser, page, child, errors, getErrors: () => [...errors] };
}

async function screenshot(page, name) {
  const dir = path.resolve(PROJECT_ROOT, 'e2e', 'screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}-${Date.now()}.png`), fullPage: false });
}

module.exports = { launchApp, screenshot, PROJECT_ROOT, ELECTRON_PATH };
