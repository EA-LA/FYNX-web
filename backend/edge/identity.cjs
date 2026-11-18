'use strict';
const crypto=require('node:crypto');
const {fail,engine}=require('../quant/common.cjs');
const {readBody}=require('../quant/api.cjs');
const {createNotificationService,timezone}=require('./notifications.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const iso=ms=>new Date(ms).toISOString();
function object(value,keys,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw fail('Invalid '+label+' fields.');return value;}
function number(v,min,max,label,nullable=false){if(nullable&&v===null)return null;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw fail('Invalid '+label+'.');return v;}
function string(v,pattern,label){if(typeof v!=='string'||!pattern.test(v))throw fail('Invalid '+label+'.');return v;}
function pragueDate(ms){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));}
function brokerTime(value){
  string(value,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{3})?$/,'broker-local timestamp');
  const iso=value.replace(' ','T')+(value.length===19?'.000Z':'Z'),parsed=Date.parse(iso);
  if(!Number.isFinite(parsed)||new Date(parsed).toISOString()!==iso)throw fail('Invalid broker-local date.');
  return parsed;
}
function validateAccountHistory(input){
  const h=object(input,['brokerTimezone','fromBrokerTime','toBrokerTime','complete','deals'],'account history');
  if(typeof h.brokerTimezone!=='string'||h.brokerTimezone.length>80)throw fail('A verified broker IANA timezone is required for history.');timezone(h.brokerTimezone);
  const from=brokerTime(h.fromBrokerTime),to=brokerTime(h.toBrokerTime);
  if(from>to||to-from>367*86400000||typeof h.complete!=='boolean'||!Array.isArray(h.deals)||h.deals.length>100)throw fail('Invalid account history range or size.');
  const ids=new Set();for(const d of h.deals){
    object(d,['id','positionId','orderId','brokerTime','type','entryType','rawSymbol','volume','price','profit','commission','swap','fee','sl','tp','magic'],'history deal');
    string(d.id,/^\d{1,20}$/,'deal ID');if(ids.has(d.id))throw fail('Duplicate history deal ID.');ids.add(d.id);
    for(const key of ['positionId','orderId','magic'])if(d[key]!==null)string(d[key],/^\d{1,20}$/,key);
    const time=brokerTime(d.brokerTime);if(time<from||time>to)throw fail('Deal is outside the reported history range.');
    if(!['buy','sell','balance','credit','fee','adjustment'].includes(d.type)||![null,'in','out','inout','out-by'].includes(d.entryType))throw fail('Invalid history deal type.');
    const trade=['buy','sell'].includes(d.type);if(trade){string(d.rawSymbol,/^[A-Za-z0-9_.#-]{1,40}$/,'deal symbol');if(d.entryType===null)throw fail('Trade entry type is required.');}else if(d.rawSymbol!==null||d.entryType!==null)throw fail('Cashflows cannot be represented as trade executions.');
    for(const key of ['volume','price'])number(d[key],trade?1e-12:0,1e10,key);
    for(const key of ['profit','commission','swap','fee'])number(d[key],-1e10,1e10,key);
    for(const key of ['sl','tp'])number(d[key],1e-12,1e10,key,true);
  }return h;
}
function validateHeartbeat(input,now=Date.now()){
  const v2=input?.version===2;
  const b=object(input,['version','sentAt','accountRef','currency','balance','equity','dayStartEquity','dayStartBalance','dayStartDate','initialBalance','ruleId','phase','safetyDailyPct','highWaterBalance','positions','instruments',...(v2?['accountHistory','accountMetadata']:[])],'heartbeat');
  if(![1,2].includes(b.version)||!Number.isInteger(b.sentAt)||Math.abs(now/1000-b.sentAt)>120)throw fail('Heartbeat timestamp is stale or invalid.',400,'STALE_HEARTBEAT');
  string(b.accountRef,/^[A-Za-z0-9_.:@ -]{1,120}$/,'account reference');string(b.currency,/^[A-Z]{3,8}$/,'account currency');
  for(const k of ['balance','equity'])number(b[k],0,1e10,k);number(b.initialBalance,1,1e10,'initial balance');
  for(const k of ['dayStartEquity','dayStartBalance','highWaterBalance'])number(b[k],1,1e10,k,true);
  if(b.dayStartDate!==null)string(b.dayStartDate,/^\d{4}-\d{2}-\d{2}$/,'Prague day');
  if(!engine().FTMO_RULES[b.ruleId])throw fail('Unknown FTMO rule version.');
  if(!Number.isInteger(b.phase)||b.phase<1||b.phase>engine().FTMO_RULES[b.ruleId].phaseTargets.length)throw fail('Invalid challenge phase.');
  number(b.safetyDailyPct,.01,20,'safety stop');
  if(!Array.isArray(b.positions)||b.positions.length>200||!Array.isArray(b.instruments)||b.instruments.length>100)throw fail('Heartbeat positions or instruments exceed their limits.');
  const ids=new Set();for(const p of b.positions){object(p,['id','symbol','side','volume','entry','price','sl','tp','riskToStop','currencies',...(v2?['floatingPL','magic','openedAtBroker','positionId']:[])],'position');string(p.id,/^[A-Za-z0-9_-]{1,80}$/,'position ID');if(ids.has(p.id))throw fail('Duplicate position ID.');ids.add(p.id);string(p.symbol,/^[A-Za-z0-9_.#-]{1,40}$/,'position symbol');if(!['buy','sell'].includes(p.side))throw fail('Invalid position side.');for(const k of ['volume','entry','price'])number(p[k],1e-12,1e10,k);for(const k of ['sl','tp'])number(p[k],1e-12,1e10,k,true);number(p.riskToStop,0,1e10,'position risk',true);if(p.sl===null&&p.riskToStop!==null)throw fail('Unprotected positions cannot claim a bounded stop risk.');if(!Array.isArray(p.currencies)||p.currencies.length>2||p.currencies.some(c=>typeof c!=='string'||!/^[A-Z]{3,8}$/.test(c)))throw fail('Invalid position currencies.');if(v2){number(p.floatingPL,-1e10,1e10,'position P&L');string(p.magic,/^\d{1,20}$/,'position magic');string(p.positionId,/^\d{1,20}$/,'position identifier');brokerTime(p.openedAtBroker);}}
  for(const m of b.instruments){object(m,['symbol','brokerSymbol','tickSize','tickValueLoss','volumeMin','volumeMax','volumeStep','digits','stopLevel','accountCurrency','asOf','bid','ask'],'instrument');string(m.symbol,/^[A-Z0-9]{3,12}$/,'instrument symbol');string(m.brokerSymbol,/^[A-Za-z0-9_.#-]{1,40}$/,'broker symbol');if(m.accountCurrency!==b.currency)throw fail('Instrument currency must match the reporting account.');for(const k of ['tickSize','tickValueLoss','volumeMin','volumeMax','volumeStep','bid','ask'])number(m[k],1e-12,1e10,k);if(!Number.isInteger(m.digits)||m.digits<0||m.digits>10||m.volumeMax<m.volumeMin||m.ask<m.bid)throw fail('Invalid instrument bounds.');number(m.stopLevel,0,1e8,'stop level');if(!Number.isInteger(m.asOf)||m.asOf>b.sentAt+5||m.asOf<b.sentAt-180)throw fail('Instrument metadata is stale.');}
  if(v2){validateAccountHistory(b.accountHistory);const m=object(b.accountMetadata,['margin','freeMargin','leverage','accountMode'],'account metadata');number(m.margin,0,1e10,'margin');number(m.freeMargin,-1e10,1e10,'free margin');number(m.leverage,1,1e6,'leverage');if(!['netting','hedging'].includes(m.accountMode))throw fail('Invalid account margin mode.');}
  return JSON.parse(JSON.stringify(b));
}
function deriveGuard(h,now=Date.now(),events=[]){
  if(!h)return {connected:false,status:'not-connected',reason:'Connect an EA from Profile to view account protection.'};
  const fresh=now-Date.parse(h.receivedAt)<180000,rule=engine().FTMO_RULES[h.ruleId],reasons=[];
  const sameDay=h.dayStartDate===pragueDate(now),dailyKnown=sameDay&&h.dayStartBalance!==null;
  if(!dailyKnown)reasons.push('Verified Prague day-start balance is missing for today.');
  if(rule.trailing&&h.highWaterBalance===null)reasons.push('Verified highest end-of-day balance is required for the trailing maximum-loss rule.');
  const dailyFloor=dailyKnown?h.dayStartBalance-rule.dailyLoss*h.initialBalance:null,safetyFloor=dailyKnown?h.dayStartBalance-h.safetyDailyPct/100*h.initialBalance:null;
  const maxFloor=rule.trailing?(h.highWaterBalance===null?null:Math.max(h.highWaterBalance,h.initialBalance)-rule.maxLoss*h.initialBalance):h.initialBalance*(1-rule.maxLoss);
  const missingRisk=h.positions.some(p=>p.sl===null||p.riskToStop===null);if(missingRisk)reasons.push('One or more open positions lack a stop or a broker-calculated risk value.');
  if(!fresh)reasons.push('EA report is older than three minutes. Values are the last reported account state.');
  const currencies=new Set(h.positions.flatMap(p=>p.currencies));const eventWarnings=events.filter(e=>String(e.impact).toLowerCase()==='high'&&currencies.has(e.currency)&&Date.parse(e.time)>=now&&Date.parse(e.time)-now<=3*3600000).map(e=>({name:e.name||e.title,currency:e.currency,time:e.time}));
  return {connected:fresh,status:fresh?'connected':'offline',receivedAt:h.receivedAt,offlineSince:iso(Date.parse(h.receivedAt)+180000),currency:h.currency,balance:h.balance,equity:h.equity,initialBalance:h.initialBalance,ruleId:h.ruleId,phase:h.phase,dayStartEquity:h.dayStartEquity,dayStartBalance:h.dayStartBalance,dailyLossLimitAmount:rule.dailyLoss*h.initialBalance,safetyLossLimitAmount:h.safetyDailyPct/100*h.initialBalance,dailyLossRoom:dailyFloor===null?null:h.equity-dailyFloor,safetyLossRoom:safetyFloor===null?null:h.equity-safetyFloor,maxLossRoom:maxFloor===null?null:h.equity-maxFloor,targetDistance:Math.max(0,h.initialBalance*(1+rule.phaseTargets[h.phase-1])-h.balance),openRisk:missingRisk?null:h.positions.reduce((n,p)=>n+p.riskToStop,0),positions:h.positions,instruments:fresh?h.instruments:[],eventWarnings,reasons,ruleSource:rule.source,asOf:h.receivedAt};
}
function firebaseAuth(){const {getApps,initializeApp,applicationDefault}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth');if(!process.env.QUANT_FIREBASE_PROJECT_ID)throw fail('Account verification is not configured.',503,'AUTH_NOT_CONFIGURED');const name='fynx-quant',app=getApps().find(a=>a.name===name)||initializeApp({projectId:process.env.QUANT_FIREBASE_PROJECT_ID,credential:applicationDefault()},name);return getAuth(app);}
async function verifyEdgeUser(req){const token=String(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];if(!token)throw fail('Sign in to manage private Edge settings.',401,'SIGN_IN_REQUIRED');try{const d=await firebaseAuth().verifyIdToken(token,true);return {uid:d.uid,email:d.email,emailVerified:d.email_verified===true,authTime:d.auth_time};}catch(e){if(e.status===503)throw e;throw fail('Your session could not be verified. Sign in again.',401,'INVALID_SESSION');}}
async function resolveRecipient(uid){const u=await firebaseAuth().getUser(uid);return {email:u.email,emailVerified:u.emailVerified&&!u.disabled};}
function createProtectionService({store,verifyIdentity=verifyEdgeUser,env=process.env,fetchImpl=fetch,now=()=>Date.now(),resolveEmail=resolveRecipient,eventResolver=async()=>[],onHeartbeat=async()=>{},guardResolver=async()=>null}={}){
  if(!store)throw new Error('Edge storage is required.');
  const notifications=createNotificationService({store,env,fetchImpl,now,resolveRecipient:resolveEmail});
  const json=(res,status,body)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
  const verified=user=>{if(!user.emailVerified||!user.email)throw fail('Verify your account email before connecting an EA or enabling email.',403,'EMAIL_VERIFICATION_REQUIRED');};
  async function preferencesFor(uid){return await store.get('user_preferences',uid)||{uid,timezone:'UTC',digestEnabled:false,scoreEmailEnabled:false};}
  async function guardFor(uid,events=[]){const selected=await guardResolver(uid,events);if(selected!==null)return selected;const h=await store.get('ea_heartbeats',uid+':latest');const guard=deriveGuard(h&&now()-Date.parse(h.receivedAt)<30*86400000?h:null,now(),events);if(h?.tokenHash){const token=await store.get('ea_tokens',h.tokenHash);if(!token||token.revokedAt){guard.connected=false;guard.status='revoked';guard.instruments=[];guard.reasons=[...(guard.reasons||[]),'The connection token was revoked.'];}}return guard;}
  async function createToken(user,label){
    verified(user);if(!Number.isFinite(user.authTime)||now()/1000-user.authTime>3600)throw fail('Sign in again before creating a new EA token.',401,'RECENT_LOGIN_REQUIRED');string(label,/^[\p{L}\p{N} ._-]{1,60}$/u,'token label');let response;
    await store.mutate('user_preferences',user.uid,async prefs=>{
      const all=(await store.scan('ea_tokens')).filter(t=>t?.uid===user.uid);if(all.filter(t=>!t.revokedAt).length>=5||all.filter(t=>now()-Date.parse(t.createdAt)<86400000).length>=10)throw fail('Token limit reached. Revoke unused tokens or retry tomorrow.',429,'TOKEN_LIMIT');
      const token='fe_'+crypto.randomBytes(32).toString('base64url'),tokenHash=hash(token),record={id:crypto.randomUUID(),uid:user.uid,label,tokenHash,createdAt:iso(now()),revokedAt:null,lastSentAt:0,lastReceivedAt:0,accountHash:null};await store.put('ea_tokens',tokenHash,record);response={id:record.id,label,token,createdAt:record.createdAt,shownOnce:true};return prefs||{uid:user.uid,timezone:'UTC',digestEnabled:false,scoreEmailEnabled:false};
    });return response;
  }
  async function receive(token,input){
    if(!/^fe_[A-Za-z0-9_-]{43}$/.test(token||''))throw fail('Invalid EA token.',401,'INVALID_EA_TOKEN');
    const key=hash(token),body=validateHeartbeat(input,now());let receivedAt;
    // Keep the token lock through persistence and ingestion. Revocation then deletion
    // must wait for accepted reports, so a late report cannot recreate erased copies.
    await store.mutate('ea_tokens',key,async old=>{
      if(!old||old.revokedAt)throw fail('Invalid or revoked EA token.',401,'INVALID_EA_TOKEN');
      if(body.sentAt<=old.lastSentAt)throw fail('Heartbeat replay rejected.',409,'HEARTBEAT_REPLAY');
      if(old.lastReceivedAt&&now()-old.lastReceivedAt<45000)throw fail('Send at most one heartbeat per minute.',429,'HEARTBEAT_RATE');
      const accountHash=hash(body.accountRef);
      if(old.accountHash&&old.accountHash!==accountHash)throw fail('This token is bound to a different trading account. Create a new token.',403,'ACCOUNT_MISMATCH');
      const {accountRef,...safe}=body;
      const record={...safe,id:old.uid+':'+body.sentAt,uid:old.uid,accountHash:hash(accountRef),tokenHash:key,receivedAt:iso(now())};
      await store.put('ea_heartbeats',record.id,record);
      await store.mutate('ea_heartbeats',old.uid+':latest',latest=>!latest||latest.sentAt<record.sentAt?record:latest);
      try{await onHeartbeat({uid:old.uid,tokenId:old.id,accountHash:record.accountHash,report:{...safe,receivedAt:record.receivedAt}});}
      catch{throw fail('Account history ingestion is temporarily unavailable. The EA will retry its unacknowledged history batch.',503,'ACCOUNT_HISTORY_PENDING');}
      receivedAt=record.receivedAt;
      return {...old,accountHash,lastSentAt:body.sentAt,lastReceivedAt:now()};
    });
    return {accepted:true,receivedAt};
  }

  async function pruneHeartbeats(){let count=0;for(const row of await store.scan('ea_heartbeats'))if(row&&now()-Date.parse(row.receivedAt)>30*86400000){await store.delete('ea_heartbeats',row.id);const latest=await store.get('ea_heartbeats',row.uid+':latest');if(latest&&now()-Date.parse(latest.receivedAt)>30*86400000)await store.delete('ea_heartbeats',row.uid+':latest');count++;}return count;}
  async function handle(req,res){const url=new URL(req.url,'https://edge.local'),route=url.pathname.replace(/^\/api\/edge\//,'');if(!/^(tokens(?:\/[^/]+)?|heartbeat|guard|preferences|alerts(?:\/[^/]+)?|notifications(?:\/[^/]+)?|unsubscribe)$/.test(route))return false;
    try{
      if(route==='heartbeat'&&req.method==='POST'){if(url.search)throw fail('EA credentials and payloads must not be sent in URLs.');const token=String(req.headers.authorization||'').match(/^Bearer (fe_[A-Za-z0-9_-]+)$/)?.[1];json(res,202,await receive(token,await readBody(req,300000)));return true;}
      if(route==='unsubscribe'&&['GET','POST'].includes(req.method)){json(res,200,await notifications.unsubscribe(url.searchParams.get('token')));return true;}
      const user=await verifyIdentity(req);if(!user?.uid)throw fail('Sign in first.',401);
      if(route==='tokens'&&req.method==='POST'){const b=object(await readBody(req,2000),['label'],'token');json(res,201,await createToken(user,b.label));}
      else if(route==='tokens'&&req.method==='GET')json(res,200,{tokens:(await store.scan('ea_tokens')).filter(t=>t?.uid===user.uid).map(({id,label,createdAt,revokedAt,lastReceivedAt})=>({id,label,createdAt,revokedAt,lastReceivedAt}))});
      else if(route.startsWith('tokens/')&&req.method==='DELETE'){const row=(await store.scan('ea_tokens')).find(t=>t?.id===route.slice(7)&&t.uid===user.uid);if(!row)throw fail('Token not found.',404);await store.mutate('ea_tokens',row.tokenHash,old=>({...old,revokedAt:iso(now())}));json(res,200,{revoked:true});}
      else if(route==='guard'&&req.method==='GET')json(res,200,await guardFor(user.uid,await eventResolver(user.uid)));
      else if(route==='preferences'&&req.method==='GET'){const p=await preferencesFor(user.uid);const {email,uid,...safe}=p;json(res,200,{...safe,emailConfigured:notifications.configured()});}
      else if(route==='preferences'&&req.method==='POST'){const b=object(await readBody(req,4000),['timezone','digestEnabled','scoreEmailEnabled'],'preferences');if(b.timezone!==undefined)timezone(b.timezone);for(const k of ['digestEnabled','scoreEmailEnabled'])if(b[k]!==undefined&&typeof b[k]!=='boolean')throw fail('Invalid notification preference.');if(b.digestEnabled||b.scoreEmailEnabled)verified(user);const saved=await store.mutate('user_preferences',user.uid,old=>({...old,uid:user.uid,...b,email:user.email||null,emailVerified:user.emailVerified===true,updatedAt:iso(now())}));json(res,200,{saved:true,timezone:saved.timezone,digestEnabled:!!saved.digestEnabled,scoreEmailEnabled:!!saved.scoreEmailEnabled,emailConfigured:notifications.configured()});}
      else if(route==='alerts'&&req.method==='GET')json(res,200,{alerts:(await store.scan('alerts')).filter(a=>a?.uid===user.uid)});
      else if(route==='alerts'&&req.method==='POST'){const b=object(await readBody(req,4000),['strategyId','symbol','threshold','emailEnabled'],'alert');string(b.strategyId,/^[A-Za-z0-9_-]{1,80}$/,'strategy ID');if(b.symbol&&!engine().SYMBOLS.some(s=>s.id===b.symbol))throw fail('Unknown alert market.');number(b.threshold,0,99,'score threshold');if(b.emailEnabled!==undefined&&typeof b.emailEnabled!=='boolean')throw fail('Invalid alert email option.');if(b.emailEnabled)verified(user);const id=hash(user.uid+':'+b.strategyId+':'+(b.symbol||'*')).slice(0,32),record={id,uid:user.uid,strategyId:b.strategyId,symbol:b.symbol||null,threshold:b.threshold,emailEnabled:!!b.emailEnabled,enabled:true,above:false,createdAt:iso(now())};await store.put('alerts',user.uid+':'+id,record);json(res,201,{alert:record});}
      else if(route.startsWith('alerts/')&&req.method==='DELETE'){const id=route.slice(7),old=await store.get('alerts',user.uid+':'+id);if(!old)throw fail('Alert not found.',404);await store.put('alerts',user.uid+':'+id,{...old,enabled:false,emailEnabled:false});json(res,200,{deleted:true});}
      else if(route==='notifications'&&req.method==='GET')json(res,200,{notifications:(await store.scan('notifications')).filter(n=>n?.uid===user.uid).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100)});
      else throw fail('Unsupported Edge operation.',405);
    }catch(e){json(res,e.status||500,{error:e.status?e.message:'Edge account service is temporarily unavailable.',code:e.code||'EDGE_ACCOUNT_ERROR'});}return true;
  }
  return {handle,createToken,receive,guardFor,preferencesFor,pruneHeartbeats,processSnapshot:notifications.processSnapshot,sendDigest:notifications.sendDigest,notifications};
}
module.exports={createProtectionService,verifyEdgeUser,validateHeartbeat,validateAccountHistory,deriveGuard,pragueDate};
