(() => {
 const economies=[
  {area:'US',country:'USA',name:'United States',currency:'USD',bank:'Federal Reserve',calendar:'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'},
  {area:'XM',country:'EMU',name:'Euro area',currency:'EUR',bank:'European Central Bank',calendar:'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'},
  {area:'GB',country:'GBR',name:'United Kingdom',currency:'GBP',bank:'Bank of England',calendar:'https://www.bankofengland.co.uk/monetary-policy'},
  {area:'JP',country:'JPN',name:'Japan',currency:'JPY',bank:'Bank of Japan',calendar:'https://www.boj.or.jp/en/mopo/mpmsche_minu/'},
  {area:'CH',country:'CHE',name:'Switzerland',currency:'CHF',bank:'Swiss National Bank',calendar:'https://www.snb.ch/en/services-events/digital-services/event-schedule'},
  {area:'CA',country:'CAN',name:'Canada',currency:'CAD',bank:'Bank of Canada',calendar:'https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/'},
  {area:'AU',country:'AUS',name:'Australia',currency:'AUD',bank:'Reserve Bank of Australia',calendar:'https://www.rba.gov.au/schedules-events/board-meeting-schedules.html'},
  {area:'NZ',country:'NZL',name:'New Zealand',currency:'NZD',bank:'Reserve Bank of New Zealand',calendar:'https://www.rbnz.govt.nz/news-and-events/how-we-release-information'}
 ];
 const metrics=[['NY.GDP.MKTP.KD.ZG','Real GDP growth'],['FP.CPI.TOTL.ZG','Consumer inflation'],['SL.UEM.TOTL.ZS','Unemployment']];
 const kind=document.body.dataset.macroKind,rows=document.getElementById('macroRows'),status=document.getElementById('macroStatus'),refresh=document.getElementById('refreshData');
 let dataset=null;
 const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
 const link=(text,url)=>{const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
 const pct=(value,precision=2)=>Number.isFinite(value)?value.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:precision})+'%':'Unavailable';
 function render(){
  rows.replaceChildren();
  if(!dataset)return;
  const query=document.getElementById('macroSearch').value.trim().toLowerCase();
  const visible=economies.filter(e=>`${e.name} ${e.currency} ${e.bank}`.toLowerCase().includes(query));
  visible.forEach(e=>{
   const card=el('article',undefined,'macro-card');card.append(el('span',e.currency,'macro-eyebrow'),el('h2',e.name));
   if(kind==='rates'){
    const rate=dataset.rows.find(r=>r.area===e.area);
    card.append(el('p',e.bank),el('div',pct(rate?.value,3),'macro-rate'),el('p',rate?`Observed ${rate.observationDate}`:'No published observation available'));
    if(rate){
     const age=(Date.now()-Date.parse(rate.observationDate+'T00:00:00Z'))/86400000;
     if(age>14)card.append(el('p','Older observation — check the central bank for a later decision.','macro-warning'));
     card.append(link('BIS series ↗',`https://data.bis.org/topics/CBPOL/BIS%2CWS_CBPOL%2C1.0/D.${e.area}`));
     const detail=el('details');detail.append(el('summary','Policy instrument definition'),el('p',rate.definition||'See the BIS source documentation.'));card.append(detail);
    }
   }else{
    const dl=el('dl');
    metrics.forEach(([code,name])=>{const observation=dataset.rows.find(r=>r.country===e.country&&r.indicator===code);const row=el('div'),dt=el('dt'),dd=el('dd',pct(observation?.value));dt.append(link(name,`https://data.worldbank.org/indicator/${code}?locations=${e.area==='XM'?'XC':e.area}`));dd.append(el('small',observation?`Year ${observation.year}`:'No observation'));row.append(dt,dd);dl.append(row);});card.append(dl);
   }
   rows.append(card);
  });
  if(!visible.length)rows.append(el('p','No matching economies. Clear the search to see all eight.','macro-empty'));
  if(kind==='rates')difference();
 }
 function difference(){
  const base=economies.find(e=>e.currency===document.getElementById('baseCurrency').value),quote=economies.find(e=>e.currency===document.getElementById('quoteCurrency').value);
  const a=dataset?.rows.find(r=>r.area===base.area),b=dataset?.rows.find(r=>r.area===quote.area);
  document.getElementById('rateDifference').textContent=a&&b?`${(a.value-b.value).toFixed(3)} percentage points`:'Comparison unavailable';
  document.getElementById('differenceDates').textContent=a&&b?`${base.currency}: ${a.observationDate} · ${quote.currency}: ${b.observationDate}. Reported policy instruments may differ.`:'Both published observations are required.';
 }
 async function load(){
  refresh.disabled=true;rows.setAttribute('aria-busy','true');status.textContent='Checking published observations…';status.classList.remove('macro-warning');
  try{
   const response=await fetch(`https://us-central1-fynx-c7a28.cloudfunctions.net/webMacroData?kind=${kind}`,{signal:AbortSignal.timeout(55000)});
   if(!response.ok)throw new Error('Source unavailable');
   const data=await response.json();if(!Array.isArray(data.rows)||!data.fetchedAt)throw new Error('Invalid response');dataset=data;render();
   status.textContent=`${data.cacheStatus==='stale'?'Refresh unavailable. Showing saved observations. ':''}Retrieved ${new Date(data.fetchedAt).toLocaleString()}. Observation dates are shown on each card.`;
   status.classList.toggle('macro-warning',data.cacheStatus==='stale');
   const details=document.getElementById('sourceDetails');details.replaceChildren(link(kind==='rates'?'Bank for International Settlements':'World Bank — World Development Indicators',kind==='rates'?'https://data.bis.org/topics/CBPOL':'https://data.worldbank.org/'));
   details.append(document.createTextNode(kind==='rates'?'. Daily observations published weekly; values are percentages per year.':`. Annual observations. Source dataset updated ${data.sourceUpdatedAt||'date unavailable'}. Values are percentages.`));
  }catch(error){window.FynxMonitor?.report('feed','macro-load',error);
   status.textContent=dataset?`Refresh failed. Previously retrieved data from ${new Date(dataset.fetchedAt).toLocaleString()} remains displayed. Check the official source.`:'Published data is temporarily unavailable. No estimated values are displayed. Use the official source links or try again.';
   status.classList.add('macro-warning');
   if(!dataset){rows.replaceChildren();rows.append(el('p','Data unavailable','macro-empty'));}
  }finally{refresh.disabled=false;rows.setAttribute('aria-busy','false');}
 }
 document.getElementById('macroSearch').addEventListener('input',render);refresh.addEventListener('click',load);
 document.getElementById('sourceDetails').append(link(kind==='rates'?'BIS policy-rate data':'World Bank indicator data',kind==='rates'?'https://data.bis.org/topics/CBPOL':'https://data.worldbank.org/'));
 if(kind==='rates'){
  ['baseCurrency','quoteCurrency'].forEach((id,index)=>{const select=document.getElementById(id);economies.forEach(e=>{const option=el('option',e.currency);option.value=e.currency;select.append(option);});select.selectedIndex=index;select.addEventListener('change',difference);});
  const sources=document.getElementById('meetingSources');economies.forEach(e=>{const card=el('article',undefined,'macro-card');card.append(el('span',e.currency,'macro-eyebrow'),el('h2',e.bank),link('Official schedule and decisions ↗',e.calendar));sources.append(card);});
 }
 load();
})();
