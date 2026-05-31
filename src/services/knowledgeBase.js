/**
 * Knowledge Base RAG — document ingestion, chunking, and semantic search.
 *
 * Stores documents in localStorage as 'cc_knowledge_base'.
 * Chunks text into ~512-char segments with 128-char overlap.
 * Uses TF-IDF (CJK bigram) for search — no external vector DB needed.
 */

const STORAGE_KEY = 'cc_knowledge_base';
const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 128;

/* ---------- Tokenizer (same as memory.js) ---------- */

function tokenize(text) {
  const cleaned = text.toLowerCase().replace(/[^一-鿿\w]/g, ' ').trim();
  const tokens = [];

  let cjkBuf = [];
  for (const char of cleaned) {
    if (/[一-鿿]/.test(char)) {
      cjkBuf.push(char);
      if (cjkBuf.length === 2) {
        tokens.push(cjkBuf.join(''));
        cjkBuf.shift();
      }
    } else {
      if (cjkBuf.length > 0) {
        tokens.push(cjkBuf.join(''));
        cjkBuf = [];
      }
    }
  }
  if (cjkBuf.length > 0) tokens.push(cjkBuf.join(''));

  const words = cleaned.split(/\s+/).filter(w => w.length >= 1);
  for (const w of words) {
    if (!/[一-鿿]/.test(w) && w.length >= 2) {
      tokens.push(w);
    }
  }
  return tokens;
}

/* ---------- Storage ---------- */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { documents: [] };
  } catch {
    return { documents: [] };
  }
}

function save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Knowledge base save failed:', e);
  }
}

/* ---------- Chunking ---------- */

