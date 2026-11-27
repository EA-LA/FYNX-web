'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const script=read('assets/js/pattern-examples.js');

function open(t){
  const dom=new JSDOM(read('markets/patterns.html'),{runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const {window}=dom,id=name=>window.document.getElementById(name);
  assert.equal(id('patternCompare').hidden,true);
  assert.equal(id('patternCompareLink').hidden,true);
  window.eval(script);
  return {window,id,change(which,index){
    const el=id(which);
    el.focus();el.value=String(index);el.dispatchEvent(new window.Event('change',{bubbles:true}));
    assert.equal(window.document.activeElement,el);
  }};
}

test('Markets links to a default comparison with labeled existing SVG and cues',t=>{
  const dir=new JSDOM(read('markets/index.html'));t.after(()=>dir.window.close());
  assert.ok(dir.window.document.querySelector('a.market-card[href="/markets/patterns.html"]'));
  const p=open(t);
  assert.equal(p.id('patternCompare').hidden,false);
  assert.equal(p.id('patternCompareLink').hidden,false);
  const titles=[...p.id('patternCompareGrid').querySelectorAll('h3')].map(el=>el.textContent);
  assert.deepEqual(titles,['Ascending Triangle','Descending Triangle']);
  assert.equal(p.id('patternCompareFirst').options.length,9);
  assert.match(p.id('patternCompareGrid').textContent,/Rising lows meet flat resistance/);
  assert.match(p.id('patternCompareGrid').textContent,/Lower highs meet flat support/);
  const charts=[...p.id('patternCompareGrid').querySelectorAll('svg')];
  assert.equal(charts.length,2);
  assert.notEqual(charts[0].querySelector('polyline').getAttribute('points'),charts[1].querySelector('polyline').getAttribute('points'));
  assert.match(charts[0].getAttribute('aria-label'),/^Ascending Triangle/);
  assert.match(charts[1].getAttribute('aria-label'),/^Descending Triangle/);
  assert.doesNotMatch(script,/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/);
});

test('comparison uses independent controls and no duplicate or stale diagrams',t=>{
  const p=open(t);
  assert.equal(p.id('patternExample').querySelector('h2').textContent,'Head and Shoulders');
  p.change('patternCompareFirst',5);
  assert.equal(p.id('patternCompareStatus').textContent,'Choose two different patterns to compare.');
  assert.equal(p.id('patternCompareGrid').children.length,0);
  p.change('patternCompareSecond',8);
  assert.match(p.id('patternCompareStatus').textContent,/Descending Triangle and Range \/ Box/);
  assert.equal(p.id('patternCompareGrid').children.length,2);
  p.window.document.querySelectorAll('button.pattern')[1].click();
  assert.equal(p.id('patternExample').querySelector('h2').textContent,'Inverse Head and Shoulders');
  assert.equal(p.window.document.activeElement,p.id('patternExample'));
  assert.equal(p.id('patternCompareGrid').children.length,2);
  assert.match(p.id('patternCompareStatus').textContent,/Descending Triangle and Range \/ Box/);
});
