import * as view from './render.js?v=20261113-shared-account-2';
import { publishedResearch } from './public-research.js?v=20261113-shared-account-2';
const researchService = window.FynxResearchService;
const $=id=>document.getElementById(id),root=$('edge-main'),symbol=document.body.dataset.edgeSymbol;
const config=JSON.parse($('edge-market-config').textContent);
const state={snapshot:null,market:null,selected:null,filter:'All',sort:'fit',order:'desc',user:null,identityVersion:0,request:0,tz:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',poll:null,headlines:null,headlinesReason:null};
let guardTimer=null,quoteTimer=null,quoteConfigured=true,quoteBusy=false,lastGuard=null;
const dialog=$('edge-dialog');
function status(message,error=false){$('edge-status').classList.toggle('edge-error',error);$('edge-status').textContent=message;}
async function api(path,options={},publicOnly=false){
 const owner=publicOnly?null:state.user,version=state.identityVersion,headers={...(options.body?{'Content-Type':'application/json'}:{}),...options.headers};
 if(owner){headers.Authorization='Bearer '+await owner.getIdToken();if(version!==state.identityVersion)throw new Error('Account changed. Reload this workspace.');}
 const response=await fetch(researchService.apiURL('/api/edge/'+path),{...options,headers,credentials:'omit',signal:options.signal||AbortSignal.timeout(20000)});
 if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('The Edge data service is unavailable. Please try again later.');
 const result=await response.json();if(version!==state.identityVersion)throw new Error('Account changed. Reload this workspace.');
 if(!response.ok)throw new Error(typeof result.error==='object'?result.error.message:result.error||result.message||'The request could not be completed.');
 return result;
}
function showDialog(html){$('edge-dialog-body').innerHTML=html;dialog.showModal();}
function signIn(action){showDialog(`<h2 id="edge-dialog-title">Sign in to ${view.esc(action)}</h2><p>Your watchlist, strategies and alerts are private to your account. Public market research stays available here.</p><div class="edge-actions"><a class="edge-button edge-primary" href="/auth/login.html?returnTo=${encodeURIComponent(location.pathname)}">Sign in</a><button class="edge-button" data-close>Keep browsing</button></div>`);}
function errorDialog(title,error){showDialog(`<h2 id="edge-dialog-title">${view.esc(title)}</h2><p>${view.esc(error.message||error)}</p><button class="edge-button" data-close>Close</button>`);}
function clock(){document.querySelectorAll('[data-countdown]').forEach(el=>{const ms=Date.parse(el.dataset.countdown)-Date.now();el.textContent=ms>0?`${Math.floor(ms/3600000)}h ${Math.floor(ms%3600000/60000)}m away`:'Release time reached';});}
function placeGuard(){const guard=$('edge-guard');if(!guard)return;if(matchMedia('(max-width:639px)').matches&&!symbol)$('edge-primary').prepend(guard);else $('edge-side').prepend(guard);}
function renderGuard(guard){lastGuard=guard;if(guard?.receivedAt&&Date.now()-Date.parse(guard.receivedAt)>=180000)guard={...guard,connected:false,status:'offline',offlineSince:new Date(Date.parse(guard.receivedAt)+180000).toISOString()};let node=$('edge-guard');if(!node){node=document.createElement('section');node.id='edge-guard';node.className='edge-guard';$('edge-side').prepend(node);}node.innerHTML=state.snapshot?.publicResearch&&state.user?'<span class="edge-eyebrow">ACCOUNT GUARD</span><h2>Public market research</h2><p>Account balances and broker sizing require your private account snapshot.</p><button class="edge-button" data-action="retry">Retry account research</button>':view.guard(guard);placeGuard();expirePlans(guard);}
function expirePlans(guard){
 if(!state.market)return;let changed=false;
 for(const plan of Object.values(state.market.tradePlans)){const time=Date.parse(plan.executionQuote?.asOf||plan.basisAt);if(plan.available&&(!guard?.connected||!Number.isFinite(time)||Date.now()-time>=180000)){Object.assign(plan,{available:false,entry:null,stop:null,target:null,lots:null,riskAmount:null,executionQuote:null,reason:'Fresh broker reporting is required. The previous executable plan has expired.'});changed=true;}}
 if(changed&&$('edge-trade-plan'))$('edge-trade-plan').outerHTML=view.tradePlan(state.market,state.selected);
}
function renderMain(){const s=state.snapshot;if(!s)return;$('edge-summary').innerHTML=view.summary(s,state.tz);$('edge-primary').innerHTML=view.radar(s.markets,state.filter,state.sort,state.order)+view.strategies(s.strategies,!!s.guest,!!state.user)+view.regimeMap(s.regimeMap);$('edge-side').innerHTML=view.events(s.markets,state.tz)+view.cot(s.markets)+'<div id="edge-risk-warnings">'+view.warnings(s.doubleRisk||[],s.guard?.currency)+'</div>'+view.moodDetails(s.mood);renderGuard(s.guard);clock();}
function renderDetail(){const m=state.market;if(!m)return;const fit=m.fits.find(f=>f.strategyId===state.selected)||m.bestFit||m.fits[0];state.selected=fit?.strategyId||null;root.querySelector('h1').textContent=config.find(s=>s.id===symbol)?.label||symbol;$('edge-back').hidden=false;$('edge-brief').textContent=m.name+' · '+(m.state.regime.value||'Regime unavailable');$('edge-summary').innerHTML=view.detailSummary(m,fit);$('edge-actions').innerHTML=`<a class="edge-button edge-primary" href="${view.quantURL(symbol,state.selected)}">Open in Quant →</a>${fit?`<button class="edge-button" data-alert="${view.esc(fit.strategyId)}" data-symbol="${view.esc(symbol)}">Set score alert</button>`:''}`;$('edge-primary').innerHTML=view.fitBreakdown(m,fit,state.selected)+view.regimeHistory(m)+view.similar(fit)+view.headlines(state.headlines,state.headlinesReason);$('edge-side').innerHTML=view.tradePlan(m,state.selected)+view.marketStats(m,(m.correlations||[]).filter(c=>c.value!=null).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,4).map(c=>({...c,correlation:c.value})))+view.positioningHistory(m)+view.events([m],state.tz);renderGuard(state.snapshot?.guard);}
function render(){symbol?renderDetail():renderMain();root.setAttribute('aria-busy','false');}
function updateMeta(data){state.tz=data.publicResearch?(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'):(data.userTimezone||data.timeZone||state.tz);$('edge-updated').textContent=`${view.date(data.asOf,state.tz)} · ${state.tz} · ${data.guest?'PUBLIC RESEARCH':'YOUR RADAR'}`;if(!symbol)$('edge-brief').textContent=data.brief;const issues=[...(data.providerIssues||[]).filter(x=>typeof x==='string'),...Object.entries(data.providerStatus||{}).filter(([,p])=>p.status==='unavailable'||p.configured===false).map(([name])=>name==='vix'?'VIX unavailable':name==='calendar'?'Calendar unavailable':name==='quotes'?'Showing daily closes':name+' unavailable')];if(data.publicResearch){
  const ageLabel=Date.now()-Date.parse(data.generatedAt)>2*86400000?'Last published research':'Published research';
  status(`${ageLabel} · generated ${view.date(data.generatedAt,state.tz)} ${state.tz}. ${state.user?'Showing public markets and built-in strategies. ':''}${issues.slice(0,3).join(' · ')}`);
  if(data.sources?.length)$('edge-sources').textContent=data.sources.join(' · ');
  return;
 }const label=data.status==='delayed'?'Delayed snapshot':data.status==='partial'?'Partial data coverage':'Latest available snapshot';status(`${label} · generated ${view.date(data.generatedAt||data.asOf,state.tz)}. ${issues.slice(0,3).join(' · ')}`);if(data.sources?.length)$('edge-sources').textContent=data.sources.join(' · ');}
