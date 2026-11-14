'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/js/quant/app.js','utf8'),start=source.indexOf('  function reconcileSaved('),end=source.indexOf('  function pendingSavedMessage',start),context={};vm.runInNewContext(source.slice(start,end)+';globalThis.reconcile=reconcileSaved;',context);
const reconcile=(local,remote,pending=[])=>context.reconcile(local,remote,new Set(pending),r=>({...r}));
test('Quant cloud edits and deletes replace confirmed local records',()=>{const result=reconcile([{id:'a',name:'Old'},{id:'deleted',name:'Deleted on iPhone'}],[{id:'a',name:'Edited on iPhone'}]);assert.equal(result.rows.length,1);assert.equal(result.rows[0].name,'Edited on iPhone');});
test('Quant retains only explicit pending device saves absent from cloud',()=>{const result=reconcile([{id:'pending',name:'Offline draft'},{id:'removed'}],[],['pending']);assert.equal(result.rows.length,1);assert.equal(result.rows[0].id,'pending');assert(result.pending.has('pending'));});
test('Quant confirmed remote copy wins over ambiguous lost-ack local draft',()=>{const result=reconcile([{id:'a',name:'Local'}],[{id:'a',name:'Edited on iPhone'}],['a']);assert.equal(result.rows[0].name,'Edited on iPhone');assert.equal(result.pending.size,0);});
