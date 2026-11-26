'use strict';
/* Market Data Display: tick highlighting logic (assets/js/terminal/tick.js) and its Terminal integration.
 * The tracker decides up / down / neutral / nothing from consecutive real values; the painter flashes a cell only
 * when its key ticked moments ago and the value it shows is that new value; settings persist in the Terminal's
 * own storage. Run: node --test scripts/test-terminal-tick.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const TICK = read('assets/js/terminal/tick.js');

// A page with the real tick.js and a controllable clock (performance.now).
function page({stored, reduced = false} = {}) {
  const dom = new JSDOM('<!doctype html><html><body class="fx-terminal"><div id="host"></div></body></html>', {runScripts: 'outside-only', url: 'https://www.fynxfinanceworld.com/terminal.html'});
  const w = dom.window;
  let t = 1000;
  Object.defineProperty(w.performance, 'now', {value: () => t, configurable: true});
  w.matchMedia = q => ({matches: reduced && /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {}});
  if (stored) w.localStorage.setItem('fx-term-market-display', JSON.stringify(stored));
  w.FynxTerminalPlugins = [];
  w.eval(TICK);
  const flush = () => new Promise(r => w.setTimeout(r, 0)); // let the MutationObserver run
  return {w, doc: w.document, T: w.FynxTick, advance: ms => { t += ms; }, flush};
}
// Objects from the page realm have their own prototypes; compare them as plain data.
const plain = o => JSON.parse(JSON.stringify(o));
const cell = (doc, text) => { const n = doc.createElement('span'); n.className = 'fx-num'; n.textContent = text; return n; };

/* ---------------- tracker ---------------- */
test('first value is a baseline; higher is up, lower is down, unchanged is nothing', () => {
  const {T} = page(), k = T.createTracker({now: () => 0});
  assert.equal(k.ingest('px:AAPL', 149.30, {digits: 2}), null, 'initial value never flashes');
  assert.equal(k.ingest('px:AAPL', 149.35, {digits: 2}), 'up');
  assert.equal(k.ingest('px:AAPL', 149.35, {digits: 2}), null, 'identical data');
  assert.equal(k.ingest('px:AAPL', 149.10, {digits: 2}), 'down');
  assert.equal(k.ingest('px:AAPL', 149.101, {digits: 2}), null, 'change invisible at display precision is not a tick');
});

test('tick direction is independent of daily performance (down 3.91% on the day, latest price up)', () => {
  const {T} = page(), k = T.createTracker({now: () => 0});
  k.ingest('px:XYZ', 149.30, {digits: 2}); k.ingest('chg:XYZ', -3.91, {digits: 2});
  assert.equal(k.ingest('px:XYZ', 149.35, {digits: 2}), 'up', 'price cell flashes green');
  assert.equal(k.ingest('chg:XYZ', -3.91, {digits: 2}), null, 'daily change unchanged: no flash, its red tone is untouched');
  assert.equal(k.ingest('chg:XYZ', -3.88, {digits: 2}), 'up', 'a less negative day change is itself an uptick');
});

test('rapid consecutive changes each tick and restart from the latest value', () => {
  const {T} = page(); let now = 0; const k = T.createTracker({now: () => now});
  k.ingest('px:BTC-USD', 90000, {digits: 2});
  const dirs = [90010, 90020, 90005, 90005, 90030].map(v => { now += 50; return k.ingest('px:BTC-USD', v, {digits: 2}); });
  assert.deepEqual(dirs, ['up', 'up', 'down', null, 'up']);
  const a = k.active('px:BTC-USD', 650);
  assert.equal(a.dir, 'up'); assert.equal(a.value, 90030); assert.equal(a.elapsed, 0);
  now += 700; assert.equal(k.active('px:BTC-USD', 650), null, 'outside the highlight window');
});