function present(data, request) {
  if (request !== state.request) return;
  if (!Number.isFinite(Date.parse(data.asOf)) || (symbol ? !data.market?.state : !Array.isArray(data.markets))) {
    throw new Error('The service did not return a market snapshot.');
  }
  const previousSnapshot = state.snapshot, previousMarket = state.market;
  state.snapshot = data;
  state.market = symbol ? data.market : null;
  try {
    updateMeta(data);
    render();
    quoteConfigured = data.providerStatus?.quotes?.configured !== false;
  } catch (error) {
    state.snapshot = previousSnapshot;
    state.market = previousMarket;
    if (previousSnapshot) { render(); updateMeta(previousSnapshot); }
    throw error;
  }
  refreshQuotes();
  if (symbol) loadHeadlines(request);
}

function failed(message) {
  root.setAttribute('aria-busy', 'false');
  status(message, true);
  if (state.snapshot) return;
  $('edge-updated').textContent = 'RESEARCH UNAVAILABLE';
  $('edge-brief').textContent = symbol ? (config.find(market => market.id === symbol)?.label || symbol) : 'Market research could not be loaded.';
  $('edge-summary').replaceChildren();
  $('edge-primary').innerHTML = `<section class="edge-panel">${view.empty('The snapshot is not available yet.', 'A verified market snapshot is required to show prices and strategy evidence.')}<button class="edge-button edge-primary" data-action="retry">Retry data</button><p class="edge-empty"><a href="/quant-analyst.html">Open Quant Analyst</a></p></section>`;
}

