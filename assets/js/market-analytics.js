(() => {
 const root=document.querySelector('[data-market-analysis]');if(!root)return;
 const kind=root.dataset.marketAnalysis,select=root.querySelector('select'),status=root.querySelector('[data-analysis-feed-status]'),output=root.querySelector('[data-analysis-output]'),button=root.querySelector('button');
 let version=0,last=null,timer,controller=null,refreshFailed=false;
 const number=(n,max=4)=>Number(n).toLocaleString(undefined,{maximumFractionDigits:max});
 // A shared view contains only an allowlisted public market or correlation window.
 // It never includes account state, snapshots, timestamps or other URL parameters.
 const viewKey=kind==='correlation'?'window':'product';
 const shareButton=root.querySelector('[data-analysis-share]');
 const shareStatus=root.querySelector('[data-analysis-share-status]');
 const shareFallback=root.querySelector('[data-analysis-share-fallback]');
 const isAllowed=value=>Array.from(select.options||[]).some(option=>option.value===value);
 function restoreSharedView(){
  const requested=new URLSearchParams(window.location?.search||'').get(viewKey);
  if(requested&&isAllowed(requested))select.value=requested;
 }
 function shareableURL(){
  if(!isAllowed(select.value)||!window.location?.origin||!window.location?.pathname)return null;
  const url=new URL(window.location.pathname,window.location.origin);
  url.searchParams.set(viewKey,select.value);
  return url.href;
 }
 let shareVersion=0;
 function resetShareFeedback(){
  shareVersion++;
  if(shareStatus)shareStatus.textContent='';
  if(shareFallback){shareFallback.hidden=true;shareFallback.value='';}
 }
 if(shareButton&&shareStatus&&shareFallback)shareButton.addEventListener('click',async()=>{
  // Serialize clipboard writes so an older selection cannot overwrite a newer copy.
  if(shareButton.disabled)return;
  const url=shareableURL();
  if(!url){shareStatus.textContent='Unable to create a view link. Please reload the page.';return;}
  resetShareFeedback();
  const attempt=shareVersion;
  shareButton.disabled=true;
  shareStatus.textContent='Copying view link…';
  try{
   if(!window.navigator?.clipboard?.writeText)throw Error('Clipboard unavailable');
   await window.navigator.clipboard.writeText(url);
   if(attempt!==shareVersion)return;
   shareFallback.hidden=true;
   shareStatus.textContent='View link copied. Market observations refresh when opened.';
  }catch(_){
   if(attempt!==shareVersion)return;
   shareFallback.value=url;
   shareFallback.hidden=false;
   shareFallback.focus();
   shareFallback.select();
   shareStatus.textContent='Copy the selected link from the field below. Observations refresh when opened.';
  }finally{
   shareButton.disabled=false;
  }
 });
 const sizeForm=kind==='liquidity'?root.querySelector('[data-liquidity-size]'):null;
 const sizeInput=sizeForm?.querySelector('#liquidityOrderSize');
 const sizeSide=sizeForm?.querySelector('#liquiditySizeSide');
 const sizeLabel=sizeForm?.querySelector('[data-size-label]');
 const sizeResult=sizeForm?.querySelector('[data-size-result]');
 const sizePrompt='Enter an order size and check it against the latest snapshot.';
 const sizeUnit=()=>select.value.split('-')[0];
 let sizeCompared=null;
 const isFreshLiquidity=data=>!!data&&!data.stale&&Date.now()-Date.parse(data.observationTime)<=60000;
 function invalidateSize(message){
  if(!sizeCompared)return;
  sizeCompared=null;
  sizeResult.textContent=message;
 }
 function resetSizeForMarket(){
  if(!sizeInput||!sizeLabel||!sizeResult)return;
  sizeCompared=null;
  sizeInput.value='';
  sizeInput.removeAttribute('aria-invalid');
  sizeLabel.textContent='Order size in '+sizeUnit();
  sizeResult.textContent=sizePrompt;
 }
 function updateSizeForSnapshot(data){
  if(!sizeCompared)return;
  if(!isFreshLiquidity(data)){
   invalidateSize('No fresh snapshot. Check again after a successful refresh.');
  }else if(['observationTime','bid','ask','bidSize','askSize'].some(key=>sizeCompared[key]!==data[key])){
   invalidateSize('The snapshot changed. Check again to compare against the new quote.');
  }
 }
 function attachSizeCheck(){
  if(!sizeInput||!sizeSide||!sizeLabel||!sizeResult)return;
  resetSizeForMarket();
  function invalidateFromEdit(){
   sizeCompared=null;
   sizeInput.removeAttribute('aria-invalid');
   if(sizeResult.textContent!==sizePrompt)sizeResult.textContent=sizePrompt;
  }
  sizeInput.addEventListener('input',invalidateFromEdit);
  sizeSide.addEventListener('change',invalidateFromEdit);
  sizeForm.addEventListener('submit',event=>{
   event.preventDefault();
   sizeCompared=null;
   sizeInput.removeAttribute('aria-invalid');
   const raw=sizeInput.value;
   const quantity=Number(raw);
   if(!/^(?:[0-9]+(?:\.[0-9]{1,8})?|\.[0-9]{1,8})$/.test(raw)||!Number.isFinite(quantity)||quantity<=0){
    sizeInput.setAttribute('aria-invalid','true');
    sizeResult.textContent='Enter a positive order size with up to 8 decimal places.';
    return;
   }
   if(!isFreshLiquidity(last)||last.product!==select.value){
    sizeResult.textContent='No fresh snapshot. Check again after a successful refresh.';
    return;
   }
   const buy=sizeSide.value==='buy';
   const displayed=buy?last.askSize:last.bidSize;
   const quote=buy?'best ask':'best bid';
   const unit=sizeUnit();
   const qtyText=number(quantity,8)+' '+unit;
   const sizeText=(displayed>0&&displayed<0.000000005?'<0.00000001':number(displayed,8))+' '+unit;
   sizeResult.textContent=quantity<=displayed
    ? `Your ${qtyText} fits within the ${sizeText} displayed at the ${quote}. This is not a fill estimate.`
    : `Your ${qtyText} exceeds the ${sizeText} displayed at the ${quote}. The full size is not shown at that price.`;
   sizeCompared=last;
  });
  sizeForm.hidden=false;
 }
 const focusPanel=kind==='correlation'?root.querySelector('[data-correlation-focus]'):null;
 const focusSelect=focusPanel?.querySelector('#correlationPair');
 const focusStatus=focusPanel?.querySelector('[data-correlation-focus-status]');
 const focusList=focusPanel?.querySelector('[data-correlation-focus-list]');
 let focusPairs=[];
 function observationStale(data){
  return !!data.stale||(kind==='liquidity'?!isFreshLiquidity(data):Date.now()-Date.parse(data.observationDate)>7*86400000);
 }
 function updateCorrelationFocus(){
  // Older cached markup can fetch this same script without the new panel.
  if(!focusSelect||!focusStatus||!focusList)return;
  const announce=text=>{if(focusStatus.textContent!==text)focusStatus.textContent=text;};
  focusList.replaceChildren();
  focusList.hidden=true;
  if(!last||observationStale(last)){
   announce(last||refreshFailed?'No current matrix for ranking. Refresh data to retry.':'Waiting for the selected observation window.');
   return;
  }
  if(new Set(last.pairs).size!==last.pairs.length){
   announce('This matrix does not identify unique pairs to rank.');
   return;
  }
  if(focusPairs.length!==last.pairs.length||focusPairs.some((pair,i)=>pair!==last.pairs[i])){
   const selected=focusSelect.value;
   focusPairs=[...last.pairs];
   const options=['',...focusPairs].map(pair=>{
    const option=document.createElement('option');
    option.value=pair;
    option.textContent=pair||'Choose a pair';
    return option;
   });
   focusSelect.replaceChildren(...options);
   focusSelect.value=focusPairs.includes(selected)?selected:'';
   focusSelect.disabled=false;
  }
  const pair=focusSelect.value;
  const index=focusPairs.indexOf(pair);
  if(index===-1){
   announce('Choose a currency pair to rank its peers.');
   return;
  }
  const peers=focusPairs.map((label,i)=>({label,value:last.matrix[index][i],i}))
   .filter(peer=>peer.i!==index&&peer.value!==null)
   .sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)||a.i-b.i);
  const omitted=focusPairs.length-1-peers.length;
  if(!peers.length){
   announce(`No measured peers for ${pair} in this window.`);
   return;
  }
  announce(`${pair} across ${last.observations} daily returns: ${peers.length} measured ${peers.length===1?'peer':'peers'}${omitted?`, ${omitted} without a coefficient`:''}.`);
  for(const {label,value} of peers){
   const row=document.createElement('li');
   const sign=value<0?'−':value>0?'+':'';
   const magnitude=Math.abs(value);
   const shown=magnitude>0&&magnitude<0.0005?'<0.001':magnitude.toFixed(3);
   row.textContent=`${label} · ${sign}${shown}`;
   focusList.append(row);
  }
  focusList.hidden=false;
 }
 restoreSharedView();
 syncSourceLink();
 attachSizeCheck();
 if(focusSelect&&focusStatus&&focusList){
  focusPanel.hidden=false;
  focusSelect.addEventListener('change',updateCorrelationFocus);
 }
 function render(data){
  // Build the next table off-screen; a malformed response must not erase the last good one.
  const table=document.createElement('table'),caption=document.createElement('caption');
  caption.textContent=kind==='correlation'?`${data.observations} daily returns`:`${data.product} · Best bid and ask`;table.append(caption);
  const head=document.createElement('thead'),body=document.createElement('tbody');table.append(head,body);
  function row(values,parent,heading=false){const tr=document.createElement('tr');values.forEach((value,i)=>{const cell=document.createElement(heading||i===0?'th':'td');if(heading)cell.scope='col';else if(i===0)cell.scope='row';cell.textContent=value;tr.append(cell);});parent.append(tr);}
  if(kind==='correlation'){
   row(['Pair',...data.pairs],head,true);data.matrix.forEach((values,i)=>row([data.pairs[i],...values.map(n=>n===null?'—':n.toFixed(2))],body));
  }else{
   row(['Measure','Value'],head,true);const unit=data.product.split('-')[0];
   for(const values of [['Best bid',`$${number(data.bid,2)}`],['Best ask',`$${number(data.ask,2)}`],['Spread',`$${number(data.spread,2)} · ${number(data.spreadBps,3)} bps`],['Size at best bid',`${number(data.bidSize,8)} ${unit}`],['Size at best ask',`${number(data.askSize,8)} ${unit}`]])row(values,body);
  }
  output.replaceChildren(table);
  if(kind==='liquidity')syncSourceLink();

 }
 // Do not display malformed, impossible or incomplete observations as verified prices.
 // Validate the entire payload before mutating the currently displayed snapshot.
 function validate(data,selected){
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const dateOk=s=>typeof s==='string'&&s.trim()&&Number.isFinite(Date.parse(s));
  const timeOk=s=>dateOk(s)&&Date.parse(s)<=Date.now()+5*60000;
  if(!data||typeof data!=='object'||!timeOk(data.fetchedAt)||
     typeof data.source!=='string'||!data.source.trim())throw Error('Incomplete source metadata');
  if(kind==='liquidity'){
   if(data.product!==selected)throw Error('Source returned a different market');
   if(!timeOk(data.observationTime)||
      !['bid','ask','spread','spreadBps','bidSize','askSize'].every(key=>finite(data[key]))||
      data.bid<=0||data.ask<data.bid||data.spread<0||data.spreadBps<0||
      data.bidSize<0||data.askSize<0||
      Math.abs(data.spread-(data.ask-data.bid))>Math.max(1e-8,data.spread*1e-8))throw Error('Invalid liquidity observation');
  }else{
   if(!Number.isInteger(data.observations)||data.observations!==Number(selected)||
      (data.window!==undefined&&data.window!==Number(selected))||
      !dateOk(data.startDate)||!timeOk(data.observationDate)||
      Date.parse(data.startDate)>Date.parse(data.observationDate)||
      !Array.isArray(data.pairs)||!data.pairs.length||
      !data.pairs.every(pair=>typeof pair==='string'&&pair.trim())||
      !Array.isArray(data.matrix)||data.matrix.length!==data.pairs.length||
      !data.matrix.every(row=>Array.isArray(row)&&row.length===data.pairs.length&&
       row.every(value=>value===null||(finite(value)&&value>=-1&&value<=1))))
    throw Error('Invalid correlation observation');
  }
 }
 function updateStatus(){if(!last)return;const stale=observationStale(last);
 if(kind==='liquidity')updateSizeForSnapshot(last);
 else updateCorrelationFocus();
 status.textContent=`${stale?'Stale data — ':''}${last.source} · ${kind==='liquidity'?'Source time '+new Date(last.observationTime).toLocaleString():'Observation window '+last.startDate+' to '+last.observationDate} · Retrieved ${new Date(last.fetchedAt).toLocaleString()}.${refreshFailed?' Refresh failed; previous observations remain.':''}`;}
 function syncSourceLink(){
  if(kind!=='liquidity')return;
  const link=root.querySelector('[data-market-source]'),product=select.value;
  if(link&&['BTC-USD','ETH-USD'].includes(product))link.href='https://www.coinbase.com/advanced-trade/spot/'+product;
 }
 async function load(force=false){
  // Scheduled refreshes never interrupt an active request. Explicit market changes do.
  if(controller&&!force)return;
  const current=++version;
  controller?.cancel(Error('Request superseded'));
  const abort=typeof AbortController==='function'?new AbortController():null;
  let rejectDeadline;
  const deadline=new Promise((_,reject)=>{rejectDeadline=reject;});
  const active={cancel(error){rejectDeadline(error);abort?.abort();}};
  controller=active;
  const selected=select.value;
  button.disabled=true;
  if(last){updateStatus();status.textContent+=' Checking for updated observations…';}
  else {
   refreshFailed=false;
   status.textContent='Loading source observations…';
   updateCorrelationFocus();
  }
  // Race the entire request (including JSON decoding), even when abort is unavailable or ignored.
  const timeout=setTimeout(()=>{const error=Error('Market observations timed out');error.name='TimeoutError';active.cancel(error);},20000);
  try{
   const params=new URLSearchParams({kind,[kind==='correlation'?'window':'product']:selected});
   const data=await Promise.race([deadline,(async()=>{
    const response=await fetch('https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketAnalytics?'+params,abort?{signal:abort.signal}:{});
    if(!response.ok)throw Error('Source unavailable');
    return response.json();
   })()]);
   if(current!==version)return;
   validate(data,selected);
   render(data);last=data;refreshFailed=false;updateStatus();
  }catch(error){
   if(current!==version)return; // A replaced request cannot overwrite the new market's state.
   window.FynxMonitor?.report('feed','feed-load',error);
   refreshFailed=true;
   if(last){last.stale=true;updateStatus();}
   else {
    status.textContent='Source data is unavailable. Retry or open the source link below. No estimated values are shown.';
    updateCorrelationFocus();
   }
  }finally{
   clearTimeout(timeout);
   if(current===version){controller=null;button.disabled=false;}
  }
 }
 select.addEventListener('change',()=>{
  // Never leave the previous market's figures or source URL under the new selection.
  last=null;refreshFailed=false;output.replaceChildren();resetShareFeedback();syncSourceLink();
  resetSizeForMarket();
  load(true);
 });
 button.addEventListener('click',()=>load(true));
 function schedule(){clearInterval(timer);if(!document.hidden)timer=setInterval(()=>{updateStatus();load();},kind==='liquidity'?15000:300000);}
 document.addEventListener('visibilitychange',()=>{schedule();if(!document.hidden){updateStatus();load();}});window.addEventListener('pagehide',()=>clearInterval(timer));window.addEventListener('pageshow',event=>{if(event.persisted){schedule();updateStatus();load();}});schedule();load();
})();
