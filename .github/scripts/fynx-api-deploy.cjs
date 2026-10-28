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
// The package contains developer-api.cjs plus every module it loads (followed through relative
// require() calls), package.json and package-lock.json. Nothing else from backend/ is shipped.
function requiresOf(code){return [...code.matchAll(/require\(\s*['"]\.\/([^'"]+)['"]\s*\)/g)].map(m=>m[1]);}
function closure(dir,entry='developer-api.cjs'){
 const seen=new Set(),missing=new Set(),stack=[entry];
 while(stack.length){const f=stack.pop();if(seen.has(f))continue;const p=path.join(dir,f);if(!fs.existsSync(p)){missing.add(f);continue;}seen.add(f);for(const r of requiresOf(fs.readFileSync(p,'utf8')))stack.push(r);}
 return {files:[...seen].sort(),missing:[...missing].sort()};
}
const BUNDLE_FILES=[...closure(path.resolve(__dirname,'../../backend')).files,'package.json','package-lock.json'];
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
// Describes drift WITHOUT revealing code (the repository and its check runs are public):
// closest committed version, changed line counts, whitespace-only check and export names.
function driftSummary(file,deployed){
 const rel=`backend/${file}`,tmp=path.join(WORK,'drift-tmp');fs.mkdirSync(tmp,{recursive:true});
 const live=path.join(tmp,'live');fs.writeFileSync(live,deployed);
 const squash=b=>b.toString('utf8').replace(/\s+/g,'');
 const commits=execFileSync('git',['log','--format=%H %cs','--',rel],{cwd:ROOT,encoding:'utf8'}).trim().split('\n').filter(Boolean);
 let best=null;
 for(const row of commits){const [c,date]=row.split(' ');let b;try{b=execFileSync('git',['show',`${c}:${rel}`],{cwd:ROOT,maxBuffer:32*1024*1024});}catch{continue;}
  const ref=path.join(tmp,'ref');fs.writeFileSync(ref,b);let d='';try{d=execFileSync('diff',['--unified=0',ref,live],{encoding:'utf8'});}catch(e){d=e.stdout||'';}
  const added=(d.match(/^\+(?!\+\+)/gm)||[]).length,removed=(d.match(/^-(?!--)/gm)||[]).length,hunks=(d.match(/^@@/gm)||[]).length;
  if(!best||added+removed<best.added+best.removed)best={commit:c.slice(0,7),date,added,removed,hunks,whitespace_only:squash(b)===squash(deployed)};}
 const names=b=>[...b.toString('utf8').matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map(m=>m[1]).sort();
 const head=fs.existsSync(path.join(ROOT,rel))?fs.readFileSync(path.join(ROOT,rel)):Buffer.alloc(0);
 return {closest:best,deployed_lines:deployed.toString('utf8').split('\n').length,deployed_exports:names(deployed),main_exports:names(head)};
}
// Optional: encrypt drifted production files to a one-time RSA public key supplied by the operator,
// so they can be reconciled without publishing production code. Only the private-key holder can read them.
function sealDrift(out){
 const pem=process.env.DRIFT_PUBLIC_KEY_B64?Buffer.from(process.env.DRIFT_PUBLIC_KEY_B64,'base64').toString('utf8'):'';
 const items=[...out.drift];
 for(const t of TARGETS){const dir=path.join(WORK,'previous',t);if(!fs.existsSync(dir))continue;
  for(const f of fs.readdirSync(dir)){if(f==='node_modules'||BUNDLE_FILES.includes(f)||!fs.statSync(path.join(dir,f)).isFile())continue;
   const {hashes}=history(f);if(!hashes.has(sha(fs.readFileSync(path.join(dir,f)))))items.push(`${t}/${f}`);}}
 out.not_in_git=items.filter(i=>!out.drift.includes(i));
 if(!pem||!items.length)return;
 const pub=crypto.createPublicKey(pem);if(pub.asymmetricKeyType!=='rsa'||pub.asymmetricKeyDetails.modulusLength<3072)throw new Error('DRIFT_PUBLIC_KEY_B64 must be an RSA key of at least 3072 bits.');
 const seen=new Map();out.sealed={};
 for(const item of items){const [t,f]=item.split('/');const data=fs.readFileSync(path.join(WORK,'previous',t,f));const h=sha(data);
  if(seen.has(h)){out.sealed[item]={same_as:seen.get(h)};continue;}seen.set(h,item);
  const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),enc=Buffer.concat([c.update(data),c.final()]);
  out.sealed[item]={alg:'RSA-OAEP-256+A256GCM',sha256:h,key:crypto.publicEncrypt({key:pub,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},key).toString('base64'),iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:enc.toString('base64')};}
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
   if(files[f]==='UNCOMMITTED_CHANGES'){out.drift.push(`${t}/${f}`);out.ok=false;(out.drift_detail||(out.drift_detail={}))[`${t}/${f}`]=driftSummary(f,fs.readFileSync(p));}
  }
  const live=closure(dir),absent=live.files.filter(f=>!BUNDLE_FILES.includes(f));
  if(absent.length){out.ok=false;out.missing_modules=[...new Set([...(out.missing_modules||[]),...absent])];}
  const index=['index.js','index.cjs'].map(f=>path.join(dir,f)).find(fs.existsSync);
  const exportsList=index?[...fs.readFileSync(index,'utf8').matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map(m=>m[1]):[];
  const other=fs.readdirSync(dir).filter(f=>!BUNDLE_FILES.includes(f)&&f!=='node_modules'&&!/^index\.c?js$/.test(f));
  out.targets[t]={files,live_modules_missing_from_package:absent,deployed_entry_exports:exportsList.length,deployed_other_files:other.length,archive_sha256:src.sources?.[t]?.sha256};
 }
 sealDrift(out);save('compare.json',out);const {sealed,...shown}=out;console.log(JSON.stringify(shown,null,1));
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
 if(process.env.PAYPAL_SECRET_ROTATED!=='true')throw new Error('Deployment requires the owner to confirm the exposed PayPal secret was rotated (workflow input paypal_secret_rotated).');
 const ready=load('readiness.json');if(!ready?.ok)throw new Error('Readiness checks did not pass; refusing to deploy.');
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