test('stale and out-of-order data never flash and never replace newer data', () => {
  const {T} = page(), k = T.createTracker({now: () => 0});
  k.ingest('px:SPY', 600, {ts: '2026-11-26T15:00:30Z'});
  assert.equal(k.ingest('px:SPY', 599, {ts: '2026-11-26T15:00:00Z'}), null, 'older timestamp ignored');
  assert.equal(k.get('px:SPY').v, 600);
  assert.equal(k.ingest('px:SPY', 601, {ts: '2026-11-26T15:01:00Z'}), 'up', 'compared with the last valid value');
});

test('missing, invalid and unavailable values are ignored and do not reset the previous value', () => {
  const {T} = page(), k = T.createTracker({now: () => 0});
  k.ingest('px:EURUSD=X', 1.0850, {digits: 4});
  for (const bad of [null, undefined, NaN, Infinity, '', '—', 'n/a', {}]) assert.equal(k.ingest('px:EURUSD=X', bad, {digits: 4}), null);
  assert.equal(k.get('px:EURUSD=X').v, 1.085);
  assert.equal(k.ingest('px:EURUSD=X', 1.0849, {digits: 4}), 'down');
  assert.equal(k.ingest('', 5), null); assert.equal(k.size(), 1);
});

test('source switch (snapshot → live feed) re-baselines without a flash', () => {
  const {T} = page(), k = T.createTracker({now: () => 0});
  k.ingest('px:AAPL', 150.00, {src: 'snap', ts: '2026-11-26T15:10:00Z'});
  assert.equal(k.ingest('px:AAPL', 150.40, {src: 'live', ts: '2026-11-26T15:05:00Z'}), null);
  assert.equal(k.ingest('px:AAPL', 150.45, {src: 'live', ts: '2026-11-26T15:05:30Z'}), 'up');
});

test('neutral updates: non-directional fields and newly published values are amber', () => {
  const {T} = page(), k = T.createTracker({now: () => 0});
  k.ingest('eco:cpi:f', null, {neutral: true, track: true});
  assert.equal(k.ingest('eco:cpi:f', '3.1%', {neutral: true}), 'neutral', 'first publication of a tracked figure');
  assert.equal(k.ingest('eco:cpi:f', '3.1%', {neutral: true}), null);
  assert.equal(k.ingest('eco:cpi:f', '3.2%', {neutral: true}), 'neutral', 'revision');
  k.ingest('rate:US', 4.25, {neutral: true, digits: 2});
  assert.equal(k.ingest('rate:US', 4.00, {neutral: true, digits: 2}), 'neutral', 'a policy-rate print is published information');
  assert.equal(k.ingest('px:never-tracked', 5), null, 'untracked first value is just a baseline');
});

test('silent ingest records a new baseline (start-up, catch-up after reconnect or a hidden tab)', () => {
  const {T} = page(), k = T.createTracker({now: () => 0});
  k.ingest('px:QQQ', 500);
  assert.equal(k.ingest('px:QQQ', 510, {silent: true}), null);
  assert.equal(k.ingest('px:QQQ', 505), 'down', 'compared with the silent baseline');
});

test('hundreds of instruments updating together stay fast', () => {
  const {T} = page(), k = T.createTracker({now: () => 0});
  for (let i = 0; i < 1000; i++) k.ingest('px:S' + i, 100 + i, {digits: 2});
  const t0 = process.hrtime.bigint(); let ticks = 0;
  for (let round = 1; round <= 20; round++) for (let i = 0; i < 1000; i++) if (k.ingest('px:S' + i, 100 + i + (round % 2 ? 0.01 : 0), {digits: 2})) ticks++;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(ticks, 20000); assert.equal(k.size(), 1000);
  assert.ok(ms < 400, `20,000 ingests took ${ms.toFixed(1)} ms`);
});

