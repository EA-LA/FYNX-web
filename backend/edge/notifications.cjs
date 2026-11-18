'use strict';
const crypto = require('node:crypto');
const { fail } = require('../quant/common.cjs');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function timezone(value) { try { new Intl.DateTimeFormat('en',{timeZone:value}).format(); } catch { throw fail('Choose a valid IANA time zone.'); } return value; }
function dateInZone(now,zone) { return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)); }
function createNotificationService({store,env=process.env,fetchImpl=fetch,now=()=>Date.now(),resolveRecipient}={}) {
  const origin = () => { const url=new URL(env.EDGE_PUBLIC_ORIGIN||'https://fynxfinanceworld.com');if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw fail('Configure an HTTPS Edge public origin.',503);return url.origin; };
  function unsubscribeToken(uid,kind,id='') {
    if(!env.EDGE_UNSUBSCRIBE_SECRET||env.EDGE_UNSUBSCRIBE_SECRET.length<32)throw fail('Email unsubscribe signing is not configured.',503,'EMAIL_NOT_CONFIGURED');
    const data=Buffer.from(JSON.stringify({uid,kind,id,exp:Math.floor(now()/1000)+366*86400})).toString('base64url');
    return data+'.'+crypto.createHmac('sha256',env.EDGE_UNSUBSCRIBE_SECRET).update(data).digest('base64url');
  }
  async function unsubscribe(token) {
    if(typeof token!=='string'||token.length>2000||!env.EDGE_UNSUBSCRIBE_SECRET)throw fail('This unsubscribe link is invalid.',400);
    const [data,signature,...rest]=token.split('.'),expected=crypto.createHmac('sha256',env.EDGE_UNSUBSCRIBE_SECRET).update(data||'').digest();
    const supplied=Buffer.from(signature||'','base64url');if(rest.length||supplied.toString('base64url')!==signature||supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))throw fail('This unsubscribe link is invalid.',400);
    let payload;try{payload=JSON.parse(Buffer.from(data,'base64url'));}catch{throw fail('This unsubscribe link is invalid.');}
    if(!payload.uid||payload.exp<now()/1000||!['digest','alerts','alert'].includes(payload.kind))throw fail('This unsubscribe link has expired or is invalid.');
    if(payload.kind==='alert')await store.mutate('alerts',payload.uid+':'+payload.id,old=>old?.uid===payload.uid?{...old,enabled:false,emailEnabled:false}:old);
    else await store.mutate('user_preferences',payload.uid,old=>({...old,uid:payload.uid,[payload.kind==='digest'?'digestEnabled':'scoreEmailEnabled']:false,updatedAt:new Date(now()).toISOString()}));
    return {unsubscribed:true,kind:payload.kind};
  }
  const configured=()=>env.EDGE_EMAIL_SEND_ENABLED==='true'&&!!env.MAILGUN_API_KEY&&!!env.EDGE_MAILGUN_DOMAIN&&!!env.EDGE_MAIL_FROM&&String(env.EDGE_UNSUBSCRIBE_SECRET||'').length>=32;
  async function deliver({uid,key,subject,text,kind,id=''}) {
    if(!configured())return {status:'unavailable',reason:'Email delivery is not configured/enabled.'};
    const prefs=await store.get('user_preferences',uid);
    if(!prefs?.emailVerified||!(kind==='digest'?prefs.digestEnabled:prefs.scoreEmailEnabled))return {status:'not-opted-in'};
    const recipient=await resolveRecipient(uid);if(!recipient?.emailVerified||!recipient.email||recipient.email!==prefs.email)return {status:'recipient-changed'};
    const unsubscribeUrl=origin()+'/api/edge/unsubscribe?token='+encodeURIComponent(unsubscribeToken(uid,kind,id));
    let claimed=false;await store.mutate('delivery_claims',key,old=>{if(old)return old;claimed=true;return {id:key,uid,status:'sending',claimedAt:new Date(now()).toISOString()};});if(!claimed)return {status:'already-claimed'};
    try {
      if(!/^[a-zA-Z0-9.-]+$/.test(env.EDGE_MAILGUN_DOMAIN))throw new Error('Invalid Mailgun domain');
      const body=new URLSearchParams({from:env.EDGE_MAIL_FROM,to:recipient.email,subject,text:text+'\n\nUnsubscribe: '+unsubscribeUrl,'h:List-Unsubscribe':'<'+unsubscribeUrl+'>','h:List-Unsubscribe-Post':'List-Unsubscribe=One-Click'});
      const base=env.EDGE_MAILGUN_REGION==='EU'?'https://api.eu.mailgun.net':'https://api.mailgun.net';
      const response=await fetchImpl(base+'/v3/'+env.EDGE_MAILGUN_DOMAIN+'/messages',{method:'POST',headers:{Authorization:'Basic '+Buffer.from('api:'+env.MAILGUN_API_KEY).toString('base64')},body,signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Mail provider rejected request');
      await store.put('delivery_claims',key,{id:key,uid,status:'accepted',acceptedAt:new Date(now()).toISOString()});return {status:'accepted'};
    }catch{await store.put('delivery_claims',key,{id:key,uid,status:'delivery-unconfirmed',updatedAt:new Date(now()).toISOString()});return {status:'delivery-unconfirmed'};}
  }
  async function processSnapshot(uid,snapshot) {
    const fits=snapshot.fits||snapshot.markets?.flatMap(m=>(m.fits||[m.bestFit]).filter(Boolean).map(f=>({...f,symbol:m.symbol})))||[];
    const alerts=(await store.scan('alerts')).filter(a=>a?.uid===uid&&a.enabled);const emitted=[];
    for(const alert of alerts){const candidates=fits.filter(f=>f.strategyId===alert.strategyId&&(!alert.symbol||f.symbol===alert.symbol)&&Number.isFinite(f.score));if(!candidates.length)continue;
      const fit=candidates.sort((a,b)=>b.score-a.score)[0],above=fit.score>alert.threshold;let fire=false;
      await store.mutate('alerts',uid+':'+alert.id,old=>{if(!old?.enabled)return old;fire=above&&!old.above;return {...old,above,lastScore:fit.score,lastEvaluatedAt:snapshot.generatedAt||snapshot.updatedAt||snapshot.asOf||new Date(now()).toISOString()};});if(!fire)continue;
      const id=digest(uid+':'+alert.id+':'+(snapshot.generatedAt||snapshot.updatedAt||snapshot.asOf||dateInZone(now(),'UTC'))),record={id,uid,alertId:alert.id,symbol:fit.symbol,strategyId:alert.strategyId,score:fit.score,message:`${fit.symbol}: strategy fit ${fit.score} is above your ${alert.threshold} threshold.`,createdAt:new Date(now()).toISOString(),read:false,unsubscribeUrl:'/profile.html#edge-settings'};
      await store.put('notifications',uid+':'+id,record);emitted.push(record);
      if(alert.emailEnabled)await deliver({uid,key:'alert:'+id,subject:'FYNX Edge Radar score alert',text:record.message+'\n'+origin()+'/edge-radar/'+fit.symbol.toLowerCase(),kind:'alerts'});
    }return emitted;
  }
  async function sendDigest(uid,snapshot,localDate) {
    const prefs=await store.get('user_preferences',uid);if(!prefs?.digestEnabled)return {status:'not-opted-in'};
    const zone=timezone(prefs.timezone||'UTC'),expected=dateInZone(now(),zone);if(localDate!==expected)throw fail('Digest date must match the current local day.');
    const brief=typeof snapshot?.brief==='string'?snapshot.brief:snapshot?.brief?.text;if(!brief)return {status:'snapshot-unavailable'};
    const snapshotTime=Date.parse(snapshot.generatedAt||snapshot.updatedAt||snapshot.asOf||'');if(!Number.isFinite(snapshotTime)||dateInZone(snapshotTime,zone)!==localDate)return {status:'snapshot-stale'};
    return deliver({uid,key:digest('digest:'+uid+':'+localDate),subject:'Your FYNX Edge Radar · '+localDate,text:brief+'\n\n'+origin()+'/edge-radar\nScores are estimates from past behavior, not trade signals.',kind:'digest'});
  }
  return {processSnapshot,sendDigest,unsubscribe,unsubscribeToken,configured};
}
module.exports={createNotificationService,timezone,dateInZone};
