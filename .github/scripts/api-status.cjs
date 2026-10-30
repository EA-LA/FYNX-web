'use strict';
// FYNX API status monitor (checklist item 47). Runs in GitHub Actions; no Google Cloud permissions.
//   node api-status.cjs probe   every 15 min: health self-check + gateway rejects keyless requests (no quota used)
//   node api-status.cjs deep    twice a day: one known-answer call per product with the test key
// Writes to STATUS_DIR (a checkout of the status-data branch): api-status.json, api-status-deep.json, incidents.xml.
// Opens a GitHub issue (label api-incident) when a component fails twice in a row within a run, and closes it on recovery.
const fs=require('node:fs'),path=require('node:path');
const BASE=process.env.API_BASE||'https://us-central1-fynx-c7a28.cloudfunctions.net';
const DIR=path.resolve(process.env.STATUS_DIR||'status'),MODE=process.argv[2];
const TARGET=99.5,RECENT=96,DAYS=90,INCIDENTS=50;
const SITE='https://www.fynxfinanceworld.com/api/status.html';
const load=(f,fb)=>{try{return JSON.parse(fs.readFileSync(path.join(DIR,f),'utf8'));}catch{return fb;}};
const save=(f,v)=>fs.writeFileSync(path.join(DIR,f),typeof v==='string'?v:JSON.stringify(v,null,1)+'\n');

async function timed(url,init,expect){
 const t=Date.now();
 try{const r=await fetch(url,{...init,signal:AbortSignal.timeout(15000)});let body=null;try{body=await r.json();}catch{}
  const ok=await expect(r,body);return {ok:!!ok,latency_ms:Date.now()-t,code:r.status};}
 catch(e){return {ok:false,latency_ms:Date.now()-t,code:0,detail:String(e.message||e).slice(0,120)};}
}
// A component counts as failing only if it fails twice, 10 seconds apart (filters one-off network blips).
async function check(fn){let r=await fn();if(!r.ok){await new Promise(x=>setTimeout(x,10000));const again=await fn();again.retried=true;r=again;}return {...r,checked_at:new Date().toISOString()};}

const PROBES={
 health:{name:'API health self-check',run:()=>timed(`${BASE}/developerHealth`,{},(r,b)=>r.status===200&&b?.status==='ok')},
 gateway:{name:'Gateway authentication',run:()=>timed(`${BASE}/developerGateway/v1/markets/exchanges`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},r=>r.status===401)}
};
const call=(route,body,known)=>()=>timed(`${BASE}/developerGateway${route}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.SMOKE_API_KEY}`},body:JSON.stringify(body)},(r,b)=>r.status===200&&known(b?.result||{}));
const DEEP={
 markets:{name:'Market Hours API',run:call('/v1/markets/exchanges',{},r=>r.exchanges?.length===7)},
 indicators:{name:'Indicators API',run:call('/v1/indicators/sma',{values:[1,2,3,4,5],period:3},r=>JSON.stringify(r.values)==='[null,null,"2","3","4"]')},
 portfolio:{name:'Portfolio API',run:call('/v1/portfolio/drawdown',{equity:[100,120,90,130,110]},r=>r.max_drawdown_percent==='25')},
 risk:{name:'Risk API',run:call('/v1/risk/risk-reward',{entry_price:'100',stop_loss_price:'90',take_profit_price:'130',direction:'long'},r=>r.rr_ratio==='3')}
};
const pct=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*(s.length-1)))];};

