import {C,$,escape,number,percent,time,ageLabel,errorHTML,loading,empty,toast,options,quotes,quoteCache} from './shared.js';
import {store} from './store.js';
let group='Stocks',request=0,lastErrors={};
const symbols=()=>group==='Watchlist'?store.state.watchlist:C.catalog.filter(a=>a.group===group).map(a=>a.symbol);
function watchControls(){
  $('#watchlist-controls').hidden=group!=='Watchlist';
  $('#watch-chips').innerHTML=store.state.watchlist.map(s=>`<span class="chip">${escape(s)}<button data-remove-watch="${escape(s)}" aria-label="Remove ${escape(s)} from watchlist">×</button></span>`).join('');
}
function render(){
  watchControls();let list=[...symbols()];const sort=$('#heatmap-sort').value;
  if(sort!=='symbol')list.sort((a,b)=>{const av=quoteCache[a]?.changePercent,bv=quoteCache[b]?.changePercent;if(!C.finite(av))return 1;if(!C.finite(bv))return -1;return sort==='gainers'?bv-av:av-bv;});else list.sort();
  $('#heatmap-output').innerHTML=list.length?`<div class="heatmap-grid">${list.map(s=>{
    const a=C.symbolMap[s],q=quoteCache[s],delta=q?.changePercent,valid=q&&C.usableQuote(q),className=valid&&C.finite(delta)?delta>0?'up':delta<0?'down':'':'';
    if(!valid)return `<div class="heat-tile"><span class="heat-symbol">${escape(s)}</span><span class="heat-name">${escape(a.name)}</span><span class="heat-change">—</span><span class="heat-price">Quote unavailable</span><span class="heat-time">${escape(lastErrors[s]||'Refresh to load this instrument.')}</span></div>`;
    return `<a class="heat-tile ${className}" href="${escape(q.sourceURL)}" target="_blank" rel="noopener" aria-label="${escape(s)} ${percent(delta)}, ${number(q.price,4)} ${q.currency}; ${escape(ageLabel(q))}; source ${escape(q.source)}"><span class="heat-symbol">${escape(s)} <span aria-hidden="true">↗</span></span><span class="heat-name">${escape(a.name)}</span><span class="heat-change">${percent(delta)}</span><span class="heat-price">${number(q.price,q.price<10?4:2)} ${q.currency}</span><span class="heat-time">${time(q.asOf)} · ${ageLabel(q)}<br>${escape(q.source)} · ${escape(q.basis)}</span></a>`;
  }).join('')}</div>`:empty('Your own market view','Add instruments to your watchlist to see them here.');
}
export async function refreshHeatmap(){
  const id=++request,list=symbols();watchControls();
  if(!list.length){render();return;}
  $('#heatmap-output').innerHTML=loading(`Updating ${list.length} ${group.toLowerCase()} quotes…`);
  try{const data=await quotes(list);if(id!==request)return;lastErrors=data.errors;render();}
  catch(error){if(id===request)$('#heatmap-output').innerHTML=errorHTML(error.message)+'<p class="method-note">Use Refresh quotes to retry. No substitute prices are shown.</p>';}
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
