'use strict';
/* Saved settings (account-wide device settings): rules, migration, conflicts, convergence and the early apply
 * step in site-theme-init.js. Run: node --test scripts/test-saved-settings.cjs */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const C = require('../assets/js/saved-settings-core.js');

class Mem { constructor(o = {}) { this.m = new Map(Object.entries(o)); } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } obj() { return Object.fromEntries(this.m); } }

test('only user settings are saved to the account; caches, sign-in hints and Build-your-own copies stay on the device', () => {
  for (const k of ['fx-term-layout-all', 'fx-term-layout-sym-stock', 'fx-term-desk', 'fx-term-dash-glob', 'fx-term-market-display', 'fx-term-committee', 'fynx_theme', 'fynx-cal-filters', 'fynx_progress_rsi', 'fynx_quiz_macd', 'fynx_saved_fed', 'fynx_calendar_alerts', 'fynx.welcome.seen'])
    assert.equal(C.synced(k), true, k);
  for (const k of ['fx-term-builder-v1:uid', 'fx-term-builder-tour:uid', 'fynx_auth_email', 'mode', 'fynx.account.sync.v1.abc', 'fynx.saved-settings.meta', 'fynx-plan-usage', 'fynx.download-dismissed-at', 'fynx-quant-workspace.json', 'x'.repeat(121)])
    assert.equal(C.synced(k), false, k);
});

