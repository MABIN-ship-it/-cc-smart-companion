/**
 * 运行版 CC App 测试工具
 * 使用 D:\cc安装包\1cc最终版\electron.exe（用户真实版本）
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const APP_EXE = 'D:/cc安装包/1cc最终版/electron.exe';
const APP_DIR = 'D:/cc安装包/1cc最终版';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

/** 连接正在运行的 CC（需用户先用 cc-debug 模式启动） */
async function connectRunningApp(port = 9223, options = {}) {
  const { timeout = 15000 } = options;

  // 检查是否已有 CC 在调试模式
  let available = false;
  try {
    const list = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    if (list && list.length > 0) available = true;
  } catch {}

  if (!available) {
    // 启动 CC 调试模式
    console.log(`[E2E] 启动运行版 CC (端口 ${port})...`);
    try { require('child_process').execSync('taskkill /f /im electron.exe 2>nul', { stdio: 'ignore' }); } catch {}
    await new Promise(r => setTimeout(r, 2000));

    const child = spawn(APP_EXE, [`--remote-debugging-port=${port}`], {
      cwd: APP_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    });

    // 等待 CDP 就绪
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const list = await fetchJson(`http://127.0.0.1:${port}/json/list`);
        if (list?.length > 0) { available = true; break; }
      } catch {}
    }
    if (!available) {
      child.kill();
      throw new Error(`运行版 CC 在 ${timeout}ms 内未就绪。请手动双击 启动CC调试模式.vbs`);
    }
  }

  console.log(`[E2E] 已连接运行版 CC (端口 ${port})`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0]?.pages()[0];
  if (!page) throw new Error('无法获取页面');

  await page.waitForLoadState('domcontentloaded');

  const hasOnboarding = await page.locator('.onboarding-overlay, .onboarding-card').count();
  if (hasOnboarding > 0) {
    await page.evaluate(() => { try { localStorage.setItem('cc_onboarding_done', '1'); } catch {} });
    await page.reload({ waitUntil: 'domcontentloaded' });
    console.log('[E2E] 已跳过引导');
  }

  await page.waitForTimeout(3000);

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  return { browser, page, errors, getErrors: () => [...errors] };
}

/** 截图 */
async function screenshot(page, name) {
  const dir = path.resolve('D:/cc安装包/汇总/CC-App/e2e/screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `real-${name}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[E2E] 截图: ${file}`);
  return file;
}

/** 绕过 Three.js Canvas 遮挡的 JS 点击 */
async function forceClick(page, text) {
  return page.evaluate((t) => {
    const els = document.querySelectorAll('*');
    for (const el of els) {
      if (el.textContent?.trim() === t) { el.click(); return true; }
    }
    for (const el of els) {
      if (el.textContent?.includes(t) && ['BUTTON','SPAN','DIV','A'].includes(el.tagName) && el.textContent.trim().length < 30) {
        el.click(); return true;
      }
    }
    return false;
  }, text);
}

/** 在输入框输入并发送 */
async function sendMessage(page, text) {
  const input = page.locator('input:not([type]), textarea, [contenteditable="true"]').first();
  if (await input.count() > 0 && await input.isVisible({ timeout: 3000 }).catch(() => false)) {
    await input.click({ force: true });
    await input.fill(text);
    await page.keyboard.press('Enter');
    return true;
  }
  return false;
}

module.exports = { connectRunningApp, screenshot, forceClick, sendMessage };
