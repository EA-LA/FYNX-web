import {C,$,escape,number,percent,time,ageLabel,errorHTML,loading,empty,toast,options,quotes,quoteCache} from './shared.js';
import {store} from './store.js';

function tileResearchActions(symbol, quote) {
  const safeSymbol = escape(symbol);
  const newsURL = '/tools/symbol-news.html?q=' + encodeURIComponent(symbol);
  let safeSourceURL = '';
  if (typeof quote?.sourceURL === 'string') {
    try {
      const parsed = new URL(quote.sourceURL);
      if (parsed.protocol === 'https:') safeSourceURL = parsed.href;
    } catch (_) { /* Missing or malformed source link: still offer internal research. */ }
  }
  const source = safeSourceURL
    ? `<a href="${escape(safeSourceURL)}" target="_blank" rel="noopener noreferrer" aria-label="Open quote source for ${safeSymbol}">Quote source ↗︎</a>`
    : '';
  return `<div class="heat-actions"><a href="${newsURL}" aria-label="Read symbol news for ${safeSymbol}">Symbol news ↗︎</a>${source}</div>`;
}

let group='Stocks',request=0,lastErrors={};
/* ---- Search any market (stocks, ETFs, indices, futures, FX, crypto worldwide) via the FYNX market proxy ---- */
const MARKET=/(^|\.)vercel\.app$/.test(globalThis.location?.hostname||'')?'/fn/market.js':'https://fynxfinanceworld.vercel.app/fn/market.js';
const SEARCH_KEY='fynx_heat_search_v1',searchNames={};
let searched=[];try{const saved=JSON.parse(globalThis.localStorage?.getItem(SEARCH_KEY)||'[]');if(Array.isArray(saved))searched=saved.filter(v=>v&&typeof v.symbol==='string').slice(0,25);}catch(_){}
searched.forEach(v=>{searchNames[v.symbol]=v.name;});
function saveSearched(){try{globalThis.localStorage?.setItem(SEARCH_KEY,JSON.stringify(searched));}catch(_){}}
async function market(params){const r=await fetch(MARKET+'?'+new URLSearchParams(params),{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Market data is temporarily unavailable.');return d;}
async function searchedQuotes(list){
  const d=await market({op:'quotes',symbols:list.join(',')}),errors={...(d.errors||{})};
  for(const [s,q] of Object.entries(d.quotes||{})){quoteCache[s]={symbol:s,price:q.price,changePercent:q.changePercent,currency:q.currency||'',asOf:q.asOf,source:'Yahoo Finance',basis:'Delayed',sourceURL:'https://finance.yahoo.com/quote/'+encodeURIComponent(s)};if(q.name)searchNames[s]=q.name;}
  return {errors};
}
function addSearched(symbol,name){
  searched=[{symbol,name},...searched.filter(v=>v.symbol!==symbol)].slice(0,25);searchNames[symbol]=name;saveSearched();
  group='Search';for(const item of $('#heatmap-groups').querySelectorAll('button'))item.setAttribute('aria-pressed',String(item.dataset.group==='Search'));
  $('#heat-search-results').hidden=true;refreshHeatmap();
}
$('#heat-search')?.addEventListener('submit',async event=>{
  event.preventDefault();const q=$('#heat-search-input').value.trim(),box=$('#heat-search-results');if(!q)return;
  box.hidden=false;box.innerHTML='<p class="heat-search-note">Searching markets…</p>';
  try{
    const d=await market({op:'search',q}),list=(d.quotes||[]).slice(0,10);
    if(!list.length){box.innerHTML='<p class="heat-search-note">No market matches “'+escape(q)+'”. Try a ticker (TSLA, SAP.DE, GC=F, EURUSD=X, BTC-USD).</p>';return;}
    box.innerHTML=list.map(x=>`<button type="button" role="option" data-heat-pick="${escape(x.symbol)}" data-name="${escape(x.name||x.symbol)}"><b>${escape(x.symbol)}</b><span>${escape(x.name||'')}</span><small>${escape([x.type,x.exchange].filter(Boolean).join(' · '))}</small></button>`).join('');
  }catch(error){box.innerHTML='<p class="heat-search-note">'+escape(error.message)+'</p>';}
});
$('#heat-search-results')?.addEventListener('click',event=>{const b=event.target.closest('[data-heat-pick]');if(b)addSearched(b.dataset.heatPick,b.dataset.name);});
globalThis.document?.addEventListener('click',event=>{const box=$('#heat-search-results');if(box&&!event.target.closest('#heat-search'))box.hidden=true;});
const symbols=()=>group==='Search'?searched.map(v=>v.symbol):group==='Watchlist'?store.state.watchlist:C.catalog.filter(a=>a.group===group).map(a=>a.symbol);
function watchControls(){
  $('#watchlist-controls').hidden=group!=='Watchlist';
  $('#watch-chips').innerHTML=store.state.watchlist.map(s=>`<span class="chip">${escape(s)}<button data-remove-watch="${escape(s)}" aria-label="Remove ${escape(s)} from watchlist">×</button></span>`).join('');
}
function render(){
  watchControls();let list=[...symbols()];const sort=$('#heatmap-sort').value;
  if(sort!=='symbol')list.sort((a,b)=>{const av=quoteCache[a]?.changePercent,bv=quoteCache[b]?.changePercent;if(!C.finite(av))return 1;if(!C.finite(bv))return -1;return sort==='gainers'?bv-av:av-bv;});else list.sort();
  $('#heatmap-output').innerHTML=list.length?`<div class="heatmap-grid">${list.map(s=>{
    const a=C.symbolMap[s]||(searchNames[s]?{name:searchNames[s]}:null),q=quoteCache[s],delta=q?.changePercent,valid=q&&C.usableQuote(q),className=valid&&C.finite(delta)?delta>0?'up':delta<0?'down':'':'';
    if(!valid)return `<div class="heat-tile"><span class="heat-symbol">${escape(s)}</span><span class="heat-name">${escape(a?.name||s)}</span><span class="heat-change">—</span><span class="heat-price">Quote unavailable</span><span class="heat-time">${escape(lastErrors[s]||'Loading again automatically.')}</span>${tileResearchActions(s,null)}</div>`;
    return `<div class="heat-tile ${className}"><span class="heat-symbol">${escape(s)}</span><span class="heat-name">${escape(a?.name||s)}</span><span class="heat-change">${percent(delta)}</span><span class="heat-price">${number(q.price,q.price<10?4:2)} ${escape(q.currency)}</span><span class="heat-time">${time(q.asOf)} · ${escape(ageLabel(q))}<br>${escape(q.source)} · ${escape(q.basis)}</span>${tileResearchActions(s,q)}</div>`;
  }).join('')}</div>`:group==='Search'?empty('Search any market','Type a company, ticker, index, future, currency pair or coin above. Results appear here as heatmap tiles.'):empty('Your own market view','Add instruments to your watchlist to see them here.');
}
export async function refreshHeatmap(){
  const id=++request,list=symbols();watchControls();
  if(!list.length){render();return;}
  $('#heatmap-output').innerHTML=loading(`Updating ${list.length} ${group.toLowerCase()} quotes…`);
  try{const data=group==='Search'?await searchedQuotes(list):await quotes(list);if(id!==request)return;lastErrors=data.errors;render();}
  catch(error){if(id===request)$('#heatmap-output').innerHTML=errorHTML(error.message)+'<p class="method-note">Quotes retry automatically every few minutes. No substitute prices are shown.</p>';}
}
$('#heatmap-groups').addEventListener('click',event=>{
  const button=event.target.closest('[data-group]');if(!button)return;group=button.dataset.group;
  for(const item of $('#heatmap-groups').querySelectorAll('button'))item.setAttribute('aria-pressed',String(item===button));refreshHeatmap();
});
$('#heatmap-sort').addEventListener('change',render);
$('#refresh-heatmap').addEventListener('click',refreshHeatmap);
options($('#watch-symbol'));
$('#watch-form').addEventListener('submit',async event=>{
  event.preventDefault();const symbol=$('#watch-symbol').value;
  try{await store.transact(s=>{if(!s.watchlist.includes(symbol)){if(s.watchlist.length>=40)throw Error('Your watchlist holds up to 40 instruments.');s.watchlist.push(symbol);}});refreshHeatmap();}catch(error){toast(error.message);}
});
$('#watch-chips').addEventListener('click',async event=>{
  const symbol=event.target.dataset.removeWatch;if(!symbol)return;
  try{await store.transact(s=>{s.watchlist=s.watchlist.filter(v=>v!==symbol);});render();}catch(error){toast(error.message);}
});
let previousWatch='';
store.addEventListener('change',()=>{const signature=JSON.stringify([store.key,store.state.watchlist]),changed=signature!==previousWatch;previousWatch=signature;watchControls();if(location.hash==='#heatmap'&&group==='Watchlist'){if(changed)refreshHeatmap();else render();}});
