const { app, BrowserWindow, ipcMain, shell, Menu, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execSync, spawn } = require('child_process');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
let autoUpdater;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
  console.warn('[CC] electron-updater failed to load:', e.message);
  autoUpdater = {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    autoDownload: false,
    on: () => {},
    checkForUpdates: async () => {},
    downloadUpdate: async () => {},
    quitAndInstall: () => {},
  };
}

let mainWindow;

// 启用语音识别 (Web Speech API)
app.commandLine.appendSwitch('enable-speech-recognition');
app.commandLine.appendSwitch('enable-speech-api');

// ─── Auto Updater ─────────────────────────────────────────────

autoUpdater.logger = {
  info: (msg) => console.log(`[Updater] ${msg}`),
  warn: (msg) => console.warn(`[Updater] ${msg}`),
  error: (msg) => console.error(`[Updater] ${msg}`),
};
autoUpdater.autoDownload = false; // 后台静默检查，用户手动下载

function sendUpdateStatus(status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', { status, ...data });
  }
}

autoUpdater.on('checking-for-update', () => {
  sendUpdateStatus('checking');
});

autoUpdater.on('update-available', (info) => {
  sendUpdateStatus('available', {
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: info.releaseNotes,
  });
});

autoUpdater.on('update-not-available', () => {
  sendUpdateStatus('not-available');
});

autoUpdater.on('download-progress', (progress) => {
  sendUpdateStatus('downloading', {
    percent: Math.round(progress.percent),
    transferred: progress.transferred,
    total: progress.total,
    bytesPerSecond: progress.bytesPerSecond,
  });
});

autoUpdater.on('update-downloaded', () => {
  sendUpdateStatus('downloaded');
});

autoUpdater.on('error', (err) => {
  sendUpdateStatus('error', { message: err?.message || String(err) });
});

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//, /mkfs/, /dd\s+if=/, /fork\s+bomb/, /:\(\)\s*\{/,
  /format\s+[cC]:/, /del\s+\/f\s+\/s\s+[cC]:\\/,
  />\s*\/dev\/sda/, /shutdown\s+-h/, /reboot/,
];

function isDangerousCommand(cmd) {
  return DANGEROUS_PATTERNS.some(p => p.test(cmd));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    show: false,
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 中文应用菜单
  const menuTemplate = [
    {
      label: '文件',
      submenu: [
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: '放大', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: '重置缩放', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于CC你的终身好友', click: () => {
          const { dialog } = require('electron');
          dialog.showMessageBox({ message: 'CC你的终身好友 v1.0\n桌面AI伴侣', title: '关于CC你的终身好友' });
        }},
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // 启动后延迟检查更新（避免阻塞UI加载）
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 5000);
  });

  // 全屏状态变化通知渲染进程（F11 或 OS 全屏切换用）
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('window:fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('window:fullscreen-changed', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // 自动允许麦克风权限（语音输入需要）
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'videoCapture'];
    callback(allowed.includes(permission));
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ====== App/Shell handlers ======

ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});

// 全屏控制（开场动画用）
ipcMain.handle('window:setFullScreen', async (_event, fullscreen) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(fullscreen);
  }
});

ipcMain.handle('window:isFullScreen', async () => {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isFullScreen() : false;
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  if (!folderPath) folderPath = app.getPath('documents');
  await shell.openPath(folderPath);
});

// 文件夹选择对话框
ipcMain.handle('dialog:selectFolder', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择工作区文件夹',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// 文件选择对话框（知识库上传用）
ipcMain.handle('dialog:selectFiles', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择知识库文件',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '文档文件', extensions: ['pdf', 'docx', 'md', 'txt', 'py', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'json', 'jpg', 'png'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths;
});

// Shell: openExternal
ipcMain.handle('shell:openExternal', async (_event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Edge TTS: simple spawn → temp MP3 → base64
const ttsPending = new Map();

ipcMain.handle('tts:speak', async (_event, text) => {
  const ts = Date.now();
  const tmpDir = path.join(app.getPath('temp'), 'cc_tts');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const mp3Path = path.join(tmpDir, `tts_${ts}.mp3`);

  const pythonCode = `
import asyncio, sys
try:
    import edge_tts
except ImportError:
    import subprocess
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'edge-tts', '-q'], capture_output=True)
    import edge_tts

async def main():
    communicate = edge_tts.Communicate(
        """${text.replace(/"/g, '\\"').replace(/\n/g, ' ')}""",
        'zh-CN-XiaoyiNeural',
        rate='+10%'
    )
    await communicate.save(r"${mp3Path.replace(/\\/g, '\\\\')}")
    print('OK')

asyncio.run(main())
`;

  const pyPath = mp3Path.replace('.mp3', '.py');
  fs.writeFileSync(pyPath, pythonCode, 'utf-8');

  const child = spawn('python', ['-u', pyPath], {
    cwd: tmpDir,
    timeout: 30000,
  });

  const pid = child.pid;
  let resolved = false;

  return new Promise((resolve) => {
    ttsPending.set(ts, child);

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        ttsPending.delete(ts);
        try { fs.unlinkSync(pyPath); } catch {}
        try { fs.unlinkSync(mp3Path); } catch {}
        resolve({ success: false, error: 'TTS生成超时(30秒)' });
      }
    }, 30000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      ttsPending.delete(ts);
      try { fs.unlinkSync(pyPath); } catch {}

      if (resolved) return;
      resolved = true;

      if (code !== 0) {
        resolve({ success: false, error: `Python exit code ${code}` });
        return;
      }

      if (!fs.existsSync(mp3Path)) {
        resolve({ success: false, error: 'MP3文件未生成' });
        return;
      }

      const mp3Buffer = fs.readFileSync(mp3Path);
      const base64 = mp3Buffer.toString('base64');
      try { fs.unlinkSync(mp3Path); } catch {}
      resolve({ success: true, audioBase64: base64, mimeType: 'audio/mpeg' });
    });

    child.stderr.on('data', (d) => {
      if (!resolved && d.toString().includes('ERROR')) {
        clearTimeout(timeout);
        resolved = true;
        child.kill();
        ttsPending.delete(ts);
        resolve({ success: false, error: d.toString() });
      }
    });
  });
});

