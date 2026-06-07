/**
 * Excel智能解析引擎
 * 将Excel文件解析为飞书多维表格所需的 fields + records 结构
 */
import { inferFieldType } from './feishuTools';

/** 将 ExcelJS 的公式/富文本对象提取为纯值 */
function normalizeCellValue(v) {
  if (v === null || v === undefined) return v;
  if (typeof v !== 'object') return v;
  // 公式对象：取 result（计算值）
  if (v.formula !== undefined) return v.result !== undefined ? v.result : v.formula;
  // 共享公式：取 result
  if (v.sharedFormula !== undefined) return v.result !== undefined ? v.result : '';
  // 富文本：拼接所有 text 片段
  if (v.richText && Array.isArray(v.richText)) return v.richText.map(t => t.text || '').join('');
  // 错误对象
  if (v.error) return v.error;
  // 其他对象（日期等）尝试取 toString
  return v;
}

/** 安全转字符串（先归一化再转） */
function safeStr(v) {
  const n = normalizeCellValue(v);
  if (n === null || n === undefined) return '';
  if (typeof n === 'string') return n.trim();
  return String(n).trim();
}

/**
 * 解析Excel文件为多维表格数据结构
 * @param {string} filePath
 * @returns {Promise<{success: boolean, sheets: Array, error?: string}>}
 */
export async function parseExcelForBitable(filePath) {
  if (!window.electronAPI) {
    return { success: false, error: 'Excel解析需要Electron环境' };
  }

  try {
    const result = await window.electronAPI.readBinary(filePath);
    if (!result.success) return { success: false, error: `读取文件失败: ${result.error}` };

    const buffer = Uint8Array.from(atob(result.buffer), c => c.charCodeAt(0)).buffer;
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

    let sheets = [];
    if (ext === '.xls' || ext === '.csv' || ext === '.ods') {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      sheets = wb.SheetNames.map(name => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: false });
        return { name, rawRows: rows };
      });
    } else {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      sheets = workbook.worksheets.map(ws => {
        const rows = [];
        ws.eachRow({ includeEmpty: false }, (row) => {
          const cells = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            cells.push(cell.value);
          });
          rows.push(cells);
        });
        return { name: ws.name, rawRows: rows };
      });
    }

    const parsedSheets = sheets.map(s => parseSheet(s.name, s.rawRows));
    return { success: true, sheets: parsedSheets };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function findHeaderRowIndex(rawRows) {
  if (rawRows.length < 2) return 0;
  const vals0 = rawRows[0].map(safeStr).filter(Boolean);
  const unique0 = new Set(vals0);
  const count0 = vals0.length;
  // 策略1：row 0 只有1~2个非空 → xlsx库合并标题
  if (count0 <= 2 && count0 > 0) {
    const count1 = rawRows[1].filter(c => safeStr(c) !== '').length;
    if (count1 > count0) return 1;
  }
  // 策略2：row 0 有>3列且只含1个唯一值 → ExcelJS全行合并标题/richText标题行
  if (count0 > 3 && unique0.size === 1) return 1;
  return 0;
}

function parseSheet(name, rawRows) {
  if (rawRows.length === 0) {
    return { name, headerRow: [], dataRows: [], rowCount: 0, colCount: 0, fields: [], records: [] };
  }

  const headerIdx = findHeaderRowIndex(rawRows);
  const headerRow = cleanHeader(rawRows[headerIdx]);
  const dataStart = headerIdx + 1;
  const colCount = headerRow.length;
  let dataRows = rawRows.slice(dataStart).filter(row => {
    return row.some(c => safeStr(c) !== '');
  });

  // 去前导空列（header为"列N"且所有data行该列为空）
  while (headerRow.length > 0 && /^列\d+$/.test(headerRow[0]) && dataRows.every(r => safeStr(r[0]) === '')) {
    headerRow.shift();
    rawRows.forEach(r => { if (r.length > 0) r.shift(); });
    dataRows = rawRows.slice(dataStart).filter(row => row.some(c => safeStr(c) !== ''));
  }

  // 推断字段类型（采样前50行）
  const fields = headerRow.map((fieldName, colIdx) => {
    const samples = sampleColumnValues(dataRows, colIdx);
    const type = inferFieldType(fieldName, samples);
    return { field_name: fieldName, type };
  });

  // 生成records
  const records = dataRows.map(row => {
    const fieldsObj = {};
    headerRow.forEach((name, colIdx) => {
      const raw = row[colIdx];
      const v = normalizeCellValue(raw);
      if (v !== null && v !== undefined && safeStr(v) !== '') {
        fieldsObj[name] = v;
      }
    });
    if (Object.keys(fieldsObj).length === 0) return null;
    return { fields: fieldsObj };
  }).filter(Boolean);

  return { name, headerRow, dataRows, rowCount: dataRows.length, colCount, fields, records };
}

/** 清理表头：空→"列N"，/→-，去首尾空格 */
export function cleanHeader(headers) {
  return headers.map((h, i) => {
    let cleaned = safeStr(h);
    cleaned = cleaned.replace(/\//g, '-').replace(/\\/g, '-').replace(/[<>:\"|?*]/g, '').trim();
    return cleaned || `列${i + 1}`;
  });
}

/** 采样指定列的数据值 */
export function sampleColumnValues(dataRows, colIndex, sampleSize = 50) {
  return dataRows.slice(0, sampleSize).map(row => {
    const raw = row[colIndex];
    return raw !== undefined && raw !== null ? safeStr(raw) : '';
  });
}
