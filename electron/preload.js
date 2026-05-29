const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Existing
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  selectFiles: () => ipcRenderer.invoke('dialog:selectFiles'),

  // Shell
  shellExecute: (cmd, cwd) => ipcRenderer.invoke('shell:execute', cmd, cwd),

  // File operations
  readFile: (filePath) => ipcRenderer.invoke('file:readFile', filePath),
  readBinary: (filePath) => ipcRenderer.invoke('file:readBinary', filePath),
  writeFile: (filePath, content, append) => ipcRenderer.invoke('file:writeFile', filePath, content, append),
  listDir: (dirPath) => ipcRenderer.invoke('file:listDir', dirPath),
  deleteFile: (filePath) => ipcRenderer.invoke('file:deleteFile', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('file:exists', filePath),

  // Web
  webFetch: (url) => ipcRenderer.invoke('web:fetch', url),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Excel generation (ExcelJS multi-step)
  generateExcel: (params) => ipcRenderer.invoke('excel:generate', params),

  // App paths
  getProjectsPath: () => ipcRenderer.invoke('app:getProjectsPath'),
  getDownloadsPath: () => ipcRenderer.invoke('app:getDownloadsPath'),

  // TTS server management (MOSS-TTS-Nano voice cloning)
  ttsServerStart: () => ipcRenderer.invoke('tts-server:start'),
  ttsServerStop: () => ipcRenderer.invoke('tts-server:stop'),
  ttsServerStatus: () => ipcRenderer.invoke('tts-server:status'),

  // Edge TTS (simple spawn → base64)
  edgeTtsSpeak: (text) => ipcRenderer.invoke('tts:speak', text),
  edgeTtsCancel: () => ipcRenderer.invoke('tts:cancel'),

  // Voice cloning
  ttsCloneSpeak: (params) => ipcRenderer.invoke('tts:cloneSpeak', params),

  // STT (Speech-to-Text via local faster-whisper)
  sttServerStart: () => ipcRenderer.invoke('stt-server:start'),
  sttServerStop: () => ipcRenderer.invoke('stt-server:stop'),
  sttServerStatus: () => ipcRenderer.invoke('stt-server:status'),
  sttTranscribe: (audioBase64, mimeType) => ipcRenderer.invoke('stt:transcribe', audioBase64, mimeType),

  // Save base64 to file
  saveBase64ToFile: (base64, filePath) => ipcRenderer.invoke('file:saveBase64ToFile', base64, filePath),

  // Built-in voice
  getBuiltInVoicePath: () => ipcRenderer.invoke('app:getBuiltInVoicePath'),

  // Auto update
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getAppVersion: () => ipcRenderer.invoke('update:getVersion'),
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },

  // Window control (opening animation)
  setFullScreen: (fullscreen) => ipcRenderer.invoke('window:setFullScreen', fullscreen),
  isFullScreen: () => ipcRenderer.invoke('window:isFullScreen'),
  onFullscreenChanged: (callback) => {
    const handler = (_event, isFullscreen) => callback(isFullscreen);
    ipcRenderer.on('window:fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', handler);
  },

  // Feishu
  feishuTest: (appId, appSecret) => ipcRenderer.invoke('feishu:test', appId, appSecret),
  feishuConfigure: (appId, appSecret) => ipcRenderer.invoke('feishu:configure', appId, appSecret),
  feishuStatus: () => ipcRenderer.invoke('feishu:status'),
  feishuDisconnect: () => ipcRenderer.invoke('feishu:disconnect'),
  feishuUploadImage: (filePath) => ipcRenderer.invoke('feishu:uploadImage', filePath),
  feishuUploadImageBase64: (base64, mimeType) => ipcRenderer.invoke('feishu:uploadImageBase64', base64, mimeType),
  feishuUploadFile: (filePath, fileName) => ipcRenderer.invoke('feishu:uploadFile', filePath, fileName),
  feishuSaveConfigFile: (appId, appSecret) => ipcRenderer.invoke('feishu:saveConfigFile', appId, appSecret),
  feishuDownloadResource: (messageId, fileKey, type, fileName) => ipcRenderer.invoke('feishu:downloadResource', messageId, fileKey, type, fileName),
  feishuImportToCloudDoc: (filePath, targetType) => ipcRenderer.invoke('feishu:importToCloudDoc', filePath, targetType),
  feishuGetSession: () => ipcRenderer.invoke('feishu:getSession'),
  feishuRefreshSession: () => ipcRenderer.invoke('feishu:refreshSession'),
  onFeishuMessage: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('feishu:message', handler);
    return () => ipcRenderer.removeListener('feishu:message', handler);
  },
  onFeishuStatusChange: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('feishu:statusChange', handler);
    return () => ipcRenderer.removeListener('feishu:statusChange', handler);
  },

  // Git & Project context
  gitStatus: (cwd) => ipcRenderer.invoke('git:status', cwd),
  gitBranch: (cwd) => ipcRenderer.invoke('git:branch', cwd),
  listProjectFiles: (dirPath) => ipcRenderer.invoke('project:listFiles', dirPath),
});
