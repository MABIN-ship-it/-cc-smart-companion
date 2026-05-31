/**
 * Playwright Electron 测试工具
 * 通过 CDP 连接 Electron，支持 UI 交互 + 自动跳过引导
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ELECTRON_PATH = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const ELECTRON_PATH_FALLBACK = 'D:/cc安装包/1cc最终版/electron.exe';
let portCounter = 9223;

function getFreePort() { return portCounter++; }

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
  const { timeout = 30000, skipOnboarding = true } = options;
  const debugPort = getFreePort();

  const exePath = fs.existsSync(ELECTRON_PATH) ? ELECTRON_PATH : ELECTRON_PATH_FALLBACK;
  if (!fs.existsSync(exePath)) {
    throw new Error(`Electron 文件不存在: ${ELECTRON_PATH}`);
  }

  const child = spawn(exePath, [
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

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const page = browser.contexts()[0]?.pages()[0];
  if (!page) throw new Error('无法获取页面');

  await page.waitForLoadState('domcontentloaded');

  // 跳过引导界面：设置 localStorage 然后刷新
  if (skipOnboarding) {
    const hasOnboarding = await page.locator('.onboarding-overlay, .onboarding-card').count();
    if (hasOnboarding > 0) {
      console.log('[E2E] 检测到引导界面，自动跳过...');
      await page.evaluate(() => { try { localStorage.setItem('cc_onboarding_done', '1'); } catch {} });
      await page.reload({ waitUntil: 'domcontentloaded' });
      console.log('[E2E] 引导已跳过，进入聊天界面');
    } else {
      console.log('[E2E] 已在聊天界面');
    }
  }

  await page.waitForTimeout(2000);

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  return { browser, page, child, errors, getErrors: () => [...errors] };
}

async function screenshot(page, name) {
  const dir = path.resolve(PROJECT_ROOT, 'e2e', 'screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}-${Date.now()}.png`), fullPage: false });
}

/** 在聊天输入框输入文字并发送 */
async function sendMessage(page, text) {
  const selectors = ['textarea', 'input[type="text"]', 'input:not([type])', '[contenteditable="true"]',
    '[role="textbox"]', '[class*="InputBar"] input', '[class*="input-bar"] input',
    '[class*="chat"] input', '[class*="message"] input'];
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0 && await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await el.click();
      await el.fill(text);
      await page.keyboard.press('Enter');
      return true;
    }
  }
  return false;
}

/** 等待文本出现 */
async function waitForText(page, text, timeout = 20000) {
  try {
    await page.waitForFunction(
      (t) => document.body.innerText.includes(t), text, { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

module.exports = { launchApp, screenshot, sendMessage, waitForText, PROJECT_ROOT, ELECTRON_PATH };
