/**
 * Web Search — Bing China primary (works in China), with fallbacks.
 * All engines have 6s timeout to avoid blocking.
 */

export async function webSearch(query, maxResults = 5) {
  // 1. Bing China — works behind GFW
  try {
    const results = await searchBingCN(query, maxResults);
    if (results.length > 0) return results;
  } catch { /* fallback */ }

  // 2. DuckDuckGo HTML
  try {
    const results = await searchDDG(query, maxResults);
    if (results.length > 0) return results;
  } catch { /* fallback */ }

  // 3. DuckDuckGo Lite
  try {
    const results = await searchDDGLite(query, maxResults);
    if (results.length > 0) return results;
  } catch { /* fallback */ }

  return [];
}

async function searchBingCN(query, max) {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${max}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(6000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  if (!res.ok) return [];
  const html = await res.text();
  const results = [];
  // Bing result: <li class="b_algo"> with <h2><a href="...">title</a></h2> and <p>snippet</p>
  const blockRegex = /<li class="b_algo"[^>]*>[\s\S]*?<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = blockRegex.exec(html)) && results.length < max) {
    const title = stripHtml(match[2]);
    const url = match[1];
    const snippet = stripHtml(match[3]).slice(0, 200);
    if (title && url) results.push({ title, snippet, url });
  }
  return results;
}

async function searchDDG(query, max) {
  const formBody = new URLSearchParams({ q: query, kl: 'cn-zh' });
  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const results = [];
  const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = resultRegex.exec(html)) && results.length < max) {
    const url = cleanUrl(match[1]);
    const title = stripHtml(match[2]);
    const snippet = stripHtml(match[3]);
    if (title && url && !url.includes('duckduckgo.com')) {
      results.push({ title, snippet, url });
    }
  }
  return results;
}

async function searchDDGLite(query, max) {
  const liteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const res = await fetch(liteUrl, {
    signal: AbortSignal.timeout(6000),
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) return [];
  const html = await res.text();
  const results = [];
  const linkRegex = /<a\s+(?:[^>]*?\s+)?href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) && results.length < max) {
    const url = cleanUrl(decodeURIComponent(match[1]));
    const title = stripHtml(match[2]);
    if (title && url && !url.includes('duckduckgo.com') && !url.includes('duck.com')) {
      results.push({ title, snippet: '', url });
    }
  }
  return results;
}

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').trim();
}

function cleanUrl(url) {
  const uddgMatch = url.match(/uddg=([^&]+)/);
  if (uddgMatch) return decodeURIComponent(uddgMatch[1]);
  return url.replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '').trim();
}