async function github(method,p,body){
 const token=process.env.GITHUB_TOKEN,repo=process.env.GITHUB_REPOSITORY;if(!token||!repo)return null;
 const r=await fetch(`https://api.github.com/repos/${repo}${p}`,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'},body:body?JSON.stringify(body):undefined});
 return r.ok?r.json():null;
}
// Open or close incidents for each component and keep issue numbers in state.
async function incidents(state,results,catalog){
 state.incidents=state.incidents||[];
 for(const [id,r] of Object.entries(results)){
  const open=state.incidents.find(i=>i.component===id&&!i.resolved_at);
  if(!r.ok&&!open){const summary=`${catalog[id].name} is failing (HTTP ${r.code||'no response'}${r.detail?`, ${r.detail}`:''}).`;
   const issue=await github('POST','/issues',{title:`API incident: ${catalog[id].name}`,labels:['api-incident'],body:`${summary}\n\nDetected ${r.checked_at} by the scheduled status monitor. Status page: ${SITE}\n\nThis issue closes automatically when the check recovers.`});
   state.incidents.unshift({id:`${id}-${Date.now()}`,component:id,name:catalog[id].name,started_at:r.checked_at,resolved_at:null,summary,issue:issue?.number||null});}
  if(r.ok&&open){open.resolved_at=r.checked_at;
   if(open.issue){await github('POST',`/issues/${open.issue}/comments`,{body:`Recovered at ${r.checked_at}. Closing automatically.`});await github('PATCH',`/issues/${open.issue}`,{state:'closed'});}}
 }
 state.incidents=state.incidents.slice(0,INCIDENTS);
}
function atom(all){
 const esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
 const items=all.slice(0,30).map(i=>`<entry><id>urn:fynx-api-incident:${esc(i.id)}</id><title>${esc(i.resolved_at?`Resolved: ${i.name}`:`Incident: ${i.name}`)}</title><updated>${esc(i.resolved_at||i.started_at)}</updated><link href="${SITE}"/><summary>${esc(i.summary+(i.resolved_at?` Resolved ${i.resolved_at}.`:' Investigating.'))}</summary></entry>`).join('');
 return `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>FYNX API incidents</title><id>urn:fynx-api-incidents</id><updated>${new Date().toISOString()}</updated><link href="${SITE}"/>${items}</feed>\n`;
}

async function probe(){
 const state=load('api-status.json',{}),results={};
 for(const [id,p] of Object.entries(PROBES))results[id]=await check(p.run);
 const ok=Object.values(results).every(r=>r.ok),now=new Date().toISOString(),day=now.slice(0,10);
 state.components={...Object.fromEntries(Object.entries(results).map(([id,r])=>[id,{name:PROBES[id].name,...r}]))};
 state.recent=[{t:now,ok,health_ms:results.health.latency_ms,gateway_ms:results.gateway.latency_ms},...(state.recent||[])].slice(0,RECENT);
 const d=(state.daily=state.daily||[]).find(x=>x.date===day)||(state.daily.unshift({date:day,checks:0,ok:0,latencies:[]}),state.daily[0]);
 d.checks++;if(ok)d.ok++;d.latencies.push(results.health.latency_ms);d.p50_ms=pct(d.latencies,0.5);d.p95_ms=pct(d.latencies,0.95);
 state.daily=state.daily.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,DAYS);state.daily.forEach((x,i)=>{if(i>1)delete x.latencies;});
 const up=n=>{const w=state.daily.slice(0,n),c=w.reduce((s,x)=>s+x.checks,0);return c?Math.round(w.reduce((s,x)=>s+x.ok,0)/c*10000)/100:null;};
 Object.assign(state,{updated_at:now,target_uptime_percent:TARGET,uptime_30d:up(30),uptime_90d:up(90),operational:ok});
 await incidents(state,results,PROBES);
 save('api-status.json',state);
 const deep=load('api-status-deep.json',{});save('incidents.xml',atom([...(state.incidents||[]),...(deep.incidents||[])].sort((a,b)=>(b.resolved_at||b.started_at).localeCompare(a.resolved_at||a.started_at))));
 console.log(`probe: ${ok?'operational':'DEGRADED'} ${JSON.stringify(results)}`);
}
async function deepCheck(){
 if(!process.env.SMOKE_API_KEY){console.log('deep: FYNX_API_SMOKE_KEY not set; skipped');return;}
 const state=load('api-status-deep.json',{}),results={};
 for(const [id,p] of Object.entries(DEEP)){results[id]=await check(p.run);await new Promise(r=>setTimeout(r,300));}
 const now=new Date().toISOString();
 state.components=Object.fromEntries(Object.entries(results).map(([id,r])=>[id,{name:DEEP[id].name,...r}]));
 state.history=[{t:now,...Object.fromEntries(Object.entries(results).map(([id,r])=>[id,r.ok]))},...(state.history||[])].slice(0,120);
 state.updated_at=now;await incidents(state,results,DEEP);save('api-status-deep.json',state);
 console.log(`deep: ${JSON.stringify(results)}`);
}
fs.mkdirSync(DIR,{recursive:true});
({probe,deep:deepCheck}[MODE]||(()=>{console.error('Usage: api-status.cjs probe|deep');process.exit(2);}))().catch(e=>{console.error(e);process.exit(1);});
module.exports={atom,pct};