/* ---------------- settings ---------------- */
test('defaults: on, background, standard intensity, 650 ms, neutral on', () => {
  const {T} = page();
  assert.deepEqual(plain(T.settings()), {enabled: true, duration: 650, intensity: 'standard', style: 'background', neutral: true});
  assert.deepEqual(plain([...T.DURATIONS]), [300, 500, 650, 1000]);
});

test('settings persist in the Terminal storage key and invalid stored values fall back safely', () => {
  const p = page();
  p.T.setSettings({duration: 300, intensity: 'strong', style: 'both', neutral: false});
  assert.deepEqual(JSON.parse(p.w.localStorage.getItem('fx-term-market-display')), {enabled: true, duration: 300, intensity: 'strong', style: 'both', neutral: false});
  const again = page({stored: {enabled: false, duration: 1000, intensity: 'subtle', style: 'text', neutral: true}});
  assert.deepEqual(plain(again.T.settings()), {enabled: false, duration: 1000, intensity: 'subtle', style: 'text', neutral: true}, 'restored after a browser refresh');
  const junk = page({stored: {enabled: 'yes', duration: 42, intensity: 'loud', style: 'glow'}});
  assert.deepEqual(plain(junk.T.settings()), plain(junk.T.DEFAULTS));
});

test('flash colours, intensity, style and neutral switch', () => {
  const {T} = page(), base = T.DEFAULTS;
  assert.deepEqual(plain(T.flashSpec('up', base)), {bg: 'rgba(0,200,83,0.32)', fg: null, duration: 650});
  assert.deepEqual(plain(T.flashSpec('down', base)), {bg: 'rgba(255,51,71,0.32)', fg: null, duration: 650});
  assert.deepEqual(plain(T.flashSpec('neutral', base)), {bg: 'rgba(255,184,0,0.32)', fg: null, duration: 650});
  assert.equal(T.flashSpec('up', {...base, intensity: 'strong'}).fg, '#000000', 'solid block keeps contrast with black text');
  assert.deepEqual(plain(T.flashSpec('down', {...base, style: 'text'})), {bg: null, fg: '#FF3347', duration: 650});
  assert.deepEqual(plain(T.flashSpec('up', {...base, style: 'both', intensity: 'subtle'})), {bg: 'rgba(0,200,83,0.12)', fg: '#00C853', duration: 650});
  assert.equal(T.flashSpec('neutral', {...base, neutral: false}), null);
  assert.equal(T.flashSpec('up', {...base, enabled: false}), null);
  assert.equal(T.flashSpec('sideways', base), null);
});

/* ---------------- painter (DOM) ---------------- */
test('a cell rendered right after its tick flashes; the flash is on that cell only', async () => {
  const {doc, T, flush} = page(), host = doc.getElementById('host');
  T.ingest('px:AAPL', 149.30, {digits: 2}); T.ingest('px:AAPL', 149.35, {digits: 2});
  const row = doc.createElement('div'), sym = doc.createElement('b'), price = T.mark(cell(doc, '149.35'), 'px:AAPL', 149.35), chg = T.mark(cell(doc, '−3.91%'), 'chg:AAPL', -3.91);
  chg.classList.add('fx-down'); row.append(sym, price, chg); host.append(row); await flush();
  assert.ok(price.classList.contains('fx-tk-1') && price.classList.contains('fx-tk-b'));
  assert.equal(price.dataset.tickDir, 'up');
  assert.equal(price.style.getPropertyValue('--fx-tk-bg0'), 'rgba(0,200,83,0.32)');
  assert.ok(!row.className.includes('fx-tk') && !sym.className.includes('fx-tk') && !chg.className.includes('fx-tk'), 'row, label and day-change cell untouched');
  assert.ok(chg.classList.contains('fx-down'), 'day change keeps its red tone');
});

