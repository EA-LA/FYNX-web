'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const date = '2026-08-04T00:00:00.000';
const fixture = [
  ['EURO FX', '099741', '100','30','20','80','200'],
  ['NO OPEN INTEREST', '000001','0','0','0','0','0'],
  ['TINY NET', '000002','100','99','50','51','20000']
].map(([market_and_exchange_names,cftc_contract_market_code,noncomm_positions_long_all,noncomm_positions_short_all,comm_positions_long_all,comm_positions_short_all,open_interest_all])=>({
  market_and_exchange_names,cftc_contract_market_code,report_date_as_yyyy_mm_dd:date,
  noncomm_positions_long_all,noncomm_positions_short_all,comm_positions_long_all,comm_positions_short_all,open_interest_all
}));
const originalHeadings = ['Non-commercial net','Commercial net'];

test('normalized view uses the verified count snapshot, preserves filters, focus and raw CSV', async t=>{
  const p = new JSDOM(read('markets/cot.html'), { runScripts:'outside-only',url:'https://www.fynxfinanceworld.com/markets/cot.html' });
  t.after(()=>p.window.close());
  const w=p.window, d=w.document, id=name=>d.getElementById(name);
  const calls=[],csv=[];
  let fail=false;
  w.fetch=async url=>{
    const params=new URL(url).searchParams;
    calls.push(Object.fromEntries(params));
    if(fail)throw Error('fixture outage');
    return {ok:true,json:async()=>params.get('$limit')==='1'?[{report_date_as_yyyy_mm_dd:date}]:fixture};
  };
  w.Blob=class { constructor(parts){this.body=parts.join('');} };
  w.URL.createObjectURL=blob=>{csv.push(blob.body);return 'blob:fixture'};
  w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){};

  w.eval(read('assets/js/cot-feed.js'));
  await tick();await tick();
  const checkbox=id('cotNetPercent');
  const row=(index=0)=>id('cotRows').rows[index];
  const cells=(index=0)=>[...row(index).cells].slice(1,3).map(cell=>cell.textContent);
  const headings=()=>[id('cotNoncommercialHeading').textContent,id('cotCommercialHeading').textContent];
  const original=cells();
  const rowButton=row().querySelector('button');
  const expected=(n)=>new Intl.NumberFormat(undefined,{style:'percent',signDisplay:'exceptZero',maximumFractionDigits:2}).format(n);
  assert.deepEqual(headings(),originalHeadings);
  assert.deepEqual(original,['+70','-60']);
  id('cotExport').click();
  checkbox.focus();
  checkbox.click();
  assert.equal(d.activeElement,checkbox);
  assert.equal(row().querySelector('button'),rowButton,'normalization leaves the existing row and controls in place');
  assert.deepEqual(headings(),originalHeadings.map(h=>h+' (% of open interest)'));
  assert.deepEqual(cells(),[expected(.35),expected(-.3)]);
  assert.deepEqual(cells(1),['Not available','Not available']);
  assert.deepEqual(cells(2),['Net long <0.01%','Net short <0.01%']);
  assert.equal(calls.length,2,'normalization does not request data');
  id('cotExport').click();
  assert.equal(csv[1],csv[0],'CSV retains the raw counts in either view');
  rowButton.click();
  id('cotSavedOnly').click();
  assert.equal(id('cotRows').rows.length,1);
  assert.deepEqual(cells(),[expected(.35),expected(-.3)]);
  id('cotSearch').value='000002';
  id('cotSearch').dispatchEvent(new w.Event('input'));
  assert.equal(id('cotExport').disabled,true);
  id('cotSavedOnly').click();
  assert.deepEqual(cells(),['Net long <0.01%','Net short <0.01%']);
  assert.equal(calls.length,2);
  fail=true;
  id('cotRefresh').click();
  await tick();await tick();
  assert.match(id('cotStatus').textContent,/previous observations retained/);
  assert.deepEqual(cells(),['Net long <0.01%','Net short <0.01%']);
  id('cotSearch').value='EURO';
  id('cotSearch').dispatchEvent(new w.Event('input'));
  checkbox.click();
  assert.deepEqual(headings(),originalHeadings);
  assert.deepEqual(cells(),original);
});