ipcMain.handle('tts:cancel', async () => {
  for (const [ts, child] of ttsPending) {
    try { child.kill(); } catch {}
    ttsPending.delete(ts);
  }
  return { success: true };
});

// ====== Shell execution ======

ipcMain.handle('shell:execute', async (event, cmd, cwd) => {
  if (isDangerousCommand(cmd)) {
    return { success: false, error: '危险命令已被拦截' };
  }

  // 长命令（>8KB）写临时bat文件执行，绕过命令行长度限制
  let commandToRun = cmd;
  let tmpFile = null;
  if (cmd && cmd.length > 8000) {
    tmpFile = path.join(app.getPath('temp'), `cc_cmd_${Date.now()}.bat`);
    fs.writeFileSync(tmpFile, '@echo off\r\nchcp 65001 >nul\r\n' + cmd, 'utf-8');
    commandToRun = `"${tmpFile}"`;
  }

  return new Promise((resolve) => {
    const child = exec(commandToRun, {
      cwd: cwd || app.getPath('home'),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000,
      shell: tmpFile ? 'cmd.exe' : 'powershell.exe',
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (tmpFile) { try { fs.unlinkSync(tmpFile); } catch {} }
      resolve({
        success: code === 0,
        exitCode: code,
        stdout: stdout.slice(-5000),
        stderr: stderr.slice(-2000),
      });
    });

    child.on('error', (err) => {
      if (tmpFile) { try { fs.unlinkSync(tmpFile); } catch {} }
      resolve({ success: false, error: err.message });
    });
  });
});

// ====== File operations ======

