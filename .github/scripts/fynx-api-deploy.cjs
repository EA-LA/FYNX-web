'use strict';
// Keyless, source-only deployment helper for the FYNX developer API (Cloud Functions 1st gen).
//
// Commands (all read env PROJECT_ID, REGION, TARGETS, ACCESS_TOKEN; state lives in WORK_DIR):
//   inventory   Read-only snapshot of every function plus the target functions' settings.
//   fetch       Download the currently deployed source of each target (needs sourceCodeGet).
//   compare     Check each deployed developer file against every committed version in Git history.
//   bundle      Build and validate the minimal deploy package from backend/.
//   deploy      Upload the package and PATCH each target with updateMask=sourceUploadUrl only.
//   verify      Confirm new source is live, settings unchanged, other functions untouched; optional smoke key.
//   rollback    Re-upload each target's previous source (used automatically if verify fails).
//   report      Publish a check run summarising the results (no secret values, no file contents).
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),crypto=require('node:crypto');

const PROJECT=process.env.PROJECT_ID||'fynx-c7a28',REGION=process.env.REGION||'us-central1';
const TARGETS=(process.env.TARGETS||'developerGateway,developerWorkspace').split(',').map(s=>s.trim()).filter(Boolean);
const WORK=path.resolve(process.env.WORK_DIR||'.deploy-work'),ROOT=path.resolve(__dirname,'../..');
// Exactly the files the API functions load. Anything else in backend/ is deliberately excluded.
const BUNDLE_FILES=['developer-api.cjs','developer-core.cjs','developer-engine.cjs','developer-billing.cjs','developer-billing-policy.cjs','developer-analytics.cjs','developer-markets.cjs','developer-markets-data.cjs','package.json','package-lock.json'];
// Settings that a source-only update must never change.
const LOCKED=['runtime','entryPoint','availableMemoryMb','timeout','maxInstances','minInstances','serviceAccountEmail','ingressSettings','vpcConnector','dockerRegistry','kmsKeyName'];
const API=process.env.GCF_API_BASE||'https://cloudfunctions.googleapis.com'; // override only for local tests
fs.mkdirSync(WORK,{recursive:true});
const save=(f,v)=>fs.writeFileSync(path.join(WORK,f),JSON.stringify(v,null,2));
const load=(f,fb=null)=>{try{return JSON.parse(fs.readFileSync(path.join(WORK,f),'utf8'));}catch{return fb;}};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fnName=n=>`projects/${PROJECT}/locations/${REGION}/functions/${n}`;

