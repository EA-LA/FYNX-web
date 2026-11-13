'use strict';
// Called only by verify-account-sync-live.cjs after explicit disposable-QA opt-in.
module.exports=async function({user,functionsBase,request,callable,check,mustReject,step}){
 const api=async(route,method='GET',body)=>{
  const response=await request(functionsBase+'/webTradingResearch/api/'+route,{method,body,token:user.idToken});
  check(response.body&&typeof response.body==='object','Research JSON response');return response.body;
 };
 const returns=[{date:'2026-11-10',return:0.001},{date:'2026-11-11',return:-0.002},{date:'2026-11-12',return:0.0015}];
 const provenance={source:'disposable-qa-synthetic-returns',warnings:['Synthetic verification data, not market performance.']};
 for(const type of ['strategies','portfolios'])await step('connected-quant-'+type+'-create-read-rename-delete',async()=>{
  check((await api('quant/'+type))[type].length===0,'New QA Quant account empty');
  const item=type==='strategies'?{id:'qa-connected-strategy',name:'QA synthetic strategy',symbol:'EURUSD',timeframe:'D1',returns,provenance}:{id:'qa-connected-portfolio',name:'QA synthetic portfolio',method:'equal-weight',sleeves:[{name:'QA synthetic sleeve',returns}],provenance};
  const created=await api('quant/'+type,'POST',item);check(created.item.id===item.id,'Saved ID contract');
  const read=await api('quant/'+type);check(read[type].length===1&&read[type][0].provenance.source===provenance.source,'Shared Quant record');
  const rename={...read[type][0],name:'QA renamed from native shape'};await api('quant/'+type,'POST',rename);
  const again=(await api('quant/'+type))[type][0];check(again.name===rename.name&&JSON.stringify(again.returns||again.sleeves)===JSON.stringify(item.returns||item.sleeves),'Rename preserves research payload');
  await api('quant/'+type+'/'+item.id,'DELETE');check((await api('quant/'+type))[type].length===0,'Delete shared Quant record');
 });
 await step('connected-edge-watchlist-and-disabled-email-preferences',async()=>{
  const before=await api('edge/watchlist');check(Array.isArray(before.symbols),'Watchlist symbols contract');
  await api('edge/watchlist','POST',{symbols:['EURUSD','USDJPY'],timezone:'Asia/Tokyo'});
  const watch=await api('edge/watchlist');check(watch.symbols.join(',')==='EURUSD,USDJPY'&&watch.timeZone==='Asia/Tokyo','Native lowercase timezone request accepted');
  await api('edge/preferences','POST',{timezone:'America/New_York',digestEnabled:false,scoreEmailEnabled:false});
  const preferences=await api('edge/preferences');check(preferences.timezone==='America/New_York'&&preferences.digestEnabled===false&&preferences.scoreEmailEnabled===false,'No email preference enabled');
 });
 await step('connected-edge-in-app-alert-create-disable-and-inbox',async()=>{
  const response=await api('edge/alerts','POST',{strategyId:'qa-synthetic-strategy',symbol:'EURUSD',threshold:99,emailEnabled:false});
  const alert=response.alert;check(alert.id&&alert.enabled===true&&alert.emailEnabled===false,'Email disabled on QA alert');
  check((await api('edge/alerts')).alerts.some(row=>row.id===alert.id),'Saved alert visible');
  await api('edge/alerts/'+alert.id,'DELETE');const disabled=(await api('edge/alerts')).alerts.find(row=>row.id===alert.id);
  check(disabled?.enabled===false&&disabled.emailEnabled===false,'Native delete disables alert');check(Array.isArray((await api('edge/notifications')).notifications),'Inbox array contract');
 });
 await step('connected-web-reminders-list-without-email-send',async()=>{const value=await callable(user,{action:'list'},'webReminders');check(Array.isArray(value.reminders)&&value.reminders.length===0,'New QA account reminder list');});
 await step('connected-consumer-free-status-and-paid-run-denial',async()=>{
  const value=await callable(user,{action:'status',accountUid:user.uid},'consumerLiveWorkspace');check(value.mode==='live'&&value.tier===null,'No customer or subscription granted');
  await mustReject(()=>callable(user,{action:'run',accountUid:user.uid,product:'risk',input:{balance:10000,riskPercent:1,entry:100,stop:99}},'consumerLiveWorkspace'),'permission-denied');
 });
 const intelligence=data=>callable(user,{expectedUID:user.uid,...data},'fynxIntelligence');
 await step('connected-intelligence-snapshot-watchlist-preferences-no-ai',async()=>{
  const value=await intelligence({action:'snapshot'});check(value.tier==='free'&&Array.isArray(value.watchlist),'Free Intelligence snapshot');
  const asset={id:'AAPL',symbol:'AAPL',name:'Apple',kind:'stocks',chartSymbol:'NASDAQ:AAPL',providerSymbol:'AAPL'};
  const added=await intelligence({action:'addWatchlist',asset});check(added.watchlist.some(row=>row.id==='AAPL'),'Added market');
  const preferences={enabled:false,categories:['price','economic','earnings'],frequency:'important',interests:['QA synthetic research']};
  const saved=await intelligence({action:'savePreferences',preferences});check(saved.preferences.enabled===false&&saved.preferences.interests.includes('QA synthetic research'),'Disabled notification preferences saved');
  const removed=await intelligence({action:'removeWatchlist',assetId:'AAPL'});check(!removed.watchlist.some(row=>row.id==='AAPL'),'Removed market');
 });
 await step('connected-intelligence-existing-history-without-ai-generation',async()=>{const value=await intelligence({action:'researchHistory'});check(Array.isArray(value.reports)&&value.reports.length===0&&value.historyDays>=1,'Existing research archive response');});
};
