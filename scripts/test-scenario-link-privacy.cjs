const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the production controller against a small, controlled DOM surface.
const source = fs.readFileSync(path.join(__dirname, '../assets/js/scenario-link.js'), 'utf8');

function setup({ search = '?source=workspace', clipboard = 'success' } = {}) {
  const base = 'https://www.fynxfinanceworld.com/tools/profit-loss.html';
  const fields = {
    accountSize: { id: 'accountSize', tagName: 'INPUT', value: '25000' },
    riskPercent: { id: 'riskPercent', tagName: 'INPUT', value: '1' },
    method: { id: 'method', tagName: 'SELECT', value: 'classic', options: [{ value: 'classic' }, { value: 'camarilla' }] }
  };
  let status;
  let handler;
  let calculateCount = 0;
  const run = { click: () => { calculateCount += 1; } };
  const button = {
    getAttribute: key => ({'data-scenario-fields':'accountSize,riskPercent,method','data-scenario-run':'calculateBtn'})[key],
    parentElement: { parentNode: { insertBefore: node => { status = node; } }, nextSibling: null },
    addEventListener: (name, cb) => { if (name === 'click') handler = cb; }
  };
  const document = {
    readyState: 'complete',
    getElementById: id => id === 'calculateBtn' ? run : fields[id] || null,
    querySelectorAll: q => q === '[data-scenario-fields]' ? [button] : [],
    createElement: tag => ({tagName:tag.toUpperCase(), attributes:{}, children:[], setAttribute(k,v){this.attributes[k]=v;}, appendChild(node){this.children.push(node);}, focus(){this.focused=true;},select(){this.selected=true;}})
  };
  const copied = [];
  const navigator = {};
  if (clipboard !== 'missing') navigator.clipboard = {writeText: (link) => {
    copied.push(link);
    return clipboard === 'reject' ? Promise.reject(new Error('Clipboard denied')) : Promise.resolve();
  }};
  let historyChanges = 0;
  const window = {
    location:{origin:'https://www.fynxfinanceworld.com',pathname:'/tools/profit-loss.html', search},
    history:{replaceState:()=>{historyChanges+=1;}}
  };
  vm.runInNewContext(source,{document,navigator,window,URLSearchParams,Number,String,Array,isFinite});
  return { fields, copied, click:()=>handler(), status:()=>status, calculateCount:()=>calculateCount, historyChanges:()=>historyChanges, currentUrl:()=>base+search };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('copy shares values without putting account balances in browser history', async () => {
  const s = setup();
  s.click(); await flush();
  assert.equal(s.copied.length, 1);
  const link = new URL(s.copied[0]);
  assert.equal(link.pathname, '/tools/profit-loss.html');
  assert.equal(link.searchParams.get('accountSize'), '25000');
  assert.equal(link.searchParams.get('riskPercent'), '1');
  assert.equal(link.searchParams.get('method'), 'classic');
  assert.equal(s.historyChanges(), 0);
  assert.equal(s.currentUrl(), 'https://www.fynxfinanceworld.com/tools/profit-loss.html?source=workspace');
  assert.match(s.status().textContent,/Anyone who opens it sees these inputs/);
});

test('opening a shared link still restores numeric and selected inputs and calculates', () => {
  const s = setup({search:'?accountSize=9000&riskPercent=2.5&method=camarilla'});
  assert.equal(s.fields.accountSize.value, '9000');
  assert.equal(s.fields.riskPercent.value, '2.5');
  assert.equal(s.fields.method.value, 'camarilla');
  assert.equal(s.calculateCount(), 1);
  assert.match(s.status().textContent,/Opened a shared scenario/);
  assert.equal(s.historyChanges(), 0);
});

test('malformed shared inputs are ignored rather than injected into calculator', () => {
  const s = setup({search:'?accountSize=%3Cscript%3E&riskPercent=NaN&method=hacked'});
  assert.equal(s.fields.accountSize.value, '25000');
  assert.equal(s.fields.riskPercent.value, '1');
  assert.equal(s.fields.method.value, 'classic');
  assert.equal(s.calculateCount(), 0);
});

test('clipboard-unavailable fallback makes a selectable link without changing URL', () => {
  const s = setup({clipboard:'missing'});
  s.click();
  assert.equal(s.status().children.length, 1);
  const input = s.status().children[0];
  assert.equal(input.readOnly, true);
  assert.equal(input.focused, true);
  assert.equal(input.selected, true);
  assert.match(input.value,/accountSize=25000/);
  assert.equal(s.historyChanges(), 0);
});

test('denied clipboard permission keeps fallback available', async () => {
  const s = setup({clipboard:'reject'});
  s.click(); await flush();
  assert.equal(s.status().children[0].attributes['aria-label'],'Scenario link');
  assert.equal(s.historyChanges(),0);
});