test('no flash on initial load, remount after the window, tab switch, or for identical data', async () => {
  const {doc, T, advance, flush} = page(), host = doc.getElementById('host');
  T.ingest('px:MSFT', 410, {digits: 2});
  const first = T.mark(cell(doc, '410.00'), 'px:MSFT', 410); host.append(first); await flush();
  assert.equal(first.dataset.tickDir, undefined, 'initial value');
  T.ingest('px:MSFT', 411, {digits: 2}); advance(700);
  host.replaceChildren(T.mark(cell(doc, '411.00'), 'px:MSFT', 411)); await flush();
  assert.equal(host.firstChild.dataset.tickDir, undefined, 'remounted after the highlight ended');
  T.ingest('px:MSFT', 411, {digits: 2});
  host.replaceChildren(T.mark(cell(doc, '411.00'), 'px:MSFT', 411)); await flush();
  assert.equal(host.firstChild.dataset.tickDir, undefined, 'identical data');
});

test('a redraw during a flash continues it; a value that is not the ticked one does not flash', async () => {
  const {doc, T, advance, flush} = page(), host = doc.getElementById('host');
  T.ingest('px:ETH-USD', 3000, {digits: 2}); T.ingest('px:ETH-USD', 2990, {digits: 2}); advance(200);
  host.replaceChildren(T.mark(cell(doc, '2,990.00'), 'px:ETH-USD', 2990)); await flush();
  assert.equal(host.firstChild.dataset.tickDir, 'down');
  assert.equal(host.firstChild.style.getPropertyValue('--fx-tk-delay'), '-200ms', 'continues from 200 ms in');
  host.replaceChildren(T.mark(cell(doc, '3,012.40'), 'px:ETH-USD', 3012.4)); await flush();
  assert.equal(host.firstChild.dataset.tickDir, undefined, 'a screener snapshot price for the same market is not this tick');
});

test('persistent cells restart their flash on every new tick (alternating animations, no timers)', () => {
  const {doc, T} = page(), n = cell(doc, '0'); doc.body.append(n);
  T.update(n, 'oflow:BTC/USD:mid', 90000.5, {digits: 2});
  assert.equal(n.dataset.tickDir, undefined, 'baseline');
  T.update(n, 'oflow:BTC/USD:mid', 90001.0, {digits: 2});
  assert.ok(n.classList.contains('fx-tk-1')); assert.equal(n.dataset.tickDir, 'up');
  T.update(n, 'oflow:BTC/USD:mid', 90000.0, {digits: 2});
  assert.ok(n.classList.contains('fx-tk-2') && !n.classList.contains('fx-tk-1')); assert.equal(n.dataset.tickDir, 'down');
  n.dispatchEvent(Object.assign(new (n.ownerDocument.defaultView.Event)('animationend'), {animationName: 'fxtk2'}));
  assert.ok(![...n.classList].some(c => c.startsWith('fx-tk')) && n.dataset.tickDir === undefined, 'cleaned up when the animation ends');
});

test('live cells on full pages update their own text and tone in place', async () => {
  const {doc, T, flush} = page(), host = doc.getElementById('host');
  T.ingest('px:NVDA', 166.19, {digits: 2}); T.ingest('chg:NVDA', -4.34, {digits: 2});
  const px = T.mark(cell(doc, '166.19'), 'px:NVDA', 166.19, {live: 'num', digits: 2}), ch = T.mark(cell(doc, '−4.34%'), 'chg:NVDA', -4.34, {live: 'pct', digits: 2});
  ch.classList.add('fx-down'); host.append(px, ch); await flush();
  T.ingest('px:NVDA', 1166.5, {digits: 2}); T.ingest('chg:NVDA', 0.25, {digits: 2});
  assert.equal(px.textContent, '1,166.50'); assert.equal(px.dataset.tickDir, 'up');
  assert.equal(ch.textContent, '+0.25%'); assert.ok(ch.classList.contains('fx-up') && !ch.classList.contains('fx-down'));
});

