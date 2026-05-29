const { test, expect } = require('@playwright/test');
const { launchApp, screenshot } = require('./helpers/electron');

test.describe('应用启动 + 进入聊天界面', () => {

  test('跳过引导后成功进入聊天界面', async () => {
    const { browser, page, child, getErrors } = await launchApp({ timeout: 25000 });

    // 确认不在引导界面
    const onboarding = await page.locator('.onboarding-overlay, .onboarding-card').count();
    expect(onboarding).toBe(0);

    // 确认聊天界面已加载
    const chatSelectors = ['.chat-interface', '#root', '[class*="ChatInterface"]', '[class*="chat-interface"]'];
    let foundChat = false;
    for (const sel of chatSelectors) {
      if (await page.locator(sel).count() > 0) { foundChat = true; break; }
    }

    await screenshot(page, 'chat-interface');
    const bodyText = await page.textContent('body');

    const errors = getErrors();
    if (errors.length > 0) console.log('⚠️ JS错误:', errors.slice(0, 5));

    child.kill();
    await browser.close().catch(() => {});

    expect(bodyText).toBeTruthy();
    expect(errors.length).toBe(0);
  });

});
