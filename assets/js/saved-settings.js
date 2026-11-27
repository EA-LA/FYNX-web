/* FYNX saved settings: keeps on-device settings in the signed-in user's FYNX account (preferences/default →
 * savedSettings) through the existing account sync (fynxAccountSync, verified Firebase UID on the server).
 * Rules live in saved-settings-core.js. This file only wires them to the browser and the account:
 *   start-up: apply the account copy (it wins over start-up defaults), then upload this device's settings the
 *   account does not have yet (one-time migration of settings saved before account saving existed);
 *   while open: detect changes (any script, any tab), upload them after a short pause; apply other devices'
 *   changes as the account refreshes (focus, reconnect, timer), and tell the page which keys changed.
 * Guests keep everything on the device, as before. Another account signing in on the same browser never
 * inherits or uploads the previous person's settings. */
import './saved-settings-core.js?v=20261127-sync-1';
import {sync, subscribe, connected, stableID} from './account-sync.js?v=20261115-intelligence-1';

const C = globalThis.FynxSavedSettingsCore;
const LS = (() => { try { return window.localStorage; } catch { return null; } })();
const now = () => Date.now();
const state = {uid: null, owner: null, restored: false, prev: {}, timer: 0, busy: false, lastUpload: 0, skipped: [], status: 'idle', error: '', revision: -1};
const readMeta = () => C.readMeta(LS.getItem(C.META_KEY));
const writeMeta = m => { try { LS.setItem(C.META_KEY, JSON.stringify(m)); } catch {} };
const emit = (keys, reason) => { if (keys.length) window.dispatchEvent(new CustomEvent('fynx:saved-settings', {detail: {keys, reason}})); };
const status = (s, error = '') => { state.status = s; state.error = error; window.dispatchEvent(new CustomEvent('fynx:saved-settings-status', {detail: {status: s, error, skipped: state.skipped}})); };

// Write account values onto the device without them being mistaken for local edits.
function applyLocal(apply) {
  const keys = Object.keys(apply);
  for (const k of keys) { try { if (apply[k] === null) LS.removeItem(k); else LS.setItem(k, apply[k]); } catch {} }
  state.prev = C.snapshot(LS);
  return keys;
}
// Changes made by this page, other tabs or any script since the last look.
function scan() {
  if (!LS) return [];
  const next = C.snapshot(LS), meta = readMeta();
  // Start-up window: the first 15 s of the page while the account copy has not arrived yet.
  const changed = C.detect(state.prev, next, meta, now(), {startup: !state.restored && performance.now() < 15000});
  state.prev = next;
  if (changed.length) { writeMeta(meta); if (state.restored) schedule(); }
  return changed;
}
const remoteRecord = () => sync.record('preferences', 'default');
const remote = () => C.remoteKeys(remoteRecord()?.data);

// Another account on this browser: put the previous account's device copy aside (it is in their account) and
// start clean, so nothing of theirs is shown to or uploaded into this account.
function adopt(owner) {
  const meta = readMeta();
  if (meta.owner && meta.owner !== owner) {
    const keep = C.snapshot(LS);
    try { LS.setItem('fynx.saved-settings.stash.' + meta.owner.slice(0, 16), JSON.stringify({at: now(), keys: keep})); } catch {}
    for (const k of Object.keys(keep)) { try { LS.removeItem(k); } catch {} }
    const fresh = C.emptyMeta(); fresh.owner = owner; writeMeta(fresh);
    state.prev = C.snapshot(LS);
    emit(Object.keys(keep), 'account-switch');
    return;
  }
  if (meta.owner !== owner) { meta.owner = owner; writeMeta(meta); }
}

function reconcileNow(reason) {
  if (!state.uid || !sync.ready || sync.uid !== state.uid) return;
  scan();
  const meta = readMeta(), firstSync = !state.restored;
  const {apply, upload, backup} = C.reconcile({local: C.snapshot(LS), meta, remote: remote(), firstSync});
  if (Object.keys(backup).length) {
    try { const old = JSON.parse(LS.getItem(C.BACKUP_KEY) || 'null') || {}; LS.setItem(C.BACKUP_KEY, JSON.stringify({at: now(), keys: {...(old.keys || {}), ...backup}})); } catch {}
  }
  // An open Terminal keeps its current desk and markets; only layouts and preferences follow live.
  if (!firstSync) for (const k of Object.keys(apply)) if (C.VIEW_KEYS.has(k)) { delete apply[k]; }
  writeMeta(meta);
  const changed = applyLocal(apply);
  state.restored = true;
  emit(changed, firstSync ? 'restore' : reason);
  if (firstSync) window.dispatchEvent(new CustomEvent('fynx:saved-settings-ready', {detail: {keys: changed, backup: Object.keys(backup)}}));
  if (Object.keys(upload).length) pending = {...pending, ...upload};
  if (Object.keys(pending).length) schedule(firstSync ? 300 : 2000);
  else status('synced');
}