ipcMain.handle('file:readFile', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content: content.slice(0, 50000) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 二进制文件读取（供 ExcelJS / 图片解析等使用）
ipcMain.handle('file:readBinary', async (_event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' };
    const buffer = fs.readFileSync(filePath);
    const MAX_SIZE = 50 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) return { success: false, error: `文件过大(${(buffer.length / 1024 / 1024).toFixed(1)}MB)，限制50MB以内` };
    return { success: true, buffer: buffer.toString('base64'), size: buffer.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('file:writeFile', async (event, filePath, content, append) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (append) {
      fs.appendFileSync(filePath, content, 'utf-8');
    } else {
      fs.writeFileSync(filePath, content, 'utf-8');
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('file:listDir', async (event, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return {
      success: true,
      entries: entries.slice(0, 100).map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isFile: e.isFile(),
      })),
      path: dirPath,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('file:deleteFile', async (event, filePath) => {
  try {
    if (fs.statSync(filePath).isDirectory()) {
      fs.rmSync(filePath, { recursive: true });
    } else {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('file:exists', async (event, filePath) => {
  return fs.existsSync(filePath);
});

// ====== Web fetch (from main process to avoid CORS) ======

ipcMain.handle('web:fetch', async (event, url) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const text = await res.text();
    return { success: true, status: res.status, body: text.slice(0, 100000) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ====== TTS Server (GPT-SoVITS Voice Cloning) ======
// 本地 GPT-SoVITS 语音克隆服务 — 端口 9880
// 安装: D:\cc安装包\克隆声音\GPT-SoVITS\
// 启动: cd GPT-SoVITS && python api_v2.py -a 127.0.0.1 -p 9880
// API: POST /tts  { text, text_lang, ref_audio_path, prompt_lang }

const TTS_SERVER_URL = 'http://127.0.0.1:9880';

function getBuiltInVoicePath() {
  let voicePath;
  if (process.env.VITE_DEV_SERVER_URL) {
    voicePath = path.join(__dirname, '..', 'python', 'voices', 'lenovo_sample.m4a');
  } else {
    voicePath = path.join(process.resourcesPath, 'python', 'voices', 'lenovo_sample.m4a');
  }
  if (fs.existsSync(voicePath)) return voicePath;
  return null;
}


ipcMain.handle('tts-server:start', async () => {
  try {
    const res = await fetch(`${TTS_SERVER_URL}/docs`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return { success: true, status: 'local_online' };
    return { success: false, error: 'GPT-SoVITS 服务未响应' };
  } catch {
    return { success: false, error: 'GPT-SoVITS 未启动。请运行: cd GPT-SoVITS && python api_v2.py -a 127.0.0.1 -p 9880' };
  }
});

ipcMain.handle('tts-server:stop', async () => {
  return { success: true, status: 'local_server' };
});

ipcMain.handle('tts-server:status', async () => {
  try {
    const res = await fetch(`${TTS_SERVER_URL}/docs`, { signal: AbortSignal.timeout(3000) });
    return { running: res.ok, serverReady: res.ok };
  } catch {
    return { running: false, serverReady: false };
  }
});

ipcMain.handle('tts:cloneSpeak', async (_event, params) => {
  const { refAudioPath, genText } = params;

  if (!fs.existsSync(refAudioPath)) {
    return { success: false, error: `参考音频未找到: ${refAudioPath}` };
  }

  try {
    const res = await fetch(`${TTS_SERVER_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: genText.slice(0, 200),
        text_lang: 'zh',
        ref_audio_path: refAudioPath.replace(/\\/g, '/'),
        prompt_lang: 'zh',
        prompt_text: '',
        streaming_mode: false,
        media_type: 'wav',
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ message: res.statusText }));
      return { success: false, error: `TTS错误: ${errData.Exception || errData.message || res.statusText}` };
    }

    const audioBuffer = Buffer.from(await res.arrayBuffer());
    return {
      success: true,
      audioBase64: audioBuffer.toString('base64'),
      mimeType: 'audio/wav',
      sampleRate: 32000,
    };
  } catch (e) {
    if (e.name === 'TimeoutError') {
      return { success: false, error: '语音生成超时（2分钟）。请尝试更短的文本。' };
    }
    return { success: false, error: `TTS连接失败: ${e.message}` };
  }
});

// ====== STT Server (faster-whisper local speech-to-text) ======
// 本地语音转文字服务 — 首次使用自动下载模型 (~142MB)
// 启动: python stt_server.py  (默认 http://127.0.0.1:18084)

const STT_SERVER_URL = 'http://127.0.0.1:18084';
let sttServerProcess = null;

function getSttPythonPath() {
  if (process.env.VITE_DEV_SERVER_URL) {
    return path.join(__dirname, '..', 'python', 'stt_server.py');
  }
  return path.join(process.resourcesPath, 'python', 'stt_server.py');
}

function killSttServer() {
  if (sttServerProcess) {
    try { process.kill(sttServerProcess.pid); } catch {}
    sttServerProcess = null;
  }
}

ipcMain.handle('stt-server:start', async () => {
  // 检查是否已存活
  try {
    const res = await fetch(`${STT_SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      return { success: true, status: 'running', modelLoaded: data.model_loaded };
    }
  } catch {}

  // 尝试启动
  const scriptPath = getSttPythonPath();
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: `STT服务脚本未找到: ${scriptPath}` };
  }

  // 先检查 Python 是否可用
  try {
    const pyCheck = execSync('python --version', { timeout: 5000, encoding: 'utf-8' });
    console.log('[STT] Python version:', pyCheck.trim());
  } catch {
    return { success: false, error: '未检测到 Python。请安装 Python 3.10+ 并确保在 PATH 中。' };
  }

  try {
    let stderr = '';
    sttServerProcess = spawn('python', [scriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      env: { ...process.env, HF_ENDPOINT: 'https://hf-mirror.com', HF_HUB_DISABLE_SYMLINKS_WARNING: '1' },
    });

    sttServerProcess.stdout?.on('data', (d) => console.log(`[STT] ${d.toString().trim()}`));
    sttServerProcess.stderr?.on('data', (d) => { stderr += d.toString(); });

    // 进程异常退出则立即报错
    let earlyExit = false;
    sttServerProcess.on('exit', (code) => {
      sttServerProcess = null;
      if (code !== 0 && code !== null) {
        earlyExit = true;
        console.error(`[STT] Process exited with code ${code}, stderr: ${stderr.slice(0, 500)}`);
      }
    });

    // 等待服务就绪（首次需pip安装+d下载模型，容忍60秒）
    for (let i = 0; i < 60; i++) {
      if (earlyExit) {
        const errMsg = stderr.slice(-400) || '进程异常退出';
        return { success: false, error: `STT服务启动失败: ${errMsg}` };
      }
      await new Promise(r => setTimeout(r, 1000));
      try {
        const res = await fetch(`${STT_SERVER_URL}/health`, { signal: AbortSignal.timeout(1000) });
        if (res.ok) {
          const data = await res.json();
          return { success: true, status: 'started', modelLoaded: data.model_loaded };
        }
      } catch {}
    }

    return { success: false, error: `STT服务启动超时（60秒）。首次启动需下载语音模型(~142MB)，请检查网络后重试。` };
  } catch (e) {
    killSttServer();
    return { success: false, error: `STT服务启动失败: ${e.message}` };
  }
});

ipcMain.handle('stt-server:stop', async () => {
  killSttServer();
  return { success: true };
});

ipcMain.handle('stt-server:status', async () => {
  try {
    const res = await fetch(`${STT_SERVER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      return { running: true, modelLoaded: data.model_loaded };
    }
    return { running: false, modelLoaded: false };
  } catch {
    return { running: false, modelLoaded: false };
  }
});

ipcMain.handle('stt:transcribe', async (_event, audioBase64, mimeType) => {
  // 先确保服务存活
  let alive = false;
  try {
    const res = await fetch(`${STT_SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    alive = res.ok;
  } catch {}

  if (!alive) {
    // 尝试启动（复用 stt-server:start 的健壮逻辑）
    const startResult = await (async () => {
      const scriptPath = getSttPythonPath();
      if (!fs.existsSync(scriptPath)) {
        return { success: false, error: 'STT服务脚本未找到' };
      }
      try {
        let stderr2 = '';
        sttServerProcess = spawn('python', [scriptPath], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
        });
        sttServerProcess.stdout?.on('data', (d) => console.log(`[STT] ${d.toString().trim()}`));
        sttServerProcess.stderr?.on('data', (d) => { stderr2 += d.toString(); });
        let earlyExit2 = false;
        sttServerProcess.on('exit', (code) => {
          sttServerProcess = null;
          if (code !== 0 && code !== null) earlyExit2 = true;
        });
        for (let i = 0; i < 60; i++) {
          if (earlyExit2) return { success: false, error: `STT进程异常退出: ${stderr2.slice(-300)}` };
          await new Promise(r => setTimeout(r, 1000));
          try {
            const r = await fetch(`${STT_SERVER_URL}/health`, { signal: AbortSignal.timeout(1000) });
            if (r.ok) return { success: true };
          } catch {}
        }
        return { success: false, error: 'STT启动超时(60s)。首次需下载模型，请检查网络。' };
      } catch (e) {
        return { success: false, error: `STT启动失败: ${e.message}` };
      }
    })();
    if (!startResult.success) {
      return { success: false, error: startResult.error || 'STT服务启动超时。请确认已安装 Python 3.10+。' };
    }
  }

  // 将 base64 写入临时文件
  const tmpDir = path.join(app.getPath('temp'), 'cc_stt');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `recording_${Date.now()}.webm`);
  fs.writeFileSync(tmpFile, Buffer.from(audioBase64, 'base64'));

  try {
    // 用原生 http 模块发送 multipart（避免 FormData 兼容问题）
    const fileBytes = fs.readFileSync(tmpFile);
    const boundary = '----CCSttBoundary' + Date.now();
    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="audio_file"; filename="recording.webm"\r\n` +
      `Content-Type: audio/webm\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileBytes, footer]);

    const res = await fetch(`${STT_SERVER_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `转写失败 (${res.status}): ${errText.slice(0, 300)}` };
    }

    const data = await res.json();
    return {
      success: true,
      text: data.text,
      duration: data.duration,
      language: data.language,
    };
  } catch (e) {
    if (e.name === 'TimeoutError') {
      return { success: false, error: '语音识别超时。请尝试更短的录音。' };
    }
    return { success: false, error: `STT连接失败: ${e.message}` };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
});

// Cleanup STT server on app quit
app.on('before-quit', () => {
  killSttServer();
});

ipcMain.handle('file:saveBase64ToFile', async (_event, base64Data, filePath) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});


// ====== Git & Project context ======

ipcMain.handle('git:status', async (_event, cwd) => {
  return new Promise((resolve) => {
    exec('git status --short', { cwd: cwd || process.cwd(), timeout: 5000 }, (err, stdout) => {
      if (err) resolve({ success: false, error: err.message });
      else resolve({ success: true, output: stdout.trim() || '(clean)' });
    });
  });
});

ipcMain.handle('git:branch', async (_event, cwd) => {
  return new Promise((resolve) => {
    exec('git branch --show-current', { cwd: cwd || process.cwd(), timeout: 5000 }, (err, stdout) => {
      if (err) resolve({ success: false, error: err.message });
      else resolve({ success: true, output: stdout.trim() });
    });
  });
});

ipcMain.handle('project:listFiles', async (_event, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const topDirs = entries.filter(e => e.isDirectory()).slice(0, 10).map(e => e.name);
    const topFiles = entries.filter(e => e.isFile()).slice(0, 10).map(e => e.name);
    return {
      success: true,
      dirCount: entries.filter(e => e.isDirectory()).length,
      fileCount: entries.filter(e => e.isFile()).length,
      topDirs,
      topFiles,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ====== ExcelJS generate_excel ======

const workbookStore = new Map();

const thinBorder = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

const STYLE_PRESETS = {
  header: {
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: thinBorder,
  },
  center: {
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder,
  },
  left: {
    alignment: { horizontal: 'left', vertical: 'middle' },
    border: thinBorder,
  },
  left_wrap: {
    alignment: { horizontal: 'left', vertical: 'middle', wrapText: true },
    border: thinBorder,
  },
  money: {
    numFmt: '#,##0.00',
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder,
  },
  category: {
    font: { bold: true, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder,
  },
};

function applyCellStyle(cell, styleName) {
  const style = STYLE_PRESETS[styleName];
  if (!style) return;
  if (style.font) cell.font = style.font;
  if (style.fill) cell.fill = style.fill;
  if (style.alignment) cell.alignment = style.alignment;
  if (style.border) cell.border = style.border;
  if (style.numFmt) cell.numFmt = style.numFmt;
}

ipcMain.handle('excel:generate', async (_event, params) => {
  const { action, path: outputPath, sheet, headers, rows, tasks, periods, colWidths, mergeCells } = params;

  try {
    switch (action) {
      case 'create': {
        if (!outputPath) return { success: false, error: '缺少 path 参数' };
        const wb = new ExcelJS.Workbook();
        wb.creator = 'CC';
        workbookStore.set(outputPath, wb);
        return { success: true, message: '工作簿已创建', path: outputPath };
      }

      case 'add_sheet': {
        if (!outputPath) return { success: false, error: '缺少 path 参数' };
        const wb = workbookStore.get(outputPath);
        if (!wb) return { success: false, error: '工作簿未找到，请先 create' };

        const ws = wb.addWorksheet(sheet || 'Sheet1');

        if (headers && headers.length > 0) {
          headers.forEach((h, i) => {
            const cell = ws.getCell(1, i + 1);
            cell.value = h;
            applyCellStyle(cell, 'header');
          });
          ws.views = [{ state: 'frozen', ySplit: 1 }];
        }

        if (colWidths && colWidths.length > 0) {
          ws.columns = colWidths.map(w => ({ width: w }));
        }

        return { success: true, message: `Sheet "${sheet}" 已创建，${headers ? headers.length : 0}列`, path: outputPath };
      }

      case 'add_rows': {
        if (!outputPath) return { success: false, error: '缺少 path 参数' };
        const wb = workbookStore.get(outputPath);
        if (!wb) return { success: false, error: '工作簿未找到，请先 create' };

        const ws = wb.getWorksheet(sheet);
        if (!ws) return { success: false, error: `Sheet "${sheet}" 未找到` };

        const startRow = ws.rowCount + 1;

        rows.forEach((row, ri) => {
          const currentRow = startRow + ri;
          (row.cells || row).forEach((cellData, ci) => {
            const cell = ws.getCell(currentRow, ci + 1);

            if (typeof cellData === 'object' && cellData.formula) {
              cell.value = { formula: cellData.formula };
            } else if (typeof cellData === 'object' && cellData.value !== undefined) {
              cell.value = cellData.value;
            } else if (typeof cellData === 'string' || typeof cellData === 'number' || cellData === null) {
              cell.value = cellData;
            } else if (typeof cellData === 'object') {
              cell.value = cellData.value != null ? cellData.value : '';
            }

            if (typeof cellData === 'object' && cellData.style) {
              applyCellStyle(cell, cellData.style);
            }
            if (typeof cellData === 'object' && cellData.format) {
              cell.numFmt = cellData.format;
            }
          });

          // Category rows: merge across all cols
          if (row.mergeAll) {
            const endCol = ws.columnCount || (row.cells || row).length;
            ws.mergeCells(currentRow, 1, currentRow, endCol);
          }
        });

        return { success: true, message: `已添加 ${rows.length} 行到 "${sheet}"`, startRow, endRow: startRow + rows.length - 1, path: outputPath };
      }

      case 'add_gantt': {
        if (!outputPath) return { success: false, error: '缺少 path 参数' };
        const wb = workbookStore.get(outputPath);
        if (!wb) return { success: false, error: '工作簿未找到，请先 create' };

        const ws = wb.getWorksheet(sheet);
        if (!ws) return { success: false, error: `Sheet "${sheet}" 未找到` };

        const startRow = ws.rowCount + 1;
        const firstCol = 1;
        const ganttStartCol = 2;

        // Period headers
        periods.forEach((p, i) => {
          const cell = ws.getCell(startRow, ganttStartCol + i);
          cell.value = typeof p === 'string' ? p : p.label;
          applyCellStyle(cell, 'header');
        });

        // Task rows
        tasks.forEach((task, ti) => {
          const rowNum = startRow + 1 + ti;
          const nameCell = ws.getCell(rowNum, firstCol);
          nameCell.value = task.name;
          applyCellStyle(nameCell, 'left');

          const color = (task.color || 'B4C6E7').replace('#', '');
          const startIdx = task.start || 0;
          const duration = task.duration || 1;

          for (let i = startIdx; i < startIdx + duration && i < periods.length; i++) {
            const cell = ws.getCell(rowNum, ganttStartCol + i);
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF' + color },
            };
          }
        });

        return { success: true, message: `甘特图已添加，${tasks.length}个任务`, startRow, path: outputPath };
      }

      case 'save': {
        if (!outputPath) return { success: false, error: '缺少 path 参数' };
        const wb = workbookStore.get(outputPath);
        if (!wb) return { success: false, error: '工作簿未找到，请先 create' };

        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        await wb.xlsx.writeFile(outputPath);

        const summary = wb.worksheets.map(ws => ({
          name: ws.name,
          rows: ws.rowCount,
          cols: ws.columnCount,
        }));

        workbookStore.delete(outputPath);

        // Verify file was written
        if (fs.existsSync(outputPath)) {
          return { success: true, path: outputPath, sheets: summary };
        }
        return { success: false, error: '文件写入后未找到，可能权限不足' };
      }

      default:
        return { success: false, error: `未知 action: ${action}。支持: create, add_sheet, add_rows, add_gantt, save` };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ====== Auto Update IPC handlers ======

ipcMain.handle('update:check', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo || null };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('update:download', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('update:getVersion', () => {
  return app.getVersion();
});

// ====== App path for project storage ======

ipcMain.handle('app:getProjectsPath', () => {
  const p = path.join(app.getPath('documents'), 'CC项目');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
});

ipcMain.handle('app:getDownloadsPath', () => {
  return app.getPath('downloads');
});

// Resolve built-in reference audio path (shipped with app)
ipcMain.handle('app:getBuiltInVoicePath', () => {
  let voicePath;
  if (process.env.VITE_DEV_SERVER_URL) {
    voicePath = path.join(__dirname, '..', 'python', 'voices', 'lenovo_sample.m4a');
  } else {
    voicePath = path.join(process.resourcesPath, 'python', 'voices', 'lenovo_sample.m4a');
  }
  if (fs.existsSync(voicePath)) return voicePath;
  return null;
});

// ====== 飞书集成 ======

const feishuWs = require('./feishu-ws.js');
const https = require('https');

ipcMain.handle('feishu:test', async (_event, appId, appSecret) => {
  return new Promise((resolve) => {
    const body = JSON.stringify({ app_id: appId, app_secret: appSecret });
    const req = https.request({
      hostname: 'open.feishu.cn',
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 0) {
            resolve({ success: true });
          } else {
            const errMsg = json.msg || `错误码: ${json.code}`;
            resolve({ success: false, error: errMsg });
          }
        } catch {
          resolve({ success: false, error: '解析响应失败' });
        }
      });
    });
    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: '连接超时' }); });
    req.write(body);
    req.end();
  });
});

// ====== 飞书会话持久化 ======

const FEISHU_SESSION_PATH = path.join(app.getPath('userData'), 'cc_feishu_session.json');
const SESSION_EXPIRE_DAYS = 7;

function generateSessionId() {
  return 'fs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function loadFeishuSession() {
  try {
    if (fs.existsSync(FEISHU_SESSION_PATH)) {
      const raw = fs.readFileSync(FEISHU_SESSION_PATH, 'utf-8');
      const session = JSON.parse(raw);
      if (session.createdAt && (Date.now() - session.createdAt) > SESSION_EXPIRE_DAYS * 86400000) {
        return null;
      }
      return session;
    }
  } catch {}
  return null;
}

async function saveFeishuSession(sessionId, context) {
  try {
    const data = JSON.stringify({ sessionId, context, createdAt: Date.now(), updatedAt: Date.now() });
    await fs.promises.writeFile(FEISHU_SESSION_PATH, data, 'utf-8');
  } catch {}
}

ipcMain.handle('feishu:configure', async (_event, appId, appSecret) => {
  try {
    const result = feishuWs.start(appId, appSecret, (data) => {
      // 接收到飞书消息事件，转发到渲染进程
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('feishu:message', data);
      }
    }, (status) => {
      // 推送WS状态变更到渲染进程
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('feishu:statusChange', status);
      }
    });
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('feishu:status', () => {
  return feishuWs.getStatus();
});

ipcMain.handle('feishu:disconnect', () => {
  return feishuWs.stop();
});

ipcMain.handle('feishu:getSession', async () => {
  const session = loadFeishuSession();
  return session || { sessionId: null };
});

ipcMain.handle('feishu:refreshSession', async () => {
  refreshFeishuSession();
  return { success: true };
});

// ====== Feishu 文件上传 ======

/**
 * 获取飞书 tenant_access_token（主进程用，复用 localStorage 凭证）
 */
async function feishuGetToken() {
  const userDataPath = app.getPath('userData');
  const lsPath = path.join(userDataPath, 'Local Storage', 'leveldb');
  // localStorage 在 Electron 中以 LevelDB 存储，不便直接读取
  // 转为用固定的配置文件路径
  const configPath = path.join(userDataPath, 'cc_feishu_config.json');
  let appId, appSecret;

  // 先从 JSON 文件读（如果有的话）
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const cfg = JSON.parse(raw);
      appId = cfg.appId;
      appSecret = cfg.appSecret;
    }
  } catch {}

  if (!appId || !appSecret) {
    throw new Error('飞书未配置。请先在 CC 工具箱中连接飞书。');
  }

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ app_id: appId, app_secret: appSecret });
    const req = https.request({
      hostname: 'open.feishu.cn',
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 0 && json.tenant_access_token) {
            resolve(json.tenant_access_token);
          } else {
            reject(new Error(`获取token失败: ${json.msg || json.code}`));
          }
        } catch (e) {
          reject(new Error('解析token响应失败'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('获取token超时')); });
    req.write(body);
    req.end();
  });
}

let cachedFeishuDomain = null;

async function feishuGetTenantDomain() {
  if (cachedFeishuDomain) return cachedFeishuDomain;
  try {
    const token = await feishuGetToken();
    // 从云盘文件列表提取租户域名（已有 docx:document 权限，无需额外权限）
    const result = await new Promise((resolve, reject) => {
      https.get({
        hostname: 'open.feishu.cn',
        path: '/open-apis/drive/v1/files?page_size=5',
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
    const files = result.data?.files || [];
    for (const f of files) {
      if (f.url) {
        const m = f.url.match(/https:\/\/([^.]+)\.feishu\.cn\//);
        if (m) { cachedFeishuDomain = m[1]; return cachedFeishuDomain; }
      }
    }
  } catch { /* 静默回退 */ }
  return 'bytedance';
}

/**
 * 封装文件 part，避免 Object.assign 污染 Buffer 的可枚举属性
 */
function prepareFilePart(buffer, filename, contentType) {
  return { _isFile: true, buffer, filename, contentType };
}

/**
 * 构造 multipart/form-data 请求体
 */
function buildMultipart(fields, boundary) {
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value && value._isFile) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${value.filename || 'file'}"\r\nContent-Type: ${value.contentType || 'application/octet-stream'}\r\n\r\n`));
      parts.push(value.buffer);
      parts.push(Buffer.from('\r\n'));
    } else {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

/**
 * 上传文件到飞书
 */
function feishuUpload(apiPath, fields) {
  return new Promise((resolve, reject) => {
    feishuGetToken().then(token => {
      const boundary = '----CCFeishu' + Date.now();
      const body = buildMultipart(fields, boundary);
      console.log(`[FeishuUpload] 上传到 ${apiPath}, body大小=${body.length} bytes`);

      const req = https.request({
        hostname: 'open.feishu.cn',
        path: apiPath,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
        timeout: 60000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(`[FeishuUpload] 响应 HTTP ${res.statusCode}, body前200字符: ${data.substring(0, 200)}`);
          try {
            const json = JSON.parse(data);
            console.log(`[FeishuUpload] code=${json.code}, msg=${json.msg}, hasData=${!!json.data}`);
            if (json.code === 0) {
              resolve({ success: true, data: json.data });
            } else {
              resolve({ success: false, error: `上传失败(${json.code}): ${json.msg}` });
            }
          } catch {
            resolve({ success: false, error: '解析上传响应失败' });
          }
        });
      });
      req.on('error', (e) => resolve({ success: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: '上传超时(60s)' }); });
      req.write(body);
      req.end();
    }).catch(e => resolve({ success: false, error: e.message }));
  });
}

ipcMain.handle('feishu:uploadImage', async (_event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: `文件不存在: ${filePath}` };
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
    const contentType = mimeMap[ext] || 'image/png';

    const result = await feishuUpload('/open-apis/im/v1/images', {
      image_type: 'message',
      image: prepareFilePart(fileBuffer, `image${ext}`, contentType),
    });

    if (result.success && result.data?.image_key) {
      return { success: true, imageKey: result.data.image_key };
    }
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('feishu:uploadFile', async (_event, filePath, fileName) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: `文件不存在: ${filePath}` };
    const fileBuffer = fs.readFileSync(filePath);
    const name = fileName || path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = { '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.zip': 'application/zip', '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json' };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    const result = await feishuUpload('/open-apis/im/v1/files', {
      file_type: 'stream',
      file_name: name,
      file: prepareFilePart(fileBuffer, name, contentType),
    });

    if (result.success && result.data?.file_key) {
      return { success: true, fileKey: result.data.file_key, fileName: name };
    }
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ====== 飞书 Base64 图片上传（粘贴截图专用）======

ipcMain.handle('feishu:uploadImageBase64', async (_event, base64Data, mimeType) => {
  try {
    const match = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
    const rawBase64 = match ? match[2] : base64Data;
    const detectedMime = match ? match[1] : (mimeType || 'image/png');

    const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/bmp': '.bmp' };
    const ext = extMap[detectedMime] || '.png';

    const fileBuffer = Buffer.from(rawBase64, 'base64');
    console.log(`[FeishuUpload] Base64上传: mime=${detectedMime}, ext=${ext}, size=${fileBuffer.length} bytes`);

    const result = await feishuUpload('/open-apis/im/v1/images', {
      image_type: 'message',
      image: prepareFilePart(fileBuffer, `image${ext}`, detectedMime),
    });

    if (result.success && result.data?.image_key) {
      console.log(`[FeishuUpload] Base64上传成功: imageKey=${result.data.image_key}`);
      return { success: true, imageKey: result.data.image_key };
    }
    return result;
  } catch (e) {
    console.error(`[FeishuUpload] Base64上传异常:`, e);
    return { success: false, error: e.message };
  }
});

// ====== 持久化飞书配置（供主进程上传用）======

ipcMain.handle('feishu:saveConfigFile', async (_event, appId, appSecret) => {
  try {
    const configPath = path.join(app.getPath('userData'), 'cc_feishu_config.json');
    fs.writeFileSync(configPath, JSON.stringify({ appId, appSecret, updatedAt: Date.now() }), 'utf-8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ====== ExcelJS 辅助函数 ======
function extractExcelSheets(workbook) {
  const sheets = workbook.worksheets.map(ws => {
    const rows = [];
    let totalRows = 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      totalRows++;
      const cells = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        cells.push(cell.text || String(cell.value ?? ''));
      });
      if (cells.length) rows.push(cells.join('\t'));
    });
    const header = rows.length > 0 ? rows[0] : '';
    const dataRows = rows.length > 1 ? rows.length - 1 : 0;
    return `[工作表: ${ws.name} | 总行数: ${totalRows} | 表头: ${header} | 数据行: ${dataRows}]\n${rows.join('\n')}`;
  });
  // 最大 200000 字符，足够容纳数千行数据
  return sheets.join('\n\n').slice(0, 200000);
}

function extractXlsSheets(workbook) {
  const sheets = workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const rows = data.filter(row => row.some(cell => cell !== ''));
    if (!rows.length) return '';
    const header = rows[0].map(c => String(c)).join('\t');
    const dataRows = rows.length - 1;
    const tabRows = rows.map(row => row.map(c => String(c)).join('\t'));
    return `[工作表: ${name} | 总行数: ${rows.length} | 表头: ${header} | 数据行: ${dataRows}]\n${tabRows.join('\n')}`;
  }).filter(Boolean);
  return sheets.join('\n\n').slice(0, 200000);
}

// ====== 飞书资源下载（从消息中下载文件/图片）======

ipcMain.handle('feishu:downloadResource', async (_event, messageId, fileKey, type, preferredFileName) => {
  const MAX_RETRIES = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
  try {
    const token = await feishuGetToken();
    const resourceType = type === 'image' ? 'image' : 'file';
    const apiPath = `/open-apis/im/v1/messages/${messageId}/resources/${fileKey}?type=${resourceType}`;

    const responseData = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'open.feishu.cn',
        path: apiPath,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        timeout: 30000,
      }, (res) => {
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              reject(new Error(json.msg || `下载失败: ${json.code}`));
            } catch { reject(new Error('解析错误响应失败')); }
          });
          return;
        }
        // 二进制响应
        const chunks = [];
        const disposition = res.headers['content-disposition'] || '';

        // 解析文件名: 优先 RFC5987 (filename*=UTF-8''...), 其次普通 filename=
        let parsedName = null;
        // RFC 5987: filename*=UTF-8''url-encoded-name
        const rfcMatch = disposition.match(/filename\*=\s*UTF-8''([^;]+)/i);
        if (rfcMatch) {
          try { parsedName = decodeURIComponent(rfcMatch[1]); } catch {}
        }
        if (!parsedName) {
          const plainMatch = disposition.match(/filename="?([^";\r\n]+)"?/i);
          if (plainMatch) {
            const raw = plainMatch[1].trim();
            try {
              const latin1Bytes = Buffer.from(raw, 'latin1');
              const utf8Decoded = latin1Bytes.toString('utf8');
              parsedName = /[一-鿿]/.test(utf8Decoded) ? utf8Decoded : raw;
            } catch {
              parsedName = raw;
            }
          }
        }
        if (!parsedName && preferredFileName) parsedName = preferredFileName;
        if (!parsedName) parsedName = `${fileKey}.bin`;

        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ chunks, contentType, fileName: parsedName }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('下载超时(30s)')); });
      req.end();
    });

    const buffer = Buffer.concat(responseData.chunks);
    const downloadDir = path.join(app.getPath('temp'), 'cc_feishu_downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
    const filePath = path.join(downloadDir, responseData.fileName);
    fs.writeFileSync(filePath, buffer);

    const result = {
      success: true,
      filePath,
      fileName: responseData.fileName,
      fileSize: buffer.length,
      mimeType: responseData.contentType,
    };

    // 图片额外返回 base64
    if (resourceType === 'image' || responseData.contentType.startsWith('image/')) {
      result.base64Preview = `data:${responseData.contentType};base64,${buffer.toString('base64')}`;
    }

    // 文本类文件返回内容预览
    const textExtensions = ['.txt', '.md', '.json', '.csv', '.xml', '.yaml', '.yml', '.js', '.ts', '.py', '.html', '.css', '.log'];
    const ext = path.extname(responseData.fileName).toLowerCase();
    if (textExtensions.includes(ext) || responseData.contentType.startsWith('text/')) {
      result.textContent = buffer.toString('utf-8').slice(0, 8000);
    }

    // Excel 文件用 ExcelJS 解析
    const excelExts = ['.xlsx', '.xlsm', '.xls', '.xltx', '.xltm'];
    if (excelExts.includes(ext)) {
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        result.textContent = extractExcelSheets(workbook);
      } catch {
        if (ext === '.xls') {
          try {
            const wb = XLSX.read(buffer, { type: 'buffer' });
            result.textContent = extractXlsSheets(wb);
          } catch {
            result.textContent = '[此文件为旧版 .xls 格式无法解析，请用 Excel/WPS 另存为 .xlsx 后重新发送]';
          }
        }
      }
    }

    return result;
  } catch (e) {
    lastError = e;
    const retryable = ['timeout', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'socket', 'network', 'ENOTFOUND'];
    if (attempt < MAX_RETRIES && retryable.some(p => (e.message || '').toLowerCase().includes(p.toLowerCase()))) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    break;
  }
  }
  return { success: false, error: lastError?.message || '下载失败' };
});

