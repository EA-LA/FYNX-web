'use strict';
// FYNX owner entitlement: verified owner account gets lifetime unlimited access everywhere; nobody else can obtain it.
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
const O = require('./owner-access.cjs');
const {FakeDB} = require('./test-support/account-sync-fake-db.cjs');
const {createMembership, capabilities, sharedNativePro} = require('./account-sync-membership.cjs');
const {createConsumerPlanResolver} = require('./accounts/entitlements.cjs');
const {entitlement, ownerLimits, effectiveCap} = require('./developer-core.cjs');
const IA = require('./industry-analytics.cjs');
const {PLANS} = require('./consumer-core.cjs');

const OWNER = {uid: 'owner-uid', email: 'ha6876122@gmail.com', emailVerified: true, disabled: false};

test('only the verified, enabled owner account qualifies', () => {
  assert.equal(O.isOwnerRecord(OWNER, {}), true);
  assert.equal(O.isOwnerRecord({...OWNER, email: 'HA6876122@Gmail.com '}, {}), true, 'case and spaces normalised');
  assert.equal(O.isOwnerRecord({...OWNER, emailVerified: false}, {}), false, 'unverified address never qualifies');
  assert.equal(O.isOwnerRecord({...OWNER, emailVerified: 'true'}, {}), false, 'only a real boolean from Firebase Auth');
  assert.equal(O.isOwnerRecord({...OWNER, disabled: true}, {}), false);
  assert.equal(O.isOwnerRecord({...OWNER, email: 'ha.6876122@gmail.com'}, {}), false);
  assert.equal(O.isOwnerRecord({...OWNER, email: 'ha6876122+x@gmail.com'}, {}), false);
  assert.equal(O.isOwnerRecord({...OWNER, email: 'someone@example.com'}, {}), false);
  assert.equal(O.isOwnerRecord({...OWNER, uid: ''}, {}), false);
  assert.equal(O.isOwnerRecord(null, {}), false);
  // Pinning to the exact Firebase UID(s).
  assert.equal(O.isOwnerRecord(OWNER, {FYNX_OWNER_UIDS: 'owner-uid'}), true);
  assert.equal(O.isOwnerRecord(OWNER, {FYNX_OWNER_UIDS: 'a, owner-uid ,b'}), true);
  assert.equal(O.isOwnerRecord(OWNER, {FYNX_OWNER_UIDS: 'someone-else'}), false, 'a second account with the same address is not the owner when UIDs are pinned');
  // Client-controlled fields are ignored entirely.
  assert.equal(O.isOwnerRecord({uid: 'x', email: 'x@example.com', emailVerified: true, owner: true, customClaims: {owner: true}, isPro: true, tier: 'pro'}, {}), false);
  assert.equal(O.ownerMembership().membershipLabel, 'FYNX Owner — Lifetime Unlimited Access');
  assert.equal(O.ownerMembership().tier, 'pro');
});

test('owner check caches, fails closed on lookup errors and never caches a failure', async () => {
  let calls = 0, fail = false, t = 0;
  const check = O.createOwnerCheck({getUser: async uid => { calls++; if (fail) throw Error('auth down'); return {...OWNER, uid}; }, env: {}, now: () => t});
  assert.equal(await check('owner-uid'), true); assert.equal(await check('owner-uid'), true); assert.equal(calls, 1);
  t += 10 * 60 * 1000; fail = true;
  assert.equal(await check('owner-uid'), false, 'lookup failure is not access');
  fail = false; assert.equal(await check('owner-uid'), true);
  assert.equal(await O.createOwnerCheck({})('owner-uid'), false, 'no Auth lookup → no owner');
  assert.equal(await check(''), false);
});

