'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const stripImports = code => code.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace(/export /g, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
function page(file) {
  const dom = new JSDOM(read(file), { url: 'https://www.fynxfinanceworld.com/' + file, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  dom.window.localStorage.setItem('mode', 'demo');
  dom.window.localStorage.setItem('user-owned-records', '[{"note":"preserve this record"}]');
  return dom;
}
function unchangedStorage(w) {
  assert.equal(w.localStorage.getItem('mode'), 'demo');
  assert.equal(w.localStorage.getItem('user-owned-records'), '[{"note":"preserve this record"}]');
}
function firestore(w) {
  const listeners = [], charts = [], writes = [];
  let authChange;
  Object.assign(w, {
    auth: {}, app: {}, authPersistenceReady: Promise.resolve(),
    onAuthStateChanged: (_, callback) => { authChange = callback; },
    getFirestore: () => ({}), collection: (_, ...parts) => parts.join('/'),
    doc: (_, ...parts) => parts.join('/'), query: value => value, orderBy: () => ({}),
    onSnapshot: (target, success, failure) => { const subscription = { target, success, failure, stopped: false }; listeners.push(subscription); return () => { subscription.stopped = true; }; },
    setDoc: async (...args) => writes.push(args), Timestamp: { fromDate: date => date }, serverTimestamp: () => ({}),
    escapeHTML: value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])),
    Chart: class { constructor(_, config) { Object.assign(this, config); charts.push(this); } update() {} },
  });
  return { listeners, charts, writes, auth: user => authChange(user) };
}
const records = [{ id: 'one', date: '2026-10-28', symbol: 'EURUSD', session: 'London', pl: 125 }, { id: 'two', date: '2026-10-29', symbol: 'USDJPY', session: 'Asia', pl: -25 }];
const snapshot = rows => ({ empty: rows.length === 0, docs: rows.map(row => ({ data: () => row })), forEach: callback => rows.forEach(row => callback({ data: () => row })) });

for (const route of ['journal.html', 'trader-journal.html']) test(route + ': guests have no trades or performance; legacy demo never replaces a real journal', async () => {
  const dom = page(route), w = dom.window, h = firestore(w);
  try {
    const module = [...w.document.querySelectorAll('script[type="module"]')].find(script => script.textContent.includes('authPersistenceReady'));
    await w.eval('(async function(){' + stripImports(module.textContent) + '\n})()');
    const text = id => w.document.getElementById(id).textContent;
    h.auth(null);
    assert.equal(text('kpiTrades'), '0'); assert.equal(text('kpiWin'), '—'); assert.equal(text('kpiPL'), '—');
    assert.match(text('modeText'), /Sign in/); assert.match(text('sessionList'), /Sign in/);
    assert.equal(h.listeners.length, 0);
    assert(h.charts.every(chart => chart.data.datasets[0].data.length === 0));
    w.document.getElementById('saveTradeBtn').click(); await tick();
    assert.equal(h.writes.length, 0); assert.match(text('tradeSaveStatus'), /Sign in/);
    h.auth({ uid: 'first-account' });
    assert.equal(h.listeners[0].target, 'users/first-account/trades');
    h.listeners[0].success(snapshot(records));
    assert.equal(text('kpiTrades'), '2'); assert.equal(text('kpiWin'), '50.0%'); assert.equal(text('kpiPL'), '+$100');
    assert.deepEqual(Array.from(h.charts[0].data.datasets[0].data), [125, 100]);
    h.auth({ uid: 'second-account' });
    assert(h.listeners[0].stopped); assert.equal(text('kpiTrades'), '0'); assert.equal(text('kpiPL'), '—');
    h.listeners[0].success(snapshot(records));
    assert.equal(text('kpiTrades'), '0', 'Late records from the previous account must not return');
    h.listeners[1].success(snapshot([{ ...records[0], pl: null }]));
    assert.equal(text('kpiTrades'), '1'); assert.equal(text('kpiPL'), '—'); assert.equal(text('kpiWin'), '—');
    assert(h.charts.every(chart => chart.data.datasets[0].data.length === 0));
    h.auth(null); h.listeners[1].success(snapshot(records));
    assert.equal(text('kpiTrades'), '0'); assert.equal(text('kpiPL'), '—');
    unchangedStorage(w);
  } finally { w.close(); }
});