async function load() {
  const request = ++state.request;
  clearTimeout(state.poll);
  root.setAttribute('aria-busy', 'true');
  const route = symbol ? 'market/' + encodeURIComponent(symbol) : 'today';
  const isPublishedHost = researchService?.production;
  // Private requests start immediately. The public snapshot can render while they complete.
  const privateRequest = isPublishedHost && state.user
    ? api(route).then(data => ({ data }), error => ({ error }))
    : null;
  let privateFinished = false;
  const publicView = isPublishedHost ? publishedResearch(symbol).then(data => {
    if (request !== state.request || privateFinished) return false;
    present(data, request);
    return true;
  }).catch(() => false) : null;
  try {
    if (!privateRequest && publicView && await publicView) return;
    if (request !== state.request) return;
    const result = privateRequest ? await privateRequest : { data: await api(route) };
    if (request !== state.request) return;
    if (result.error) throw result.error;
    const data = result.data;
    if (data.status === 'building') {
      if (!data.job?.jobId) throw new Error('The service could not prepare a snapshot. Try again.');
      if (!state.snapshot) status(data.message || 'Preparing market research from recorded history.');
      root.setAttribute('aria-busy', 'false');
      state.poll = setTimeout(() => poll(data.job.jobId, request), 2500);
      return;
    }
    present(data, request);
    privateFinished = true;
    if (data.refreshJob) state.poll = setTimeout(() => poll(data.refreshJob.jobId || data.refreshJob, request), 5000);
  } catch (error) {
    if (publicView) await publicView;
    else if (request === state.request) {
      try { present(await publishedResearch(symbol), request); }
      catch { /* Preserve the service error when neither source is available. */ }
    }
    if (request !== state.request) return;
    if (state.snapshot?.publicResearch) {
      root.setAttribute('aria-busy', 'false');
      updateMeta(state.snapshot);
      return;
    }
    failed(error.message);
  }
}