let pending = {};
function schedule(delay = 2000) {
  clearTimeout(state.timer);
  const wait = Math.max(delay, 8000 - (now() - state.lastUpload));   // at most one account write every 8 s
  state.timer = setTimeout(flush, wait);
}
async function flush() {
  if (state.busy || !state.uid || !sync.ready) return;
  // Everything dirty on this device, not only what this tab saw change.
  const meta = readMeta(), local = C.snapshot(LS), r = remote();
  for (const [k, t] of Object.entries(meta.t)) if (t > (meta.up[k] || 0) && !meta.prov[k] && C.synced(k)) {
    if (r[k] && r[k].t >= t) continue;                                   // the account already has newer
    pending[k] = {v: Object.prototype.hasOwnProperty.call(local, k) ? local[k] : null, t};
  }
  const {ok, skipped} = C.budget(pending, r);
  state.skipped = skipped;
  if (!Object.keys(ok).length) { pending = {}; status(skipped.length ? 'partial' : 'synced'); return; }
  if (sync.conflicts.some(c => c.domain === 'preferences' && c.id === 'default')) await settleConflict();
  if (sync.conflicts.length || sync.status === 'recovery') { status('waiting', 'Saving is paused until your account sync is resolved.'); return; }
  state.busy = true; state.lastUpload = now(); status('saving');
  try {
    await sync.save('preferences', 'default', C.payload(ok));
    const m = readMeta(); C.confirm(m, ok); writeMeta(m);
    for (const k of Object.keys(ok)) if (pending[k] === ok[k]) delete pending[k];
    status(skipped.length ? 'partial' : 'synced');
  } catch (error) {
    // Kept on the device (and in the account outbox when offline); retried on the next change, focus or timer.
    status(sync.conflicts.length ? 'conflict' : 'pending', error?.message || 'Not saved to your account yet.');
    if (sync.conflicts.some(c => c.domain === 'preferences' && c.id === 'default')) { await settleConflict(); schedule(1500); }
    else schedule(30000);
  } finally { state.busy = false; }
}
// Another device saved preferences first. Settings carry their own times, so take the account's record and
// re-apply only this device's newer settings; anything else in the record (Research Desk, reader) is kept as the
// user changed it, exactly as the account's own "keep mine" would.
async function settleConflict() {
  const mine = sync.pending.filter(m => m.domain === 'preferences' && m.id === 'default');
  const onlySettings = mine.every(m => m.data && Object.keys(m.data).every(f => f === C.FIELD));
  try { await sync.resolveConflict('preferences', 'default', !onlySettings); } catch {}
  reconcileNow('conflict');
}

async function start() {
  if (!LS || !C) return;
  state.prev = C.snapshot(LS);
  // Watch for changes from this page (any script) and from other tabs.
  setInterval(scan, 1500);
  window.addEventListener('storage', e => { if (!e.key || C.synced(e.key)) scan(); });
  document.addEventListener('visibilitychange', () => { scan(); if (document.hidden && Object.keys(pending).length) flush(); });
  window.addEventListener('pagehide', () => { scan(); });
  await connected;
  subscribe(async s => {
    const uid = s.uid || null;
    if (uid !== state.uid) {
      state.uid = uid; state.restored = false; state.revision = -1; pending = {};
      if (!uid) { status('guest'); return; }
      state.owner = await stableID(uid);
      if (state.uid !== uid) return;
      try { LS.setItem(C.OWNER_KEY, state.owner); } catch {}
      adopt(state.owner);
    }
    if (!uid || !s.ready || s.uid !== state.uid) return;
    const rev = remoteRecord()?.revision ?? 0;
    if (!state.restored || rev !== state.revision) { state.revision = rev; reconcileNow('remote'); }
  });
}

// Public surface for pages (Terminal) and tests.
window.FynxSavedSettings = {
  get state() { return {status: state.status, error: state.error, restored: state.restored, skipped: [...state.skipped], signedIn: !!state.uid}; },
  flush: () => { scan(); return flush(); },
  refresh: () => sync.refresh(),
  backup() { try { return JSON.parse(LS.getItem(C.BACKUP_KEY) || 'null'); } catch { return null; } },
  // Use this device's previous values (kept when the account's copy replaced them) everywhere.
  restoreBackup(keys) {
    const b = this.backup(); if (!b?.keys) return [];
    const meta = readMeta(), t = now(), chosen = (keys || Object.keys(b.keys)).filter(k => k in b.keys && C.synced(k));
    for (const k of chosen) { try { LS.setItem(k, b.keys[k]); } catch {} meta.t[k] = t; meta.h[k] = C.hash(b.keys[k]); delete meta.prov[k]; }
    writeMeta(meta); state.prev = C.snapshot(LS);
    const rest = {...b.keys}; for (const k of chosen) delete rest[k];
    try { if (Object.keys(rest).length) LS.setItem(C.BACKUP_KEY, JSON.stringify({at: b.at, keys: rest})); else LS.removeItem(C.BACKUP_KEY); } catch {}
    emit(chosen, 'backup'); schedule(300); return chosen;
  },
  dismissBackup() { try { LS.removeItem(C.BACKUP_KEY); } catch {} }
};
start();
