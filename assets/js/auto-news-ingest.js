/* Automatic news notification ingestion for authenticated users.
 * Uses the existing ingestNewsNotifications(uid, items) from account-system.
 * Real news source: the same market-feed endpoint used by market-intelligence-data.js.
 * Does not create a second system. Respects preferences and deduplication via the engine.
 */
(function () {
  'use strict';
  if (window.__fynxAutoNewsIngest) return;
  window.__fynxAutoNewsIngest = true;

  const INTERVAL_MS = 3 * 60 * 1000;
  const MAX_AGE_MS = 15 * 60 * 1000;
  // Verified endpoint from assets/js/market-intelligence-data.js
  const ENDPOINT = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? '/api/market-feed'
    : 'https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketFeed';
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

  // Cached payload is usable only if it has a valid fetchedAt within MAX_AGE_MS.
  function isFresh(payload) {
    if (!payload || !Array.isArray(payload.items) || !payload.items.length) return false;
    const ts = payload.fetchedAt || payload.timestamp || payload.updatedAt;
    if (!ts) return false; // no timestamp = not fresh
    const age = Date.now() - new Date(ts).getTime();
    return Number.isFinite(age) && age >= 0 && age < MAX_AGE_MS;
  }

  async function loadItems() {
    // 1. Fresh cached payload (must have timestamp)
    try {
      const raw = localStorage.getItem('fynx_news_latest_payload');
      if (raw) {
        const payload = JSON.parse(raw);
        if (isFresh(payload)) return payload.items;
      }
    } catch (e) {
      log('localStorage payload parse failed', e);
    }

    // Also check the real market-intelligence cache keys used by the site
    try {
      const edition = (window.FynxEdition && window.FynxEdition.get && window.FynxEdition.get()) || 'us';
      const key = 'fynx_market_intelligence_v3_' + edition + '_all';
      const raw = localStorage.getItem(key);
      if (raw) {
        const payload = JSON.parse(raw);
        if (isFresh(payload)) return payload.items;
      }
    } catch (_) {}

    // 2. Fetch fresh from the verified market-feed endpoint
    try {
      const edition = (window.FynxEdition && window.FynxEdition.get && window.FynxEdition.get()) || 'us';
      const url = ENDPOINT + '?' + new URLSearchParams({ edition, category: 'all' });
      const res = await fetch(url, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!res.ok) {
        log('market-feed returned ' + res.status);
        return [];
      }
      const data = await res.json();
      if (!data || !data.fetchedAt || !Array.isArray(data.items)) {
        log('market-feed response missing fetchedAt or items');
        return [];
      }
      const age = Date.now() - new Date(data.fetchedAt).getTime();
      if (!Number.isFinite(age) || age > MAX_AGE_MS) {
        log('market-feed response is stale');
        return [];
      }
      log('fetched fresh news from market-feed');
      return data.items;
    } catch (e) {
      log('market-feed fetch failed', e);
      return [];
    }
  }

  async function tryIngest() {
    const now = Date.now();
    if (now - lastAttempt < 30000) return;
    lastAttempt = now;
    if (!window.FynxIdentity || !window.FynxIdentity.uid || document.hidden) return;

    try {
      const items = await loadItems();
      if (!items.length) return;

      const mod = await import('/assets/js/account-system.js?v=20261127-terminal-alerts-1');
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