async function gcf(method,url,body){
 const token=process.env.ACCESS_TOKEN;if(!token)throw new Error('ACCESS_TOKEN is not set.');
 const res=await fetch(url.startsWith('http')?url:API+url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const text=await res.text();let json;try{json=text?JSON.parse(text):{};}catch{json={raw:text.slice(0,300)};}
 if(!res.ok){const e=new Error(`${method} ${url.replace(API,'')} -> ${res.status} ${json?.error?.status||''}: ${json?.error?.message||''}`.trim());e.status=res.status;e.gstatus=json?.error?.status;throw e;}
 return json;
}
// Map a permission failure to the IAM permission that was missing, for the report.
function permissionNote(e,permission){return e.status===403?{permission,error:e.message}:null;}
function summarizeFn(f){
 return {name:f.name.split('/').pop(),status:f.status,runtime:f.runtime,entryPoint:f.entryPoint,availableMemoryMb:f.availableMemoryMb,timeout:f.timeout,maxInstances:f.maxInstances??null,minInstances:f.minInstances??null,serviceAccountEmail:f.serviceAccountEmail,ingressSettings:f.ingressSettings,vpcConnector:f.vpcConnector??null,dockerRegistry:f.dockerRegistry??null,kmsKeyName:f.kmsKeyName??null,
  securityLevel:f.httpsTrigger?.securityLevel??null,trigger:f.httpsTrigger?'https':f.eventTrigger?.eventType||'other',
  // Names and version references only. Secret values are never readable through this API.
  secrets:(f.secretEnvironmentVariables||[]).map(s=>({key:s.key,secret:s.secret,version:s.version})).sort((a,b)=>a.key.localeCompare(b.key)),
  envVarNames:Object.keys(f.environmentVariables||{}).sort(),labels:f.labels||{},versionId:f.versionId,updateTime:f.updateTime,buildId:f.buildId??null};
}

async function inventory(out='inventory.json'){
 const result={at:new Date().toISOString(),project:PROJECT,region:REGION,targets:{},all:[],permissions:[]};
 try{
  let page='',items=[];do{const r=await gcf('GET',`/v1/projects/${PROJECT}/locations/-/functions?pageSize=500${page?`&pageToken=${page}`:''}`);items=items.concat(r.functions||[]);page=r.nextPageToken||'';}while(page);
  result.all=items.map(f=>({name:f.name.split('/').slice(-3).join('/'),status:f.status,runtime:f.runtime,updateTime:f.updateTime,versionId:f.versionId})).sort((a,b)=>a.name.localeCompare(b.name));
 }catch(e){const n=permissionNote(e,'cloudfunctions.functions.list');if(n)result.permissions.push(n);else throw e;}
 try{const r=await gcf('GET',`/v2/projects/${PROJECT}/locations/-/functions?pageSize=500`);result.gen2=(r.functions||[]).map(f=>({name:f.name.split('/').slice(-3).join('/'),state:f.state,updateTime:f.updateTime})).sort((a,b)=>a.name.localeCompare(b.name));}catch(e){result.gen2_error=e.message;}
 for(const t of TARGETS){
  try{result.targets[t]=summarizeFn(await gcf('GET',`/v1/${fnName(t)}`));}
  catch(e){if(e.status===404)result.targets[t]={missing:true};else{const n=permissionNote(e,'cloudfunctions.functions.get');if(n){result.permissions.push(n);result.targets[t]={unreadable:true};}else throw e;}}
 }
 save(out,result);console.log(`Inventory: ${result.all.length} 1st-gen functions; targets ${TARGETS.map(t=>`${t}=${result.targets[t]?.status||'?'}`).join(', ')}; permission gaps ${result.permissions.length}`);
 return result;
}

async function download(t,dir){
 const {downloadUrl}=await gcf('POST',`/v1/${fnName(t)}:generateDownloadUrl`,{});
 const res=await fetch(downloadUrl);if(!res.ok)throw new Error(`Source download for ${t} failed: ${res.status}`);
 const zip=Buffer.from(await res.arrayBuffer());fs.mkdirSync(dir,{recursive:true});
 const zipPath=path.join(WORK,`${t}-previous.zip`);fs.writeFileSync(zipPath,zip);
 execFileSync('unzip',['-q','-o',zipPath,'-d',dir]);
 return {zip:zipPath,sha256:sha(zip),bytes:zip.length};
}
async function fetchSources(){
 const out={sources:{},permissions:[]};
 for(const t of TARGETS){
  try{out.sources[t]=await download(t,path.join(WORK,'previous',t));}
  catch(e){const n=permissionNote(e,'cloudfunctions.functions.sourceCodeGet');if(n){out.permissions.push(n);out.sources[t]={unreadable:true};}else throw e;}
 }
 save('sources.json',out);return out;
}

// Every version of a backend file ever committed, keyed by content hash.
function history(file){
 const rel=`backend/${file}`,hashes=new Map();
 let commits=[];try{commits=execFileSync('git',['log','--format=%H','--',rel],{cwd:ROOT,encoding:'utf8'}).trim().split('\n').filter(Boolean);}catch{}
 for(const c of commits){try{const b=execFileSync('git',['show',`${c}:${rel}`],{cwd:ROOT,maxBuffer:32*1024*1024});if(!hashes.has(sha(b)))hashes.set(sha(b),c.slice(0,7));}catch{/* file deleted in that commit */}}
 return {hashes,head:fs.existsSync(path.join(ROOT,rel))?sha(fs.readFileSync(path.join(ROOT,rel))):null};
}
function compare(){
 const src=load('sources.json',{sources:{}}),out={targets:{},drift:[],ok:true};
 for(const t of TARGETS){
  const dir=path.join(WORK,'previous',t);if(!fs.existsSync(dir)){out.targets[t]={skipped:'source not downloaded'};out.ok=false;continue;}
  const files={};
  for(const f of BUNDLE_FILES.filter(f=>f.endsWith('.cjs'))){
   const p=path.join(dir,f);if(!fs.existsSync(p)){files[f]='not_in_deployed_source';continue;}
   const h=sha(fs.readFileSync(p)),{hashes,head}=history(f);
   files[f]=h===head?'same_as_main':hashes.has(h)?`older_commit_${hashes.get(h)}`:'UNCOMMITTED_CHANGES';
   if(files[f]==='UNCOMMITTED_CHANGES'){out.drift.push(`${t}/${f}`);out.ok=false;}
  }
  const index=['index.js','index.cjs'].map(f=>path.join(dir,f)).find(fs.existsSync);
  const exportsList=index?[...fs.readFileSync(index,'utf8').matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map(m=>m[1]):[];
  const other=fs.readdirSync(dir).filter(f=>!BUNDLE_FILES.includes(f)&&f!=='node_modules'&&!/^index\.c?js$/.test(f));
  out.targets[t]={files,deployed_entry_exports:exportsList.length,deployed_other_files:other.length,archive_sha256:src.sources?.[t]?.sha256};
 }
 save('compare.json',out);console.log(JSON.stringify(out,null,1));
 if(!out.ok)process.exitCode=1;return out;
}

function bundle(){
 const dir=path.join(WORK,'bundle');fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
 for(const f of BUNDLE_FILES){const p=path.join(ROOT,'backend',f);if(!fs.existsSync(p))throw new Error(`Missing backend/${f}`);fs.copyFileSync(p,path.join(dir,f));}
 const pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));pkg.main='index.js';delete pkg.scripts;fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify(pkg,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'index.js'),["'use strict';","// Generated by .github/scripts/fynx-api-deploy.cjs. Deploy package for the FYNX developer API only.","const admin=require('firebase-admin');","if(!admin.apps.length)admin.initializeApp();","const api=require('./developer-api.cjs');",...TARGETS.map(t=>`exports.${t}=api.${t};`),''].join('\n'));
 // Validate: production dependency install from the lockfile, syntax, and every target export resolves to a handler.
 execFileSync('npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:dir,stdio:'inherit'});
 for(const f of fs.readdirSync(dir).filter(f=>/\.c?js$/.test(f)))execFileSync(process.execPath,['--check',path.join(dir,f)]);
 const probe=`const m=require(${JSON.stringify(path.join(dir,'index.js'))});const want=${JSON.stringify(TARGETS)};for(const t of want)if(typeof m[t]!=='function')throw new Error(t+' is not exported');const extra=Object.keys(m).filter(k=>!want.includes(k));if(extra.length)throw new Error('Unexpected exports: '+extra);console.log('Bundle exports OK: '+want.join(', '));`;
 execFileSync(process.execPath,['-e',probe],{cwd:dir,stdio:'inherit',env:{...process.env,GCLOUD_PROJECT:PROJECT,FIREBASE_CONFIG:JSON.stringify({projectId:PROJECT})}});
 const zipPath=path.join(WORK,'bundle.zip');fs.rmSync(zipPath,{force:true});
 execFileSync('zip',['-q','-r','-X',zipPath,'.','-x','node_modules/*'],{cwd:dir});
 const zip=fs.readFileSync(zipPath),files=Object.fromEntries(BUNDLE_FILES.concat('index.js').map(f=>[f,sha(fs.readFileSync(path.join(dir,f)))]));
 save('bundle.json',{zip:zipPath,sha256:sha(zip),bytes:zip.length,files,targets:TARGETS});console.log(`Bundle ready: ${zip.length} bytes, ${Object.keys(files).length} files.`);
}

