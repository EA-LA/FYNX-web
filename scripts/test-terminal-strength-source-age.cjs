'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

// Exercise the production Terminal plugin with its actual render callback; no live feeds or account data.
const source = readFileSync(join(__dirname, '../assets/js/terminal/strength.js'), 'utf8');
const symbols = ['EURUSD=X','GBPUSD=X','AUDUSD=X','NZDUSD=X','JPY=X','CAD=X','CHF=X'];
function quotes(asOf = new Date(Date.now() - 60000).toISOString()) {
  return Object.fromEntries(symbols.map(symbol => [symbol, {changePercent:1.2,asOf}]));
}
function render(quotesBySymbol) {
  const root = node('section');
  const state = {};
  const window = {FynxTerminalPlugins:[]};
  const document = {
    getElementById: () => ({}), // Skip injecting styles; this test targets the rendered status.
    createTextNode: text => node('#text','',text)
  };
  vm.runInNewContext(source,{window,document,setInterval:()=>0,Date},{filename:'strength.js'});
  const T = {
    store:{get:key=>key === 'str-win' ? 'td' : '',set(){}},
    el:node,
    quoteFor:symbol=>quotesBySymbol[symbol],
    finite:Number.isFinite,
    panel:()=>root,
    setText:(key,value)=>{state[key]=value;},
    tabs:()=>{},
    signed:value=>Number(value).toFixed(2)+'%',
    tone:()=>'',ago:iso=>'age('+iso+')',
    empty:(host,message)=>{host.append(node('p','fx-empty',message));},
    PANELS:{},PANEL_DESC:{},LINK_LABEL:{},RENDER:{},
    TABBED:new Set(),EXTRA_GROUPS:[],DESK_DEFS:{}
  };
  assert.equal(window.FynxTerminalPlugins.length,1);
  window.FynxTerminalPlugins[0](T,null);
  T.RENDER.str();
  const foot = find(root,n=>n.className === 'fx-foot');
  return {text:foot?.textContent || '',root,summary:state['n-str']};
}
function node(tag,className='',text='') {
  return {tag,className,textContent:String(text),children:[],style:{},
    setAttribute(){},append(...items){this.children.push(...items);}};
}
function find(node,predicate) {
  if (predicate(node)) return node;
  for (const child of node.children) { const hit = find(child,predicate); if (hit) return hit; }
  return null;
}

test('shows the oldest pair timestamp, not the newest update',()=>{
  const q = quotes();
  const oldest = new Date(Date.now()-5*3600000).toISOString();
  const latest = new Date(Date.now()-10000).toISOString();
  q['EURUSD=X'].asOf = oldest;
  q['GBPUSD=X'].asOf = latest;
  const result = render(q);
  assert.match(result.text,/oldest source quote/);
  assert.ok(result.text.includes('age('+oldest+')'));
  assert.ok(!result.text.includes('age('+latest+')'));
  assert.match(result.summary, /▲/); // Strength was still computed and ranked.
});
test('shows precise oldest age when all seven source times match',()=>{
  const at = new Date(Date.now()-120000).toISOString();
  const result = render(quotes(at));
  assert.ok(result.text.includes('oldest source quote age('+at+')'));
});
test('does not imply complete freshness when one source timestamp is missing',()=>{
  const q = quotes();
  delete q['CAD=X'].asOf;
  const result = render(q);
  assert.match(result.text,/source time unavailable for one or more pairs/);
  assert.ok(!result.text.includes('oldest source quote'));
  assert.match(result.summary,/▲/);
});
test('does not display invalid or far-future timestamps as fresh',()=>{
  for (const at of ['not-a-date','2999-01-01T00:00:00Z']) {
    const q = quotes();
    q['CHF=X'].asOf = at;
    assert.match(render(q).text,/source time unavailable for one or more pairs/);
  }
});
test('still shows a waiting state when an FX quote is unavailable',()=>{
  const q = quotes();
  delete q['EURUSD=X'];
  const result = render(q);
  assert.equal(result.text,'');
  assert.ok(find(result.root,n=>n.className==='fx-empty'));
});
