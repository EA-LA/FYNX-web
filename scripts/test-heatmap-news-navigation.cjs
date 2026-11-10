'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');

const root = path.join(__dirname, '..');
const moduleSource = readFileSync(path.join(root, 'assets/js/research/markets.js'), 'utf8')
  .replace(/^import .*;\\s*$/gm, '')
  .replace('export async function refreshHeatmap', 'async function refreshHeatmap');
const escapeHTML = value => String(value).replace(/[&<>"']/g, ch =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));

function workspace() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="heatmap-output"></div><div id="watchlist-controls"></div><div id="watch-chips"></div>
    <div id="heatmap-groups"></div><button id="refresh-heatmap"></button>
    <select id="heatmap-sort"><option value="symbol">Symbol</option></select>
    <select id="watch-symbol"></select><form id="watch-form"></form>
  </body></html>`, {url:'https://www.fynxfinanceworld.com/tools/research-heatmap.html'});
  const catalog = [
    {symbol:'AAPL',name:'Apple',group:'Stocks'},
    {symbol:'MSFT',name:'Microsoft',group:'Stocks'},
    {symbol:'BTC-USD',name:'Bitcoin',group:'Crypto'},
    {symbol:'XAU/USD',name:'Gold / USD',group:'FX'}
  ];
  const quoteCache = {
    AAPL: {price:201.25, changePercent:1.2, currency:'USD', asOf:'2026-11-10',
      source:'Yahoo Finance', basis:'Previous close', sourceURL:'https://finance.yahoo.com/quote/AAPL/'},
    'BTC-USD': {price:82000,changePercent:-2.5,currency:'USD',asOf:'2026-11-10',
      source:'Coinbase',basis:'Rolling 24h',sourceURL:'https://exchange.coinbase.com/trade/BTC-USD'}
  };
  const C = {catalog, symbolMap:Object.fromEntries(catalog.map(item=>[item.symbol,item])),
    finite:Number.isFinite, usableQuote:q=>Number.isFinite(q?.price)};
  const $ = selector => dom.window.document.querySelector(selector);
  const store = {state:{watchlist:['AAPL','BTC-USD']},key:'test',addEventListener(){}};
  const context = vm.createContext({
    C,$,escape:escapeHTML,number:value=>String(value),
    percent:value=>Number(value).toFixed(1)+'%',time:value=>value,
    ageLabel:()=> 'Previous session',errorHTML:()=>'',loading:()=>'',empty:()=>'',toast:()=>{},
    options:()=>{},quotes:async()=>({errors:{}}),quoteCache,store,
    location:dom.window.location, URL,encodeURIComponent
  });
  vm.runInContext(moduleSource, context, {timeout:1000});
  const render=()=>vm.runInContext('render()',context,{timeout:1000});
  return {dom,quoteCache,render,context};
}
function tile(document, symbol) {
  return [...document.querySelectorAll('.heat-tile')].find(el =>
    el.querySelector('.heat-symbol')?.textContent.trim()===symbol);
}

test('priced tiles have separate internal news and attributed external quote links', () => {
  const {dom,render}=workspace();render();
  const card=tile(dom.window.document,'AAPL');
  assert.ok(card);
  const links=[...card.querySelectorAll('a')];
  assert.equal(links.length,2);
  assert.equal(new URL(links[0].href).pathname,'/tools/symbol-news.html');
  assert.equal(new URL(links[0].href).searchParams.get('q'),'AAPL');
  assert.equal(links[1].href,'https://finance.yahoo.com/quote/AAPL/');
  assert.equal(links[1].target,'_blank');
  assert.match(links[1].rel,/noopener/);
  assert.match(links[1].rel,/noreferrer/);
  assert.ok(links.every(a=>a.hasAttribute('aria-label')));
  assert.equal(card.querySelector('a a'),null);
  assert.match(card.textContent,/Previous close/);
});
test('unavailable quotes still lead to contextual news without a misleading price source',()=>{
  const {dom,render}=workspace();render();
  const card=tile(dom.window.document,'MSFT');
  assert.match(card.textContent,/Quote unavailable/);
  assert.equal(card.querySelectorAll('a').length,1);
  assert.equal(new URL(card.querySelector('a').href).searchParams.get('q'),'MSFT');
});
test('crypto and special-character FX symbols survive the navigation round trip',()=>{
  const {dom,render,context}=workspace();
  vm.runInContext("group='Crypto'",context);render();
  assert.equal(new URL(tile(dom.window.document,'BTC-USD').querySelector('a').href).searchParams.get('q'),'BTC-USD');
  vm.runInContext("group='FX'",context);render();
  assert.equal(new URL(tile(dom.window.document,'XAU/USD').querySelector('a').href).searchParams.get('q'),'XAU/USD');
});
test('unsafe or malformed source URLs are not rendered as clickable links',()=>{
  const {dom,quoteCache,render}=workspace();
  quoteCache.AAPL.sourceURL='javascript:alert(1)';render();
  assert.equal(tile(dom.window.document,'AAPL').querySelectorAll('a').length,1);
  quoteCache.AAPL.sourceURL='not-a-url';render();
  assert.equal(tile(dom.window.document,'AAPL').querySelectorAll('a').length,1);
});
test('the receiving Symbol News page reads the same q parameter',()=>{
  const reader=readFileSync(path.join(root,'tools/symbol-news.html'),'utf8');
  assert.match(reader,/new URLSearchParams\\(location\\.search\\)\\.get\\("q"\\)/);
});
test('mobile actions remain available as 44px keyboard-focusable targets',()=>{
  const styles=readFileSync(path.join(root,'assets/research-desk.css'),'utf8');
  assert.match(styles,/\\.heat-actions a\\s*\\{[^}]*min-height:44px/);
  assert.match(styles,/\\.heat-actions a:focus-visible\\s*\\{/);
  assert.match(styles,/@media\\(max-width:520px\\)\\{\\.heat-actions a/);
});
