const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const electronPath = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');

test.describe('CC 烟雾测试', () => {

  test('应用能正常启动且不崩溃 (15秒存活测试)', async () => {
    console.log(`Electron: ${electronPath}`);
    console.log(`主进程: ${path.join(projectRoot, 'electron', 'main.js')}`);

    if (!fs.existsSync(electronPath)) {
      throw new Error(`Electron 可执行文件不存在: ${electronPath}`);
    }

    // 使用 child_process 启动 Electron 应用
    const child = spawn(electronPath, ['electron/main.js'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    });

    let stdout = '';
    let stderr = '';
    let exited = false;
    let exitCode = null;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('exit', (code) => {
      exited = true;
      exitCode = code;
    });

    // 等待 15 秒 — 如果应用在这期间崩溃，exit 事件会触发
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve('timeout');
      }, 15000);

      child.on('exit', () => {
        clearTimeout(timeout);
        resolve('exit');
      });
    });

    // 检查结果
    if (exited) {
      console.log(`应用意外退出，退出码: ${exitCode}`);
      console.log(`stdout (最近): ${stdout.slice(-500)}`);
      console.log(`stderr (最近): ${stderr.slice(-500)}`);
    }

    expect(exited).toBe(false);

    // 杀掉进程
    child.kill();
  });

});