test('Home uses only saved account results and clears performance during sign-out, failures and account switches', () => {
  const dom = page('home.html'), w = dom.window, h = firestore(w);
  try {
    w.eval(stripImports(read('assets/js/home-journal.js')));
    const text = id => w.document.getElementById(id).textContent;
    h.auth(null);
    assert.equal(text('homeTrades'), '0'); assert.equal(text('homeWinRate'), '—'); assert.equal(text('homePnl'), '—');
    assert.match(text('homeStatsStatus'), /Sign in/);
    h.auth({ uid: 'first-account' }); h.listeners[0].success(snapshot(records));
    assert.equal(text('homeTrades'), '2'); assert.equal(text('homeWinRate'), '50.0%'); assert.equal(text('homePnl'), '$100.00');
    h.auth({ uid: 'second-account' }); h.listeners[0].success(snapshot(records));
    assert.equal(text('homeTrades'), '0'); assert.equal(text('homePnl'), '—');
    h.listeners[1].success(snapshot([{ pl: '' }]));
    assert.equal(text('homeTrades'), '1'); assert.equal(text('homeWinRate'), '—'); assert.equal(text('homePnl'), '—');
    h.listeners[1].failure(Error('Offline'));
    assert.equal(text('homePnl'), '—'); assert.match(text('homeStatsStatus'), /unavailable/);
    h.auth(null); h.listeners[1].success(snapshot(records));
    assert.equal(text('homeTrades'), '0'); assert.equal(text('homePnl'), '—');
    unchangedStorage(w);
  } finally { w.close(); }
});

test('Profile ignores legacy demo identity and metrics while retaining real account data and ownership isolation', async () => {
  const dom = page('profile.html'), w = dom.window, h = firestore(w);
  try {
    const script = [...w.document.querySelectorAll('script:not([src])')].find(script => script.textContent.includes('function renderProfile()'));
    w.eval(script.textContent);
    w.eval(stripImports(read('assets/js/profile-sync.js')));
    const text = id => w.document.getElementById(id).textContent;
    h.auth(null);
    assert.equal(text('profileName'), 'Guest'); assert.equal(text('profileEmail'), '—');
    assert.equal(text('statTotalTrades'), '0'); assert.equal(text('statWinRate'), '—'); assert.equal(text('statAvgReturn'), '—');
    h.auth({ uid: 'first-account', displayName: 'Real Name', email: 'real@example.com', metadata: { creationTime: '2026-01-05T12:00:00Z' } });
    h.listeners[0].success({ data: () => ({ displayName: 'Saved Name', bio: 'My own profile' }) });
    h.listeners[1].success(snapshot(records));
    assert.equal(text('profileName'), 'Saved Name'); assert.equal(text('profileEmail'), 'real@example.com');
    assert.equal(text('statTotalTrades'), '2'); assert.equal(text('statWinRate'), '50.0%'); assert.equal(text('statAvgReturn'), '—');
    h.auth({ uid: 'second-account', displayName: 'Second Name', email: 'second@example.com' });
    h.listeners[0].success({ data: () => ({ displayName: 'Old Account' }) }); h.listeners[1].success(snapshot(records));
    assert.equal(text('profileName'), 'Second Name'); assert.equal(text('statTotalTrades'), '0');
    h.auth(null); h.listeners[3].success(snapshot(records));
    assert.equal(text('profileName'), 'Guest'); assert.equal(text('statWinRate'), '—');
    unchangedStorage(w);
  } finally { w.close(); }
});

test('legacy demo compatibility and shared navigation never substitute identity or delete saved records', async () => {
  const dom = page('home.html'), w = dom.window;
  try {
    w.FynxIdentity = { uid: 'real-account', displayName: 'Actual Trader' };
    w.eval(read('demo-mode.js'));
    assert.equal(w.FynxDemoMode.isDemoMode(), false);
    w.FynxDemoMode.setDemoMode(true);
    assert.equal(w.FynxDemoMode.isDemoMode(), false);
    w.eval(read('fynx-nav.js')); await tick();
    assert.equal(w.document.getElementById('avatarInitials').textContent, 'AT');
    assert.equal(w.document.querySelector('.demo-banner'), null);
    assert.equal(w.document.querySelector('#publicAccountLinks a:last-child').pathname, '/profile.html');
    unchangedStorage(w);
    const signup = new JSDOM(read('auth/signup.html')).window.document;
    assert.equal(signup.querySelector('#viewDemo'), null);
    assert(signup.querySelector('a[href="../home.html"]'));
    signup.defaultView.close();
  } finally { w.close(); }
});