test('switching highlighting off stops flashes and clears running ones; neutral can be switched off alone', async () => {
  const {doc, T, flush} = page(), host = doc.getElementById('host');
  T.ingest('px:GLD', 250); T.ingest('px:GLD', 251);
  const a = T.mark(cell(doc, '251'), 'px:GLD', 251); host.append(a); await flush();
  assert.equal(a.dataset.tickDir, 'up');
  T.setSettings({enabled: false});
  assert.equal(a.dataset.tickDir, undefined);
  T.ingest('px:GLD', 252); host.replaceChildren(T.mark(cell(doc, '252'), 'px:GLD', 252)); await flush();
  assert.equal(host.firstChild.dataset.tickDir, undefined);
  T.setSettings({enabled: true, neutral: false});
  T.ingest('cb:fed', '4.25%', {neutral: true}); T.ingest('cb:fed', '4.00%', {neutral: true});
  host.replaceChildren(T.mark(cell(doc, '4.00%'), 'cb:fed', null)); await flush();
  assert.equal(host.firstChild.dataset.tickDir, undefined);
});

test('observe(): derived values flash only right after a real data batch, never on a plain redraw', () => {
  const {T, advance} = page();
  T.observe('port:value', 10000, {digits: 0});
  assert.equal(T.observe('port:value', 10100, {digits: 0}), null, 'no data batch yet: redraw only');
  T.commit(); assert.equal(T.observe('port:value', 10200, {digits: 0}), 'up');
  advance(5000); assert.equal(T.observe('port:value', 9000, {digits: 0}), null, 'remount long after the batch');
  T.commit({silent: true}); assert.equal(T.observe('port:value', 9500, {digits: 0}), null, 'silent batches do not count');
});

test('SETTINGS page: Market Data Display section with all five controls', () => {
  const p = page(), pages = {}, T = {el: (t, c, x) => { const n = p.doc.createElement(t); if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; },
    btn: (x, c, f) => { const b = p.doc.createElement('button'); b.textContent = x; b.className = c || ''; b.addEventListener('click', f); return b; }, PAGE_NAMES: ['HELP'], KEYS: [['F1', 'Help', 'help']]};
  const PG = {add: (n, l, r) => { pages[n] = r; }, setHead() {}, rerender: () => { host.replaceChildren(); pages.settings(host); },
    section: t => { const s = p.doc.createElement('section'); const h = p.doc.createElement('h2'); h.textContent = t; s.append(h); return s; }, sourceNote: t => T.el('p', 'pg-note', t)};
  const host = p.doc.createElement('div');
  for (const plug of p.w.FynxTerminalPlugins) plug(T, PG);
  assert.ok(pages.settings && T.PAGE_NAMES.includes('SETTINGS') && T.KEYS.some(k => k[2] === 'settings'));
  pages.settings(host);
  assert.equal(host.querySelector('h2').textContent, 'Market Data Display');
  const labels = [...host.querySelectorAll('.fx-mdd-label b')].map(b => b.textContent);
  assert.deepEqual(labels, ['Live Tick Highlighting', 'Highlight Duration', 'Highlight Intensity', 'Highlight Style', 'Neutral Update Highlighting']);
  const groups = [...host.querySelectorAll('.fx-mdd-opts')].map(g => [...g.querySelectorAll('button')].map(b => b.textContent));
  assert.deepEqual(groups[1], ['300ms', '500ms', '650ms', '1000ms']); assert.deepEqual(groups[2], ['Subtle', 'Standard', 'Strong']); assert.deepEqual(groups[3], ['Background', 'Text', 'Background + Text']);
  const pressed = [...host.querySelectorAll('[aria-pressed="true"]')].map(b => b.textContent);
  assert.deepEqual(pressed, ['On', '650ms', 'Standard', 'Background', 'On']);
  [...host.querySelectorAll('.fx-mdd-opts')[1].querySelectorAll('button')].find(b => b.textContent === '1000ms').click();
  assert.equal(p.T.settings().duration, 1000);
  assert.equal(JSON.parse(p.w.localStorage.getItem('fx-term-market-display')).duration, 1000);
});

