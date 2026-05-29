/**
 * Excel智能解析引擎
 * 将Excel文件解析为飞书多维表格所需的 fields + records 结构
 */
import { inferFieldType } from './feishuTools';

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

function parseSheet(name, rawRows) {
  if (rawRows.length === 0) {
    return { name, headerRow: [], dataRows: [], rowCount: 0, colCount: 0, fields: [], records: [] };
  }

  const headerRow = cleanHeader(rawRows[0]);
  const colCount = headerRow.length;
  const dataRows = rawRows.slice(1).filter(row => {
    // 跳过全空行
    return row.some(c => c !== null && c !== undefined && String(c).trim() !== '');
  });

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
      const val = row[colIdx];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        fieldsObj[name] = val;
      }
    });
    if (Object.keys(fieldsObj).length === 0) return null;
    return { fields: fieldsObj };
  }).filter(Boolean);

  return { name, headerRow, dataRows, rowCount: dataRows.length, colCount, fields, records };
}

/** 清理表头：空表头替换为"列N" */
export function cleanHeader(headers) {
  return headers.map((h, i) => {
    const cleaned = String(h ?? '').trim();
    return cleaned || `列${i + 1}`;
  });
}

/** 采样指定列的数据值 */
export function sampleColumnValues(dataRows, colIndex, sampleSize = 50) {
  return dataRows.slice(0, sampleSize).map(row => {
    const val = row[colIndex];
    return val !== undefined && val !== null ? String(val) : '';
  });
}