// ---- Endpoint tests: every new route, compared with the engine in Git plus independent known answers ----
function localEngine(){const dir=path.join(WORK,'bundle');return {analytics:require(path.join(dir,'developer-analytics.cjs')),markets:require(path.join(dir,'developer-markets.cjs')),engine:require(path.join(dir,'developer-engine.cjs'))};}
const RSI_SERIES=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64];
const WAVE=Array.from({length:60},(_,i)=>String((100+Math.sin(i/4)*5+i*0.1).toFixed(4)));
const CANDLES=[{high:10,low:8,close:9,volume:100},{high:12,low:9.5,close:11,volume:300},{high:11.5,low:10,close:10.5,volume:200},{high:13,low:10.4,close:12,volume:250}];
const ENDPOINT_CASES=[
 ['indicators','sma',{values:[1,2,3,4,5],period:3},r=>JSON.stringify(r.values)==='[null,null,"2","3","4"]'],
 ['indicators','ema',{values:['1','2','3','4','5','6'],period:3},r=>JSON.stringify(r.values)==='[null,null,"2","3","4","5"]'],
 ['indicators','rsi',{values:RSI_SERIES,period:14,decimals:2},r=>r.values[14]==='70.46'&&r.latest.values==='57.92'],
 ['indicators','macd',{values:WAVE,decimals:10},r=>r.macd[24]===null&&r.signal[33]!==null&&Math.abs(Number(r.latest.histogram)-(Number(r.latest.macd)-Number(r.latest.signal)))<1e-9],
 ['indicators','bollinger',{values:[2,4,4,4,5,5,7,9],period:8},r=>r.latest.middle==='5'&&r.latest.upper==='9'&&r.latest.lower==='1'],
 ['indicators','atr',{candles:CANDLES,period:2},r=>JSON.stringify(r.values)==='[null,"2.5","2","2.3"]'],
 ['indicators','stochastic',{candles:CANDLES,k_period:2,d_period:2},r=>r.k.length===4&&r.d[0]===null],
 ['indicators','vwap',{candles:[{high:11,low:9,close:10,volume:100},{high:13,low:11,close:12,volume:300}]},r=>JSON.stringify(r.values)==='["10","11.5"]'],
 ['indicators','screen',{series:[{symbol:'AAA',values:[10,10,10,10,10,9,8,7,6,12]},{symbol:'BBB',values:[1,2,3,4,5,6,7,8,9,10]}],conditions:[{left:{indicator:'close'},operator:'crosses_above',right:{indicator:'sma',period:3}}]},r=>JSON.stringify(r.matches)==='["AAA"]'],
 ['markets','status',{at:'2026-11-02T14:30:00Z',exchanges:['NYSE','HKEX','LSE']},r=>r.exchanges[0].status==='open'&&r.exchanges[0].next_close==='2026-11-02T21:00:00Z'&&r.exchanges[1].status==='closed'],
 ['markets','holidays',{exchange:'NYSE',year:2026},r=>r.coverage_status==='full_year'&&r.days.some(d=>d.date==='2026-11-26'&&d.type==='holiday')],
 ['markets','sessions',{at:'2026-11-02T13:30:00Z'},r=>r.fx_market==='open'&&r.overlap==='London + New York'],
 ['markets','exchanges',{},r=>r.exchanges.length===7],
 ['portfolio','performance',{trades:[{pnl:100,r_multiple:2},{pnl:-50,r_multiple:-1},{pnl:200},{pnl:-50},{pnl:0}],starting_balance:'10000'},r=>r.profit_factor==='3'&&r.win_rate_percent==='40'&&r.return_percent==='2'],
 ['portfolio','drawdown',{equity:[100,120,90,130,110]},r=>r.max_drawdown_percent==='25'&&r.max_drawdown_recovered_at===3],
 ['portfolio','exposure',{account_equity:'50000',account_currency:'USD',positions:[{symbol:'EURUSD',side:'long',quantity:'1',contract_size:'100000',price:'1.08',asset_class:'forex'},{symbol:'AAPL',side:'long',quantity:'100',price:'200',asset_class:'stock'}]},r=>r.gross_exposure==='128000'&&r.currency_legs.EUR==='100000'],
 ['risk','risk-reward',{entry_price:'100',stop_loss_price:'90',take_profit_price:'130',direction:'long'},r=>r.rr_ratio==='3']
];
async function smoke(){
 const key=process.env.SMOKE_API_KEY,base=process.env.SMOKE_BASE||`https://${REGION}-${PROJECT}.cloudfunctions.net/developerGateway`,checks=[];
 const call=async(route,body,headers={})=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});let j=null;try{j=await r.json();}catch{}return {status:r.status,json:j};};
 const anon=await call('/v1/markets/exchanges',{});checks.push({check:'request without key is rejected',expected:401,got:anon.status,pass:anon.status===401});
 if(!key){checks.push({check:'endpoint tests',skipped:'FYNX_API_SMOKE_KEY secret not set'});return checks;}
 let local=null;try{local=localEngine();}catch(e){checks.push({check:'load Git engine for comparison',pass:false,got:e.message});}
 const auth={Authorization:`Bearer ${key}`};
 for(const [group,name,body,known] of ENDPOINT_CASES){
  await new Promise(r=>setTimeout(r,250)); // stay well under the 10 requests/second test limit
  const route=`/v1/${group}/${name}`,r=await call(route,body,auth),result=r.json?.result;
  if(r.status===403&&/permission/i.test(r.json?.error?.code||'')){checks.push({check:`POST ${route}`,scope:true,got:'403: test key lacks this scope',pass:null});continue;}
  let expected=null;try{expected=group==='risk'?local.engine.risk(name,body):group==='markets'?local.markets.markets(name,body):group==='portfolio'?local.analytics.portfolio(name,body):local.analytics.indicator(name,body);}catch(e){expected={error:e.message};}
  const matches=r.status===200&&result&&JSON.stringify(result)===JSON.stringify(expected),knownOk=r.status===200&&!!result&&(()=>{try{return !!known(result);}catch{return false;}})();
  checks.push({check:`POST ${route}`,expected:'200, equal to Git engine, known answer',got:r.status!==200?`${r.status} ${r.json?.error?.code||''} ${r.json?.error?.message||''}`.trim():!matches?'200 but differs from Git engine':!knownOk?'200 but known answer wrong':'200 ✓',pass:matches&&knownOk});
 }
 return checks;
}
async function endpointTests(){const checks=await smoke();const failed=checks.filter(c=>c.pass===false),scoped=checks.filter(c=>c.scope);save('endpoints.json',{checks,ok:!failed.length&&!scoped.length&&!checks.some(c=>c.skipped)});console.log(JSON.stringify(checks,null,1));if(failed.length||checks.some(c=>c.skipped))process.exitCode=1;}