/* ---------------- Terminal integration (static wiring) ---------------- */
test('the Terminal loads tick.js before its pages, plugins and app, with versioned URLs', () => {
  const html = read('terminal.html'), at = s => html.indexOf(s);
  assert.ok(at('/assets/js/terminal/tick.js?v=') > 0);
  for (const f of ['pages.js', 'portfolio.js', 'scanner.js', 'orderflow.js', 'world.js', 'app.js']) assert.ok(at('/assets/js/terminal/tick.js') < at('/assets/js/terminal/' + f + '?v='), f);
});

test('app.js commits ticks before redrawing, never on start-up, and tags every live value panel', () => {
  const app = read('assets/js/terminal/app.js');
  assert.ok(!/S\.prev\b|fx-flash/.test(app), 'old per-panel flash removed (one shared system)');
  assert.match(app, /commitTicks\(true\);[^\n]*\n\s*renderDeskBar\(\); renderAll\(\)/, 'start-up commit is silent and precedes the first render');
  assert.match(app, /await loadQuotes\(\); commitTicks\(\); renderQuotesAll\(\)/);
  assert.match(app, /loadQuotes\(\)\.then\(\(\) => \{ commitTicks\(true\); renderQuotesAll\(\);/, 'returning to the tab re-baselines');
  for (const key of ["'px:' + id", "'chg:' + id", "'bid:' + p", "'ask:' + p", "'ust:10Y'", '`curve:${area}:${r.tenor}`', "ecoKey(e) + ':f'", '`opt:${u.symbol}:px`', "'px:' + s.symbol"]) assert.ok(app.includes(key), key);
  const heat = app.slice(app.indexOf('function renderHeat'), app.indexOf('function periodReturn'));
  assert.ok(heat && !/\btk\(|data-tick/.test(heat), 'heat map keeps its performance colours, no tick flashing');
  assert.ok(!/\btk\(|data-tick/.test(read('assets/js/terminal/heatmaps.js')), 'heat map plugin untouched');
});

test('pages, portfolio, scanner, world, order flow and builder widgets use the shared system', () => {
  assert.match(read('assets/js/terminal/pages.js'), /live: 'num'/);
  assert.match(read('assets/js/terminal/portfolio.js'), /TK\.observe\('port:value'/);
  assert.match(read('assets/js/terminal/scanner.js'), /TICK_FIELD = \{price: 'px:', chg: 'chg:'\}/);
  assert.match(read('assets/js/terminal/world.js'), /'px:' \+ m\.fx/);
  assert.match(read('assets/js/terminal/orderflow.js'), /oflow:\$\{OF\.pair\}:mid/);
  const core = read('assets/js/terminal/builder-core.js');
  assert.match(core, /tick: tickCell/); assert.match(core, /FYNX\.tick\(price, quote\.symbol, quote\.price\)/);
  assert.match(read('assets/js/terminal/builder.js'), /display: tickDisplay\(\)/);
});

test('CSS: rectangular cell flash, no layout properties, reduced-motion fallback', () => {
  const css = read('assets/css/terminal-all.css'), block = css.slice(css.indexOf('@property --fx-tk-bg'), css.indexOf('.fx-mdd-row'));
  assert.ok(block.includes('@keyframes fxtk1') && block.includes('@keyframes fxtk2'));
  assert.match(block, /@media \(prefers-reduced-motion:reduce\)\{\.fx-tk-1,\.fx-tk-2\{animation-timing-function:steps\(1,end\)\}\}/);
  for (const banned of ['border-radius', 'box-shadow', 'padding', 'margin', 'width', 'transform', 'font-size', 'filter']) assert.ok(!block.includes(banned), 'no ' + banned);
  assert.ok(!/fx-flash-up|fxfu/.test(css), 'old flash styles replaced');
});