/* ---------- website + Terminal membership (consumerLiveWorkspace) ---------- */
function workspace({user = OWNER, env = {}, customer = false, stripeKey = 'sk_live_UNIT_TEST_ONLY', fetchImpl} = {}) {
  const data = new Map(), stripeCalls = [];
  const snapshot = path => ({exists: data.has(path), data: () => data.get(path)});
  const ref = path => ({path, id: path.split('/').pop(), get: async () => snapshot(path), set: async (v, o) => data.set(path, o?.merge ? {...data.get(path), ...v} : v), collection: n => collection(path + '/' + n)});
  const collection = path => ({doc: id => ref(path + '/' + id), orderBy() { return this; }, limit() { return this; }, get: async () => ({docs: [], size: 0})});
  const db = {collection, runTransaction: async fn => fn({get: async r => snapshot(r.path), set: (r, v, o) => r.set(v, o), create: (r, v) => r.set(v), delete: r => data.delete(r.path)})};
  const stripe = new Proxy({}, {get: (_, k) => new Proxy({}, {get: (__, m) => async (...a) => { stripeCalls.push([k, m, a]); if (k === 'subscriptions' && m === 'list') return {data: []}; return {}; }})});
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const module = {exports: {}};
  const stubs = {'firebase-functions/v1': {https: {HttpsError}, runWith: () => ({https: {onCall: f => f}})}, 'firebase-admin': {firestore: () => db, auth: () => ({getUser: async uid => ({...user, uid})})}, stripe: function () { return stripe; }};
  if (customer) data.set(`fynxConsumerLive/${user.uid}`, {customer: 'cus_x'});
  const realFetch = global.fetch;
  vm.runInNewContext(fs.readFileSync(__dirname + '/consumer-live-workspace.cjs', 'utf8'), {module, exports: module.exports, process: {env: {FYNX_CONSUMER_STRIPE_SECRET_KEY: stripeKey, ...env}}, require: n => stubs[n] || require(n), Date, Math, JSON, Object, Number, String, Array, Promise, Set, Map, Error, URL, console, setTimeout});
  const call = (d, uid = user.uid) => { if (fetchImpl) global.fetch = fetchImpl; return module.exports._test.handler(d, {auth: {uid, token: {auth_time: Math.floor(Date.now() / 1000)}}}).finally(() => { global.fetch = realFetch; }); };
  return {call, data, stripeCalls};
}

test('owner status: Professional tier, lifetime, no Stripe lookups and no payment records', async () => {
  const h = workspace();
  const s = await h.call({action: 'status'});
  assert.equal(s.tier, 'pro'); assert.equal(s.owner, true); assert.equal(s.lifetime, true); assert.equal(s.accessProvider, 'owner');
  assert.equal(s.membershipLabel, 'FYNX Owner — Lifetime Unlimited Access'); assert.equal(s.subscription, null);
  assert.equal(h.stripeCalls.length, 0, 'no Stripe customer, subscription or payment is created or read');
  assert.ok(![...h.data.keys()].some(k => /customer|subscription|payment/i.test(JSON.stringify(h.data.get(k)) || '')), 'no fake billing records');
});

test('owner works even when Stripe is not configured, and checkout is refused without charging', async () => {
  const h = workspace({stripeKey: ''});
  assert.equal((await h.call({action: 'status'})).owner, true);
  await assert.rejects(h.call({action: 'checkout', tier: 'pro'}), {code: 'already-exists'});
  assert.equal(h.stripeCalls.length, 0);
  await assert.rejects(h.call({action: 'portal'}), {code: 'failed-precondition'}, 'no billing account to manage');
});

test('owner has no daily limits in any usage category, and every Pro tool runs', async () => {
  const h = workspace();
  for (const cat of ['analysis', 'ai', 'backtest']) for (let i = 0; i < 9; i++) { const r = await h.call({action: 'usage', op: 'charge', cat, key: cat + i}); assert.equal(r.allowed, true); assert.equal(r.limit, null); assert.equal(r.owner, true); }
  const r = await h.call({action: 'run', product: 'watchlist', input: {symbols: ['AAPL']}});
  assert.ok(r.result);
  assert.deepEqual(PLANS.pro.products, ['analytics', 'risk', 'scenarios', 'review', 'export', 'watchlist', 'portfolio', 'simulation'], 'the owner tier carries every Pro product');
});