test('an old demo flag cannot bypass the existing protected-page sign-in requirement', async () => {
  const source = read('assets/js/session-manager.js');
  const code = source.slice(source.indexOf('export async function bootstrapSession'), source.indexOf('export const sessionState')).replace('export ', '');
  let authChange, redirected, readDemo = false;
  const context = { currentAuth: null, pageStateOwner: null, bootResolved: false, browserLocalPersistence: {}, KEYS: { sessionEvent: 'session', bootReady: 'ready' }, bindPresenceListeners() {}, setPersistence: async () => {}, onAuthStateChanged: (_, callback) => { authChange = callback; return () => {}; }, window: { location: { pathname: '/account-settings.html', search: '', hash: '', replace: target => { redirected = target; } } }, readLastActiveAt: () => 1, validateSessionTimeout: async () => ({ expired: false }), trackActivity() {}, safeSetItem() {}, safeGetItem() {}, bindPageStateTracking() {}, dispatchSessionEvent() {}, now: Date.now, localStorage: { getItem: () => { readDemo = true; return 'demo'; } } };
  vm.createContext(context); vm.runInContext(code, context);
  const result = context.bootstrapSession({ auth: {}, protectedPage: true });
  await authChange(null);
  assert.equal((await result).redirected, true);
  assert.match(redirected, /^\/auth\/login\.html\?returnTo=/);
  assert.equal(readDemo, false);
});

test('calendar alerts preserve user reminders while retired generated examples never render or notify', () => {
  const dom = page('tools/calendar-alerts.html'), w = dom.window, notices = [];
  try {
    const future = new Date(Date.now() + 10 * 60000), tomorrow = new Date(Date.now() + 2 * 86400000);
    const fields = date => ({ date: [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'), time: String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0') });
    const generated = { id: 'sample-1', name: 'US CPI', ...fields(future), reminderOffset: 15, notified: false, impact: 'high', note: 'Old generated example' };
    const actual = { id: 'user-record', name: 'My recorded event', ...fields(tomorrow), reminderOffset: 15, notified: false, impact: 'medium', note: 'My saved reminder' };
    const raw = JSON.stringify([generated, actual]);
    w.localStorage.setItem('fynx_calendar_alerts', raw);
    w.setInterval = () => 1;
    w.Notification = class { static permission = 'granted'; constructor(...args) { notices.push(args); } };
    const script = [...w.document.querySelectorAll('script:not([src])')].find(script => script.textContent.includes('const ALERTS_KEY'));
    w.eval(script.textContent);
    assert.equal(w.document.getElementById('loadSampleBtn'), null);
    assert.equal(w.document.getElementById('savedAlertsValue').textContent, '1');
    assert.match(w.document.getElementById('alertsList').textContent, /My recorded event/);
    assert.doesNotMatch(w.document.getElementById('alertsList').textContent, /US CPI/);
    assert.equal(notices.length, 0);
    assert.equal(w.localStorage.getItem('fynx_calendar_alerts'), raw);
    w.document.getElementById('eventName').value = 'New user reminder';
    w.document.getElementById('eventDate').value = actual.date;
    w.document.getElementById('eventTime').value = actual.time;
    w.document.getElementById('addAlertBtn').click();
    const saved = JSON.parse(w.localStorage.getItem('fynx_calendar_alerts'));
    assert.equal(saved.length, 3);
    assert.deepEqual(saved[0], generated); assert.deepEqual(saved[1], actual);
    assert.equal(w.document.getElementById('savedAlertsValue').textContent, '2');
    unchangedStorage(w);
  } finally { w.close(); }
});

test('legacy simulated heatmap redirects to the sourced research heatmap', () => {
  const doc = new JSDOM(read('tools/heatmap.html')).window.document;
  try {
    let destination;
    vm.runInNewContext(doc.querySelector('script').textContent, { location: { search: '?symbols=BTC-USD', hash: '#heatmap', replace: value => { destination = value; } } });
    assert.equal(destination, '/tools/research-heatmap.html?symbols=BTC-USD#heatmap');
    assert.equal(doc.querySelector('main a').getAttribute('href'), '/tools/research-heatmap.html');
    assert.doesNotMatch(doc.body.textContent, /simulated|demo/i);
  } finally { doc.defaultView.close(); }
});

function runTool(w, name) {
  const script = [...w.document.querySelectorAll('script:not([src])')].find(script => script.textContent.includes('function ' + name + '('));
  assert(script, 'Actual tool implementation is present');
  w.eval(script.textContent);
}

test('currency conversion requires an entered rate and never substitutes a fixed quote', () => {
  const dom = page('tools/currency.html'), w = dom.window;
  try {
    runTool(w, 'calculateConversion');
    const el = id => w.document.getElementById(id);
    assert.equal(el('customRate').value, '');
    el('amount').value = '250'; el('calculateBtn').click();
    assert.match(el('resultArea').textContent, /No rate is supplied automatically/);
    assert.equal(el('resultArea').querySelector('.big-result'), null);
    el('customRate').value = '0.8'; el('calculateBtn').click();
    assert.equal(el('resultArea').querySelector('.big-result').textContent, '250.00 USD = 200.00 EUR');
    assert.match(el('resultArea').textContent, /manually entered rate/);
    el('swapBtn').click();
    assert.equal(el('customRate').value, '1.25');
    assert.equal(el('resultArea').querySelector('.big-result').textContent, '250.00 EUR = 312.50 USD');
    el('toCurrency').value = 'JPY'; el('toCurrency').dispatchEvent(new w.Event('change'));
    assert.equal(el('customRate').value, '');
    assert.equal(el('resultArea').querySelector('.big-result'), null);
    el('calculateBtn').click(); assert.match(el('resultArea').textContent, /No rate is supplied/);
    el('toCurrency').value = 'EUR'; el('calculateBtn').click();
    assert.equal(el('resultArea').querySelector('.big-result').textContent, '250.00 EUR = 250.00 EUR');
    assert.match(el('resultArea').textContent, /Same currency/);
  } finally { w.close(); }
});