async function waitOp(op,label){
 for(let i=0;i<120;i++){if(op.done){if(op.error)throw new Error(`${label} failed: ${op.error.message||JSON.stringify(op.error)}`);return op;}await new Promise(r=>setTimeout(r,5000));op=await gcf('GET',`/v1/${op.name}`);}
 throw new Error(`${label} did not finish within 10 minutes.`);
}
async function uploadAndPatch(t,zipPath,label){
 const {uploadUrl}=await gcf('POST',`/v1/projects/${PROJECT}/locations/${REGION}/functions:generateUploadUrl`,{});
 const zip=fs.readFileSync(zipPath);
 const put=await fetch(uploadUrl,{method:'PUT',headers:{'Content-Type':'application/zip','x-goog-content-length-range':'0,104857600'},body:zip});
 if(!put.ok)throw new Error(`Upload for ${t} failed: ${put.status}`);
 // updateMask=sourceUploadUrl: only the code changes. Memory, timeout, secrets, env vars, service account, trigger and IAM stay as they are.
 const op=await gcf('PATCH',`/v1/${fnName(t)}?updateMask=sourceUploadUrl`,{name:fnName(t),sourceUploadUrl:uploadUrl});
 await waitOp(op,`${label} ${t}`);console.log(`${label}: ${t} updated.`);
}
async function deploy(){
 const b=load('bundle.json'),cmp=load('compare.json'),inv=load('inventory.json');
 if(!b)throw new Error('Run bundle first.');if(!cmp?.ok)throw new Error('Source comparison did not pass; refusing to deploy.');
 for(const t of TARGETS){const s=inv?.targets?.[t];if(!s||s.missing||s.unreadable||s.status!=='ACTIVE')throw new Error(`${t} is not an existing ACTIVE function; this workflow only updates existing functions.`);}
 const done=[];
 try{for(const t of TARGETS){await uploadAndPatch(t,b.zip,'Deploy');done.push(t);}}
 finally{save('deployed.json',{deployed:done,at:new Date().toISOString()});}
}
async function rollback(){
 const d=load('deployed.json',{deployed:[]}),src=load('sources.json',{sources:{}}),out={rolled_back:[],failed:[]};
 for(const t of d.deployed){try{await uploadAndPatch(t,src.sources[t].zip,'Rollback');out.rolled_back.push(t);}catch(e){out.failed.push({target:t,error:e.message});}}
 save('rollback.json',out);console.log(JSON.stringify(out));if(out.failed.length)process.exitCode=1;
}

