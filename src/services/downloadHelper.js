/**
 * Download helper — fetches files and saves to local disk.
 * Uses Electron IPC to save files to the user's downloads folder.
 */

export async function downloadFileFromMain(url, filename, outputDir) {
  try {
    // Fetch the file
    const res = await fetch(url, {
      signal: AbortSignal.timeout(60000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    if (!res.ok) {
      return `下载失败: HTTP ${res.status} ${res.statusText}`;
    }

    const contentType = res.headers.get('content-type') || '';
    const isText = contentType.includes('text') || contentType.includes('json') || contentType.includes('xml')
      || contentType.includes('javascript');

    let content;
    if (isText) {
      content = await res.text();
    } else {
      // For binary files, convert to base64
      const blob = await res.blob();
      content = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      return `文件下载完成（${contentType}），但二进制文件需要手动保存。请通过 execute_shell 使用 curl 下载:\ncurl -L -o "%USERPROFILE%\\Downloads\\${filename || 'download'}" "${url}"`;
    }

    // Determine filename
    const finalName = filename || extractFilename(url, contentType);
    const downloadsPath = outputDir || await window.electronAPI.getDownloadsPath();
    const fullPath = `${downloadsPath}\\${finalName}`;

    // Save via IPC
    const result = await window.electronAPI.writeFile(fullPath, content);
    if (result.success) {
      return `文件已下载并保存到: ${fullPath}\n文件大小: ${content.length} 字符`;
    }
    return `下载成功但保存失败: ${result.error}`;
  } catch (e) {
    return `下载出错: ${e.message}`;
  }
}

function extractFilename(url, contentType) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      const last = parts[parts.length - 1];
      if (last.includes('.')) return last;
    }
  } catch {}

  // Fallback based on content type
  const extMap = {
    'text/html': 'page.html',
    'application/json': 'data.json',
    'text/javascript': 'script.js',
    'text/css': 'style.css',
    'application/pdf': 'document.pdf',
  };
  for (const [type, name] of Object.entries(extMap)) {
    if (contentType.includes(type)) return name;
  }
  return 'download.txt';
}
