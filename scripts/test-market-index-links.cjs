'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'markets/index.html'), 'utf8');
const sections = ['currencies','crypto','indicators','patterns','volatility','correlation','cot','liquidity','historical-data'];

test('market directory exposes real, crawlable links to all nine implemented sections', () => {
  assert.match(html, /<nav class="market-grid" aria-label="Market research sections">/);
  assert.equal((html.match(/class="market-card"/g) || []).length, sections.length);
  for (const section of sections) {
    assert.match(html, new RegExp('<a class="market-card" href="/markets/' + section + '\\.html" data-market="' + section + '">'));
    const page = path.join(root, 'markets', section + '.html');
    assert.ok(fs.existsSync(page), section + ' must have a real destination');
    assert.match(fs.readFileSync(page, 'utf8'), /<h1[^>]*>[^<]+/i);
  }
});

test('each static card has readable text and responsive keyboard styling', () => {
  const cards = [...html.matchAll(/<a class="market-card"[^>]+>([\s\S]*?)<\/a>/g)];
  assert.equal(cards.length, sections.length);
  for (const [, body] of cards) {
    assert.match(body, /<strong>[^<]+<\/strong>/);
    assert.match(body, /<span>[^<]{20,}<\/span>/);
  }
  assert.match(html, /\.market-card:focus-visible/);
  assert.match(html, /@media\(max-width:600px\)/);
});