async function smoke(){
 const key=process.env.SMOKE_API_KEY,base=process.env.SMOKE_BASE||`https://${REGION}-${PROJECT}.cloudfunctions.net/developerGateway`,checks=[];
 const call=async(route,body,headers={})=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});let j=null;try{j=await r.json();}catch{}return {status:r.status,json:j};};
 const anon=await call('/v1/markets/exchanges',{});checks.push({check:'request without key is rejected',expected:401,got:anon.status,pass:anon.status===401});
 if(!key){checks.push({check:'authenticated route checks',skipped:'Optional FYNX_API_SMOKE_KEY secret not set'});return checks;}
 const auth={Authorization:`Bearer ${key}`};
 const cases=[
  ['/v1/markets/exchanges',{},j=>j?.result?.exchanges?.length===7],
  ['/v1/indicators/sma',{values:[1,2,3,4,5],period:3},j=>JSON.stringify(j?.result?.values)===JSON.stringify([null,null,'2','3','4'])],
  ['/v1/portfolio/drawdown',{equity:[100,120,90,130,110]},j=>j?.result?.max_drawdown_percent==='25'],
  ['/v1/markets/holidays',{exchange:'NYSE',year:2026},j=>j?.result?.days?.some(d=>d.date==='2026-11-26')],
  ['/v1/risk/risk-reward',{entry_price:'100',stop_loss_price:'90',take_profit_price:'130',direction:'long'},j=>j?.result?.rr_ratio==='3']
 ];
 for(const [route,body,ok] of cases){const r=await call(route,body,auth);const good=r.status===200&&!!ok(r.json);checks.push({check:`POST ${route}`,expected:'200 with the known result',got:r.status===200&&!good?'200 with an unexpected result':r.status,pass:good});}
 return checks;
}
async function verify(){
 const pre=load('inventory.json'),b=load('bundle.json'),post=await inventory('inventory-after.json'),problems=[],notes=[];
 for(const t of TARGETS){
  const a=pre.targets[t],z=post.targets[t];
  if(z?.status!=='ACTIVE')problems.push(`${t} status is ${z?.status}`);
  if(a.versionId===z.versionId)problems.push(`${t} version did not change (${a.versionId})`);
  for(const k of LOCKED)if(JSON.stringify(a[k])!==JSON.stringify(z[k]))problems.push(`${t} setting ${k} changed: ${JSON.stringify(a[k])} -> ${JSON.stringify(z[k])}`);
  if(JSON.stringify(a.secrets)!==JSON.stringify(z.secrets))problems.push(`${t} secret bindings changed`);
  if(JSON.stringify(a.envVarNames)!==JSON.stringify(z.envVarNames))problems.push(`${t} environment variable names changed`);
  if(a.securityLevel!==z.securityLevel||a.trigger!==z.trigger)problems.push(`${t} trigger changed`);
  if(JSON.stringify(a.labels)!==JSON.stringify(z.labels))notes.push(`${t} labels changed`);
  // The live source must be byte-identical to the validated bundle.
  const dir=path.join(WORK,'live',t);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  try{const {downloadUrl}=await gcf('POST',`/v1/${fnName(t)}:generateDownloadUrl`,{});const r=await fetch(downloadUrl);const zp=path.join(WORK,`${t}-live.zip`);fs.writeFileSync(zp,Buffer.from(await r.arrayBuffer()));execFileSync('unzip',['-q','-o',zp,'-d',dir]);
   for(const [f,h] of Object.entries(b.files))if(!fs.existsSync(path.join(dir,f))||sha(fs.readFileSync(path.join(dir,f)))!==h)problems.push(`${t} live file ${f} does not match the bundle`);}
  catch(e){problems.push(`${t} live source could not be verified: ${e.message}`);}
 }
 // Every other function must be untouched.
 const before=new Map(pre.all.map(f=>[f.name,f])),after=new Map(post.all.map(f=>[f.name,f])),mine=new Set(TARGETS.map(t=>`${REGION}/functions/${t}`));
 for(const [n,f] of before){if(mine.has(n))continue;const g=after.get(n);if(!g)problems.push(`${n} disappeared`);else if(g.versionId!==f.versionId||g.updateTime!==f.updateTime)problems.push(`${n} changed during this deployment`);}
 for(const n of after.keys())if(!before.has(n))problems.push(`${n} appeared during this deployment`);
 const checks=await smoke();for(const c of checks)if(c.pass===false)problems.push(`Smoke check failed: ${c.check} (got ${c.got})`);
 const out={ok:problems.length===0,problems,notes,smoke:checks,preserved_functions:post.all.length-TARGETS.length};
 save('verify.json',out);console.log(JSON.stringify(out,null,1));if(!out.ok)process.exitCode=1;
}

