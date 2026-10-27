'use strict';
// FYNX API 7: trading sessions, exchange holidays and market-hours status.
// Uses published exchange schedules bundled in developer-markets-data.cjs; no third-party feed.
const {InputError}=require('./developer-engine.cjs');
const {HOLIDAYS,COVERAGE}=require('./developer-markets-data.cjs');
const invalid=(m,c='invalid_input')=>{throw new InputError(m,c);};
const DAY=86400000;

// Regular cash-equity hours in exchange local time. `early` is the session list on a published early-close day.
const EXCHANGES={
 NYSE:{name:'New York Stock Exchange',tz:'America/New_York',sessions:[['09:30','16:00']],early:[['09:30','13:00']]},
 NASDAQ:{name:'Nasdaq',tz:'America/New_York',sessions:[['09:30','16:00']],early:[['09:30','13:00']]},
 LSE:{name:'London Stock Exchange',tz:'Europe/London',sessions:[['08:00','16:30']],early:[['08:00','12:30']]},
 TSX:{name:'Toronto Stock Exchange',tz:'America/Toronto',sessions:[['09:30','16:00']],early:[['09:30','13:00']]},
 TSXV:{name:'TSX Venture Exchange',tz:'America/Toronto',sessions:[['09:30','16:00']],early:[['09:30','13:00']]},
 HKEX:{name:'Hong Kong Exchanges',tz:'Asia/Hong_Kong',sessions:[['09:30','12:00'],['13:00','16:00']],early:[['09:30','12:00']]},
 TSE:{name:'Tokyo Stock Exchange',tz:'Asia/Tokyo',sessions:[['09:00','11:30'],['12:30','15:30']],early:[['09:00','11:30']]}
};
// Forex sessions as shown on /tools/market-hours.html. The spot FX week runs Sunday 17:00 to Friday 17:00 New York time.
const FX_SESSIONS=[
 {id:'sydney',name:'Sydney',tz:'Australia/Sydney',open:'08:00',close:'17:00'},
 {id:'tokyo',name:'Tokyo',tz:'Asia/Tokyo',open:'09:00',close:'18:00'},
 {id:'london',name:'London',tz:'Europe/London',open:'08:00',close:'17:00'},
 {id:'new_york',name:'New York',tz:'America/New_York',open:'08:00',close:'17:00'}
];

