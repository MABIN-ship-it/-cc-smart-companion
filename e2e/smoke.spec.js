import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

test.describe('CC 烟雾测试', () => {

  test('应用能正常启动并显示主界面', async () => {
    // 启动 Electron 应用
    const electronApp = await electron.launch({
      args: [path.join(projectRoot, 'electron', 'main.js')],
      cwd: projectRoot,
    });

    // 等待第一个窗口出现
    const window = await electronApp.firstWindow();
    console.log(`窗口标题: ${await window.title()}`);

    // 1. 验证窗口存在
    expect(await window.title()).toBeTruthy();

    // 2. 等待页面加载完成 (OpeningAnimation → ChatInterface)
    //    开场动画约7秒，等12秒确保主界面已出现
    await window.waitForTimeout(12000);

    // 3. 截图 — 这是最关键的验证：亲眼看到应用实际状态
    await window.screenshot({
      path: path.join(projectRoot, 'e2e', 'screenshots', 'main-ui.png'),
      fullPage: false,
    });

    // 4. 检查页面是否有 canvas 元素（Three.js 3D渲染）
    const canvasCount = await window.evaluate(() => {
      return document.querySelectorAll('canvas').length;
    });
    console.log(`Canvas 元素数量: ${canvasCount}`);
    expect(canvasCount).toBeGreaterThan(0);

    // 5. 检查是否有输入区域（InputBar 组件）
    const hasInput = await window.evaluate(() => {
      return !!(
        document.querySelector('textarea') ||
        document.querySelector('input[type="text"]') ||
        document.querySelector('[class*="input"]') ||
        document.querySelector('[class*="Input"]')
      );
    });
    console.log(`输入栏存在: ${hasInput}`);

    // 6. 检查 body 不为空（页面已渲染内容）
    const bodyText = await window.evaluate(() => {
      return document.body.innerText.length;
    });
    console.log(`页面文本长度: ${bodyText}`);
    expect(bodyText).toBeGreaterThan(0);

    // 关闭应用
    await electronApp.close();
  });

});
