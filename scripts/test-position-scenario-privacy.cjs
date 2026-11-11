'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual Position Size scenario-link controller, not a reimplementation.
const html = fs.readFileSync(path.join(__dirname, '../tools/position-size.html'), 'utf8');
const match = html.match(/\(function scenarioLink\(\)\{[\s\S]*?\n    \}\)\(\);/);
assert.ok(match, 'Position Size scenario controller must exist');

function setup({search = '', clipboard = 'success', manual = false, initial = {}} = {}) {
  let click, replacements = 0, selected = 0, focused = 0, calculations = 0, manualClicks = 0;
  const copies = [];
  const status = {
    textContent: '', children: [],
    appendChild(el) { this.children.push(el); }
  };
  const button = {addEventListener(type, handler) {if (type === 'click') click = handler;}};
  const quoteRate = {value: initial.quoteUsdRate ?? '1.2'};
  const manualBtn = {click() {manualClicks += 1;}};
  const elements = {shareScenarioBtn: button, scenarioStatus: status, quoteUsdRate: quoteRate, manualModeBtn: manualBtn};
  const document = {
    getElementById(id) {return elements[id] || null;},
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(), value: '', readOnly: false,
        setAttribute(key, value) {this[key] = value;},
        focus() {focused += 1;},
        select() {selected += 1;}
      };
    }
  };
  const els = {
    pair: {value:initial.pair ?? 'EURUSD'},
    balance: {value:initial.balance ?? '25000'},
    riskPercent: {value:initial.riskPercent ?? '1'},
    riskDollars: {value:initial.riskDollars ?? '300'},
    stopPips: {value:initial.stopPips ?? '25'},
    manualPrice: {value:initial.price ?? '1.08'},
    manualPriceRow: {style:{display:manual?'block':'none'}}
  };
  const navigator = clipboard === 'missing' ? {} : {clipboard:{
    writeText(value) {
      copies.push(value);
      return clipboard === 'reject' ? Promise.reject(new Error('denied')) : Promise.resolve();
    }
  }};
  const location = {
    origin:'https://www.fynxfinanceworld.com',
    pathname:'/tools/position-size.html',
    search
  };
  const context = {
    document, els, navigator, location, URLSearchParams,
    history:{replaceState(){replacements += 1;}},
    pairs:['EURUSD','GBPUSD','XAUUSD'],
    isGoldPair: pair => pair === 'XAUUSD',
    usePercentRisk:true,
    setStopPipsDecimals(){},
    syncRiskUI(){},
    setMessage(){},
    calculate(){calculations += 1;},
    startAutoUpdates(){return Promise.resolve();},
    currentPrice: 0,
    manualMode: false
  };
  vm.runInNewContext(match[0], context, {filename:'position-size-scenario-controller.js'});
  assert.equal(typeof click, 'function');
  return {
    click, copies, status, els, quoteRate, context,
    historyChanges: () => replacements,
    selected: () => selected, focused: () => focused,
    calculations: () => calculations, manualClicks: () => manualClicks
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('copy includes risk assumptions without mutating browser history', async () => {
  const b = setup();
  b.click(); await settle();
  assert.equal(b.historyChanges(), 0);
  assert.equal(b.copies.length, 1);
  const link = new URL(b.copies[0]);
  assert.equal(link.pathname, '/tools/position-size.html');
  assert.equal(link.searchParams.get('pair'), 'EURUSD');
  assert.equal(link.searchParams.get('balance'), '25000');
  assert.equal(link.searchParams.get('riskPercent'), '1');
  assert.equal(link.searchParams.get('stopPips'), '25');
  assert.match(b.status.textContent, /Link copied/);
});

test('manual price and quote-rate scenarios still share valid inputs', async () => {
  const b = setup({manual:true, initial:{price:'1.0825',quoteUsdRate:'1.4'}});
  b.click(); await settle();
  const link = new URL(b.copies[0]);
  assert.equal(link.searchParams.get('price'), '1.0825');
  assert.equal(link.searchParams.get('quoteUsdRate'), '1.4');
  assert.equal(b.historyChanges(), 0);
});

test('invalid financial values are excluded from shared link', async () => {
  const b = setup({initial:{balance:'<script>',riskPercent:'999',stopPips:'NaN'}});
  b.click(); await settle();
  const link = new URL(b.copies[0]);
  assert.equal(link.searchParams.has('balance'), false);
  assert.equal(link.searchParams.has('riskPercent'), false);
  assert.equal(link.searchParams.has('stopPips'), false);
  assert.equal(b.historyChanges(), 0);
});

test('no clipboard permission gives a selectable link instead of modifying address bar', () => {
  const b = setup({clipboard:'missing'});
  b.click();
  assert.equal(b.status.children.length, 1);
  assert.equal(b.status.children[0].readOnly, true);
  assert.equal(b.status.children[0]['aria-label'], 'Scenario link');
  assert.equal(b.selected(), 1);
  assert.equal(b.focused(), 1);
  assert.equal(b.historyChanges(), 0);
});

test('rejected clipboard access falls back to selecting the generated link', async () => {
  const b = setup({clipboard:'reject'});
  b.click(); await settle();
  assert.equal(b.status.children.length, 1);
  assert.match(b.status.children[0].value, /balance=25000/);
  assert.equal(b.historyChanges(), 0);
});

test('opening a valid shared manual-risk link still restores fields and calculates', () => {
  const b = setup({search:'?pair=EURUSD&mode=usd&balance=6000&riskDollars=60&stopPips=15&price=1.2&quoteUsdRate=1.1'});
  assert.equal(b.els.balance.value, '6000');
  assert.equal(b.els.riskDollars.value, '60');
  assert.equal(b.els.stopPips.value, '15');
  assert.equal(b.els.manualPrice.value, '1.2');
  assert.equal(b.quoteRate.value, '1.1');
  assert.equal(b.context.usePercentRisk, false);
  assert.equal(b.manualClicks(), 1);
  assert.equal(b.calculations(), 1);
  assert.equal(b.historyChanges(), 0);
});