test('correlation starts empty and calculates only complete user-entered observations', () => {
  const dom = page('tools/correlation.html'), w = dom.window;
  try {
    runTool(w, 'calculateCorrelation');
    const el = id => w.document.getElementById(id);
    assert.equal(el('seriesA').value, ''); assert.equal(el('seriesB').value, '');
    assert.equal(w.document.querySelector('[data-preset]'), null);
    for (const id of ['corrValue', 'matrixAB', 'matrixBA']) assert.equal(el(id).textContent, '—');
    el('seriesA').value = '1,2,3'; el('seriesB').value = '2,4,6'; el('calculateBtn').click();
    assert.equal(el('corrValue').textContent, '1.0000'); assert.equal(el('sampleSize').textContent, '3');
    el('seriesA').value = '1,bad,3'; el('seriesB').value = '2,4'; el('calculateBtn').click();
    assert.equal(el('corrValue').textContent, 'Error'); assert.equal(el('matrixAB').textContent, '—');
    for (const cell of w.document.querySelectorAll('.matrix-diagonal')) assert.equal(cell.textContent, '—');
    el('seriesA').value = '2,2,2'; el('seriesB').value = '2,4,6'; el('calculateBtn').click();
    assert.equal(el('corrValue').textContent, 'Error');
    el('clearBtn').click(); assert.equal(el('corrValue').textContent, '—');
  } finally { w.close(); }
});

test('position sizing accepts dated real reference quotes and isolates pair changes, outages and manual inputs', async () => {
  const dom = page('tools/position-size.html'), w = dom.window, pending = [];
  const observation = new Date().toISOString().slice(0, 10);
  try {
    w.AbortSignal.timeout = () => undefined;
    w.fetch = url => new Promise((resolve, reject) => pending.push({ url, resolve, reject }));
    w.eval(read('assets/vendor/decimal.js'));
    runTool(w, 'refreshPrice');
    const el = id => w.document.getElementById(id);
    const quote = async (index, base, target, price, date = observation) => {
      pending[index].resolve({ ok: true, json: async () => ({ base, date, rates: { [target]: price } }) });
      await tick();
    };
    const pair = value => { el('pair').value = value; el('pair').dispatchEvent(new w.Event('change')); };
    await quote(0, 'GBP', 'CAD', 1.8);
    assert.equal(el('priceValue').textContent, '1.80000');
    assert.match(el('priceStatus').textContent, new RegExp(observation));
    pair('EUR/USD');
    assert.equal(el('priceValue').textContent, '—');
    el('calcBtn').click(); await tick();
    assert.equal(el('lotsOut').textContent, '—');
    await quote(1, 'EUR', 'USD', 1.2);
    el('calcBtn').click(); await tick();
    assert.equal(el('usedPriceOut').textContent, '1.20000');
    assert.equal(el('lotsOut').textContent, '0.04');
    pair('GBP/USD'); pair('USD/JPY');
    pending[2].reject(new Error('Old request failed')); await tick();
    assert.equal(el('manualPriceRow').style.display, 'none');
    await quote(3, 'USD', 'JPY', 150);
    assert.equal(el('priceValue').textContent, '150.000');
    el('manualModeBtn').click();
    assert.equal(el('priceValue').textContent, '—');
    el('manualPrice').value = '151'; el('manualPrice').dispatchEvent(new w.Event('input'));
    assert.equal(el('priceValue').textContent, '151.000');
    pair('EUR/USD');
    assert.equal(el('manualPrice').value, ''); assert.equal(el('priceValue').textContent, '—');
    el('refreshBtn').click(); await quote(4, 'EUR', 'USD', 1.3, '2000-01-01');
    assert.equal(el('priceValue').textContent, '—');
    assert.match(el('message').textContent, /External rates unavailable/);
    el('refreshBtn').click(); pending[5].reject(new Error('Source unavailable')); await tick();
    assert.equal(el('priceValue').textContent, '—');
    assert.equal(el('manualPrice').value, '');
    unchangedStorage(w);
  } finally { w.close(); }
});