const formatters={};
function local(ms,tz){
 const f=formatters[tz]||(formatters[tz]=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',weekday:'short'}));
 const p=Object.fromEntries(f.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`,weekday:p.weekday,y:+p.year,m:+p.month,d:+p.day,h:+p.hour,min:+p.minute,s:+p.second};
}
// Convert a wall-clock time in `tz` to a UTC instant (two refinement passes handle DST offsets).
function zoned(date,time,tz){
 const [y,m,d]=date.split('-').map(Number),[h,mi]=time.split(':').map(Number),want=Date.UTC(y,m-1,d,h,mi);
 let guess=want;for(let i=0;i<3;i++){const l=local(guess,tz),seen=Date.UTC(l.y,l.m-1,l.d,l.h,l.min,l.s);guess+=want-seen;}
 return guess;
}
const iso=ms=>new Date(ms).toISOString().replace('.000Z','Z');
const addDays=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
const weekend=date=>[0,6].includes(new Date(date+'T12:00:00Z').getUTCDay());

function code(x){const c=typeof x==='string'?x.toUpperCase():'';if(!EXCHANGES[c])invalid(`Unknown exchange. Use one of: ${Object.keys(EXCHANGES).join(', ')}.`,'unsupported_exchange');return c;}
function instant(at){
 if(at===undefined||at===null)return Date.now();
 if(typeof at!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(at)||!Number.isFinite(Date.parse(at)))invalid('at must be an ISO 8601 timestamp with a timezone, e.g. 2026-11-02T14:30:00Z.');
 const t=Date.parse(at);if(Math.abs(t-Date.now())>6*365*DAY)invalid('at must be within six years of today.');return t;
}
function covered(ex,date){const c=COVERAGE[ex];return !!c&&date>=c.start&&date<=c.end;}
// Day classification for one exchange: trading | early_close | holiday | weekend | unknown.
function dayInfo(ex,date){
 if(weekend(date))return {type:'weekend'};
 if(!covered(ex,date))return {type:'unknown'};
 const y=HOLIDAYS[ex]?.[date.slice(0,4)],md=date.slice(5);
 if(y?.closed?.includes(md))return {type:'holiday',source:y.source};
 if(y?.early?.includes(md))return {type:'early_close',source:y.source};
 return {type:'trading'};
}
function intervals(ex,date,info){const def=EXCHANGES[ex];return (info.type==='early_close'?def.early:def.sessions).map(([a,b])=>[zoned(date,a,def.tz),zoned(date,b,def.tz)]);}

function exchangeStatus(ex,t){
 const def=EXCHANGES[ex],l=local(t,def.tz),info=dayInfo(ex,l.date);
 const out={exchange:ex,name:def.name,timezone:def.tz,local_time:`${l.date}T${l.time}`,local_date:l.date,day_type:info.type,status:'closed',next_open:null,next_close:null};
 if(info.type==='unknown'){out.status='unknown';out.warnings=['date_outside_published_calendar_coverage'];out.coverage=COVERAGE[ex];return out;}
 if(info.source)out.calendar_source=info.source;
 const today=info.type==='trading'||info.type==='early_close'?intervals(ex,l.date,info):[];
 const current=today.find(([a,b])=>t>=a&&t<b);
 if(current){out.status='open';out.next_close=iso(current[1]);}
 else if(today.some(([,b])=>b<=t)&&today.some(([a])=>a>t))out.status='break';
 // Look ahead up to 15 calendar days for the next session boundary.
 for(let i=0;i<=15&&(!out.next_open||!out.next_close);i++){
  const date=addDays(l.date,i),d=dayInfo(ex,date);
  if(d.type==='unknown'){(out.warnings||(out.warnings=[])).push('next_session_beyond_calendar_coverage');break;}
  if(d.type!=='trading'&&d.type!=='early_close')continue;
  for(const [a,b] of intervals(ex,date,d)){if(!out.next_open&&a>t)out.next_open=iso(a);if(!out.next_close&&b>t)out.next_close=iso(b);}
 }
 if(out.status!=='open'&&out.next_close&&out.next_open&&out.next_close<out.next_open)out.next_close=null;
 if(!out.warnings)out.warnings=[];
 return out;
}
function fxOpen(t){
 const l=local(t,'America/New_York'),wd=l.weekday,mins=l.h*60+l.min;
 if(wd==='Sat')return false;if(wd==='Sun')return mins>=17*60;if(wd==='Fri')return mins<17*60;return true;
}
function fxSessions(t){
 const market=fxOpen(t),sessions=FX_SESSIONS.map(s=>{
  const l=local(t,s.tz);let open=zoned(l.date,s.open,s.tz),close=zoned(l.date,s.close,s.tz);
  if(t>=close){open=zoned(addDays(l.date,1),s.open,s.tz);close=zoned(addDays(l.date,1),s.close,s.tz);}
  const active=market&&t>=open&&t<close&&!['Sat','Sun'].includes(l.weekday);
  return {session:s.id,name:s.name,timezone:s.tz,local_hours:`${s.open}-${s.close}`,status:active?'open':'closed',window_start:iso(open),window_end:iso(close)};
 });
 const open=sessions.filter(s=>s.status==='open').map(s=>s.name);
 return {at:iso(t),fx_market:market?'open':'closed',fx_week:'Sunday 17:00 to Friday 17:00 America/New_York',sessions,active_sessions:open,overlap:open.length>1?open.join(' + '):null,note:'Sessions are liquidity conventions, not exchange hours. Brokers and holidays can change actual availability.'};
}

const MARKETS=['status','holidays','sessions','exchanges'];
function markets(name,x){
 if(!x||typeof x!=='object')invalid('Send a JSON object.');
 if(name==='exchanges')return {exchanges:Object.entries(EXCHANGES).map(([k,v])=>({exchange:k,name:v.name,timezone:v.tz,regular_sessions:v.sessions.map(([a,b])=>`${a}-${b}`),early_close_sessions:v.early.map(([a,b])=>`${a}-${b}`),calendar_coverage:COVERAGE[k]})),hours_basis:'regular cash-equity session, exchange local time'};
 if(name==='sessions')return fxSessions(instant(x.at));
 if(name==='status'){
  const t=instant(x.at);let list=Object.keys(EXCHANGES);
  if(x.exchanges!==undefined){if(!Array.isArray(x.exchanges)||!x.exchanges.length||x.exchanges.length>20)invalid('exchanges must be a non-empty array.');list=[...new Set(x.exchanges.map(code))];}
  return {at:iso(t),exchanges:list.map(e=>exchangeStatus(e,t)),hours_basis:'regular cash-equity session; pre-market, after-hours and auctions are excluded'};
 }
 if(name==='holidays'){
  const ex=code(x.exchange),year=x.year===undefined?new Date().getUTCFullYear():x.year;
  if(!Number.isInteger(year)||year<2000||year>2100)invalid('year must be a four-digit year.');
  const y=HOLIDAYS[ex]?.[year],c=COVERAGE[ex],def=EXCHANGES[ex];
  const days=y?['closed','early'].flatMap(k=>(y[k]||[]).map(md=>({date:`${year}-${md}`,type:k==='closed'?'holiday':'early_close',...(k==='early'?{sessions:def.early.map(([a,b])=>`${a}-${b}`)}:{})}))).sort((a,b)=>a.date.localeCompare(b.date)):[];
  const full=c&&`${year}-01-01`>=c.start&&`${year}-12-31`<=c.end;
  return {exchange:ex,year,timezone:def.tz,days,calendar_source:y?.source||null,coverage:c,coverage_status:!y?'not_covered':full?'full_year':'partial_year',warnings:full?[]:['unlisted_dates_are_not_confirmed_open']};
 }
 invalid('Markets endpoint not found. Use one of: '+MARKETS.join(', ')+'.','not_found');
}
module.exports={markets,MARKETS,EXCHANGES,_time:{local,zoned,exchangeStatus,fxSessions}};