async function report(){
 const mode=process.env.MODE||'inventory',inv=load('inventory.json'),src=load('sources.json'),cmp=load('compare.json'),b=load('bundle.json'),d=load('deployed.json'),v=load('verify.json'),rb=load('rollback.json');
 const perms=[...(inv?.permissions||[]),...(src?.permissions||[])];
 const L=[];const line=s=>L.push(s);
 line(`Mode: **${mode}** · project \`${PROJECT}\` · region \`${REGION}\` · targets ${TARGETS.map(t=>`\`${t}\``).join(', ')}`);line('');
 if(perms.length){line('### Missing Google Cloud permissions');for(const p of perms)line(`- \`${p.permission}\` — ${p.error}`);line('');}
 if(inv){line('### Target functions (before)');line('| Function | Status | Runtime | Entry | Memory | Timeout | Max inst. | Service account | Secrets | Env var names | Version |');line('|---|---|---|---|---|---|---|---|---|---|---|');
  for(const t of TARGETS){const s=inv.targets[t]||{};line(s.missing?`| ${t} | NOT FOUND |||||||||||`:s.unreadable?`| ${t} | unreadable (permission) |||||||||||`:`| ${t} | ${s.status} | ${s.runtime} | ${s.entryPoint} | ${s.availableMemoryMb} | ${s.timeout} | ${s.maxInstances??'-'} | ${s.serviceAccountEmail} | ${s.secrets.map(x=>`${x.key}@${x.version}`).join(' ')||'-'} | ${s.envVarNames.join(' ')||'-'} | ${s.versionId} |`);}
  line('');line(`All 1st-gen functions in project: **${inv.all.length}**${inv.gen2?` · 2nd-gen: **${inv.gen2.length}**`:''}`);line('');
  if(inv.all.length){line('<details><summary>Function inventory</summary>');line('');for(const f of inv.all)line(`- ${f.name} · ${f.status} · ${f.runtime} · v${f.versionId} · ${f.updateTime}`);line('');line('</details>');line('');}}
 if(cmp){line('### Deployed source vs Git history');for(const [t,c] of Object.entries(cmp.targets)){line(`**${t}**${c.skipped?` — ${c.skipped}`:` — deployed entry exports ${c.deployed_entry_exports}, other files ${c.deployed_other_files}`}`);if(c.files)for(const [f,s] of Object.entries(c.files))line(`- ${f}: ${s}`);}line(cmp.ok?'Result: **no uncommitted production changes**.':`Result: **BLOCKED** — ${cmp.drift.length?`uncommitted changes in ${cmp.drift.join(', ')}`:'deployed source not available'}.`);line('');}
 if(b)line(`### Bundle\n${Object.keys(b.files).length} files, ${b.bytes} bytes, sha256 \`${b.sha256.slice(0,16)}…\`\n`);
 if(d)line(`### Deployment\nUpdated: ${d.deployed.join(', ')||'none'}\n`);
 if(v){line(`### Verification: ${v.ok?'PASSED':'FAILED'}`);for(const p of v.problems)line(`- ❌ ${p}`);for(const n of v.notes)line(`- ⚠️ ${n}`);for(const c of v.smoke||[])line(`- ${c.skipped?'⏭️':c.pass?'✅':'❌'} ${c.check}${c.skipped?` — ${c.skipped}`:` (expected ${c.expected}, got ${c.got})`}`);line(`- Other functions preserved: ${v.preserved_functions}`);line('');}
 if(rb)line(`### Rollback\nRestored: ${rb.rolled_back.join(', ')||'none'}${rb.failed.length?` · FAILED: ${rb.failed.map(f=>f.target).join(', ')}`:''}\n`);
 const failed=process.env.JOB_STATUS&&process.env.JOB_STATUS!=='success';
 const conclusion=failed||perms.length||(cmp&&!cmp.ok)||(v&&!v.ok)?(mode==='inventory'&&!failed?'neutral':'failure'):'success';
 const title=mode==='inventory'?(perms.length?`Inventory incomplete: ${perms.length} permission gap(s)`:cmp&&!cmp.ok?'Inventory: production source drift found':'Inventory complete'):v?.ok?'Deployed and verified':rb?.rolled_back?.length?`Deployment failed verification and was rolled back${rb.failed.length?' (ROLLBACK INCOMPLETE)':''}`:cmp&&!cmp.ok?'Deployment blocked: production source has changes not in Git':perms.length?`Deployment blocked: ${perms.length} permission gap(s)`:'Deployment did not complete; production unchanged';
 const text=L.join('\n').slice(0,65000);fs.writeFileSync(path.join(WORK,'report.md'),`## ${title}\n\n${text}`);
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## ${title}\n\n${text}\n`);
 if(process.env.GITHUB_TOKEN&&process.env.GITHUB_REPOSITORY){
  const r=await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/check-runs`,{method:'POST',headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json'},body:JSON.stringify({name:`FYNX API ${mode} report`,head_sha:process.env.GITHUB_SHA,status:'completed',conclusion,output:{title,summary:`${title}. Run ${process.env.GITHUB_RUN_ID||''}`,text}})});
  console.log(`Check run: ${r.status}`);
 }
}

const commands={inventory:()=>inventory(),fetch:fetchSources,compare,bundle,deploy,verify,rollback,report};
const cmd=process.argv[2];
if(!commands[cmd]){console.error(`Usage: node fynx-api-deploy.cjs ${Object.keys(commands).join('|')}`);process.exit(2);}
Promise.resolve(commands[cmd]()).catch(e=>{console.error(`::error::${e.message}`);process.exit(1);});
