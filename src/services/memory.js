const STORAGE_KEY = 'cc_memory_store';

export function loadMemories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMemories(memories) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
}

export function extractMemoryFromConversation(userMessage, aiResponse) {
  const newMemories = [];
  const combined = userMessage + ' ' + aiResponse;

  // Extract user preferences (I like/I use/I prefer)
  const prefPatterns = [
    { regex: /我(?:喜欢|习惯|常用|偏好)(?:用|使用)?(.{2,15}?)(?:[，。.!！?？\n]|$)/g, type: 'user' },
    { regex: /我(?:是|叫|做)(?:一个|一名)?(.{2,15}?)(?:[，。.!！?？\n]|$)/g, type: 'user' },
    { regex: /我的.{0,5}(?:项目|工作|任务).{0,5}是(.{2,30}?)(?:[，。.!！?？\n]|$)/g, type: 'project' },
    { regex: /(?:截止|deadline|日期|到期).{0,5}(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/g, type: 'date' },
  ];

  for (const { regex, type } of prefPatterns) {
    let match;
    while ((match = regex.exec(combined)) !== null) {
      const content = match[1]?.trim();
      if (content && content.length >= 2 && content.length < 50) {
        const exists = newMemories.find(m => m.content.includes(content));
        if (!exists) {
          const mem = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
            content: type === 'date' ? `📅 ${match[0].trim()}` : content,
            type,
            level: 'hot',
            importance: 3,
            mentions: 1,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
            source: 'auto',
          };
          if (type === 'date') {
            mem.reason = '';
            mem.recurring = true;
            mem.dateValue = match[1] || '';
          }
          newMemories.push(mem);
        }
      }
    }
  }

  if (newMemories.length > 0) {
    const existing = loadMemories();
    const merged = mergeMemories(existing, newMemories);
    saveMemories(merged);
  }

  return newMemories;
}

function mergeMemories(existing, newOnes) {
  const merged = [...existing];
  for (const mem of newOnes) {
    const dup = merged.find(e =>
      e.content === mem.content ||
      (e.type === mem.type && similarContent(e.content, mem.content))
    );
    if (dup) {
      dup.mentions = (dup.mentions || 1) + 1;
      dup.importance = Math.min(10, (dup.importance || 3) + 1);
      dup.lastAccessed = Date.now();
      if (dup.mentions >= 3) {
        dup.level = 'hot';
        dup.expiresAt = Date.now() + 365 * 24 * 3600 * 1000;
      }
    } else {
      merged.push(mem);
    }
  }
  return merged;
}

function similarContent(a, b) {
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  return longer.includes(shorter) && shorter.length > longer.length * 0.5;
}

export async function applyForgettingRules() {
  const memories = loadMemories();
  const now = Date.now();

  for (const m of memories) {
    const age = now - m.createdAt;

    // 冷节点归档：90天→归档，永不删除
    if (age > 90 * 24 * 3600 * 1000 && (m.level === 'cold' || (m.lastAccessed && now - m.lastAccessed > 90 * 24 * 3600 * 1000))) {
      m.level = 'archived';
      continue;
    }

    // 30天warm→降级cold
    if (age > 30 * 24 * 3600 * 1000 && m.level === 'warm' && (m.importance || 3) < 5) {
      m.level = 'cold';
    }

    // 过期但重要→降级不删除
    if (m.expiresAt && now > m.expiresAt) {
      m.level = (m.importance || 3) >= 5 ? 'cold' : 'archived';
      if (m.level === 'cold') m.expiresAt = now + 90 * 24 * 3600 * 1000;
    }
  }

  const result = memories.filter(m => m.level !== '_deleted');
  saveMemories(result);
  return result;
}

export function getHotMemories(limit = 10) {
  return loadMemories()
    .filter(m => m.level === 'hot')
    .sort((a, b) => (b.importance || 0) - (a.importance || 0))
    .slice(0, limit);
}

export function searchMemories(query, limit = 5) {
  const memories = loadMemories();
  if (!query.trim() || memories.length === 0) return memories.slice(0, limit);

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return memories.slice(0, limit);

  // Build document-term index
  const docs = memories.map(m => ({ id: m.id, tokens: tokenize(m.content), memory: m }));
  const docFreq = new Map();
  for (const doc of docs) {
    const seen = new Set();
    for (const t of doc.tokens) {
      if (!seen.has(t)) {
        docFreq.set(t, (docFreq.get(t) || 0) + 1);
        seen.add(t);
      }
    }
  }

  const N = docs.length;

  // Score each document with TF-IDF + recency boost
  const scored = docs.map(doc => {
    const tf = new Map();
    for (const t of doc.tokens) {
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

    // Recency boost: accessed in last 7 days gets bonus
    const daysSinceAccess = (Date.now() - doc.memory.lastAccessed) / 86400000;
    const recencyBoost = daysSinceAccess < 7 ? 2 : daysSinceAccess < 30 ? 1 : 0;

    // Importance contributes as a multiplier
    const importanceBoost = 1 + (doc.memory.importance || 0) / 10;

    return {
      memory: doc.memory,
      score: score * importanceBoost + recencyBoost,
    };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.memory);
}

function tokenize(text) {
  const cleaned = text.toLowerCase().replace(/[^一-鿿\w]/g, ' ').trim();
  const tokens = [];

  // CJK bigram tokenization
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

  // Add whitespace-separated words and single meaningful chars
  const words = cleaned.split(/\s+/).filter(w => w.length >= 1);
  for (const w of words) {
    if (!/[一-鿿]/.test(w) && w.length >= 2) {
      tokens.push(w);
    }
  }

  return tokens;
}

export function exportMemories() {
  return JSON.stringify(loadMemories(), null, 2);
}

export function importMemories(data) {
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      saveMemories(parsed);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}
