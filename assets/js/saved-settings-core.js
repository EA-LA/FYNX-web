/* FYNX saved settings: the rules that keep a user's on-device settings (Terminal layouts, desks, panel choices,
 * theme, filters, alerts, progress…) in their FYNX account, so every device and browser shows the same setup.
 *
 * Storage model. The account record preferences/default holds {savedSettings: {v: 1, keys: {<key>: {v, t}}}}:
 * v is the exact localStorage string (null = removed) and t the time the user made that change. The account
 * record is the source of truth; localStorage is the device cache. Per-key last-writer-wins on t, so two devices
 * editing different settings never overwrite each other, and an older device can never replace a newer change.
 *
 * Device metadata (localStorage 'fynx.saved-settings.meta') tracks, per key: t = when this device's value was set,
 * up = the newest time this device has confirmed with the account, h = hash of the value this device last saw.
 * A key is "dirty" (a local change the account has not seen) when t > up.
 *
 * Pure functions only: no DOM, no network. Used by saved-settings.js (account glue) and by the unit tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxSavedSettingsCore = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const FIELD = 'savedSettings';
  const META_KEY = 'fynx.saved-settings.meta';
  const OWNER_KEY = 'fynx.saved-settings.owner';
  const BACKUP_KEY = 'fynx.saved-settings.backup';
  const MIGRATION_T = 1;            // settings that existed before account saving: older than any real change
  const MAX_VALUE = 20000;          // one setting (characters); larger values stay on the device
  const MAX_TOTAL = 80000;          // all saved settings together, well inside the 128 KB account record

  // Which device keys belong to the account. Everything else (caches, sign-in hints, per-device prompts) stays local.
  const EXACT = new Set([
    'fynx_theme', 'fynx-cal-filters', 'fynx:cot:saved-contract-codes:v1', 'fynx-edge-focus', 'fynx_sidebar_collapsed',
    'fynx.welcome.seen', 'fynx_study_mode', 'fynx_intel_saved_v1', 'fynx_calendar_alerts', 'fynx.saved-resources.v1',
    'fynx.recent-resources.v1', 'fynx_news_edition_v1', 'fynx-map-mode'
  ]);
  const PREFIXES = ['fx-term-', 'fynx_progress_', 'fynx_quiz_', 'fynx_saved_'];
  // Terminal keys that are not user settings: Build-your-own keeps its own account copy; tour seen-flags are per user id.
  const EXCLUDE = [/^fx-term-builder-v1:/, /^fx-term-builder-tour:/];
  // Where you are in the Terminal (desk, focused or compared markets): restored when a device opens the Terminal,
  // never pushed live into a Terminal that is already open on another device.
  const VIEW_KEYS = new Set(['fx-term-desk', 'fx-term-sym', 'fx-term-cmp', 'fx-term-last-sym', 'fx-term-last-cmp']);

  function synced(key) {
    if (typeof key !== 'string' || !key || key.length > 120) return false;
    if (EXACT.has(key)) return true;
    if (!PREFIXES.some(p => key.startsWith(p))) return false;
    return !EXCLUDE.some(re => re.test(key));
  }
  // FNV-1a: cheap identity for "is this the value I already know", not security.
  function hash(value) {
    if (value === null || value === undefined) return 'x';
    let h = 0x811c9dc5; const s = String(value);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36) + ':' + s.length;
  }
  function emptyMeta() { return {v: 1, owner: null, t: {}, up: {}, h: {}, prov: {}}; }
  function readMeta(raw) {
    try { const m = JSON.parse(raw || 'null'); if (m && m.v === 1 && m.t && m.up && m.h) return {...emptyMeta(), ...m, prov: m.prov || {}}; } catch {}
    return emptyMeta();
  }
  // All synced keys currently on the device.
  function snapshot(storage) {
    const out = {};
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (synced(k)) { const v = storage.getItem(k); if (v !== null) out[k] = v; } }
    return out;
  }
  // The account's copy, read from the account record data (preferences/default).
  function remoteKeys(prefs) {
    const keys = prefs && prefs[FIELD] && prefs[FIELD].keys;
    const out = {};
    if (!keys || typeof keys !== 'object') return out;
    for (const [k, r] of Object.entries(keys)) {
      if (!synced(k) || !r || typeof r !== 'object' || !Number.isFinite(r.t)) continue;
      if (r.v !== null && typeof r.v !== 'string') continue;
      out[k] = {v: r.v, t: r.t};
    }
    return out;
  }

  // Record local changes since the previous snapshot. Changes during page start-up, before the account copy has
  // arrived, are provisional: they are start-up writes (a desk chosen by default, a cleared selection) and must not
  // beat the account's copy. Later changes are the user's, even while offline, and always count.
  function detect(prev, next, meta, now, {startup = false} = {}) {
    const changed = [];
    for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) {
      const a = prev[k], b = next[k];
      if (a === b) continue;
      const h = hash(b === undefined ? null : b);
      if (meta.h[k] === h) continue;              // already known: another tab recorded it, or the account applied it
      meta.t[k] = Math.max(now, (meta.t[k] || 0) + 1);
      meta.h[k] = h;
      if (startup) meta.prov[k] = 1; else delete meta.prov[k];
      changed.push(k);
    }
    return changed;
  }

  /* Combine the device and the account. Returns what to write on the device (apply: key → value or null to remove),
   * what to send to the account (upload: key → {v, t}), and keys whose device value was replaced on this device's
   * first sync (backup: key → old value) so a migration never silently destroys a customised device. */
  function reconcile({local, meta, remote, firstSync = false}) {
    const apply = {}, upload = {}, backup = {};
    for (const k of new Set([...Object.keys(local).filter(synced), ...Object.keys(remote)])) {
      const r = remote[k], lv = Object.prototype.hasOwnProperty.call(local, k) ? local[k] : null;
      const lt = meta.t[k] || 0, known = meta.up[k] || 0, prov = !!meta.prov[k];
      const dirty = lt > known && !prov;
      if (r) {
        if (dirty && lt > r.t) { if (lv !== r.v) upload[k] = {v: lv, t: lt}; else { meta.up[k] = lt; } continue; }
        // The account is newer (or this device has nothing new): the account's value wins.
        if (lv !== r.v) {
          if (firstSync && lv !== null && !known && !(lt > 0 && !prov)) backup[k] = lv;
          apply[k] = r.v;
        }
        meta.t[k] = r.t; meta.up[k] = r.t; meta.h[k] = hash(r.v); delete meta.prov[k];
      } else if (lv !== null || dirty) {
        // Not in the account yet: a new setting, or one that existed on this device before account saving.
        const t = lt || MIGRATION_T;
        upload[k] = {v: lv, t};
        meta.t[k] = t; meta.h[k] = hash(lv); delete meta.prov[k];
      }
    }
    return {apply, upload, backup};
  }

  // Keep the upload inside the account record's size budget. Oversized settings stay on this device only.
  function budget(upload, remote) {
    const size = (k, r) => k.length + (r.v ? r.v.length : 0) + 24;
    let total = 0; for (const [k, r] of Object.entries(remote)) if (!upload[k]) total += size(k, r);
    const ok = {}, skipped = [];
    for (const [k, r] of Object.entries(upload).sort((a, b) => (a[1].v || '').length - (b[1].v || '').length)) {
      const s = size(k, r);
      if ((r.v && r.v.length > MAX_VALUE) || total + s > MAX_TOTAL) { skipped.push(k); continue; }
      ok[k] = r; total += s;
    }
    return {ok, skipped};
  }
  // Mark an upload as confirmed by the account.
  function confirm(meta, sent) { for (const [k, r] of Object.entries(sent)) if ((meta.up[k] || 0) < r.t) meta.up[k] = r.t; }
  const payload = keys => ({[FIELD]: {v: 1, keys}});

  return {FIELD, META_KEY, OWNER_KEY, BACKUP_KEY, MIGRATION_T, MAX_VALUE, MAX_TOTAL, VIEW_KEYS,
    synced, hash, emptyMeta, readMeta, snapshot, remoteKeys, detect, reconcile, budget, confirm, payload};
});
