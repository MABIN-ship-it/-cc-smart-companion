const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const projectRoot = path.resolve(__dirname, '..');
const electronPath = fs.existsSync(path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe'))
  ? path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
  : 'D:/cc安装包/1cc最终版/electron.exe';

function getDebugPort() {
  // 找一个可用端口
  return 9222;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

test.describe('CC 烟雾测试', () => {

  test('应用启动不崩溃 + 控制台无 JS 错误', async () => {
    const debugPort = getDebugPort();

    if (!fs.existsSync(electronPath)) {
      throw new Error(`Electron 可执行文件不存在: ${electronPath}`);
    }

    const child = spawn(electronPath, [
      'electron/main.js',
      `--remote-debugging-port=${debugPort}`,
    ], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    });

    let stdout = '';
    let stderr = '';
    let exited = false;
    let exitCode = null;

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('exit', (code) => {
      exited = true;
      exitCode = code;
    });

    // Step 1: 等应用启动 + DevTools 就绪（最多20秒）
    let debugUrl = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));

      if (exited) break;

      try {
        const list = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
        if (list && list.length > 0) {
          debugUrl = list[0].webSocketDebuggerUrl;
          break;
        }
      } catch {
        // 还没就绪，继续等
      }
    }

    // Step 2: 结果分析
    const errors = [];
    const warnings = [];

    // 从 stdout/stderr 中提取错误
    const allOutput = stdout + stderr;
    const lines = allOutput.split('\n');
    for (const line of lines) {
      // 匹配 JS 错误
      if (line.includes('ReferenceError') || line.includes('TypeError') ||
          line.includes('is not defined') || line.includes('Cannot read properties') ||
          line.includes('Error:') || line.includes('Uncaught')) {
        errors.push(line.trim());
      }
      // 匹配常见警告
      if (line.includes('[KnowledgeSystem]') || line.includes('[CLONE-DEBUG]')) {
        warnings.push(line.trim());
      }
    }

    // 杀掉进程
    child.kill();

    // Step 3: 断言
    // 应用不能崩溃
    if (exited) {
      console.log(`应用退出码: ${exitCode}`);
      console.log(`stderr 最后500字符: ${stderr.slice(-500)}`);
    }
    expect(exited, `应用在15秒内崩溃了，退出码: ${exitCode}`).toBe(false);

    // 能连上 DevTools 说明渲染进程启动了
    expect(debugUrl, '无法连接到渲染进程（DevTools未就绪）').toBeTruthy();

    // 关键：没有 JS 引用错误（像 "sendModelRequest is not defined"）
    if (errors.length > 0) {
      console.log('检测到 JS 错误:');
      errors.forEach(e => console.log('  -', e));
    }
    expect(errors.length, `渲染进程有 ${errors.length} 个 JS 错误`).toBe(0);

    // 警告（非致命但需关注）
    if (warnings.length > 0) {
      console.log('检测到警告:');
      warnings.forEach(w => console.log('  -', w));
    }
  });

});