test('a different verified account gets nothing extra; unverified owner address gets nothing', async () => {
  const other = workspace({user: {uid: 'u2', email: 'someone@example.com', emailVerified: true, disabled: false}});
  const s = await other.call({action: 'status'}); assert.equal(s.tier, null); assert.equal(s.owner, undefined);
  for (let i = 0; i < 5; i++) assert.equal((await other.call({action: 'usage', op: 'charge', cat: 'analysis', key: 'k' + i})).allowed, true);
  assert.equal((await other.call({action: 'usage', op: 'charge', cat: 'analysis', key: 'k6'})).allowed, false, 'free daily limit unchanged for everyone else');
  await assert.rejects(other.call({action: 'industries'}), {code: 'permission-denied'}, 'advanced industry analytics stay Pro-only');
  const spoof = workspace({user: {...OWNER, uid: 'spoof', emailVerified: false}});
  assert.equal((await spoof.call({action: 'status'})).owner, undefined);
  // Request body cannot claim ownership.
  assert.equal((await other.call({action: 'status', owner: true, tier: 'pro', accessProvider: 'owner'})).owner, undefined);
});

test('pinned UID: the owner email on another UID is not the owner', async () => {
  const h = workspace({user: {...OWNER, uid: 'impostor'}, env: {FYNX_OWNER_UIDS: 'owner-uid'}});
  assert.equal((await h.call({action: 'status'})).owner, undefined);
  const real = workspace({env: {FYNX_OWNER_UIDS: 'owner-uid'}});
  assert.equal((await real.call({action: 'status'})).owner, true);
});

test('infrastructure rate limit still applies to the owner', async () => {
  const h = workspace();
  for (let i = 0; i < 30; i++) await h.call({action: 'status'});
  await assert.rejects(h.call({action: 'status'}), {code: 'resource-exhausted'});
});

/* ---------- app / account-sync membership ---------- */
test('app membership: owner has every capability without a bridge, provider or subscription', async () => {
  const db = new FakeDB(), at = 1800000000000;
  const get = createMembership({db, stripe: () => { throw Error('no stripe'); }, now: () => at, ownerOf: async uid => uid === 'owner-uid'});
  const r = await get('owner-uid');
  assert.equal(r.webTier, 'pro'); assert.equal(r.nativeTier, 'pro'); assert.equal(r.owner, true); assert.equal(r.lifetime, true);
  assert.equal(r.membershipLabel, 'FYNX Owner — Lifetime Unlimited Access');
  assert.ok(Object.values(r.capabilities).every(v => v === true));
  assert.equal(sharedNativePro(r, at), true, 'shared with connected FYNX apps');
  const other = await get('alice'); assert.equal(other.webTier, null); assert.equal(other.capabilities.nativePro, false); assert.equal(other.owner, undefined);
  // A cached non-owner record is not reused once the account is the owner (and vice versa).
  const flip = createMembership({db, stripe: () => { throw Error('x'); }, now: () => at, ownerOf: async () => true});
  assert.equal((await flip('alice')).owner, true);
  assert.deepEqual(capabilities({stripeTier: null, apple: false, bridgeEnabled: false}).webAnalytics, false);
});

/* ---------- My Accounts (MT4/MT5 live plan) ---------- */
test('My Accounts plan resolver: owner is Professional without Stripe; others unchanged', async () => {
  const noStripe = createConsumerPlanResolver({ownerOf: async uid => uid === 'owner-uid'});
  assert.equal(await noStripe('owner-uid'), 'pro'); assert.equal(await noStripe('alice'), null);
  const stripe = {subscriptions: {list: async () => ({data: []})}};
  const r = createConsumerPlanResolver({stripe, profileOf: async () => ({customer: 'cus'}), ownerOf: async uid => uid === 'owner-uid'});
  assert.equal(await r('owner-uid'), 'pro'); assert.equal(await r('alice'), null);
  const broken = createConsumerPlanResolver({ownerOf: async () => { throw Error('x'); }});
  assert.equal(await broken('owner-uid'), null, 'fails closed');
});

/* ---------- Developer API ---------- */
test('developer API: owner gets unlimited monthly calls with no overage billing; rate limit kept', () => {
  const l = entitlement({plan: 'free'}, 'live', Date.now(), {owner: true});
  assert.equal(l.unlimited, true); assert.equal(l.overage, false); assert.equal(l.monthlyPrice, 0); assert.ok(l.monthlyCalls >= 1e12);
  assert.equal(l.rps, 50, 'per-second infrastructure limit stays');
  assert.equal(effectiveCap({}, l), l.monthlyCalls);
  assert.deepEqual(entitlement({plan: 'free'}, 'live'), entitlement({plan: 'free'}, 'live', Date.now(), {owner: false}), 'everyone else unchanged');
  assert.equal(entitlement({plan: 'business', planCheckedUntil: Date.now() + 1e6}, 'live').plan, 'business');
  assert.deepEqual(ownerLimits().plan, 'owner');
});

