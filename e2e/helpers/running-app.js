/**
 * 运行版 CC App 测试工具
 * 直接启动 D:\cc安装包\1cc最终版\electron.exe 并测试真实功能
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const APP_DIR = 'D:/cc安装包/1cc最终版';
const APP_EXE = path.join(APP_DIR, 'electron.exe');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function launchRunningApp(options = {}) {
  const { debugPort = 9226, timeout = 40000 } = options;

  if (!fs.existsSync(APP_EXE)) {
    throw new Error(`运行版 electron.exe 不存在: ${APP_EXE}`);
  }

  console.log(`[E2E] 启动运行版: ${APP_EXE}`);

  // 先杀掉残留进程
  try { require('child_process').execSync('taskkill /f /im electron.exe 2>nul', { stdio: 'ignore' }); } catch {}

  await new Promise(r => setTimeout(r, 1000));

  const child = spawn(APP_EXE, [
    `--remote-debugging-port=${debugPort}`,
  ], {
    cwd: APP_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });

  // 收集日志
  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  // 等待 CDP 就绪
  let debugUrl = null;
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    await new Promise(r => setTimeout(r, 2000));
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
    console.log(`STDOUT最后500字符: ${stdout.slice(-500)}`);
    console.log(`STDERR最后500字符: ${stderr.slice(-500)}`);
    throw new Error(`运行版 CDP 在 ${timeout}ms 内未就绪`);
  }

  console.log(`[E2E] CDP 已连接，端口 ${debugPort}`);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const page = browser.contexts()[0]?.pages()[0];
  if (!page) throw new Error('无法获取页面');

  await page.waitForLoadState('domcontentloaded');

  // 自动跳过引导
  const hasOnboarding = await page.locator('.onboarding-overlay, .onboarding-card').count();
  if (hasOnboarding > 0) {
    console.log('[E2E] 跳过引导界面...');
    await page.evaluate(() => { try { localStorage.setItem('cc_onboarding_done', '1'); } catch {} });
    await page.reload({ waitUntil: 'domcontentloaded' });
    console.log('[E2E] 进入聊天界面');
  }

  await page.waitForTimeout(3000);

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  return { browser, page, child, stdout, stderr, errors, getErrors: () => [...errors] };
}

async function screenshot(page, name) {
  const dir = 'D:/cc安装包/汇总/CC-App/e2e/screenshots';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `running-${name}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[E2E] 截图: ${file}`);
  return file;
}

/** 在聊天输入框输入并发送 */
async function sendMessage(page, text) {
  const selectors = ['input:not([type])', 'input[type="text"]', 'textarea', '[contenteditable="true"]', '[role="textbox"]'];
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0 && await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await el.click();
      await el.fill(text);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      return true;
    }
  }
  return false;
}

/** 等待文本出现 */
async function waitForText(page, text, timeout = 25000) {
  try {
    await page.waitForFunction(t => document.body.innerText.includes(t), text, { timeout });
    return true;
  } catch { return false; }
}

/** 读取页面上的文本内容 */
async function getPageText(page) {
  return (await page.textContent('body')) || '';
}

module.exports = { launchRunningApp, screenshot, sendMessage, waitForText, getPageText };
