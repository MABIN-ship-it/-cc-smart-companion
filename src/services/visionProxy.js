/**
 * 视觉代理 — 对非视觉模型，用 Tesseract.js OCR 提取图片文字
 */
import Tesseract from 'tesseract.js';

const cache = new Map();

/** 简单 hash（避免引入 crypto） */
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < Math.min(str.length, 2000); i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return String(h);
}

/**
 * 从 base64 data-URI 中提取文字
 * @param {string} base64 - data:image/png;base64,xxx
 * @returns {Promise<string>}
 */
async function extractText(base64) {
  const key = simpleHash(base64);
  if (cache.has(key)) return cache.get(key);

  try {
    const { data } = await Tesseract.recognize(base64, 'eng+chi_sim', {
      logger: () => {}, // 静默
    });
    const text = (data.text || '').trim();
    cache.set(key, text);
    return text;
  } catch (e) {
    console.warn('OCR failed:', e.message);
    return '';
  }
}

/**
 * 批量处理图片块，返回文字描述
 * @param {Array<{type:'image', source:{type:'base64', media_type:string, data:string}}>} blocks
 * @returns {Promise<string>}
 */
export async function describeImages(blocks) {
  const imageBlocks = blocks.filter(b => b.type === 'image' && b.source?.type === 'base64');
  if (imageBlocks.length === 0) return '';

  const results = await Promise.all(
    imageBlocks.map(async (block, i) => {
      const dataUri = `data:${block.source.media_type};base64,${block.source.data}`;
      const text = await extractText(dataUri);
      if (text) return `[图片${i + 1}文字内容]:\n${text}`;
      return `[图片${i + 1}]: 未检测到文字`;
    })
  );

  return results.join('\n\n');
}
