/* Run before page-specific scripts so the first render uses the saved theme. */
(() => {
  window.FynxPreferences = {
    getItem(key) { try { return localStorage.getItem(key); } catch { return null; } },
    setItem(key, value) { try { localStorage.setItem(key, value); } catch {} }
  };
  // Legacy controls remain inert for scripts that retain references to their IDs.
  const policy = document.createElement('style');
  policy.textContent = `:is([data-journal-theme],[data-fynx-theme-toggle],#themeToggle,#themeBtn,#theme-toggle,.theme-toggle,.theme-btn,.fynx-network-theme,.fynx-theme-toggle,[data-theme-control]):not(.profile-appearance-control):not(#appearance-theme):not([data-profile-appearance]):not(.appearance-theme):not(#appearance){display:none!important}`;
  document.head.appendChild(policy);
  // Capture early failures while the reporting script is still loading. Keep
  // only operation identifiers and codes, never exception messages or inputs.
  window.FynxMonitor ||= {
    report(category, operation, error) {
      const queue = window.__fynxMonitorQueue ||= [];
      if (queue.length < 12) queue.push([category, operation, {code: typeof error?.code === 'string' ? error.code : error?.name === 'TimeoutError' ? 'timeout' : error?.name === 'TypeError' ? 'network' : 'unknown'}]);
    },
    async track(category, operation, action) {
      try { return await action(); } catch (error) { window.FynxMonitor.report(category, operation, error); throw error; }
    }
  };
  const monitor = document.createElement('script');
  monitor.src = '/assets/js/monitoring.js?v=20261127-source-1';
  monitor.defer = true;
  document.head.appendChild(monitor);
  // Saved settings follow the FYNX account (saved-settings.js). Before this page reads any setting, apply the
  // account's copy cached on this device, so the first render already matches the user's other devices.
  // Rules: a value from the account is applied when it is newer than what this device last confirmed and this
  // device has no newer unsaved change of its own. Nothing is uploaded here.
  let signedInHint = false;
  try {
    const owner = localStorage.getItem('fynx.saved-settings.owner');
    signedInHint = !!owner || !!localStorage.getItem('fynx_auth_email');
    const cache = owner && JSON.parse(localStorage.getItem('fynx.account.sync.v1.' + owner) || 'null');
    if (cache && Array.isArray(cache.rows)) {
      const row = cache.rows.find(r => r && r.domain === 'preferences' && r.id === 'default' && !r.deleted);
      const keys = Object.assign({}, row?.data?.savedSettings?.keys);
      for (const m of cache.pending || []) if (m && m.domain === 'preferences' && m.id === 'default' && m.data?.savedSettings?.keys) Object.assign(keys, m.data.savedSettings.keys);
      const meta = JSON.parse(localStorage.getItem('fynx.saved-settings.meta') || 'null');
      if (meta && meta.v === 1 && meta.owner === owner && meta.t && meta.up && meta.h) {
        const hash = value => { if (value === null || value === undefined) return 'x'; let h = 0x811c9dc5; const s = String(value); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36) + ':' + s.length; };
        let changed = false;
        for (const [k, r] of Object.entries(keys)) {
          if (!r || !Number.isFinite(r.t) || (r.v !== null && typeof r.v !== 'string') || k.length > 120) continue;
          if (!/^(fx-term-|fynx_progress_|fynx_quiz_|fynx_saved_)|^(fynx_theme|fynx-cal-filters|fynx:cot:saved-contract-codes:v1|fynx-edge-focus|fynx_sidebar_collapsed|fynx\.welcome\.seen|fynx_study_mode|fynx_intel_saved_v1|fynx_calendar_alerts|fynx\.saved-resources\.v1|fynx\.recent-resources\.v1|fynx_news_edition_v1|fynx-map-mode)$/.test(k) || /^fx-term-builder-(v1|tour):/.test(k)) continue;
          const known = meta.up[k] || 0, dirty = (meta.t[k] || 0) > known && !(meta.prov || {})[k];
          if (r.t <= known || dirty) continue;
          if (localStorage.getItem(k) !== r.v) { if (r.v === null) localStorage.removeItem(k); else localStorage.setItem(k, r.v); }
          meta.t[k] = r.t; meta.up[k] = r.t; meta.h[k] = hash(r.v); changed = true;
        }
        if (changed) localStorage.setItem('fynx.saved-settings.meta', JSON.stringify(meta));
      }
    }
  } catch {}
  // Keep this device's settings and the account in step (signed-in users; guests stay device-only).
  if (signedInHint && !document.querySelector('script[type="module"][src*="saved-settings"]')) {
    const load = () => { const s = document.createElement('script'); s.type = 'module'; s.src = '/assets/js/saved-settings.js?v=20261127-sync-1'; document.head.appendChild(s); };
    if (document.readyState === 'complete') setTimeout(load, 0); else window.addEventListener('load', () => (window.requestIdleCallback || setTimeout)(load), {once: true});
  }
  let theme = 'light';
  try {
    const saved = localStorage.getItem('fynx_theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch {}
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = theme === 'light' ? '#ffffff' : '#0b0c0c';
})();
