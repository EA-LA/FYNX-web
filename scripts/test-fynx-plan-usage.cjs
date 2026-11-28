/* FYNXPlan daily allowances: signed-in members are counted by the server (clock and storage cannot reset it),
 * the server's refusal shows no result, repeats are free, and an unreachable server falls back to the local counter. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
function load() {
  const store = new Map(), mk = () => ({getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)});
  const root = {__FYNX_PLAN_TEST__: true, localStorage: mk(), sessionStorage: mk(), document: undefined, location: {pathname: '/terminal.html', search: ''}, setTimeout, clearTimeout, Promise, Date, Math, JSON, Number, String, Object, Array, Set, Map, Infinity, NaN, console};
  root.window = root; root.globalThis = root;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/fynx-plan.js'), 'utf8'), root);
  return {P: root.FYNXPlan, store};
}
(async () => {
  // Server answers: free member with 2 AI runs a day, counted on the server.
  let calls = [], serverUsed = 0; const seen = new Set();
  const server = {call: async d => { calls.push(d); if (d.action !== 'usage') return {}; if (d.op === 'read') return {counts: {analysis: 0, ai: serverUsed, backtest: 0}, resetAt: Date.now() + 3600e3};
    if (d.key && seen.has(d.key)) return {allowed: true, used: serverUsed, repeat: true, resetAt: Date.now() + 3600e3};
    if (serverUsed >= 2) return {allowed: false, used: serverUsed, limit: 2, resetAt: Date.now() + 3600e3}; serverUsed++; if (d.key) seen.add(d.key); return {allowed: true, used: serverUsed, limit: 2, resetAt: Date.now() + 3600e3}; }};
  let {P, store} = load(); P._test.set(server, {tier: 'free', uid: 'u1', signedIn: true, verified: true});
  assert.equal(await P.charge('ai', 'a', {silent: true}), true); assert.equal(await P.charge('ai', 'b', {silent: true}), true);
  assert.equal(await P.charge('ai', 'c', {silent: true}), false, 'the server refuses the third free AI run');
  assert.equal(calls.filter(c => c.action === 'usage' && c.op === 'charge').length, 3, 'every new run asks the server');
  assert.equal(P.meter('ai').used, 2, 'the meter mirrors the server count'); assert.match(P.resetText(), /00:00 UTC/);
  // Same analysis again is free and needs no server call.
  const before = calls.length; assert.equal(await P.charge('ai', 'a', {silent: true}), true); assert.equal(calls.length, before, 'a repeat on this device is not re-sent');
  // Clearing browser storage does not give the allowance back: the server still says 2, and still knows run 'a'.
  store.clear(); ({P} = load()); P._test.set(server, {tier: 'free', uid: 'u1', signedIn: true, verified: true});
  assert.equal(await P.charge('ai', 'd', {silent: true}), false, 'clearing storage does not reset a server-counted allowance');
  assert.equal(await P.charge('ai', 'a', {silent: true}), true, 'the server remembers a run already paid for today');
  // Server unreachable → local counter (free AI = 2 per day on this device).
  ({P} = load()); P._test.set({call: async () => { throw new Error('offline'); }}, {tier: 'free', uid: 'u2', signedIn: true, verified: true});
  assert.equal(await P.charge('ai', 'x', {silent: true}), true); assert.equal(await P.charge('ai', 'y', {silent: true}), true);
  assert.equal(await P.charge('ai', 'z', {silent: true}), false, 'local fallback still enforces the daily allowance');
  assert.match(P.resetText(), /midnight on this device/);
  // Guests never call the server.
  ({P} = load()); let guestCalls = 0; P._test.set({call: async () => { guestCalls++; return {}; }}, {tier: 'guest', uid: null, signedIn: false, verified: true});
  assert.equal(await P.charge('ai', 'g1', {silent: true}), true); assert.equal(await P.charge('ai', 'g2', {silent: true}), false, 'guest AI preview = 1 a day');
  assert.equal(guestCalls, 0);
  // FYNX owner: the server's status decides (owner + Professional tier); unlimited, no checkout, never from storage.
  {
    let statusCalls = 0;
    const ownerSvc = reply => ({config: {auth: {currentUser: {uid: 'owner-uid'}}}, call: async d => { if (d.action === 'status') { statusCalls++; return reply; } if (d.action === 'usage') return d.op === 'read' ? {counts: {}} : {allowed: true, used: 0, limit: null}; return {}; }});
    ({P} = load()); P._test.set(ownerSvc({mode: 'live', tier: 'pro', owner: true, lifetime: true}), {});
    await P.refresh();
    assert.equal(P.owner, true); assert.equal(P.tier, 'pro'); assert.equal(P.name, 'FYNX Owner'); assert.equal(P.label, 'FYNX Owner — Lifetime Unlimited Access');
    assert.equal(P.meter('analysis').limit, Infinity); assert.equal(P.meter('ai').limit, Infinity); assert.equal(P.meter('backtest').limit, Infinity);
    for (let i = 0; i < 100; i++) assert.equal(await P.charge('analysis', 'o' + i, {silent: true}), true);
    await assert.rejects(P.checkout('pro'), /complimentary/);
    // A status that says owner without the Professional tier is not trusted.
    ({P} = load()); P._test.set(ownerSvc({mode: 'live', tier: 'free', owner: true}), {}); await P.refresh(); assert.equal(P.owner, false); assert.equal(P.tier, 'free');
    // The plan module never takes owner status from its session cache (the server is asked on every page load).
    const src = fs.readFileSync(path.join(__dirname, '../assets/js/fynx-plan.js'), 'utf8');
    assert.match(src, /!cached\.owner &&/); assert.ok(!/ha6876122/.test(src), 'no email check in the browser');
  }

  // Paid membership responses must belong to the active verification, even when
  // accounts change or sign out while the membership service is responding.
  {
    const paid = {mode: 'live', tier: 'pro', owner: true};
    const auth = {currentUser: {uid: 'paid-a'}};
    let resolveOld;
    ({P, store} = load());
    P._test.set({config: {auth}, call: d => d.action === 'status'
      ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({counts: {}})}, {});
    const pending = P.refresh();
    auth.currentUser = null;
    await P.refresh();
    resolveOld(paid);
    await pending;
    assert.equal(P.tier, 'guest', 'late paid status cannot restore access after sign-out');
    assert.equal(P.owner, false);
    assert.equal(store.has('fynx.plan.v1'), false, 'late status cannot repopulate the membership cache');
  }
  {
    const auth = {currentUser: {uid: 'paid-a'}};
    let resolveOld, calls = 0, seen = [];
    ({P, store} = load());
    P._test.set({config: {auth}, call: d => d.action === 'status'
      ? (++calls === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({mode: 'live', tier: 'starter'}))
      : Promise.resolve({counts: {analysis: 3}})}, {tier: 'pro', uid: 'old', signedIn: true, verified: true, owner: true});
    P.onChange(s => seen.push(s));
    const pending = P.refresh();
    assert.equal(seen[0].tier, 'free', 'the prior paid account is hidden during verification');
    assert.equal(seen[0].owner, false);
    auth.currentUser = {uid: 'paid-b'};
    await P.refresh();
    resolveOld({mode: 'live', tier: 'pro', owner: true});
    await pending;
    assert.equal(P.tier, 'starter');
    assert.equal(P.owner, false);
    assert.equal(JSON.parse(store.get('fynx.plan.v1')).uid, 'paid-b');
    assert.equal(P.meter('analysis').left, 12);
  }
  {
    const auth = {currentUser: {uid: 'paid-a'}};
    let resolveUsage, count = 0;
    ({P, store} = load());
    P._test.set({config: {auth}, call: d => {
      if (d.action === 'status') return Promise.resolve({mode: 'live', tier: 'starter'});
      return ++count === 1 ? new Promise(resolve => { resolveUsage = resolve; }) : Promise.resolve({counts: {analysis: 2}});
    }}, {});
    await P.refresh();
    auth.currentUser = {uid: 'paid-b'};
    await P.refresh();
    assert.equal(P.meter('analysis').left, 13);
    resolveUsage({counts: {analysis: 14}});
    await Promise.resolve();
    assert.equal(P.meter('analysis').left, 13, 'old account usage cannot overwrite the new paid allowance');
    assert.equal(JSON.parse(store.get('fynx.usage.v1')).who, 'paid-b');
  }
  {
    const auth = {currentUser: {uid: 'paid-a'}};
    let rejectOld, calls = 0;
    ({P} = load());
    P._test.set({config: {auth}, call: d => d.action === 'status'
      ? (++calls === 1 ? new Promise((_, reject) => { rejectOld = reject; }) : Promise.resolve({mode: 'live', tier: 'plus'}))
      : Promise.resolve({counts: {}})}, {});
    const pending = P.refresh();
    auth.currentUser = {uid: 'paid-b'};
    await P.refresh();
    rejectOld(new Error('old request failed'));
    await pending;
    assert.equal(P.tier, 'plus', 'an old failed verification cannot downgrade a newer paid account');
  }

  console.log('FYNXPlan usage: server-counted allowances, storage reset resistance, repeats, offline fallback, guest limits and owner access passed');
})().catch(e => { console.error(e); process.exit(1); });
