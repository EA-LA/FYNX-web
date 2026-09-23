'use strict';
const admin=require('firebase-admin'),{createHash}=require('node:crypto');
const {recordFailure}=require('./operations');
const logger=require('firebase-functions/logger');
const sources={
 nyse:'https://www.nyse.com/trade/hours-calendars',
 nasdaq:'https://www.nasdaq.com/market-activity/stock-market-holiday-schedule',
 jpx:'https://www.jpx.co.jp/english/corporate/about-jpx/calendar/',
 tmx:'https://www.tsx.com/en/trading/calendars-and-trading-hours/calendar',
 tmxNotices:'https://www.tsx.com/en/trading/toronto-stock-exchange/trading-notices',
 hkex:'https://www.hkex.com.hk/News/HKEX-Calendar?sc_lang=en',
 lse:'https://www.londonstockexchange.com/equities-trading/business-days'
};
function fingerprint(html){
 const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 // Keep calendar/closure passages; ignore rotating prices, navigation, and scripts.
 const passages=[...text.matchAll(/.{0,50}(?:holiday|early clos|market clos|trading suspend|mourning|non.trading).{0,200}/gi)].map(m=>m[0]);
 if((text.match(/holiday|early clos|market clos|trading suspend|mourning|non.trading/gi)||[]).length<2)throw Error('Calendar needs browser review');
 return createHash('sha256').update(passages.join('\n')).digest('hex');
}
async function check(){
 const db=admin.firestore(),ref=db.doc('fynxWebOperations/holidayNoticeChecks');
 const old=(await ref.get()).data()||{};
 if(old.checkedAt && Date.now()-Date.parse(old.checkedAt)<86400000)return;
 const results={};
 await Promise.all(Object.entries(sources).map(async([name,url])=>{
  try{const response=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'FYNX-Calendar-Review/1.0'}});if(!response.ok)throw Error('Source unavailable');
   const hash=fingerprint(await response.text()),previous=old.sources?.[name];
   const changed=!!previous?.hash&&hash!==previous.hash;
   const pendingReview=changed||previous?.pendingReview===true||previous?.status==='review_required';
   results[name]={url,hash,pendingReview,checkedAt:new Date().toISOString(),status:pendingReview?'review_required':'checked',...(changed?{changedAt:new Date().toISOString()}:previous?.changedAt?{changedAt:previous.changedAt}:{})};
   if(changed||results[name].status==='review_required')recordFailure({category:'feed',operation:'feed-probe',code:'unavailable',page:'/tools/market-holidays.html'},'holiday-notice-review');
  }catch{results[name]={...(old.sources?.[name]||{}),url,checkedAt:new Date().toISOString(),status:'source_unavailable'};recordFailure({category:'feed',operation:'feed-probe',code:'unavailable',page:'/tools/market-holidays.html'},'holiday-source');}
 }));
 await ref.set({checkedAt:new Date().toISOString(),sources:results});
 logger.info('Holiday calendar source review',{monitor:'fynx-holiday-notices',sources:Object.fromEntries(Object.entries(results).map(([k,v])=>[k,v.status]))});
}
exports.check=check;exports._test={fingerprint};
