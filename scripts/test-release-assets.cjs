'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {build,VERSION}=require('./build-release-assets.cjs');

test('cache versioning reaches module importers without touching runtime expressions, selectors or external paths',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fynx-release-assets-'));
  const write=(file,source)=>fs.writeFileSync(path.join(root,file),source);
  const read=file=>fs.readFileSync(path.join(root,file),'utf8');
  try {
    for(const dir of ['assets/js','auth','tools','scripts','output','vendor'])fs.mkdirSync(path.join(root,dir),{recursive:true});
    write('index.html','<script src="assets/js/entry.js?v=old"></script><script src="fynx-nav.js?mode=reader&amp;v=old#anchor"></script><script src="https://cdn.example/fynx-nav.js?v=old"></script><script src="vendor/fynx-nav.js?v=old"></script>');
    write('assets/js/entry.js',"import './session-bootstrap.js?v=old';");
    write('assets/js/session-bootstrap.js','import {bootstrapSession} from "./session-manager.js?v=old";');
    const runtime="const selector='#dateChip';const other='#file.js';const color='#24332b';const fragment='#';const query='?';const lookalike='?file.js';const kind='a';const conditional=kind==='a'?'b':'c';";
    write('assets/js/terminal-home.js',runtime);
    write('auth/login.html','<script src="./auth-form.js?v=old"></script>');
    write('tools/nested.html','<script src="../fynx-nav.js"></script>');
    write('scripts/example.html','<script src="/fynx-nav.js?v=old"></script>');
    write('output/preview.html','<script src="/fynx-nav.js?v=old"></script>');
    const first=build(root);
    assert(first.assets.includes('assets/js/session-bootstrap.js'));assert(first.assets.includes('assets/js/entry.js'));
    assert(read('assets/js/entry.js').includes('?v='+VERSION));assert(read('assets/js/session-bootstrap.js').includes('?v='+VERSION));
    assert(read('index.html').includes('assets/js/entry.js?v='+VERSION));assert(read('index.html').includes('mode=reader&amp;v='+VERSION+'#anchor'));
    assert(read('index.html').includes('https://cdn.example/fynx-nav.js?v=old'));assert(read('index.html').includes('vendor/fynx-nav.js?v=old'));
    assert(read('auth/login.html').includes('./auth-form.js?v='+VERSION));assert(read('tools/nested.html').includes('../fynx-nav.js?v='+VERSION));
    assert(read('scripts/example.html').includes('?v=old'));assert(read('output/preview.html').includes('?v=old'));
    assert.equal(read('assets/js/terminal-home.js'),runtime);assert.doesNotThrow(()=>new vm.Script(read('assets/js/terminal-home.js')));
    assert.equal(build(root).changed.length,0);
    write('index.html','<script src="assets/js/entry.js?v=regenerated"></script>');
    assert.deepEqual(build(root).changed,['index.html']);assert(read('index.html').includes('?v='+VERSION));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
