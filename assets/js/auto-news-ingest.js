/* Automatic news notification ingestion for authenticated users.
 * Uses the existing ingestNewsNotifications(uid, items) from account-system.
 * Does not create a second system. Respects preferences and deduplication via the engine.
 */
(function () {
  'use strict';
  if (window.__fynxAutoNewsIngest) return;
  window.__fynxAutoNewsIngest = true;

  const INTERVAL_MS = 3 * 60 * 1000;
  const MAX_AGE_MS = 15 * 60 * 1000; // treat cached payload older than 15 min as stale
  let timer = null;
  let lastAttempt = 0;

  function log(msg, err) {
    try {
      if (window.FynxMonitor && window.FynxMonitor.report) {
        window.FynxMonitor.report('notification', 'auto-ingest', err || new Error(msg));
      }
      if (location.search.includes('debug=1') || window.__fynxDebug) {
        console.info('[FYNX auto-ingest]', msg, err || '');
      }
    } catch (_) {}
  }

  function isFresh(payload) {
    if (!payload || !Array.isArray(payload.items) || !payload.items.length) return false;
    const ts = payload.fetchedAt || payload.timestamp || payload.updatedAt;
    if (!ts) return true; // no timestamp: accept but prefer refresh later
    const age = Date.now() - new Date(ts).getTime();
    return Number.isFinite(age) && age < MAX_AGE_MS;
  }

  async function loadItems() {
    // 1. Fresh localStorage payload written by the news feed
    try {
      const raw = localStorage.getItem('fynx_news_latest_payload');
      if (raw) {
        const payload = JSON.parse(raw);
        if (isFresh(payload)) return payload.items;
        log('cached news payload stale or missing timestamp');
      }
    } catch (e) {
      log('localStorage payload parse failed', e);
    }

    // 2. Try known client-side news endpoints that the site already uses
    const candidates = [
      '/assets/data/news-latest.json',
      '/api/news/latest',
      '/news/latest.json'
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
        if (!res.ok) continue;
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : null;
        if (items && items.length) {
          log('fetched fresh news from ' + url);
          return items;
        }
      } catch (_) {
        // endpoint optional
      }
    }
    return [];
  }

  async function tryIngest() {
    const now = Date.now();
    if (now - lastAttempt < 30000) return;
    lastAttempt = now;
    if (!window.FynxIdentity || !window.FynxIdentity.uid || document.hidden) return;

    try {
      const items = await loadItems();
      if (!items.length) return;

      const mod = await import('/assets/js/account-system.js?v=20261125-header-fix');
      if (mod && typeof mod.ingestNewsNotifications === 'function') {
        const result = await mod.ingestNewsNotifications(window.FynxIdentity.uid, items);
        if (result && result.created > 0) log('ingested ' + result.created + ' news notifications');
      } else {
        log('ingestNewsNotifications not available');
      }
    } catch (err) {
      log('ingestion failed', err);
    }
  }

  function start() {
    if (timer) return;
    tryIngest();
    timer = setInterval(tryIngest, INTERVAL_MS);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function onVisible() {
    if (!document.hidden) {
      if (!timer) start();
      else tryIngest();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onVisible);
  window.addEventListener('pagehide', stop);
})();
