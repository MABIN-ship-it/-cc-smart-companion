const { test, expect } = require('@playwright/test');
const { launchApp, screenshot } = require('./helpers/electron');

test.describe('工具栏和设置', () => {

  test('界面包含可交互元素', async () => {
    const { browser, page, child } = await launchApp({ timeout: 25000 });

    // 检查按钮/可点击元素
    const clickables = page.locator('button, [role="button"], [class*="icon"], [class*="tool"]');
    const count = await clickables.count();

    console.log(`找到 ${count} 个可交互元素`);
    await screenshot(page, 'interactive-elements');

    child.kill();
    await browser.close().catch(() => {});
    expect(count).toBeGreaterThan(0);
  });

});