/* ---------- server-side industry analytics ---------- */
function eqFixture() {
  const syms = [], info = {}, closes = {}, rows = [];
  const groups = [['Information Technology', 'Semiconductors', 1.6], ['Information Technology', 'Systems Software', 1.2], ['Energy', 'Integrated Oil & Gas', 0.8], ['Utilities', 'Electric Utilities', 1.0]];
  groups.forEach(([sec, ind, drift], g) => { for (let k = 0; k < 5; k++) { const s = `S${g}${k}`; syms.push(s); info[s] = {n: s, sec, ind};
    const w = Array.from({length: 53}, (_, i) => 100 * (1 + (drift - 1) * i / 52) + k), d = Array.from({length: 23}, (_, i) => w[52] * (1 + (drift - 1) * (i - 22) / 250));
    closes[s] = {p: d[22], c: 0.1, d, w, y0: w[0]}; rows.push([s, s, d[22], 0.1, 1, 1e10 * (k + 1), sec, ind]); } });
  return {eq: {version: 1, generatedAt: '2026-11-26T00:00:00Z', indices: {sp500: syms}, info, closes}, scan: {stocks: {fields: ['symbol', 'name', 'price', 'changePct', 'volume', 'marketCap', 'sector', 'industry'], rows}}};
}
test('industry analytics: relative strength, rotation quadrants, breadth, score', () => {
  const {eq, scan} = eqFixture(), m = IA.membersFrom(eq, scan), r = IA.compute(m, {group: 'industry'});
  assert.equal(r.groups.length, 4); assert.equal(r.benchmark.members, 20);
  const semis = r.groups.find(g => g.name === 'Semiconductors'), oil = r.groups.find(g => g.name === 'Integrated Oil & Gas');
  assert.ok(semis.rs3m > 0 && oil.rs3m < 0);
  assert.equal(r.groups[0].name, 'Semiconductors', 'strongest group ranks first');
  assert.ok(['Leading', 'Weakening'].includes(semis.quadrant)); assert.ok(['Lagging', 'Improving'].includes(oil.quadrant));
  assert.equal(semis.aboveMa, 100); assert.equal(oil.aboveMa, 0);
  assert.equal(semis.leaders.length, 3);
  assert.deepEqual(['Leading', 'Weakening', 'Lagging', 'Improving'], [IA.quadrant(1, 1), IA.quadrant(1, -1), IA.quadrant(-1, -1), IA.quadrant(-1, 1)]);
  assert.equal(IA.quadrant(null, 1), null);
  const sectors = IA.compute(m, {group: 'sector'}); assert.equal(sectors.groups.length, 3);
});

test('owner (and Pro members) receive server-computed industry analytics', async () => {
  IA._reset();
  const {eq, scan} = eqFixture();
  const fetchImpl = async url => ({ok: true, json: async () => url.endsWith('equities.json') ? eq : scan});
  const h = workspace({fetchImpl});
  const r = await h.call({action: 'industries', level: 'sector'});
  assert.equal(r.level, 'sector'); assert.equal(r.groups.length, 3); assert.match(r.method, /Relative strength/);
  IA._reset();
});

test('no client rule can write membership records, and owner access is not stored anywhere a client can reach', () => {
  const rules = fs.readFileSync(__dirname + '/rules/firestore.rules', 'utf8');
  for (const c of ['fynxConsumerLive', 'fynxAccountMemberships', 'intelligenceEntitlements', 'fynxDevelopers']) assert.ok(!rules.includes('match /' + c), c + ' has no client rule (default deny; admin only)');
  const catchAll = rules.slice(rules.indexOf('match /{document=**}'));
  assert.match(catchAll, /allow read, write: if isAdmin\(\)|if isAdmin\(\)/, 'the catch-all is admin-only');
  // The entitlement code never reads a client-writable profile field for ownership.
  const src = fs.readFileSync(__dirname + '/owner-access.cjs', 'utf8');
  assert.ok(!/firestore|localStorage|customClaims|request\.body/.test(src.replace(/\/\/.*$/gm, '')), 'decided only from the Firebase Auth user record');
});
