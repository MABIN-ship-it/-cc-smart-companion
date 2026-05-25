/**
 * GitHub Search — uses the public GitHub REST API.
 * No authentication required for basic search (60 req/hour unauthenticated).
 */

export async function searchGitHub(query, sort = 'stars', maxResults = 5) {
  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&order=desc&per_page=${maxResults}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CC-App' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      // If rate-limited, try the web search fallback
      if (res.status === 403) {
        return await githubWebFallback(query, maxResults);
      }
      return [];
    }

    const data = await res.json();
    return (data.items || []).map(repo => ({
      fullName: repo.full_name,
      description: repo.description || '',
      url: repo.html_url,
      stars: repo.stargazers_count,
      language: repo.language || '',
      topics: repo.topics || [],
      updatedAt: repo.updated_at,
    }));
  } catch {
    return await githubWebFallback(query, maxResults);
  }
}

async function githubWebFallback(query, maxResults) {
  try {
    const url = `https://github.com/search?q=${encodeURIComponent(query)}&type=repositories&s=stars&o=desc`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];

    const html = await res.text();
    const results = [];
    const repoRegex = /<a[^>]*data-testid="results-list-repo-link"[^>]*href="(\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = repoRegex.exec(html)) && results.length < maxResults) {
      const fullName = match[1].replace(/^\//, '').trim();
      const name = fullName;
      results.push({
        fullName: name,
        description: '',
        url: `https://github.com/${name}`,
        stars: 0,
        language: '',
        topics: [],
        updatedAt: '',
      });
    }
    return results;
  } catch {
    return [];
  }
}