function chunkText(text) {
  const chunks = [];
  if (text.length <= CHUNK_SIZE) {
    chunks.push(text);
    return chunks;
  }

  let start = 0;
  while (start < text.length) {
    let end = start + CHUNK_SIZE;

    // Try to break at sentence boundary
    if (end < text.length) {
      const searchEnd = Math.min(end + 80, text.length);
      const breakChars = ['。', '！', '？', '\n', '.', '!', '?', '；', ';'];
      let bestBreak = -1;
      for (const ch of breakChars) {
        const pos = text.indexOf(ch, end - 60);
        if (pos !== -1 && pos < searchEnd) {
          if (bestBreak === -1 || pos < bestBreak) {
            bestBreak = pos;
          }
        }
      }
      if (bestBreak !== -1) {
        end = bestBreak + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - CHUNK_OVERLAP;
    if (start < 0) start = 0;
    if (start >= text.length) break;
  }

  return chunks;
}

/* ---------- Public API ---------- */

/** Add a document from text content. */
export function addDocument(title, content, source = '') {
  const data = load();
  const docId = 'kb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const chunks = chunkText(content);

  const doc = {
    id: docId,
    title,
    source,
    type: source.split('.').pop()?.toLowerCase() || 'txt',
    chunkCount: chunks.length,
    chunks: chunks.map((text, i) => ({
      id: `${docId}_${i}`,
      text,
      tokens: tokenize(text),
      index: i,
    })),
    addedAt: Date.now(),
  };

  data.documents.push(doc);
  save(data);
  return doc;
}

/** Add a document from a file path (reads via electronAPI). */
export async function addDocumentFromFile(filePath) {
  if (!window.electronAPI) {
    throw new Error('文件读取仅在Electron环境中可用');
  }

  const { readFile } = await import('./fileReader');
  const result = await readFile(filePath);
  if (!result.success) {
    throw new Error(`读取文件失败: ${result.error}`);
  }

  const fileName = result.filename;
  const ext = result.ext;

  let content = result.content || '';

  // 表格文件: 格式化为TSV文本（已由 fileReader 预处理）
  if (result.type === 'spreadsheet' && result.sheets) {
    content = result.sheets.map(sheet =>
      `[工作表: ${sheet.name} | ${sheet.rows.length}行]\n` +
      sheet.rows.slice(0, 200).map(row =>
        (row || []).map(c => String(c ?? '')).join('\t')
      ).join('\n')
    ).join('\n\n');
  }

  // 图片文件: 记录元数据
  if (result.type === 'image') {
    content = `[图片文件: ${fileName}, 大小: ${((result.fileSize || 0) / 1024).toFixed(1)}KB]`;
    if (result.base64) {
      content += `\n[图片数据已加载，可用于发送到飞书]`;
    }
  }

  // PDF/DOCX 使用 Python 提取（保留原有逻辑）
  if (['pdf', 'docx'].includes(ext)) {
    try {
      const pyContent = await extractWithPython(filePath, ext);
      if (pyContent && pyContent.trim().length > 0) {
        content = pyContent;
      }
    } catch (e) {
      console.warn('Python文本提取失败，使用原始读取:', e.message);
    }
  }

  if (!content || content.trim().length === 0) {
    throw new Error('未能提取到有效文本内容');
  }

  return addDocument(fileName, content, filePath);
}

/** Use Python to extract text from PDF/DOCX files. */
async function extractWithPython(filePath, ext) {
  // 生成临时文件路径
  const appPath = (await window.electronAPI.getAppPath?.()) || '';
  const tmpDir = appPath ? appPath.replace(/\\/g, '/') + '/temp' : '';
  const baseName = 'cc_extract_' + Date.now();
  const scriptPath = tmpDir ? tmpDir + '/' + baseName + '.py' : filePath.replace(/\.[^.]+$/, '_extract.py');
  const outPath = tmpDir ? tmpDir + '/' + baseName + '_out.txt' : filePath.replace(/\.[^.]+$/, '_out.txt');

  // Python 脚本：将提取结果写入文件，避免通过 PowerShell stdout 时编码被搅乱
  const pythonScript = ext === 'pdf'
    ? `import sys, os, subprocess
try:
    import PyPDF2
except ImportError:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'PyPDF2', '-q'])
    import PyPDF2

try:
    with open(r"${filePath}", "rb") as f:
        reader = PyPDF2.PdfReader(f)
        text = "\\n".join(page.extract_text() or "" for page in reader.pages)
    # 直接写入文件，避免 stdout 编码问题
    with open(r"${outPath}", "w", encoding="utf-8") as out:
        out.write(text[:50000])
    print("OK")
except Exception as e:
    with open(r"${outPath}", "w", encoding="utf-8") as out:
        out.write(f"ERROR:{str(e)}")
    print("FAIL")
`
    : `import sys, os, subprocess
try:
    import docx
except ImportError:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'python-docx', '-q'])
    import docx

try:
    doc = docx.Document(r"${filePath}")
    text = "\\n".join(p.text for p in doc.paragraphs)
    with open(r"${outPath}", "w", encoding="utf-8") as out:
        out.write(text[:50000])
    print("OK")
except Exception as e:
    with open(r"${outPath}", "w", encoding="utf-8") as out:
        out.write(f"ERROR:{str(e)}")
    print("FAIL")
`;

  await window.electronAPI.writeFile(scriptPath, pythonScript);

  // 执行 Python
  let result = null;
  for (const pyCmd of ['python3', 'python', 'py']) {
    result = await window.electronAPI.shellExecute(`${pyCmd} "${scriptPath}"`);
    if (result.success) break;
  }

  // 读取 Python 写入的输出文件（绕过 PowerShell GBK 编码问题）
  let extractedText = '';
  const outResult = await window.electronAPI.readFile(outPath);
  if (outResult.success && outResult.content) {
    extractedText = outResult.content;
    if (extractedText.startsWith('ERROR:')) {
      throw new Error(`文本提取失败: ${extractedText.slice(6)}`);
    }
  }

  // 清理临时文件
  await window.electronAPI.deleteFile(scriptPath);
  await window.electronAPI.deleteFile(outPath);

  if (!extractedText) {
    if (!result || !result.success) {
      const errDetail = result?.stderr || result?.error || 'Python未安装';
      throw new Error(`Python执行失败: ${errDetail}`);
    }
    throw new Error('未能提取到有效文本（PDF可能为扫描版或加密文件）');
  }

  return extractedText;
}

/** Remove a document by ID. */
export function removeDocument(docId) {
  const data = load();
  data.documents = data.documents.filter(d => d.id !== docId);
  save(data);
}

/** List all documents (without chunk text for performance). */
export function listDocuments() {
  const data = load();
  return data.documents.map(d => ({
    id: d.id,
    title: d.title,
    source: d.source,
    type: d.type,
    chunkCount: d.chunkCount,
    addedAt: d.addedAt,
  }));
}

/** Get a single document with all chunks. */
export function getDocument(docId) {
  const data = load();
  return data.documents.find(d => d.id === docId) || null;
}

/**
 * Search the knowledge base.
 * @returns {Array<{chunkId, docTitle, text, score, highlightRange}>}
 */
export function searchKnowledge(query, limit = 5) {
  const data = load();
  const allDocs = data.documents;
  if (allDocs.length === 0) return [];

  const queryTokens = tokenize(query);
  // 额外对原始查询分词（保留英文单词等），用于文件名匹配
  const rawQueryTokens = tokenizeRaw(query);

  // Build document frequency index across all chunks
  const allChunks = [];
  for (const doc of allDocs) {
    for (const chunk of doc.chunks) {
      allChunks.push({ doc, chunk });
    }
  }

  const N = allChunks.length;
  const docFreq = new Map();

  for (const { chunk } of allChunks) {
    const seen = new Set();
    for (const t of chunk.tokens) {
      if (!seen.has(t)) {
        docFreq.set(t, (docFreq.get(t) || 0) + 1);
        seen.add(t);
      }
    }
  }

  // Score each chunk (TF-IDF + filename bonus)
  const scored = allChunks.map(({ doc, chunk }) => {
    const tf = new Map();
    for (const t of chunk.tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }

    let score = 0;
    for (const qt of queryTokens) {
      const termFreq = tf.get(qt) || 0;
      if (termFreq === 0) continue;
      const df = docFreq.get(qt) || 1;
      const idf = Math.log((N + 1) / (df + 1)) + 1;
      score += termFreq * idf;
    }

    // 文件名匹配加分：文件名包含查询词时给额外权重
    const fileName = (doc.title || '').toLowerCase();
    const fileNameTokens = tokenize(fileName);
    let nameBonus = 0;
    for (const qt of queryTokens) {
      if (fileNameTokens.includes(qt)) nameBonus += 0.5;
    }
    // 原始查询词直接出现在文件名中（如 "简历" matches "个人简历.pdf"）
    if (query.trim().length > 0 && fileName.includes(query.trim().toLowerCase())) {
      nameBonus += 1.0;
    }
    // 原始查询的每个关键词出现在文件名中
    for (const rqt of rawQueryTokens) {
      if (rqt.length >= 2 && fileName.includes(rqt)) nameBonus += 0.3;
    }
    score += nameBonus * (1 + Math.log(N + 1)); // 文件名匹配权重不低于内容匹配

    return {
      docTitle: doc.title,
      docId: doc.id,
      chunkId: chunk.id,
      text: chunk.text,
      score,
    };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Tokenize for raw keyword matching (preserves non-CJK words of any length). */
function tokenizeRaw(text) {
  return text.toLowerCase()
    .replace(/[^\w一-鿿]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 1);
}

/**
 * Build a RAG context string from search results.
 * For injection into the system prompt.
 */
export function buildRAGContext(query, limit = 3) {
  const results = searchKnowledge(query, limit);
  if (results.length === 0) return '';

  let ctx = '\n## 用户知识库相关内容\n';
  for (const r of results) {
    ctx += `\n【${r.docTitle}】${r.text.slice(0, 600)}`;
  }
  ctx += '\n\n请基于以上资料回答用户问题，并在回答中引用相关来源。';
  return ctx;
}

/** Get total stats. */
export function getKnowledgeStats() {
  const data = load();
  let totalChunks = 0;
  let totalChars = 0;
  for (const doc of data.documents) {
    totalChunks += doc.chunkCount;
    for (const chunk of doc.chunks) {
      totalChars += chunk.text.length;
    }
  }
  return {
    documentCount: data.documents.length,
    chunkCount: totalChunks,
    totalChars,
  };
}

/** Clear the entire knowledge base. */
export function clearKnowledgeBase() {
  save({ documents: [] });
}