async function poll(id, request) {
  if (request !== state.request) return;
  try {
    const job = await api('jobs/' + encodeURIComponent(id));
    if (request !== state.request) return;
    if (['completed', 'complete'].includes(job.status)) { await load(); return; }
    if (['failed', 'cancelled'].includes(job.status)) {
      throw new Error(job.error?.message || job.error || 'Data preparation stopped. Try again.');
    }
    if (!state.snapshot) {
      const progress = Number.isFinite(job.progress) ? ' · ' + Math.round(job.progress <= 1 ? job.progress * 100 : job.progress) + '%' : '';
      status('Preparing attributed market data' + progress + '.');
    }
    state.poll = setTimeout(() => poll(id, request), 4000);
  } catch (error) {
    if (request !== state.request) return;
    if (state.snapshot?.publicResearch) { updateMeta(state.snapshot); return; }
    failed(error.message);
    if (!state.snapshot) $('edge-primary').querySelector('h3').textContent = 'Snapshot preparation stopped.';
  }
}
const NEWS_QUERY={EURUSD:'EUR/USD',GBPUSD:'GBP/USD',USDJPY:'USD/JPY',USDCHF:'USD/CHF',AUDUSD:'AUD/USD',USDCAD:'USD/CAD',NZDUSD:'NZD/USD',EURGBP:'EUR/GBP',EURJPY:'EUR/JPY',GBPJPY:'GBP/JPY',XAUUSD:'gold price',XAGUSD:'silver price',US30:'Dow Jones',NAS100:'Nasdaq 100',SPX500:'S&P 500',BTCUSD:'Bitcoin',ETHUSD:'Ethereum'};
async function publicHeadlines(){const response=await fetch(MARKET_FN+'?'+new URLSearchParams({op:'search',q:NEWS_QUERY[symbol]||symbol}),{credentials:'omit',signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('Headlines are temporarily unavailable.');const data=await response.json();return (data.news||[]).filter(n=>n.title&&/^https:\/\//.test(n.url||'')&&Number.isFinite(Date.parse(n.publishedAt))&&Date.now()-Date.parse(n.publishedAt)<14*864e5).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).map(n=>({title:n.title,url:n.url,source:n.publisher||'Yahoo Finance',publishedAt:n.publishedAt,tone:'Unclassified'}));}
async function loadHeadlines(request){try{const data=await api('headlines?symbol='+encodeURIComponent(symbol),{},true);if(request!==state.request)return;state.headlines=data.headlines||data.items||[];state.headlinesReason=data.reason||data.message||null;}catch(e){if(request!==state.request)return;state.headlines=[];state.headlinesReason=e.message;
 // The research headline service is down: use public market headlines for this instrument instead.
 try{const fallback=await publicHeadlines();if(request!==state.request)return;if(fallback.length){state.headlines=fallback;state.headlinesReason=null;}}catch{}}const area=$('edge-headlines');if(area)area.outerHTML=view.headlines(state.headlines,state.headlinesReason);}
async function editWatchlist(){if(!state.user){signIn('save your watchlist');return;}try{const current=await api('watchlist');showDialog(`<h2 id="edge-dialog-title">Your daily watchlist</h2><p>Select the markets included in your morning research.</p><form id="edge-watchlist-form"><div class="edge-watchlist-grid">${config.map(m=>`<label><input type="checkbox" name="symbols" value="${view.esc(m.id)}" ${current.symbols.includes(m.id)?'checked':''}>${view.esc(m.label)}</label>`).join('')}</div><label class="edge-form-field">Snapshot time zone<select name="timeZone">${timezones(current.timeZone||state.tz)}</select></label><button class="edge-button edge-primary" type="submit">Save watchlist</button><p class="edge-form-status" role="status"></p></form>`);}catch(e){errorDialog('Watchlist unavailable',e);}}
function timezones(selected){const all=[...new Set([selected,...(Intl.supportedValuesOf?.('timeZone')||['UTC','America/New_York','America/Los_Angeles','Europe/London','Asia/Dubai','Asia/Tokyo'])])];return all.map(t=>`<option ${t===selected?'selected':''}>${view.esc(t)}</option>`).join('');}
async function digest(){if(!state.user){signIn('manage your briefing preferences');return;}try{const prefs=await api('preferences');showDialog(`<h2 id="edge-dialog-title">Your 6 AM briefing</h2><p>${prefs.emailConfigured?'Choose whether to receive a daily summary of your watchlist and strategy fits.':'Email delivery is currently unavailable. You can still save your time zone and briefing preference.'}</p><form id="edge-digest-form"><label class="edge-form-field">Time zone<select name="timezone">${timezones(prefs.timezone||state.tz)}</select></label><label><input type="checkbox" name="digestEnabled" ${prefs.digestEnabled?'checked':''}>Email my daily brief at 6 AM</label><button type="submit" class="edge-button edge-primary">Save preference</button><p class="edge-form-status" role="status"></p></form>`);}catch(e){errorDialog('Email preferences unavailable',e);}}
function alertForm(strategyId,market){if(!state.user){signIn('create an alert');return;}showDialog(`<h2 id="edge-dialog-title">When the fit improves</h2><p>Receive an in-app notification when ${market?view.esc(market):'a watched market'} crosses above your chosen score. Scores require complete inputs and enough historical trades.</p><form id="edge-alert-form" data-strategy="${view.esc(strategyId)}" data-symbol="${view.esc(market||'')}"><label class="edge-form-field">Alert above <input name="threshold" type="number" min="0" max="99" step="1" required value="70"></label><label><input type="checkbox" name="emailEnabled">Request email alerts when delivery is enabled</label><button type="submit" class="edge-button edge-primary">Create alert</button><p class="edge-form-status" role="status"></p></form>`);}
async function submit(form){const out=form.querySelector('[role=status]'),button=form.querySelector('[type=submit]');button.disabled=true;const version=state.identityVersion;out.textContent='Saving…';try{const fields=new FormData(form);let result;if(form.id==='edge-watchlist-form'){const symbols=fields.getAll('symbols');if(!symbols.length)throw new Error('Choose at least one market.');result=await api('watchlist',{method:'POST',body:JSON.stringify({symbols,timeZone:fields.get('timeZone')})});out.textContent='Watchlist saved. Refreshing your research…';state.snapshot=null;load();}else if(form.id==='edge-digest-form'){result=await api('preferences',{method:'POST',body:JSON.stringify({timezone:fields.get('timezone'),digestEnabled:fields.has('digestEnabled')})});out.textContent='Preference saved.'+(result.emailConfigured?'':' Email delivery is currently unavailable.');}else{result=await api('alerts',{method:'POST',body:JSON.stringify({strategyId:form.dataset.strategy,...(form.dataset.symbol?{symbol:form.dataset.symbol}:{}),threshold:Number(fields.get('threshold')),emailEnabled:fields.has('emailEnabled')})});out.textContent='Alert created. Manage notifications in Profile.';button.hidden=true;}}catch(e){if(version===state.identityVersion)out.textContent=e.message;}finally{if(version===state.identityVersion)button.disabled=false;}}
root.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.filter){state.filter=button.dataset.filter;renderMain();root.querySelector('[data-filter="'+state.filter+'"]')?.focus();}else if(button.dataset.sort){state.order=state.sort===button.dataset.sort&&state.order==='desc'?'asc':'desc';state.sort=button.dataset.sort;renderMain();root.querySelector('[data-sort="'+state.sort+'"]')?.focus();}else if(button.dataset.alert)alertForm(button.dataset.alert,button.dataset.symbol);else if(button.dataset.action==='watchlist')editWatchlist();else if(button.dataset.action==='digest')digest();else if(button.dataset.action==='retry')load();});
root.addEventListener('change',e=>{if(e.target.id==='edge-strategy'){state.selected=e.target.value;renderDetail();$('edge-strategy')?.focus();}});
dialog.addEventListener('click',e=>{if(e.target.closest('[data-close]'))dialog.close();});dialog.addEventListener('submit',e=>{if(e.target.id?.startsWith('edge-')){e.preventDefault();submit(e.target);}});
matchMedia('(max-width:639px)').addEventListener('change',placeGuard);
const clockTimer=setInterval(()=>{clock();if(lastGuard)renderGuard(lastGuard);},30000);
async function initializeIdentity(){try{const [{auth:firebaseAuth},{onAuthStateChanged}]=await Promise.all([import('/auth/firebase.js'),import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')]);await firebaseAuth.authStateReady();onAuthStateChanged(firebaseAuth,user=>{const changed=(user?.uid||null)!==(state.user?.uid||null);state.user=user;if(!changed)return;state.identityVersion++;state.request++;clearTimeout(state.poll);state.snapshot=null;state.market=null;state.headlines=null;state.selected=null;dialog.close();$('edge-dialog-body').replaceChildren();if(symbol)$('edge-actions').replaceChildren();$('edge-updated').textContent='LOADING THIS ACCOUNT’S RESEARCH';$('edge-brief').textContent='Preparing your watchlist and strategy fits.';$('edge-summary').replaceChildren();$('edge-side').replaceChildren();$('edge-primary').innerHTML='<section class="edge-panel edge-loading"><h2>Loading your research…</h2><p>Retrieving this account’s watchlist and strategies.</p></section>';renderGuard(null);load();});}catch{}}

// Public delayed quotes (Vercel market proxy) when the research service has no quote provider.
// Metals are excluded: the public source only lists futures, which differ from the spot series used here.
const PUBLIC_QUOTE={US30:'^DJI',NAS100:'^NDX',SPX500:'^GSPC',BTCUSD:'BTC-USD',ETHUSD:'ETH-USD'};
const publicSymbol=s=>PUBLIC_QUOTE[s]||(/^[A-Z]{6}$/.test(s)&&!/^XA[GU]/.test(s)?s+'=X':null);
const MARKET_FN=/(^|\.)vercel\.app$/.test(location.hostname)?'/fn/market.js':'https://fynxfinanceworld.vercel.app/fn/market.js';
async function publicQuotes(markets){
 const pairs=markets.map(m=>[m.symbol,publicSymbol(m.symbol)]).filter(p=>p[1]);if(!pairs.length)return [];
 const response=await fetch(MARKET_FN+'?'+new URLSearchParams({op:'quotes',symbols:pairs.map(p=>p[1]).join(',')}),{credentials:'omit',signal:AbortSignal.timeout(15000)});if(!response.ok)return [];
 const data=await response.json();return pairs.map(([symbol,ticker])=>{const q=data.quotes?.[ticker];return q&&{symbol,price:q.price,asOf:q.asOf,changePct:q.changePercent,source:'Yahoo Finance (delayed)'};}).filter(Boolean);
}
function applyQuote(m,q){
 const time=Date.parse(q.asOf);if(!m||!Number.isFinite(q.price)||q.price<=0||!Number.isFinite(time)||time>Date.now()+60000||q.status==='stale')return;
 // A quote older than the snapshot's last completed close adds nothing; keep the close.
 if(Date.now()-time>900000&&(!q.source||Date.parse(m.price?.asOf||0)>=time))return;
 m.price={value:q.price,reason:null,asOf:q.asOf};m.priceSource=q.source||null;if(Number.isFinite(q.changePct))m.dayChangePct={value:q.changePct,reason:null,asOf:q.asOf};
 const cell=document.querySelector('[data-edge-price="'+m.symbol+'"]');if(cell)cell.innerHTML=view.price(q.price,m.symbol)+'<small>'+(q.source?'Delayed quote':'Quote')+' · '+view.esc(view.date(q.asOf,'UTC'))+' UTC</small>';
}
async function refreshQuotes(){
 if(!state.snapshot||quoteBusy||document.hidden)return;
 const version=state.identityVersion,request=state.request,markets=symbol?[state.market]:state.snapshot.markets;quoteBusy=true;
 try{
  let quotes=[],fallback=!quoteConfigured;
  if(quoteConfigured){try{const response=await fetch(researchService.apiURL('/api/quant/quotes?'+new URLSearchParams({symbols:markets.map(m=>m.symbol).join(',')})),{credentials:'omit',signal:AbortSignal.timeout(15000)});if(!response.ok)fallback=true;else{const data=await response.json();if(data.configured===false){quoteConfigured=false;fallback=true;}else if(Array.isArray(data.quotes)){quotes=data.quotes.filter(q=>q.status!=='stale'&&Date.now()-Date.parse(q.asOf)<=900000);fallback=quotes.length<markets.length;}}}catch{fallback=true;}}
  if(fallback){const covered=new Set(quotes.map(q=>q.symbol)),missing=markets.filter(m=>!covered.has(m.symbol));if(missing.length)quotes=quotes.concat(await publicQuotes(missing).catch(()=>[]));}
  if(version!==state.identityVersion||request!==state.request)return;
  for(const q of quotes)applyQuote(markets.find(m=>m.symbol===q.symbol),q);
  if(symbol&&state.market)$('edge-summary').innerHTML=view.detailSummary(state.market,state.market.fits.find(f=>f.strategyId===state.selected));
 }catch{/* Keep the previous timestamped quote or daily close on provider outages. */}finally{quoteBusy=false;}
}
quoteTimer=setInterval(refreshQuotes,60000);

load();initializeIdentity();
guardTimer=setInterval(async()=>{if(!state.user||document.hidden||state.snapshot?.guest)return;try{const guard=await api('guard');renderGuard(guard);if(symbol){const detail=await api('market/'+encodeURIComponent(symbol));if(detail.market&&state.market){state.market.tradePlans=detail.market.tradePlans;state.snapshot.guard=guard;if($('edge-trade-plan'))$('edge-trade-plan').outerHTML=view.tradePlan(state.market,state.selected);}}else if(state.snapshot){const latest=await api('today');if(latest.markets){state.snapshot.guard=guard;state.snapshot.doubleRisk=latest.doubleRisk;const warnings=$('edge-risk-warnings');if(warnings)warnings.innerHTML=view.warnings(latest.doubleRisk||[],guard.currency);}}}catch{/* Existing snapshot keeps its timestamp; do not invent connectivity. */}},60000);
window.addEventListener('pagehide',()=>{clearTimeout(state.poll);clearInterval(guardTimer);clearInterval(quoteTimer);clearInterval(clockTimer);state.request++;});
