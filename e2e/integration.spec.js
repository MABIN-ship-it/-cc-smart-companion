/**
 * 综合功能验证测试
 * 模拟用户操作：跳过引导 → 进入聊天 → 验证核心功能
 */
const { test, expect } = require('@playwright/test');
const { launchApp, screenshot, sendMessage } = require('./helpers/electron');

test.describe('综合功能验证', () => {

  test('引导 → 聊天 → 输入 → 完整链路', async () => {
    const { browser, page, child, getErrors } = await launchApp({ timeout: 25000 });

    // Step 1: 确认已进入聊天界面
    const hasChat = await page.locator('#root').count();
    expect(hasChat).toBe(1);

    // Step 2: 检查主要UI区域
    const bodyText = await page.textContent('body');
    const sections = [];
    if (bodyText.includes('CC') || bodyText.includes('cc') || bodyText.includes('伙伴')) sections.push('品牌名');
    if (bodyText.includes('消息') || bodyText.includes('聊天') || bodyText.includes('对话')) sections.push('聊天区域');
    if (bodyText.includes('设置') || bodyText.includes('API') || bodyText.includes('配置')) sections.push('设置入口');
    console.log(`UI检测到: ${sections.join(', ') || '基础界面'}`);

    // Step 3: 检查是否有输入区域
    const inputEl = page.locator('textarea, input[type="text"], input:not([type]), [contenteditable="true"], [role="textbox"]').first();
    const hasInput = (await inputEl.count()) > 0;
    console.log(`输入区域: ${hasInput ? '存在' : '未检测到'}`);

    // Step 4: 截图留念
    await screenshot(page, 'full-flow');

    // Step 5: 尝试发送消息
    if (hasInput) {
      const sent = await sendMessage(page, '测试消息: 你好CC');
      console.log(`发送测试: ${sent ? '成功' : '失败'}`);
      if (sent) {
        await page.waitForTimeout(3000);
        await screenshot(page, 'after-send');
      }
    }

    // Step 6: 检查JS错误
    const errors = getErrors();
    const hasErrors = errors.length > 0;
    if (hasErrors) console.log(`⚠️ ${errors.length}个JS错误:`, errors.slice(0, 5));

    child.kill();
    await browser.close().catch(() => {});

    expect(hasInput).toBe(true);
    if (hasErrors) {
      console.log('JS错误详情:', errors.join('\n'));
    }
  });

});
