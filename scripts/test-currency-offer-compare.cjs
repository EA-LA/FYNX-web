'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('tools/currency.html');
const script=read('assets/js/currency-offer-compare.js');
const ids=['offer-a-rate','offer-a-fee','offer-b-rate','offer-b-fee'];

function open(t){
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://www.fynxfinanceworld.com/tools/currency.html'});
  const {window}=dom,d=window.document,id=name=>d.getElementById(name);
  t.after(()=>window.close());
  window.matchMedia=()=>({matches:false,addEventListener(){}});
  const controller=[...d.scripts].find(x=>x.textContent.includes('function clearForm()'));
  assert.ok(controller);
  window.eval(controller.textContent);
  for(const [name,value] of [['fromCurrency','USD'],['toCurrency','EUR'],['amount','1000']])id(name).value=value;
  assert.equal(id('currency-offer-run').disabled,true);
  window.eval(read('assets/vendor/decimal.js'));
  window.eval(script);
  assert.equal(id('currency-offer-run').disabled,false);
  const mode=name=>id(name).textContent;
  const status=()=>mode('currency-offer-status');
  const edit=(name,value)=>{id(name).value=value;id(name).dispatchEvent(new window.Event('input',{bubbles:true}));};
  const compare=(...values)=>{
    values.forEach((s,i)=>edit(ids[i],s));
    id('currency-offer-run').click();
    return [mode('offer-a-net'),mode('offer-b-net')];
  };
  return {d,id,status,mode,edit,compare};
}

test('a better headline rate can deliver less after a fixed fee',t=>{
  const p=open(t);
  assert.equal(p.mode('currency-offer-basis'),'Rates in EUR per 1 USD. Fees in USD.');
  assert.deepEqual(p.compare('0.93','20','0.92','0'),['911.40 EUR','920.00 EUR']);
  assert.match(p.status(),/^Offer B delivers 8.60 EUR more/);
  assert.deepEqual(p.compare('0.92','0','0.92','0'),['920.00 EUR','920.00 EUR']);
  assert.equal(p.status(),'Both offers deliver the same amount.');
  assert.equal(p.id('customRate').value,'');
  assert.equal(p.id('shareScenarioBtn').dataset.scenarioFields,'amount,fromCurrency,toCurrency,customRate,referenceRate');
  assert.doesNotMatch(script,/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|clipboard/);
});

test('invalid fees, tiny differences and edited amount are handled without stale results',t=>{
  const p=open(t);
  assert.deepEqual(p.compare('0.93000001','0','0.93','0'),['930.00001 EUR','930.00 EUR']);
  assert.match(p.status(),/^Offer A delivers 0.00001 EUR more/);
  p.edit('amount','20');
  assert.equal(p.id('currency-offer-results').hidden,true);
  assert.match(p.status(),/Inputs changed/);
  assert.deepEqual(p.compare('0.93','20','0.92','0'),['','']);
  assert.match(p.status(),/fee must be less/);
  for(const bad of ['','-1','0x1','1e-2','0.000000001']){
    assert.deepEqual(p.compare('0.93',bad,'0.92','0'),['','']);
    assert.match(p.status(),/Enter a positive budget/);
  }
});

test('changing direction never reuses quotes for the old pair; going back restores inputs but not results',t=>{
  const p=open(t);
  p.compare('0.93','20','0.92','0');
  p.id('swapBtn').click();
  assert.equal(p.mode('currency-offer-basis'),'Rates in USD per 1 EUR. Fees in EUR.');
  assert.equal(p.id('currency-offer-results').hidden,true);
  assert.deepEqual(ids.map(name=>p.id(name).value),['','','','']);
  assert.deepEqual(p.compare('1.07','0','1.08','0'),['1070.00 USD','1080.00 USD']);
  p.id('swapBtn').click();
  assert.equal(p.mode('currency-offer-basis'),'Rates in EUR per 1 USD. Fees in USD.');
  assert.equal(p.id('currency-offer-results').hidden,true);
  assert.deepEqual(ids.map(name=>p.id(name).value),['0.93','20','0.92','0']);
  assert.match(p.status(),/Review the restored offers/);
});

test('the public tool directory links to the original currency tool',t=>{
  const dom=new JSDOM(read('calculator.html'));
  t.after(()=>dom.window.close());
  assert.ok(dom.window.document.querySelector('article a[href="/tools/currency.html"]'));
});
