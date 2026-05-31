/**
 * User interactions — favorites, feedback, reports.
 * Each stored in localStorage under its own key.
 */

/* ---------- Favorites ---------- */
const FAV_KEY = 'cc_favorites';

export function getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; }
}

export function addFavorite(msg) {
  const favs = getFavorites();
  favs.push({
    id: 'fav_' + Date.now(),
    messageContent: msg.content,
    title: (msg.content || '').slice(0, 40),
    savedAt: Date.now(),
  });
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch {}
  return favs;
}

export function removeFavorite(id) {
  const favs = getFavorites().filter(f => f.id !== id);
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch {}
}

/* ---------- Feedback ---------- */
const FB_KEY = 'cc_feedback';

export function getFeedback() {
  try { return JSON.parse(localStorage.getItem(FB_KEY)) || []; } catch { return []; }
}

export function addFeedback(msg, note) {
  const fb = getFeedback();
  fb.push({
    id: 'fb_' + Date.now(),
    messageContent: (msg.content || '').slice(0, 200),
    note,
    createdAt: Date.now(),
  });
  try { localStorage.setItem(FB_KEY, JSON.stringify(fb)); } catch {}
}

/* ---------- Reports ---------- */
const RPT_KEY = 'cc_reports';

export function getReports() {
  try { return JSON.parse(localStorage.getItem(RPT_KEY)) || []; } catch { return []; }
}

export function addReport(msg, reason) {
  const rpts = getReports();
  rpts.push({
    id: 'rpt_' + Date.now(),
    messageContent: (msg.content || '').slice(0, 200),
    reason,
    createdAt: Date.now(),
  });
  try { localStorage.setItem(RPT_KEY, JSON.stringify(rpts)); } catch {}
}
