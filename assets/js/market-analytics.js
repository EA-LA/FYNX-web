(() => {
 const root=document.querySelector('[data-market-analysis]');if(!root)return;
 const kind=root.dataset.marketAnalysis,select=root.querySelector('select'),status=root.querySelector('[role=status]'),output=root.querySelector('[data-analysis-output]'),button=root.querySelector('button');
 let version=0,last=null,timer,controller=null;
 const number=(n,max=4)=>Number(n).toLocaleString(undefined,{maximumFractionDigits:max});
 function render(data){
  output.replaceChildren();const table=document.createElement('table'),caption=document.createElement('caption');
  caption.textContent=kind==='correlation'?`${data.observations} daily returns`:`${data.product} · Best bid and ask`;table.append(caption);
  const head=document.createElement('thead'),body=document.createElement('tbody');table.append(head,body);
  function row(values,parent,heading=false){const tr=document.createElement('tr');values.forEach((value,i)=>{const cell=document.createElement(heading||i===0?'th':'td');if(heading)cell.scope='col';else if(i===0)cell.scope='row';cell.textContent=value;tr.append(cell);});parent.append(tr);}
  if(kind==='correlation'){
   row(['Pair',...data.pairs],head,true);data.matrix.forEach((values,i)=>row([data.pairs[i],...values.map(n=>n===null?'—':n.toFixed(2))],body));
  }else{
   row(['Measure','Value'],head,true);const unit=data.product.split('-')[0];
   for(const values of [['Best bid',`$${number(data.bid,2)}`],['Best ask',`$${number(data.ask,2)}`],['Spread',`$${number(data.spread,2)} · ${number(data.spreadBps,3)} bps`],['Size at best bid',`${number(data.bidSize,8)} ${unit}`],['Size at best ask',`${number(data.askSize,8)} ${unit}`]])row(values,body);
  }
  output.append(table);
  if(kind==='liquidity')syncSourceLink();

 }
 function updateStatus(){if(!last)return;const stale=last.stale||(kind==='liquidity'?Date.now()-Date.parse(last.observationTime)>60000:Date.now()-Date.parse(last.observationDate)>7*86400000);
 status.textContent=`${stale?'Stale data — ':''}${last.source} · ${kind==='liquidity'?'Source time '+new Date(last.observationTime).toLocaleString():'Observation window '+last.startDate+' to '+last.observationDate} · Retrieved ${new Date(last.fetchedAt).toLocaleString()}.`;}
 function syncSourceLink(){
  if(kind!=='liquidity')return;
  const link=root.querySelector('[data-market-source]'),product=select.value;
  if(link&&['BTC-USD','ETH-USD'].includes(product))link.href='https://www.coinbase.com/advanced-trade/spot/'+product;
 }
 async function load(force=false){
  // Scheduled refreshes never interrupt an active request. Explicit market changes do.
  if(controller&&!force)return;
  const current=++version;
  controller?.abort();
  const active=new AbortController();controller=active;
  const selected=select.value;
  button.disabled=true;
  status.textContent='Loading source observations…';
  const timeout=setTimeout(()=>active.abort(),20000);
  try{
   const params=new URLSearchParams({kind,[kind==='correlation'?'window':'product']:selected});
   const response=await fetch('https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketAnalytics?'+params,{signal:active.signal});
   if(!response.ok)throw Error('Source unavailable');
   const data=await response.json();
   if(current!==version)return;
   if(kind==='liquidity'&&data.product!==selected)throw Error('Source returned a different market');
   last=data;render(data);updateStatus();
  }catch(error){
   if(current!==version)return; // A replaced request cannot overwrite the new market's state.
   window.FynxMonitor?.report('feed','feed-load',error);
   if(last){last.stale=true;updateStatus();status.textContent+=' Refresh failed; previous observations remain.';}
   else status.textContent='Source data is unavailable. Retry or open the source link below. No estimated values are shown.';
  }finally{
   clearTimeout(timeout);
   if(current===version){controller=null;button.disabled=false;}
  }
 }
 select.addEventListener('change',()=>{
  // Never leave the previous market's figures or source URL under the new selection.
  last=null;output.replaceChildren();syncSourceLink();load(true);
 });
 button.addEventListener('click',()=>load(true));
 function schedule(){clearInterval(timer);if(!document.hidden)timer=setInterval(()=>{updateStatus();load();},kind==='liquidity'?15000:300000);}
 document.addEventListener('visibilitychange',()=>{schedule();if(!document.hidden){updateStatus();load();}});window.addEventListener('pagehide',()=>clearInterval(timer));window.addEventListener('pageshow',event=>{if(event.persisted){schedule();updateStatus();load();}});schedule();load();
})();
