(() => {
 const root=document.querySelector('[data-market-analysis]');if(!root)return;
 const kind=root.dataset.marketAnalysis,select=root.querySelector('select'),status=root.querySelector('[role=status]'),output=root.querySelector('[data-analysis-output]'),button=root.querySelector('button');
 let busy=false,version=0,last=null,timer;
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
 }
 function updateStatus(){if(!last)return;const stale=last.stale||(kind==='liquidity'?Date.now()-Date.parse(last.observationTime)>60000:Date.now()-Date.parse(last.observationDate)>7*86400000);
 status.textContent=`${stale?'Stale data — ':''}${last.source} · ${kind==='liquidity'?'Source time '+new Date(last.observationTime).toLocaleString():'Observation window '+last.startDate+' to '+last.observationDate} · Retrieved ${new Date(last.fetchedAt).toLocaleString()}.`;}
 async function load(){if(busy)return;busy=true;button.disabled=true;select.disabled=true;const current=++version;status.textContent='Loading source observations…';
 try{const params=new URLSearchParams({kind,[kind==='correlation'?'window':'product']:select.value});const response=await fetch('https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketAnalytics?'+params,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Source unavailable');const data=await response.json();if(current!==version)return;last=data;render(data);updateStatus();}
 catch(error){window.FynxMonitor?.report('feed','feed-load',error);if(last){last.stale=true;updateStatus();status.textContent+=' Refresh failed; previous observations remain.';}else status.textContent='Source data is unavailable. Retry or open the source link below. No estimated values are shown.';}
 finally{busy=false;button.disabled=false;select.disabled=false;}}
 select.addEventListener('change',()=>{last=null;output.replaceChildren();load();});button.addEventListener('click',load);
 function schedule(){clearInterval(timer);if(!document.hidden)timer=setInterval(()=>{updateStatus();load();},kind==='liquidity'?15000:300000);}
 document.addEventListener('visibilitychange',()=>{schedule();if(!document.hidden){updateStatus();load();}});window.addEventListener('pagehide',()=>clearInterval(timer));schedule();load();
})();
