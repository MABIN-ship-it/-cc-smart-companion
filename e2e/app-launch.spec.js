const { test, expect } = require('@playwright/test');
const { launchApp, screenshot } = require('./helpers/electron');

test.describe('应用启动', () => {

  test('启动不崩溃 + 页面加载成功', async () => {
    const { browser, page, child, getErrors } = await launchApp({ timeout: 25000 });

    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    const errors = getErrors();
    if (errors.length > 0) console.log('⚠️ JS错误:', errors.slice(0, 5));

    // 先截图再关闭
    await screenshot(page, 'app-launch').catch(() => {});
    child.kill();
    await browser.close().catch(() => {});

    expect(errors.length).toBe(0);
  });

});
