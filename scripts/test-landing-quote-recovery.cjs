'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const code=fs.readFileSync(path.join(__dirname,'..','assets/js/terminal-landing-live.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function setup(){
  const dom=new JSDOM(`<!doctype html><html><body>
    <section id="landingLiveNews"></section>
    <p id="landingNewsStatus"></p>
    <section id="landingHeadlineGrid"></section>
    <p id="landingHeadlineStatus"></p>
    <table><tbody id="landingQuoteRows"><tr><td>Checking indicative market quotes…</td></tr></tbody></table>
    <p id="landingQuoteStatus">Checking sources…</p>
  </body></html>`,{url:'https://www.fynxfinanceworld.com/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window, requests=[];
  w.setInterval=()=>0;
  w.FynxEdition={get:()=> 'us',editions:[{id:'us',label:'US'}]};
  w.FynxTerminalData={
    instruments:[{symbol:'EURUSD=X',shortName:'EUR/USD',name:'Euro / US Dollar'}],
    loadBriefing:async()=>({items:[],message:'No new stories.'}),
    loadQuotes:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))
  };
  w.eval(code);
  await tick();
  await tick();
  assert.equal(requests.length,1,'Expected the initial quote request');
  return {dom,w,requests,refresh:async()=>{
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    await tick();
    assert.ok(requests.length>=1,'Expected a subsequent quote refresh');
  }};
}
const sample={
  stale:false,
  quotes:{'EURUSD=X':{symbol:'EURUSD=X',price:1.0831,sourceURL:'https://example.com/eurusd',source:'Exchange reference',currency:'USD',asOf:'2026-11-23T15:00:00Z',changePercent:0.12,basis:'Previous close'}}
};

test('first quote request failure replaces indefinite loading placeholder with an honest error',async()=>{
  const a=await setup();
  try{
    a.requests.shift().reject(new Error('Network unavailable'));
    await tick();
    const rows=a.w.document.getElementById('landingQuoteRows');
    const status=a.w.document.getElementById('landingQuoteStatus');
    assert.doesNotMatch(rows.textContent,/Checking indicative market quotes/);
    assert.match(rows.textContent,/quotes are unavailable/i);
    assert.equal(rows.querySelector('td').colSpan,3);
    assert.match(status.textContent,/No quote values have been loaded/i);
  }finally{a.dom.window.close();}
});

test('later failed refresh keeps dated quotes visible, explicitly marks them as potentially stale, and recovers',async()=>{
  const a=await setup();
  try{
    a.requests.shift().resolve(sample);
    await tick();
    const rows=a.w.document.getElementById('landingQuoteRows');
    const status=a.w.document.getElementById('landingQuoteStatus');
    const verified=rows.textContent;
    assert.match(verified,/1\.0831/);
    assert.match(status.textContent,/Global indicative instruments/);

    await a.refresh();
    a.requests.shift().reject(new Error('Timeout'));
    await tick();
    assert.equal(rows.textContent,verified,'Verified last quotes must not disappear on a failed refresh');
    assert.match(status.textContent,/Previously loaded quote values remain visible and may be out of date/i);
    assert.match(status.textContent,/source timestamps/i);

    await a.refresh();
    a.requests.shift().resolve({...sample,quotes:{'EURUSD=X':{...sample.quotes['EURUSD=X'],price:1.0842}}});
    await tick();
    assert.match(rows.textContent,/1\.0842/);
    assert.doesNotMatch(status.textContent,/refresh failed/i);
  }finally{a.dom.window.close();}
});

test('an empty verified-source snapshot is an unavailable state and never erases prior dated quotes',async()=>{
  const a=await setup();
  try{
    const rows=a.w.document.getElementById('landingQuoteRows');
    const status=a.w.document.getElementById('landingQuoteStatus');
    a.requests.shift().resolve({quotes:{},status:'unavailable'});
    await tick();
    assert.match(rows.textContent,/quotes are unavailable/i);
    assert.match(status.textContent,/No quote values have been loaded/i);

    await a.refresh();
    a.requests.shift().resolve(sample);
    await tick();
    const prior=rows.textContent;
    assert.match(prior,/1\.0831/);

    await a.refresh();
    a.requests.shift().resolve({quotes:{},status:'unavailable'});
    await tick();
    assert.equal(rows.textContent,prior);
    assert.match(status.textContent,/may be out of date/i);
  }finally{a.dom.window.close();}
});

test('the landing page loads the versioned live quote script',()=>{
  assert.match(html,/src="\/assets\/js\/terminal-landing-live\.js\?v=20261123-quote-recovery-1"/);
});