// ====== 飞书文件导入为云文档 ======
ipcMain.handle('feishu:importToCloudDoc', async (_event, filePath, targetType) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: `文件不存在: ${filePath}` };

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const fileSize = fileBuffer.length;

    // 映射导入目标类型
    const typeMap = {
      '.xls': 'sheet', '.xlsx': 'sheet', '.xlsm': 'sheet', '.csv': 'sheet',
      '.docx': 'docx', '.doc': 'docx',
    };
    const importType = targetType || typeMap[ext] || 'docx';

    console.log(`[ImportTask] 上传到云盘: ${fileName}, 大小=${fileSize}, 目标类型=${importType}`);

    // 1. 上传到飞书云盘获取 file_token
    const uploadResult = await feishuUpload('/open-apis/drive/v1/files/upload_all', {
      file_name: fileName,
      parent_type: 'explorer',
      size: String(fileSize),
      file: prepareFilePart(fileBuffer, fileName),
    });

    if (!uploadResult.success || !uploadResult.data?.file_token) {
      return { success: false, error: `上传云盘失败: ${uploadResult.error || '未获取到file_token'}` };
    }

    const fileToken = uploadResult.data.file_token;
    console.log(`[ImportTask] 上传成功, file_token=${fileToken}`);

    // 2. 创建导入任务
    const importResult = await new Promise((resolve) => {
      feishuGetToken().then(token => {
        const body = JSON.stringify({
          file_extension: ext.replace('.', ''),
          file_name: fileName,
          file_token: fileToken,
          type: importType,
        });
        const req = https.request({
          hostname: 'open.feishu.cn',
          path: '/open-apis/drive/v1/import_tasks',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 30000,
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch (e) { resolve({ code: -1, msg: e.message }); }
          });
        });
        req.on('error', (e) => resolve({ code: -1, msg: e.message }));
        req.write(body);
        req.end();
      }).catch(e => resolve({ code: -1, msg: e.message }));
    });

    if (importResult.code !== 0) {
      return { success: false, error: `导入任务创建失败(${importResult.code}): ${importResult.msg}` };
    }

    const ticket = importResult.data?.ticket;
    if (!ticket) return { success: false, error: '未获取到ticket' };

    console.log(`[ImportTask] 导入任务已创建, ticket=${ticket}`);

    // 3. 轮询导入结果 (最多等 30 秒)
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollResult = await new Promise((resolve) => {
        feishuGetToken().then(token => {
          https.get({
            hostname: 'open.feishu.cn',
            path: `/open-apis/drive/v1/import_tasks/${ticket}`,
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 10000,
          }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(data)); }
              catch (e) { resolve({ code: -1, msg: e.message }); }
            });
          }).on('error', (e) => resolve({ code: -1, msg: e.message }));
        }).catch(e => resolve({ code: -1, msg: e.message }));
      });

      if (pollResult.code === 0 && pollResult.data?.job_status === 0) {
        const result = pollResult.data.result || {};
        const domain = await feishuGetTenantDomain();
        const pathType = importType === 'sheet' ? 'sheets' : importType;
        const docUrl = result.url || `https://${domain}.feishu.cn/${pathType}/${result.token || ''}`;
        console.log(`[ImportTask] 导入完成: ${docUrl}`);
        return { success: true, url: docUrl, token: result.token, type: importType, fileName };
      }
      if (pollResult.data?.job_status === 2) {
        return { success: false, error: `导入失败: ${pollResult.data.message || '未知错误'}` };
      }
    }

    return { success: false, error: '导入超时，请稍后在飞书云盘中查看' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