test('no placeholder text or obsolete section-only navigation remains', () => {
  assert.doesNotMatch(html, /Placeholder|Add your UI|Add your real content|Add the real dashboards/i);
  assert.doesNotMatch(html, /href="index\.html\?section=/);
  assert.match(html, /Market data can be delayed or unavailable/);
});

const inline = html.match(/<script data-market-redirect>([\s\S]*?)<\/script>/);
function redirect(query) {
  assert.ok(inline, 'legacy route script exists');
  const replaced = [];
  const links = sections.map(section => ({ dataset: { market: section }, href: 'https://www.fynxfinanceworld.com/markets/' + section + '.html' }));
  const location = { search: query, replace: url => replaced.push(url) };
  vm.runInNewContext(inline[1], {
    URLSearchParams,
    location,
    document: { querySelectorAll: selector => {
      assert.equal(selector, 'a[data-market]');
      return links;
    } },
  });
  return replaced;
}

test('legacy ?section= routes replace the placeholder URL with their working page', () => {
  for (const section of sections) {
    assert.deepEqual(redirect('?section=' + section), ['https://www.fynxfinanceworld.com/markets/' + section + '.html']);
  }
  assert.deepEqual(redirect('?section=VIX'), []);
  assert.deepEqual(redirect('?section=CRYPTO'), ['https://www.fynxfinanceworld.com/markets/crypto.html']);
});

test('unknown and injection-shaped section queries never navigate', () => {
  for (const query of ['', '?section=', '?section=unknown', '?section=javascript%3Aalert(1)', '?section=..%2F..%2Fowner']) {
    assert.deepEqual(redirect(query), []);
  }
});

const historical = fs.readFileSync(path.join(root, 'markets/historical-data.html'), 'utf8');
function historicalHarness(initialAsset = 'EUR/USD', initialPeriod = '1 Week', supportsObserver = true) {
  const scripts = [], storage = {}, windowEvents = {}, timers = new Map(), observers = [];
  let nextTimer = 0, frame = null;
  class FakeObserver {
    constructor(callback) { this.callback = callback; this.active = false; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  function node(props = {}) {
    const listeners = {};
    return { ...props, addEventListener(type, callback) { listeners[type] = callback; },
      fire(type) { listeners[type](); } };
  }
  const els = {
    asset: node({ value: initialAsset }), period: node({ value: initialPeriod }),
    histResult: node(), histPending: node(), histApply: node(), themeLabel: node(), themeToggle: node(),
    histWidget: node({ querySelector(selector) { return selector === 'iframe' ? frame : { appendChild(script) { scripts.push(script); } }; } })
  };
  Object.defineProperty(els.histWidget, 'innerHTML', { set() { frame = null; } });
  const source = historical.match(/<script data-historical-chart>([\s\S]*?)<\/script>/);
  assert.ok(source, 'historical chart script is present');
  vm.runInNewContext(source[1], {
    MutationObserver: supportsObserver ? FakeObserver : undefined,
    setTimeout(callback, delay) { assert.equal(delay, 15000); const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: { getElementById(id) { return els[id]; }, createElement() { return {}; }, body: { classList: { toggle() {} } } },
    window: { FynxPreferences: { getItem(key) { return storage[key]; }, setItem(key,value) { storage[key] = value; } },
      addEventListener(type, callback) { windowEvents[type] = callback; } }
  });
  const latest = () => JSON.parse(scripts.at(-1).textContent);
  const expire = () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } };
  const insertFrame = () => { frame = {}; for (const observer of observers) if (observer.active) observer.callback(); };
  return { els, scripts, latest, storage, windowEvents, timers, observers, expire, insertFrame };
}
test('historical chart starts with the restored valid controls and honest request status', () => {
  const { els, latest } = historicalHarness('Gold', '3 Months');
  assert.equal(latest().symbol, 'OANDA:XAUUSD');
  assert.equal(latest().range, '3M');
  assert.equal(els.histPending.hidden, true);
  assert.match(els.histResult.textContent, /Requested 3 Months view for Gold/);
  assert.match(historical, /id="histResult" role="status"/);
});
test('historical chart theme changes do not apply unsubmitted market and range selections', () => {
  const { els, scripts, latest, storage, windowEvents } = historicalHarness();
  els.asset.value = 'BTC/USD'; els.asset.fire('change');
  els.period.value = '1 Year'; els.period.fire('change');
  assert.equal(els.histPending.hidden, false);
  assert.equal(scripts.length, 1);
  els.themeToggle.fire('click');
  assert.equal(latest().theme, 'dark');
  assert.equal(latest().symbol, 'FX:EURUSD');
  assert.equal(latest().range, '5D');
  storage.fynx_theme = 'light'; windowEvents.storage({ key: 'fynx_theme' });
  assert.equal(latest().symbol, 'FX:EURUSD');
  assert.match(els.histResult.textContent, /EUR\/USD/);
  els.histApply.fire('click');
  assert.equal(latest().symbol, 'BITSTAMP:BTCUSD');
  assert.equal(latest().range, '12M');
  assert.equal(els.histPending.hidden, true);
});
test('historical chart ignores obsolete provider failures and enables a real retry', () => {
  const { els, scripts, latest } = historicalHarness();
  const first = scripts[0];
  els.asset.value = 'Gold'; els.asset.fire('change'); els.histApply.fire('click');
  first.onerror();
  assert.match(els.histResult.textContent, /^Requested.*Gold/);
  scripts.at(-1).onerror();
  assert.match(els.histResult.textContent, /Could not load.*Gold.*retry/);
  els.histApply.fire('click');
  assert.equal(latest().symbol, 'OANDA:XAUUSD');
  assert.match(els.histResult.textContent, /^Requested/);
});
test('historical chart ignores unknown configuration values rather than sending them to the provider', () => {
  const { els, scripts } = historicalHarness();
  els.asset.value = '__proto__'; els.asset.fire('change'); els.histApply.fire('click');
  assert.equal(scripts.length, 1);
  assert.equal(els.histPending.hidden, false);
});

test('historical chart reports a silent missing frame and recovers when it arrives late', () => {
  const h = historicalHarness();
  h.expire();
  assert.match(h.els.histResult.textContent, /has not appeared yet.*retry/);
  assert.equal(h.timers.size, 0);
  h.insertFrame();
  assert.match(h.els.histResult.textContent, /Chart frame opened.*data may be delayed.*blank/);
  assert.equal(h.observers.filter(o => o.active).length, 0);
});
test('historical chart frame arrival cancels the timeout without claiming verified prices', () => {
  const h = historicalHarness();
  h.insertFrame();
  assert.equal(h.timers.size, 0);
  assert.match(h.els.histResult.textContent, /Chart frame opened.*data may be delayed/);
  h.expire();
  assert.doesNotMatch(h.els.histResult.textContent, /has not appeared/);
});
test('historical chart superseded timers and observers cannot overwrite a new selection', () => {
  const h = historicalHarness();
  const oldTimer = [...h.timers.values()][0], oldObserver = h.observers[0];
  h.els.asset.value = 'Gold'; h.els.asset.fire('change'); h.els.histApply.fire('click');
  assert.equal(h.timers.size, 1);
  assert.equal(oldObserver.active, false);
  oldTimer(); oldObserver.callback();
  assert.match(h.els.histResult.textContent, /^Requested.*Gold/);
  h.scripts.at(-1).onerror();
  assert.equal(h.timers.size, 0);
  assert.equal(h.observers.filter(o => o.active).length, 0);
  assert.match(h.els.histResult.textContent, /Could not load.*Gold/);
});
test('historical chart checks for a frame at the deadline without MutationObserver', () => {
  const missing = historicalHarness('Gold', '1 Week', false);
  missing.expire();
  assert.match(missing.els.histResult.textContent, /has not appeared yet/);
  const present = historicalHarness('Gold', '1 Week', false);
  present.insertFrame(); present.expire();
  assert.match(present.els.histResult.textContent, /Chart frame opened.*Gold/);
});

const indicators = fs.readFileSync(path.join(root, 'markets/indicators.html'), 'utf8');
function indicatorHarness({ observer = true } = {}) {
  const source = [...indicators.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(([, s]) => s.includes('embed-widget-technical-analysis.js'));
  assert.ok(source, 'indicator embed script exists');
  let latest, theme, timerId = 0;
  const timers = new Map(), requests = [], watches = [];
  function node(props = {}) {
    const handlers = new Map(), attrs = new Map();
    return Object.assign({
      addEventListener(type, h) { handlers.set(type, h); },
      setAttribute(k, v) { attrs.set(k, v); },
      getAttribute(k) { return attrs.get(k); },
      fire(type) { handlers.get(type)?.(); },
    }, props);
  }
  const wrap = {
    set innerHTML(_) {
      latest = { frame:false,
        querySelector(selector) { return selector === 'iframe' && this.frame; },
        appendChild(script) { requests.push({script, container:this}); } };
    },
    querySelector() { return latest; }
  };
  const els = {techWidget:wrap, techWidgetReload:node(), techWidgetStatus:node(), themeToggle:node(), themeLabel:node()};
  class Observer {
    constructor(callback) { this.callback = callback; watches.push(this); }
    observe(container, options) { assert.ok(options.subtree); this.container = container; this.active = true; }
    disconnect() { this.active = false; }
  }
  vm.runInNewContext(source[1], {
    window:{FynxPreferences:{getItem:()=>theme, setItem:(k,v)=>{theme=v;}},addEventListener(){}},
    document: {getElementById:id=>els[id], createElement:()=>({}), body:{classList:{toggle(){}}}},
    setTimeout(fn,delay){assert.equal(delay,15000);timers.set(++timerId,fn);return timerId;},
    clearTimeout(id){timers.delete(id);},
    MutationObserver:observer ? Observer : undefined
  });
  const insertFrame = (which = -1) => {
    const {container} = requests.at(which); container.frame = true;
    for (const watch of watches.filter(x => x.active && x.container === container)) watch.callback();
  };
  const expire = () => { for (const [id,fn] of [...timers]) { timers.delete(id);fn(); } };
  return {els, requests, watches, timers, expire, insertFrame};
}

test('the free Indicators overview exposes an accessible loading/failure message and stable retry control', () => {
  assert.match(indicators, /id="techWidgetStatus" role="status"/);
  assert.match(indicators, /id="techWidgetReload" type="button"/);
  const {els,requests,insertFrame} = indicatorHarness();
  assert.match(els.techWidgetStatus.textContent, /Opening/);
  assert.equal(els.techWidgetReload.getAttribute('aria-disabled'),'true');
  els.techWidgetReload.fire('click');
  assert.equal(requests.length,1);
  requests[0].script.onerror();
  assert.match(els.techWidgetStatus.textContent, /Could not load.*indicator reference/);
  assert.equal(els.techWidgetReload.getAttribute('aria-disabled'),'false');
  assert.equal(els.techWidget.hidden,true);
  els.techWidgetReload.fire('click');
  assert.equal(requests.length,2);
  assert.equal(els.techWidget.hidden,false);
  assert.equal(JSON.parse(requests[1].script.innerHTML).symbol,'FX:EURUSD');
  insertFrame();
  assert.equal(els.techWidgetStatus.textContent,'');
  assert.equal(els.techWidgetReload.getAttribute('aria-disabled'),'false');
});

test('a script that loads without mounting an iframe times out, but a late frame clears the warning', () => {
  const {els,requests,watches,timers,expire,insertFrame} = indicatorHarness();
  requests[0].script.onload();
  assert.match(els.techWidgetStatus.textContent, /Opening/);
  expire();
  assert.match(els.techWidgetStatus.textContent, /has not appeared/);
  assert.equal(els.techWidgetReload.getAttribute('aria-disabled'),'false');
  insertFrame();
  assert.equal(els.techWidgetStatus.textContent,'');
  assert.equal(watches.filter(x=>x.active).length,0);
  assert.equal(timers.size,0);
});

test('an outdated theme render cannot bury a new embed with a late error or iframe', () => {
  const {els,requests,watches,timers,insertFrame} = indicatorHarness();
  const oldTimer=[...timers.values()][0], oldObserver=watches[0];
  els.themeToggle.fire('click');
  assert.equal(JSON.parse(requests[1].script.innerHTML).colorTheme,'dark');
  requests[0].script.onerror(); insertFrame(0); oldObserver.callback(); oldTimer();
  assert.match(els.techWidgetStatus.textContent,/Opening/);
  assert.equal(els.techWidget.hidden,false);
  assert.equal(watches.filter(x=>x.active).length,1);
  insertFrame();
  assert.equal(els.techWidgetStatus.textContent,'');
});

test('older browsers can detect a mounted frame without MutationObserver', () => {
  const {els,insertFrame,expire} = indicatorHarness({observer:false});
  insertFrame();
  expire();
  assert.equal(els.techWidgetStatus.textContent,'');
  assert.equal(els.techWidgetReload.getAttribute('aria-disabled'),'false');
});

const currencies = fs.readFileSync(path.join(root, 'markets/currencies.html'), 'utf8');
function conversionHarness({amount = '12.34', rate = 1.09} = {}) {
  function control(value) {
    const listeners = {};
    return {value, textContent:'', addEventListener(type, fn) { listeners[type] = fn; },
      fire(type, event) { return listeners[type]?.(event); }};
  }
  const els = {amount:control(amount), pair:control('EURUSD'), fxResult:control(), fxConvertForm:control()};
  const start = currencies.indexOf('    let conversionRequest=');
  const end = currencies.indexOf('    function renderWidget()', start);
  assert.ok(start >= 0 && end > start, 'Find the converter wiring, not the third-party quote widget');
  const requests = [];
  let complete;
  const ctx = vm.createContext({
    document:{getElementById:id=>els[id]}, AbortSignal,
    fetch(url) {
      requests.push(url);
      return Promise.resolve({ok:true, json:() => complete || Promise.resolve({rate,date:'2026-11-26'})});
    }
  });
  vm.runInContext(currencies.slice(start,end),ctx);
  return {els, requests, convert:()=>vm.runInContext('convertFx()',ctx), delay:()=>new Promise(resolve=>{
    complete = new Promise(finish=>resolve(finish));
  })};
}

test('Currencies converter submits natively from the amount field without reloading', async () => {
  const h = conversionHarness();
  assert.match(currencies, /<form [^>]*id="fxConvertForm"[^>]*>[\s\S]*<input [^>]*step="any"[^>]*id="amount"[\s\S]*<button [^>]*type="submit"[^>]*>Calculate<\/button>\s*<\/form>/);
  let prevented=false;
  await h.els.fxConvertForm.fire('submit',{preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.match(h.els.fxResult.textContent,/12\.34 EUR ≈ 13\.45 USD/);
  assert.deepEqual(h.requests,['https://api.frankfurter.dev/v2/providers/ecb/rate/eur/usd']);
});

test('Currencies distinguishes a tiny positive conversion from an actual zero', async () => {
  const h = conversionHarness({amount:'0.0001'});
  await h.convert();
  assert.match(h.els.fxResult.textContent,/^0\.0001 EUR ≈ <0\.01 USD · Rate 1\.09 · Observation 2026-11-26$/);
  h.els.amount.value='0';
  await h.convert();
  assert.match(h.els.fxResult.textContent,/^0 EUR ≈ 0 USD/);
  h.els.amount.value='0.007';
  await h.convert();
  assert.match(h.els.fxResult.textContent,/^0\.007 EUR ≈ 0\.01 USD/);
});

test('Currencies handles overflow and does not render results after the input changes', async () => {
  const h = conversionHarness({amount:'1e308',rate:2});
  await h.convert();
  assert.match(h.els.fxResult.textContent,/too large to convert/i);
  const release = await h.delay();
  h.els.amount.value='100';
  const request=h.convert();
  h.els.amount.value='12';
  h.els.amount.fire('input');
  release({rate:1.09,date:'2026-11-26'});
  await request;
  assert.equal(h.els.fxResult.textContent,'Press Calculate to convert this amount.');
});
