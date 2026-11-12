'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const helper = fs.readFileSync(path.join(root, 'assets/js/research/holding-undo.js'), 'utf8');
const modulePromise = import('data:text/javascript;charset=utf-8,' + encodeURIComponent(helper));
const personal = fs.readFileSync(path.join(root, 'assets/js/research/personal.js'), 'utf8');

test('manual position removal is an isolated snapshot with a 15-second undo window', async () => {
  const {stageHoldingRemoval,HOLDING_UNDO_WINDOW_MS} = await modulePromise;
  const original = {id:'holding-a',symbol:'AAPL',units:2,averageCost:180};
  const entry = stageHoldingRemoval(original,'fynx.research.v1.guest',7,1000);
  original.units = 0;
  assert.equal(entry.holding.units,2);
  assert.equal(HOLDING_UNDO_WINDOW_MS,15000);
  assert.equal(entry.expiresAt,16000);
});
test('undo requires the original account and an unchanged portfolio revision', async () => {
  const {stageHoldingRemoval,canUndoHolding} = await modulePromise;
  const item=stageHoldingRemoval({id:'x',symbol:'MSFT',units:1},'scope-A',3,100);
  assert.equal(canUndoHolding(item,'scope-A',3,15099),true);
  assert.equal(canUndoHolding(item,'scope-A',3,15100),false);
  assert.equal(canUndoHolding(item,'scope-B',3,200),false);
  assert.equal(canUndoHolding(item,'scope-A',4,200),false);
  assert.equal(canUndoHolding(null,'scope-A',3,200),false);
});
test('undo restores exactly the deleted position without modifying other holdings', async () => {
  const {stageHoldingRemoval,restoreRemovedHolding} = await modulePromise;
  const entry=stageHoldingRemoval({id:'a',symbol:'AAPL',units:1.25,averageCost:155},'guest',1,0);
  const existing=[{id:'b',symbol:'BTC-USD',units:.1,averageCost:25000}];
  restoreRemovedHolding(existing,entry);
  assert.deepEqual(existing,[{id:'b',symbol:'BTC-USD',units:.1,averageCost:25000},{id:'a',symbol:'AAPL',units:1.25,averageCost:155}]);
});
test('undo refuses duplicate identifiers and full portfolios', async () => {
  const {stageHoldingRemoval,restoreRemovedHolding} = await modulePromise;
  const entry=stageHoldingRemoval({id:'a',symbol:'AAPL',units:1},'guest',1,0);
  const duplicate=[{id:'a'}];
  assert.throws(()=>restoreRemovedHolding(duplicate,entry),/already exists/);
  assert.equal(duplicate.length,1);
  const full=Array.from({length:100},(_,i)=>({id:'id-'+i}));
  assert.throws(()=>restoreRemovedHolding(full,entry),/100-position/);
  assert.equal(full.length,100);
});
test('invalid removal snapshots are rejected before offering Undo', async () => {
  const {stageHoldingRemoval} = await modulePromise;
  assert.throws(()=>stageHoldingRemoval({},'scope',1,0),/invalid holding/);
  assert.throws(()=>stageHoldingRemoval({id:'a'},'',1,0),/invalid holding/);
  assert.throws(()=>stageHoldingRemoval({id:'a'},'scope',NaN,0),/invalid holding/);
});
test('production UI uses scoped local storage transaction and an accessible undo control', () => {
  assert.match(personal,/import\s*\{[^}]*stageHoldingRemoval[^}]*canUndoHolding[^}]*restoreRemovedHolding[^}]*\}\s*from\s*['"]\.\/holding-undo\.js['"]/);
  assert.match(personal,/data-undo-holding/);
  assert.match(personal,/aria-live="polite"/);
  assert.match(personal,/store\.transact\(s=>\{[\s\S]*?restoreRemovedHolding\(s\.holdings,queued\);[\s\S]*?\},queued\.scope\)/);
  assert.match(personal,/setTimeout\(\(\)=>\{/);
  assert.match(personal,/if\(changed\)\{previousScope=store\.key;lastRemoved=null;/);
});