test('the early step in site-theme-init.js uses exactly the same key rules', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets/js/site-theme-init.js'), 'utf8');
  const re = new RegExp(src.match(/if \(!(\/\^\(fx-term-[^\n]*?\$\/)\.test\(k\)/)[1].slice(1, -1));
  const sample = ['fx-term-layout-all', 'fx-term-builder-v1:u', 'fx-term-builder-tour:u', 'fynx_theme', 'fynx_theme2', 'fynx-cal-filters', 'fynx:cot:saved-contract-codes:v1', 'fynx-edge-focus', 'fynx_sidebar_collapsed', 'fynx.welcome.seen', 'fynxXwelcome.seen', 'fynx_study_mode', 'fynx_intel_saved_v1', 'fynx_calendar_alerts', 'fynx.saved-resources.v1', 'fynx.recent-resources.v1', 'fynx_news_edition_v1', 'fynx-map-mode', 'fynx_progress_a', 'fynx_quiz_b', 'fynx_saved_c', 'mode', 'fynx_auth_email'];
  for (const k of sample) assert.equal(re.test(k) && !/^fx-term-builder-(v1|tour):/.test(k), C.synced(k), k);
});

test('a brand-new device gets the whole account setup and uploads nothing', () => {
  const meta = C.emptyMeta(), remote = {'fx-term-layout-all': {v: '["mkts","focus"]', t: 500}, 'fynx_theme': {v: 'dark', t: 400}};
  const r = C.reconcile({local: {}, meta, remote, firstSync: true});
  assert.deepEqual(r.apply, {'fx-term-layout-all': '["mkts","focus"]', 'fynx_theme': 'dark'});
  assert.deepEqual(r.upload, {}); assert.deepEqual(r.backup, {});
  assert.equal(meta.up['fx-term-layout-all'], 500);
});

test('settings saved before account saving existed are uploaded once (migration) and never beat a real change', () => {
  const meta = C.emptyMeta();
  const r = C.reconcile({local: {'fx-term-layout-all': '["heat"]'}, meta, remote: {}, firstSync: true});
  assert.deepEqual(r.upload, {'fx-term-layout-all': {v: '["heat"]', t: C.MIGRATION_T}});
  // Another device's later real edit (t = now) wins over the migrated copy everywhere.
  const r2 = C.reconcile({local: {'fx-term-layout-all': '["heat"]'}, meta, remote: {'fx-term-layout-all': {v: '["top"]', t: 9e12}}});
  assert.deepEqual(r2.apply, {'fx-term-layout-all': '["top"]'}); assert.deepEqual(r2.upload, {});
});

test('two devices with different old layouts: the account copy is shown and this device’s version is kept as a backup', () => {
  const meta = C.emptyMeta();
  const r = C.reconcile({local: {'fx-term-layout-all': '["mine"]'}, meta, remote: {'fx-term-layout-all': {v: '["account"]', t: C.MIGRATION_T}}, firstSync: true});
  assert.deepEqual(r.apply, {'fx-term-layout-all': '["account"]'});
  assert.deepEqual(r.backup, {'fx-term-layout-all': '["mine"]'}, 'nothing is silently destroyed');
});

test('an older device can never overwrite a newer change; a newer local change is uploaded', () => {
  const meta = C.emptyMeta(); meta.t.k = 100; meta.up.k = 50; meta.h.k = C.hash('old');
  const older = C.reconcile({local: {'fx-term-k': 'x'}, meta: {...C.emptyMeta(), t: {'fx-term-k': 100}, up: {'fx-term-k': 50}, h: {}}, remote: {'fx-term-k': {v: 'newer', t: 200}}});
  assert.deepEqual(older.apply, {'fx-term-k': 'newer'}); assert.deepEqual(older.upload, {});
  const newer = C.reconcile({local: {'fx-term-k': 'x'}, meta: {...C.emptyMeta(), t: {'fx-term-k': 300}, up: {'fx-term-k': 50}, h: {}}, remote: {'fx-term-k': {v: 'remote', t: 200}}});
  assert.deepEqual(newer.upload, {'fx-term-k': {v: 'x', t: 300}}); assert.deepEqual(newer.apply, {});
});

test('start-up writes before the account loads (default desk, cleared selection) never overwrite the account', () => {
  const meta = C.emptyMeta(), prev = {}, next = {'fx-term-desk': 'all'};
  C.detect(prev, next, meta, 1000, {startup: true});
  assert.equal(meta.prov['fx-term-desk'], 1);
  const r = C.reconcile({local: next, meta, remote: {'fx-term-desk': {v: 'crypto', t: 500}}, firstSync: true});
  assert.deepEqual(r.apply, {'fx-term-desk': 'crypto'}, 'the account desk wins even though the default was written later');
  assert.deepEqual(r.upload, {});
});

test('a device that was offline for a whole session keeps its edits: they beat older account values on reconnect', () => {
  const meta = C.emptyMeta(); meta.t['fx-term-layout-all'] = 100; meta.up['fx-term-layout-all'] = 100;
  C.detect({'fx-term-layout-all': '["a"]'}, {'fx-term-layout-all': '["offline edit"]'}, meta, 5000, {startup: false});
  const r = C.reconcile({local: {'fx-term-layout-all': '["offline edit"]'}, meta, remote: {'fx-term-layout-all': {v: '["a"]', t: 100}}, firstSync: true});
  assert.deepEqual(r.upload, {'fx-term-layout-all': {v: '["offline edit"]', t: 5000}}); assert.deepEqual(r.apply, {});
});

test('values applied from the account or recorded by another tab are not treated as new edits (no sync loops)', () => {
  const meta = C.emptyMeta(); meta.h['fx-term-layout-all'] = C.hash('["a"]');
  assert.deepEqual(C.detect({'fx-term-layout-all': '["z"]'}, {'fx-term-layout-all': '["a"]'}, meta, 5000), []);
  assert.deepEqual(C.detect({'fx-term-layout-all': '["a"]'}, {'fx-term-layout-all': '["b"]'}, meta, 6000), ['fx-term-layout-all']);
});

test('removing a setting (layout reset) reaches the other devices', () => {
  const meta = C.emptyMeta(); meta.up['fx-term-layout-all'] = 10; meta.t['fx-term-layout-all'] = 10;
  C.detect({'fx-term-layout-all': '["a"]'}, {}, meta, 20);
  const r = C.reconcile({local: {}, meta, remote: {'fx-term-layout-all': {v: '["a"]', t: 10}}});
  assert.deepEqual(r.upload, {'fx-term-layout-all': {v: null, t: 20}});
  const other = C.reconcile({local: {'fx-term-layout-all': '["a"]'}, meta: {...C.emptyMeta(), t: {'fx-term-layout-all': 10}, up: {'fx-term-layout-all': 10}}, remote: {'fx-term-layout-all': {v: null, t: 20}}});
  assert.deepEqual(other.apply, {'fx-term-layout-all': null});
});

test('the account record stays inside its size budget; oversized settings stay on the device', () => {
  const big = 'x'.repeat(C.MAX_VALUE + 1);
  const {ok, skipped} = C.budget({'fx-term-a': {v: 'small', t: 1}, 'fx-term-b': {v: big, t: 1}}, {});
  assert.deepEqual(Object.keys(ok), ['fx-term-a']); assert.deepEqual(skipped, ['fx-term-b']);
  const many = {}; for (let i = 0; i < 10; i++) many['fx-term-k' + i] = {v: 'y'.repeat(C.MAX_VALUE - 100), t: 1};
  const r = C.budget(many, {}); const used = Object.values(r.ok).reduce((s, x) => s + x.v.length, 0);
  assert.ok(used <= C.MAX_TOTAL && r.skipped.length > 0);
});

test('two devices editing in any order converge to the newest value of every setting', () => {
  // Fake account: deep-merges like fynxAccountSync and keeps a revision (conflicts are retried by the client).
  let server = {}; const push = up => { for (const [k, r] of Object.entries(up)) server[k] = r; };
  const device = () => ({ls: new Mem(), meta: C.emptyMeta(), prev: {}, restored: false});
  const sync = (d, clock) => {
    const snap = C.snapshot(d.ls); C.detect(d.prev, snap, d.meta, clock);
    const r = C.reconcile({local: C.snapshot(d.ls), meta: d.meta, remote: {...server}, firstSync: !d.restored});
    for (const [k, v] of Object.entries(r.apply)) { if (v === null) d.ls.removeItem(k); else d.ls.setItem(k, v); }
    d.restored = true;
    const {ok} = C.budget(r.upload, server); push(ok); C.confirm(d.meta, ok); d.prev = C.snapshot(d.ls);
  };
  let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let round = 0; round < 200; round++) {
    server = {}; const A = device(), B = device(); let clock = 1000; const truth = {};
    A.ls.setItem('fx-term-layout-all', '["legacyA"]'); A.prev = C.snapshot(A.ls); // a customised desktop from before account saving (part of its start-up baseline)
    for (let step = 0; step < 30; step++) {
      clock += 1 + rnd(5);
      const d = rnd(2) ? A : B, k = 'fx-term-' + ['layout-all', 'layout-stocks', 'desk', 'dash-x'][rnd(4)], act = rnd(10);
      if (act < 5) { const v = 'v' + step; d.ls.setItem(k, v); truth[k] = v; sync(d, clock); }
      else if (act < 6) { d.ls.removeItem(k); truth[k] = null; sync(d, clock); }
      else sync(rnd(2) ? A : B, clock);
    }
    for (let i = 0; i < 3; i++) { clock += 2; sync(A, clock); sync(B, clock); }
    for (const k of new Set([...Object.keys(truth), 'fx-term-layout-all'])) assert.equal(A.ls.getItem(k), B.ls.getItem(k), `round ${round}: ${k} agrees`);
    for (const [k, v] of Object.entries(truth)) assert.equal(A.ls.getItem(k), v, `round ${round}: ${k} is the newest edit`);
  }
});

