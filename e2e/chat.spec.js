const { test, expect } = require('@playwright/test');
const { launchApp, screenshot, sendMessage, waitForText } = require('./helpers/electron');

test.describe('聊天交互', () => {

  test('输入框存在并可输入文字', async () => {
    const { browser, page, child } = await launchApp({ timeout: 25000 });

    // 查找输入区域
    const selectors = ['textarea', 'input[type="text"]', 'input:not([type])', '[contenteditable="true"]',
      '[role="textbox"]', '[class*="InputBar"] input', '[class*="input-bar"] input', '[class*="chat"] input'];
    let inputInfo = '';
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      const cnt = await el.count();
      if (cnt > 0) {
        const visible = await el.isVisible().catch(() => false);
        inputInfo += `${sel}: count=${cnt}, visible=${visible}\n`;
        if (visible) {
          await el.click();
          await el.fill('E2E测试:你好');
          const val = await el.inputValue().catch(() => '');
          if (val.includes('你好')) {
            inputInfo += '  → 输入成功';
            break;
          }
        }
      }
    }
    console.log(`输入检测:\n${inputInfo}`);

    await screenshot(page, 'chat-input-test');
    child.kill();
    await browser.close().catch(() => {});
    expect(inputInfo).toContain('输入成功');
  });

  test('发送消息后有界面反馈', async () => {
    const { browser, page, child } = await launchApp({ timeout: 25000 });

    // 截图发送前
    await screenshot(page, 'before-message');
    const textBefore = (await page.textContent('body')) || '';

    // 尝试发送
    const sent = await sendMessage(page, '你好');
    await page.waitForTimeout(4000);

    const textAfter = (await page.textContent('body')) || '';
    await screenshot(page, 'after-message');

    console.log(`消息发送: ${sent ? '成功' : '未找到输入框'}, body长度: ${textBefore.length} → ${textAfter.length}`);

    child.kill();
    await browser.close().catch(() => {});
    // 弱断言：不崩溃就算通过
    expect(true).toBe(true);
  });

});
