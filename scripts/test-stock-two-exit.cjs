'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = p => fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const fields = ['entryPrice','stopLoss','stock-exit-total','stock-exit-first','stock-exit-target-one','stock-exit-target-two'];
const outputs = ['stock-exit-both','stock-exit-reverse','stock-exit-stop'];

function open(t) {
  const p = new JSDOM(read('tools/stock.html'),{runScripts:'outside-only'});
  t.after(() => p.window.close());
  const doc = p.window.document;
  const id = name => doc.getElementById(name);
  const script = read('assets/js/stock-two-exit.js');
  assert.equal(id('stock-exit-compare').disabled, true);
  p.window.eval(read('assets/vendor/decimal.js'));
  p.window.eval(script);
  assert.equal(id('stock-exit-compare').disabled, false);
  const edit = (name, value, event='input') => {
    id(name).value = value;
    id(name).dispatchEvent(new p.window.Event(event,{bubbles:true}));
  };
  return {doc,id,edit,script,calculate(values) {
    values.forEach((value,index)=>edit(fields[index],value));
    id('stock-exit-compare').click();
    return outputs.map(name=>id(name).textContent);
  }};
}

test('free directory and Stock Calculator expose and isolate the new panel', t => {
  const dir = new JSDOM(read('calculator.html'));
  t.after(() => dir.window.close());
  assert.ok(dir.window.document.querySelector('article a[href="/tools/stock.html"]'));
  const p = open(t);
  assert.ok(p.doc.querySelector('a[href="#stock-two-exits"]'));
  const src = Array.from(p.doc.scripts, script=>script.getAttribute('src')||'');
  const decimal = src.indexOf('/assets/vendor/decimal.js');
  assert.ok(decimal>=0 && src.indexOf('/assets/js/stock-two-exit.js?v=20261126')>decimal);
  assert.equal(p.id('shareScenarioBtn').dataset.scenarioFields,'accountSize,riskPercent,entryPrice,stopLoss');
  assert.doesNotMatch(p.script,/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|clipboard/);
});

test('long and short splits use the executed shares at each scenario price', t => {
  const p = open(t);
  assert.deepEqual(p.calculate(['100','98','100','40','104','110']), ['+$760.00','+$40.00','−$200.00']);
  assert.match(p.id('stock-exit-status').textContent, /^Long model: 40 shares.*60/);
  assert.deepEqual(p.calculate(['100','103','100','30','97','90']), ['+$790.00','−$120.00','−$300.00']);
  assert.match(p.id('stock-exit-status').textContent, /^Short model: 30 shares.*70/);
  assert.equal(p.id('sharesValue').textContent,'0 shares');
});

test('exact decimal arithmetic distinguishes a flat reversal from a small loss', t => {
  const p = open(t);
  assert.deepEqual(p.calculate(['1','0.99999999','2','1','1.00000001','1.00000003']),
    ['+$0.00000004','$0.00','−$0.00000002']);
});

test('invalid order and allocation suppress old figures; edits and Clear invalidate', t => {
  const p = open(t);
  p.calculate(['100','98','100','40','104','110']);
  assert.equal(p.id('stock-exit-results').hidden,false);
  p.edit('entryPrice','101','change');
  assert.equal(p.id('stock-exit-results').hidden,true);
  assert.match(p.id('stock-exit-status').textContent,/Inputs changed/);
  assert.deepEqual(p.calculate(['100','98','100','100','104','110']),['','','']);
  assert.match(p.id('stock-exit-status').textContent,/at least one share to each/);
  assert.deepEqual(p.calculate(['100','98','100','2.5','104','110']),['','','']);
  assert.deepEqual(p.calculate(['100','98','100','40','110','104']),['','','']);
  assert.match(p.id('stock-exit-status').textContent,/second target farther/);
  assert.deepEqual(p.calculate(['100','98','100','40','90','95']),['','','']);
  p.calculate(['100','98','100','40','104','110']);
  p.id('clearBtn').click();
  assert.equal(p.id('stock-exit-results').hidden,true);
  assert.equal(p.id('stock-exit-status').textContent,'');
});
