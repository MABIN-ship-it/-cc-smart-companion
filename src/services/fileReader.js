/**
 * 统一文件读取引擎
 * 支持格式: txt, md, json, xml, csv, js, ts, py, html, css,
 *           pdf, docx, xlsx, xls, pptx, jpg, png, gif, webp, bmp
 */

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.xml', '.csv', '.yaml', '.yml',
  '.js', '.ts', '.jsx', '.tsx', '.py', '.html', '.css',
  '.log', '.env', '.ini', '.cfg', '.toml', '.sh', '.bat',
]);

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico',
]);

const SPREADSHEET_EXTENSIONS = new Set([
  '.xlsx', '.xls', '.xlsm', '.xltx', '.xltm', '.csv', '.ods',
]);

const DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.pptx', '.ppt',
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * 统一文件读取入口
 * @param {string} filePath 绝对路径
 * @returns {Promise<{
 *   success: boolean,
 *   type: 'text'|'image'|'spreadsheet'|'document'|'binary',
 *   filename: string,
 *   ext: string,
 *   content?: string,
 *   base64?: string,
 *   sheets?: Array<{name: string, rows: Array<Array>}>,
 *   error?: string,
 *   fileSize?: number,
 * }>}
 */
export async function readFile(filePath) {
  if (!filePath) return { success: false, error: '文件路径为空' };

  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  const filename = filePath.replace(/^.*[/\\]/, '');

  if (!window.electronAPI) {
    return { success: false, error: '文件读取仅在Electron环境中可用' };
  }

  let detectedType = 'binary';
  if (TEXT_EXTENSIONS.has(ext)) detectedType = 'text';
  else if (IMAGE_EXTENSIONS.has(ext)) detectedType = 'image';
  else if (SPREADSHEET_EXTENSIONS.has(ext)) detectedType = 'spreadsheet';
  else if (DOCUMENT_EXTENSIONS.has(ext)) detectedType = 'document';

  try {
    switch (detectedType) {
      case 'text':
        return await readTextFile(filePath, filename, ext);
      case 'image':
        return await readImageFile(filePath, filename, ext);
      case 'spreadsheet':
        return await readSpreadsheetFile(filePath, filename, ext);
      case 'document':
        return await readDocumentFile(filePath, filename, ext);
      default:
        return await readBinaryFile(filePath, filename, ext);
    }
  } catch (e) {
    return { success: false, type: detectedType, filename, ext, error: e.message };
  }
}

async function readTextFile(filePath, filename, ext) {
  const result = await window.electronAPI.readFile(filePath);
  if (!result.success) return { success: false, type: 'text', filename, ext, error: result.error };
  return {
    success: true,
    type: 'text',
    filename,
    ext,
    content: result.content,
    fileSize: (result.content || '').length,
  };
}

async function readImageFile(filePath, filename, ext) {
  const result = await window.electronAPI.readBinary(filePath);
  if (!result.success) return { success: false, type: 'image', filename, ext, error: result.error };
  const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
  const mime = mimeMap[ext] || 'application/octet-stream';
  return {
    success: true,
    type: 'image',
    filename,
    ext,
    base64: `data:${mime};base64,${result.buffer}`,
    fileSize: result.size,
    content: `[图片文件: ${filename}, 大小: ${(result.size / 1024).toFixed(1)}KB]`,
  };
}

async function readSpreadsheetFile(filePath, filename, ext) {
  const result = await window.electronAPI.readBinary(filePath);
  if (!result.success) return { success: false, type: 'spreadsheet', filename, ext, error: result.error };

  try {
    const buffer = Uint8Array.from(atob(result.buffer), c => c.charCodeAt(0)).buffer;
    let sheets = [];

    if (ext === '.xls' || ext === '.csv' || ext === '.ods') {
      // 使用 SheetJS (xlsx 库) 读取旧格式
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      sheets = wb.SheetNames.map(name => {
        const sheet = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
        return { name, rows };
      });
    } else {
      // 使用 ExcelJS 读取新格式
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      sheets = workbook.worksheets.map(ws => {
        const rows = [];
        ws.eachRow({ includeEmpty: false }, (row) => {
          const cells = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            cells.push(cell.value ?? '');
          });
          rows.push(cells);
        });
        return { name: ws.name, rows };
      });
    }

    // 生成文本预览
    const textContent = sheets.map(s =>
      `[工作表: ${s.name} | ${s.rows.length}行]\n${s.rows.slice(0, 50).map(r => r.join('\t')).join('\n')}`
    ).join('\n\n').slice(0, 50000);

    return { success: true, type: 'spreadsheet', filename, ext, sheets, content: textContent, fileSize: result.size };
  } catch (e) {
    return { success: false, type: 'spreadsheet', filename, ext, error: `表格解析失败: ${e.message}` };
  }
}

async function readDocumentFile(filePath, filename, ext) {
  // 文档类通过 Electron IPC 调用 Python 提取
  const result = await window.electronAPI.readFile(filePath);
  if (result.success && result.content) {
    return { success: true, type: 'document', filename, ext, content: result.content, fileSize: result.content.length };
  }
  // 回退：尝试作为二进制文件返回
  const binResult = await window.electronAPI.readBinary(filePath);
  if (!binResult.success) return { success: false, type: 'document', filename, ext, error: binResult.error };
  return {
    success: true, type: 'document', filename, ext,
    content: `[文档文件: ${filename}, 大小: ${(binResult.size / 1024).toFixed(1)}KB, 需Python环境提取文字]`,
    fileSize: binResult.size,
  };
}

async function readBinaryFile(filePath, filename, ext) {
  const result = await window.electronAPI.readBinary(filePath);
  if (!result.success) return { success: false, type: 'binary', filename, ext, error: result.error };
  return {
    success: true, type: 'binary', filename, ext,
    content: `[二进制文件: ${filename}, 大小: ${(result.size / 1024).toFixed(1)}KB]`,
    fileSize: result.size,
  };
}