// ---- Readiness: permissions, credential scan, rollback, secret exposure map ----
const CREDENTIAL_PATTERNS=[['Stripe secret key',/\b[sr]k_(live|test)_[0-9A-Za-z]{10,}/],['Stripe webhook secret',/\bwhsec_[0-9A-Za-z]{10,}/],['Private key block',/-----BEGIN [A-Z ]*PRIVATE KEY-----/],['Google API key',/\bAIza[0-9A-Za-z_-]{35}\b/],['AWS access key',/\bAKIA[0-9A-Z]{16}\b/],['GitHub token',/\bgh[pousr]_[0-9A-Za-z]{30,}/],['Mailgun key',/\bkey-[0-9a-f]{32}\b/],['Hard-coded secret assignment',/(client_secret|clientSecret|api_secret|password)\s*[:=]\s*['"][^'"\s]{8,}['"]/i],['PayPal credentials',/paypal[^\n]{0,40}(secret|client_id)\s*[:=]\s*['"][^'"]{8,}/i]];
function scanTree(dir){
 const hits=[],walk=d=>{for(const f of fs.readdirSync(d)){if(f==='node_modules')continue;const p=path.join(d,f),rel=path.relative(dir,p);if(fs.statSync(p).isDirectory()){walk(p);continue;}
  if(f.startsWith('.'))hits.push({file:rel,finding:'hidden file (e.g. .runtimeconfig.json or .env) in package'});
  const text=fs.readFileSync(p,'utf8');for(const [name,re] of CREDENTIAL_PATTERNS)if(re.test(text))hits.push({file:rel,finding:name});}};
 walk(dir);return hits;
}
async function readiness(){
 const inv=load('inventory.json'),cmp=load('compare.json'),src=load('sources.json'),b=load('bundle.json'),out={checks:[],exposure:null};
 const add=(check,pass,detail)=>out.checks.push({check,pass,detail});
 const sas=[...new Set(TARGETS.map(t=>inv?.targets?.[t]?.serviceAccountEmail).filter(Boolean))];
 for(const sa of sas){try{const r=await gcf('POST',`${process.env.IAM_API_BASE||'https://iam.googleapis.com'}/v1/projects/${PROJECT}/serviceAccounts/${encodeURIComponent(sa)}:testIamPermissions`,{permissions:['iam.serviceAccounts.actAs']});add(`github-deploy can act as runtime account ${sa}`,(r.permissions||[]).includes('iam.serviceAccounts.actAs'),(r.permissions||[]).join(', ')||'not granted');}catch(e){add(`github-deploy can act as runtime account ${sa}`,false,e.message);}}
 if(!sas.length)add('runtime service account identified',false,'inventory has no service account');
 const need=['cloudfunctions.functions.get','cloudfunctions.functions.sourceCodeGet','cloudfunctions.functions.sourceCodeSet','cloudfunctions.functions.update'];
 for(const t of TARGETS){try{const r=await gcf('POST',`/v1/${fnName(t)}:testIamPermissions`,{permissions:need});const missing=need.filter(p=>!(r.permissions||[]).includes(p));add(`deploy permissions on ${t}`,!missing.length,missing.length?`missing ${missing.join(', ')}`:'get, sourceCodeGet, sourceCodeSet, update');}catch(e){add(`deploy permissions on ${t}`,false,e.message);}}
 const hits=b?scanTree(path.join(WORK,'bundle')):[{file:'-',finding:'bundle missing'}];
 add('no credentials or hidden files in deploy package',!hits.length,hits.length?hits.map(h=>`${h.file}: ${h.finding}`).join('; '):`${Object.keys(b.files).length} files scanned (node_modules excluded; installed from the lockfile at build time)`);
 const rollbackReady=!!cmp?.ok&&TARGETS.every(t=>src?.sources?.[t]?.zip&&fs.existsSync(src.sources[t].zip));
 add('rollback ready',rollbackReady,rollbackReady?`pre-deploy source of both functions downloaded; live API files match commit(s) in Git (${[...new Set(Object.values(cmp.targets).flatMap(c=>Object.values(c.files||{})).filter(v=>v.startsWith('older_commit')||v==='same_as_main'))].join(', ')})`:'pre-deploy source missing or live code not in Git');
 add('endpoint test key configured (FYNX_API_SMOKE_KEY)',!!process.env.SMOKE_API_KEY,process.env.SMOKE_API_KEY?'set':'not set: authenticated endpoint tests will be skipped');
 out.exposure=await exposureMap(inv);
 out.ok=out.checks.every(c=>c.pass||c.check.startsWith('endpoint test key'));
 save('readiness.json',out);console.log(JSON.stringify(out,null,1));
}
// Which 1st-gen functions ship a .runtimeconfig.json with PayPal keys, and which code reads it. Names only, never values.
async function exposureMap(inv){
 const rows=[],dir=path.join(WORK,'exposure');
 for(const f of inv?.all||[]){const name=f.name.split('/').pop(),region=f.name.split('/')[0],d=path.join(dir,name);
  try{const {downloadUrl}=await gcf('POST',`/v1/projects/${PROJECT}/locations/${region}/functions/${name}:generateDownloadUrl`,{});const r=await fetch(downloadUrl);const zp=path.join(dir,`${name}.zip`);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(zp,Buffer.from(await r.arrayBuffer()));execFileSync('unzip',['-q','-o',zp,'-d',d]);
   const rc=path.join(d,'.runtimeconfig.json');let keys=[];if(fs.existsSync(rc)){try{const walk=(x,p)=>x&&typeof x==='object'?Object.entries(x).forEach(([k,v])=>walk(v,p?`${p}.${k}`:k)):keys.push(p);walk(JSON.parse(fs.readFileSync(rc,'utf8')),'');}catch{keys=['(unparseable)'];}}
   const readers=[];const walk=p=>{for(const e of fs.readdirSync(p)){if(e==='node_modules'||e.startsWith('.'))continue;const q=path.join(p,e);if(fs.statSync(q).isDirectory())walk(q);else if(/\.(c?js|mjs|ts)$/.test(e)){const t=fs.readFileSync(q,'utf8');if(/functions\.config\(\)|runtimeconfig|\bpaypal\b/i.test(t))readers.push(path.relative(d,q));}}};walk(d);
   rows.push({function:name,has_runtimeconfig:fs.existsSync(rc),paypal_keys:keys.filter(k=>/paypal/i.test(k)),code_mentioning_paypal_or_config:readers});
  }catch(e){rows.push({function:name,error:e.message.slice(0,160)});}
  fs.rmSync(d,{recursive:true,force:true});fs.rmSync(path.join(dir,`${name}.zip`),{force:true});}
 // 2nd gen: configuration names (plain env vars vs Secret Manager references) and code that mentions PayPal.
 const gen2=[];let page='';
 try{do{const r=await gcf('GET',`/v2/projects/${PROJECT}/locations/-/functions?pageSize=500${page?`&pageToken=${page}`:''}`);for(const f of r.functions||[])gen2.push(f);page=r.nextPageToken||'';}while(page);}catch(e){rows.push({function:'(2nd-gen list)',error:e.message.slice(0,160)});}
 const g2=[];
 for(const f of gen2){const name=f.name.split('/').pop(),sc=f.serviceConfig||{},d=path.join(dir,'g2-'+name);
  const row={function:name,plain_env_paypal:Object.keys(sc.environmentVariables||{}).filter(k=>/paypal/i.test(k)),secret_refs_paypal:(sc.secretEnvironmentVariables||[]).filter(x=>/paypal/i.test(x.key+' '+x.secret)).map(x=>`${x.key}<-${x.secret}@${x.version}`),code:[]};
  row.environment=f.environment||null;row.source=Object.keys(f.buildConfig?.source||{}).join(',')||'none';
  if(f.environment==='GEN_1'){row.skipped='1st gen (scanned above)';g2.push(row);continue;}
  try{const dl=await gcf('POST',`/v2/${f.name}:generateDownloadUrl`,{});const downloadUri=dl.downloadUri||dl.downloadUrl;if(!downloadUri)throw new Error(`no download URL (source: ${row.source}; response keys: ${Object.keys(dl).join(',')||'none'})`);const r=await fetch(downloadUri);if(!r.ok)throw new Error(`download HTTP ${r.status} (source: ${row.source})`);const zp=d+'.zip';fs.mkdirSync(d,{recursive:true});fs.writeFileSync(zp,Buffer.from(await r.arrayBuffer()));execFileSync('unzip',['-q','-o',zp,'-d',d]);
   if(fs.existsSync(path.join(d,'.runtimeconfig.json'))&&/paypal/i.test(fs.readFileSync(path.join(d,'.runtimeconfig.json'),'utf8')))row.runtimeconfig_paypal=true;
   const walk=p=>{for(const e of fs.readdirSync(p)){if(e==='node_modules'||e.startsWith('.'))continue;const q=path.join(p,e);if(fs.statSync(q).isDirectory())walk(q);else if(/\.(c?js|mjs|ts)$/.test(e)&&/\bpaypal\b/i.test(fs.readFileSync(q,'utf8')))row.code.push(path.relative(d,q));}};walk(d);
  }catch(e){row.error=e.message.slice(0,160);}
  fs.rmSync(d,{recursive:true,force:true});fs.rmSync(d+'.zip',{force:true});g2.push(row);}
 const g2hit=g2.filter(r=>r.plain_env_paypal.length||r.secret_refs_paypal.length||r.code.length||r.runtimeconfig_paypal);
 return {functions_scanned:rows.length,exposed:rows.filter(r=>r.paypal_keys?.length).map(r=>r.function),readers:rows.filter(r=>r.code_mentioning_paypal_or_config?.length).map(r=>({function:r.function,files:r.code_mentioning_paypal_or_config})),errors:rows.filter(r=>r.error).map(r=>r.function),
  gen2_scanned:g2.filter(r=>!r.skipped).length,gen2_config_checked:g2.filter(r=>!r.skipped).length,gen2_code_scanned:g2.filter(r=>!r.skipped&&!r.error).length,gen2_paypal:g2hit,gen2_errors:g2.filter(r=>r.error).map(r=>`${r.function}: ${r.error}`)};
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
 const checks=await smoke();for(const c of checks)if(c.pass===false)problems.push(`Endpoint check failed: ${c.check} (got ${c.got})`);for(const c of checks)if(c.scope)notes.push(`${c.check}: test key lacks this scope (create a new test key after deploy; new keys get every scope)`);
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
 if(cmp){line('### Deployed source vs Git history');for(const [t,c] of Object.entries(cmp.targets)){line(`**${t}**${c.skipped?` — ${c.skipped}`:` — deployed entry exports ${c.deployed_entry_exports}, other files ${c.deployed_other_files}`}`);if(c.files)for(const [f,s] of Object.entries(c.files))line(`- ${f}: ${s}`);}if(cmp.drift_detail){line('');line('**Drift summary** (no code shown):');for(const [k,d] of Object.entries(cmp.drift_detail)){const c=d.closest;line(`- ${k}: closest committed version \`${c?.commit}\` (${c?.date}) — ${c?.added} line(s) added, ${c?.removed} removed in ${c?.hunks} place(s)${c?.whitespace_only?' — WHITESPACE ONLY':''}; deployed exports: ${d.deployed_exports.join(', ')||'none'}; main exports: ${d.main_exports.join(', ')||'none'}`);}}
  if(cmp.missing_modules?.length)line(`- ❌ Live code loads modules that are not in the deploy package: ${cmp.missing_modules.join(', ')}`);
  if(cmp.not_in_git?.length)line(`- Live files with no committed version: ${cmp.not_in_git.join(', ')}`);
  if(cmp.sealed){line('');line('<details><summary>Sealed production files (encrypted to the operator key; unreadable without it)</summary>');line('');line('```json');line(JSON.stringify(cmp.sealed));line('```');line('</details>');}
  line(cmp.ok?'Result: **no uncommitted production changes**.':`Result: **BLOCKED** — ${cmp.drift.length?`uncommitted changes in ${cmp.drift.join(', ')}`:cmp.missing_modules?.length?`live code needs ${cmp.missing_modules.join(', ')}`:'deployed source not available'}.`);line('');}
 if(b)line(`### Bundle\n${Object.keys(b.files).length} files, ${b.bytes} bytes, sha256 \`${b.sha256.slice(0,16)}…\`\n`);
 const rd=load('readiness.json'),ep=load('endpoints.json');
 if(rd){line(`### Readiness: ${rd.ok?'PASSED':'NOT READY'}`);for(const c of rd.checks)line(`- ${c.pass?'✅':c.check.startsWith('endpoint test key')?'⚠️':'❌'} ${c.check} — ${c.detail}`);
  const x=rd.exposure;if(x){line('');line(`**PayPal secret exposure** (${x.functions_scanned} 1st-gen functions scanned, names only):`);line(`- Functions whose deployed source contains PayPal keys in .runtimeconfig.json: ${x.exposed.length?x.exposed.join(', '):'none'}`);line(`- Code that mentions PayPal or functions.config(): ${x.readers.length?x.readers.map(r=>`${r.function} (${r.files.join(', ')})`).join('; '):'none'}`);if(x.errors.length)line(`- Could not scan: ${x.errors.join(', ')}`);
  if(x.gen2_scanned!==undefined){line(`- 2nd-gen functions: ${x.gen2_scanned} (configuration checked for all; code scanned for ${x.gen2_code_scanned})`);if(!x.gen2_paypal.length)line('- 2nd gen: no PayPal env vars, Secret Manager references, runtime config or code');for(const r of x.gen2_paypal)line(`- 2nd gen ${r.function}: plain env vars [${r.plain_env_paypal.join(', ')||'-'}] · Secret Manager refs [${r.secret_refs_paypal.join(', ')||'-'}] · runtimeconfig ${r.runtimeconfig_paypal?'YES':'no'} · code [${r.code.join(', ')||'-'}]`);if(x.gen2_errors.length)line(`- 2nd gen code not downloadable (${x.gen2_errors.length}): ${x.gen2_errors.join('; ')}`);}}line('');}
 if(d)line(`### Deployment\nUpdated: ${d.deployed.join(', ')||'none'}\n`);
 if(ep){line(`### Endpoint tests: ${ep.ok?'ALL PASSED':'NOT ALL PASSED'}`);for(const c of ep.checks)line(`- ${c.skipped?'⏭️':c.scope?'🔒':c.pass?'✅':'❌'} ${c.check}${c.skipped?` — ${c.skipped}`:` — ${c.got}`}`);line('');}
 if(v){line(`### Verification: ${v.ok?'PASSED':'FAILED'}`);for(const p of v.problems)line(`- ❌ ${p}`);for(const n of v.notes)line(`- ⚠️ ${n}`);for(const c of v.smoke||[])line(`- ${c.skipped?'⏭️':c.pass?'✅':'❌'} ${c.check}${c.skipped?` — ${c.skipped}`:` (expected ${c.expected}, got ${c.got})`}`);line(`- Other functions preserved: ${v.preserved_functions}`);line('');}
 if(rb)line(`### Rollback\nRestored: ${rb.rolled_back.join(', ')||'none'}${rb.failed.length?` · FAILED: ${rb.failed.map(f=>f.target).join(', ')}`:''}\n`);
 const failed=process.env.JOB_STATUS&&process.env.JOB_STATUS!=='success';
 const bad=perms.length||(cmp&&!cmp.ok)||(v&&!v.ok)||(rd&&!rd.ok)||(ep&&!ep.ok);
 const conclusion=failed?'failure':bad?(mode==='inventory'?'neutral':'failure'):'success';
 let title;
 if(mode==='test')title=ep?.ok?'Endpoint tests: all passed':'Endpoint tests: not all passed';
 else if(mode==='inventory')title=perms.length?`Inventory incomplete: ${perms.length} permission gap(s)`:cmp&&!cmp.ok?'Inventory: production source drift found':rd&&!rd.ok?'Inventory complete: NOT ready to deploy':rd?'Inventory complete: ready to deploy':'Inventory complete';
 else if(v?.ok)title=ep&&!ep.ok?'Deployed and verified; some endpoint tests not run':'Deployed and verified';
 else if(rb?.rolled_back?.length)title=`Deployment failed verification and was rolled back${rb.failed.length?' (ROLLBACK INCOMPLETE)':''}`;
 else if(cmp&&!cmp.ok)title='Deployment blocked: production source has changes not in Git';
 else if(perms.length)title=`Deployment blocked: ${perms.length} permission gap(s)`;
 else title='Deployment did not run; production unchanged';
 const text=L.join('\n').slice(0,65000);fs.writeFileSync(path.join(WORK,'report.md'),`## ${title}\n\n${text}`);
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## ${title}\n\n${text}\n`);
 if(process.env.GITHUB_TOKEN&&process.env.GITHUB_REPOSITORY){
  const r=await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/check-runs`,{method:'POST',headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json'},body:JSON.stringify({name:`FYNX API ${mode} report`,head_sha:process.env.GITHUB_SHA,status:'completed',conclusion,output:{title,summary:`${title}. Run ${process.env.GITHUB_RUN_ID||''}`,text}})});
  console.log(`Check run: ${r.status}`);
 }
}

const commands={inventory:()=>inventory(),fetch:fetchSources,compare,bundle,readiness,deploy,verify,rollback,endpoints:endpointTests,report};
const cmd=process.argv[2];
if(!commands[cmd]){console.error(`Usage: node fynx-api-deploy.cjs ${Object.keys(commands).join('|')}`);process.exit(2);}
Promise.resolve(commands[cmd]()).catch(e=>{console.error(`::error::${e.message}`);process.exit(1);});