test('site-theme-init applies the account copy before the page reads its settings, never over an unsaved change', () => {
  const owner = 'abc123';
  const ls = new Mem({
    'fynx.saved-settings.owner': owner,
    ['fynx.account.sync.v1.' + owner]: JSON.stringify({version: 1, rows: [{domain: 'preferences', id: 'default', revision: 3, data: {savedSettings: {v: 1, keys: {
      'fx-term-layout-all': {v: '["acct"]', t: 900}, 'fynx_theme': {v: 'dark', t: 900}, 'fx-term-desk': {v: 'crypto', t: 900}, 'fynx_auth_email': {v: 'evil', t: 900}}}}}], pending: []}),
    'fynx.saved-settings.meta': JSON.stringify({v: 1, owner, t: {'fx-term-desk': 950}, up: {'fx-term-desk': 100}, h: {}, prov: {}}),
    'fx-term-desk': 'stocks', 'fx-term-layout-all': '["old"]'
  });
  const appended = [];
  const ctx = {localStorage: ls, window: {addEventListener() {}}, setTimeout, document: {readyState: 'loading', head: {appendChild: n => appended.push(n)}, createElement: () => ({style: {}, dataset: {}}), querySelector: () => null, documentElement: {dataset: {}, style: {}}}};
  ctx.window.requestIdleCallback = null;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js/site-theme-init.js'), 'utf8'), ctx);
  assert.equal(ls.getItem('fx-term-layout-all'), '["acct"]', 'newer account layout applied before the Terminal reads it');
  assert.equal(ls.getItem('fynx_theme'), 'dark');
  assert.equal(ctx.document.documentElement.dataset.theme, 'dark', 'first render uses the account theme');
  assert.equal(ls.getItem('fx-term-desk'), 'stocks', 'an unsaved newer change on this device is kept');
  assert.equal(ls.getItem('fynx_auth_email'), null, 'keys outside the allowlist are never written');
});
