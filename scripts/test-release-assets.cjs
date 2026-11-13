'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {build,VERSION,ASSET_VERSIONS,rewriteReferences,ASSETS}=require('./build-release-assets.cjs');
const {publicSiteFiles,isPublicSitePath,PUBLIC_DIRECTORIES}=require('./public-site-files.cjs');

test('public traversal includes published routes and excludes test, private, hidden and unrecognized source directories',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fynx-public-traversal-'));
  const canary='<script src="/fynx-nav.js?v=fixture-original"></script>';
  const publicFiles=['index.html','api/index.html','edge-radar/eurusd/index.html','profile/accounts/index.html','profile/accounts/connect/file/index.html','auth/login.html','learn/lessons/forex/example.html','intelligence/example-article/index.html','assets/js/example.js'];
  const privateFiles=['tests/accounts/fixtures/mt4-statement.html','tests/accounts/example.js','backend/private.html','lib/source.js','content/template.html','config/private.html','docs/guide.html','scripts/example.html','functions/source.js','new-private-service/example.html','.accounts-data/records.html','.edge-data/private.html','.quant-data/private.html','.git/private.html','node_modules/example/index.html','dist/index.html','output/preview.html','tools/fixtures/statement.html','assets/__tests__/example.js','assets/.private/example.js','assets/vendor/example.js'];
  try {
    for(const file of [...publicFiles,...privateFiles]){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),canary);}
    fs.symlinkSync(path.join(root,'tests/accounts/fixtures/mt4-statement.html'),path.join(root,'tools/linked.html'));
    fs.symlinkSync(path.join(root,'tests/accounts'),path.join(root,'tools/linked-directory'));
    const expectedHTML=publicFiles.filter(file=>file.endsWith('.html')).sort();
    assert.deepEqual(publicSiteFiles(root).sort(),expectedHTML);
    assert(isPublicSitePath('profile/accounts/connect/ea/index.html'));
    for(const file of ['../private.html','/tests/private.html','tools/../../private.html','tools\\private.html','tests/accounts/fixtures/mt4-statement.html','assets/.private/example.js'])assert.equal(isPublicSitePath(file),false,file);
    const packagedDirectories=fs.readFileSync(path.join(__dirname,'package-static.cjs'),'utf8').match(/const directories = (\[[^;]+\]);/)[1];
    assert.deepEqual(vm.runInNewContext(packagedDirectories).join(','),PUBLIC_DIRECTORIES.join(','),'Traversal must match the public packaging roots');
    const result=build(root);
    assert.deepEqual(result.changed.sort(),publicFiles.slice().sort());
    for(const file of privateFiles)assert.equal(fs.readFileSync(path.join(root,file),'utf8'),canary,'Build mutated non-public source: '+file);
    assert.equal(fs.readFileSync(path.join(root,'tools/linked.html'),'utf8'),canary,'Build followed a private symlink');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

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

test('workspace validation release changes only its asset cache identity',()=>{
 const source=`<script src="/assets/js/shared-workspace.js?v=old"></script><script src="/assets/js/account-sync.js?v=${VERSION}"></script>`;
 const updated=rewriteReferences(source,'workspace.html',new Set(ASSETS));
 assert(updated.includes('shared-workspace.js?v='+ASSET_VERSIONS['assets/js/shared-workspace.js']));
 assert(updated.includes('account-sync.js?v='+VERSION));
 assert.equal(rewriteReferences(updated,'workspace.html',new Set(ASSETS)),updated);
});
