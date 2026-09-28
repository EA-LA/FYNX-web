'use strict';
// Builds only reviewed immutable documents; never labels a draft as effective.
const fs=require('node:fs'),path=require('node:path');
const {blockers,contentHash,digest}=require('../backend/developer-legal.cjs');
const config=path.resolve(__dirname,'../backend/legal-release.json'),r=JSON.parse(fs.readFileSync(config,'utf8'));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function html(name){const d=r.documents[name];return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FYNX API '+escape(name)+'</title><style>body{font:16px/1.65 system-ui;max-width:850px;margin:40px auto;padding:0 20px}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}a{color:#174c38}</style><a href="../../workspace.html#billing">Back to workspace</a><h1>FYNX API '+escape(name)+'</h1><p>Version '+escape(r.version)+'</p><article data-document-sha256="'+d.sha256+'"><pre>'+escape(d.body)+'</pre></article></html>\n';}
(async()=>{
 const missing=blockers(r,false);
 if(missing.length){console.error('Publication blocked:\n- '+missing.join('\n- '));process.exitCode=1;return;}
 const mode=process.argv[2];if(mode==='--check'){console.log('Reviewed content is ready to render. Live publication is a separate check.');return;}
 if(mode==='--render'){
  const dir=path.resolve(__dirname,'../api/legal',r.version);fs.mkdirSync(dir,{recursive:true});
  for(const name of ['terms','privacy','billing']){const file=path.join(dir,name+'.html'),body=html(name);if(fs.existsSync(file)){if(fs.readFileSync(file,'utf8')!==body)throw Error('Published versions are immutable. Create a new version.');}else fs.writeFileSync(file,body,{flag:'wx'});}
  console.log('Reviewed documents rendered. Deploy static pages, then run --verify-live before paid activation.');return;
 }
 if(mode==='--verify-live'){
  for(const name of ['terms','privacy','billing']){const url='https://www.fynxfinanceworld.com/api/legal/'+r.version+'/'+name+'.html',response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok||digest(await response.text())!==digest(html(name)))throw Error('Live document does not match reviewed content: '+name);}
  r.publication={bundle_sha256:contentHash(r),verified_at:new Date().toISOString()};fs.writeFileSync(config,JSON.stringify(r,null,2)+'\n');console.log('Exact live document bytes verified. Deploy the updated legal release manifest with the backend.');return;
 }
 throw Error('Use --check, --render or --verify-live.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
