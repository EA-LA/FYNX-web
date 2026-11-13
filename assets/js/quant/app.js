/* Quant Analyst: attributed inputs, isolated calculations, no synthetic market data. */
(function () {
  'use strict';
  const Q = window.FynxQuant, $ = id => document.getElementById(id);
  if (!Q || !$('quant-main')) return;
  const state = { symbol:'EURUSD', news:false, bars:null, metadata:null, backtest:null, tested:null, optimized:null, portfolio:null, sleeves:[], saved:[], savedPortfolios:[], events:[], busy:false, cancelled:false, worker:null, reject:null, seq:0, ea:null, auth:null, uid:null };
  const strategyControls=document.createElement('div');strategyControls.className='params';strategyControls.innerHTML='<label>Strategy model<select id="strategyModel"><option value="breakout">ATR breakout</option><option value="mean-reversion">Mean reversion</option><option value="news">News drift</option></select></label><label>Candle execution model<select id="executionMode"><option value="auto">Use available OHLC / close data</option><option value="close">Daily close proxy</option><option value="ohlc">OHLC next-open execution</option></select></label><label id="meanLookbackLabel" hidden>Mean lookback<input id="meanLookback" type="number" value="20" min="2" max="500"></label><label id="meanEntryZLabel" hidden>Mean entry standard deviations<input id="meanEntryZ" type="number" value="1.5" min="0.1" max="10" step="0.1"></label>';$('N').closest('.params').before(strategyControls);
  const strategyLabel=()=>({breakout:'ATR breakout','mean-reversion':'Mean reversion',news:'News drift'}[$('strategyModel').value]);
  function selectStrategyModel(model){$('strategyModel').value=model;state.news=model==='news';$('meanLookbackLabel').hidden=$('meanEntryZLabel').hidden=model!=='mean-reversion';}
  const marketChanges = new Map(),marketQuotes=new Map(),archiveCloses=new Map(),quoteFailures=new Map();
  let quoteRequest=null,quoteAttemptAt=0,quoteRefreshTimer,quotesUnconfigured=false;
  let portfolioSelectionTouched=false;
  const steps = {backtest:'bt',optimize:'opt',portfolio:'port',montecarlo:'mc',ftmo:'ftmo',deploy:'dep'};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = (x,d=2) => Number.isFinite(x) ? x.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}) : x === Infinity ? '∞' : '—';
  const pct = x => Number.isFinite(x) ? `${number(x*100)}%` : '—';
  const value = id => {
    const input=$(id),label=input.closest('label')?.textContent?.trim()||id,n=Number(input.value);
    if(input.value===''||!Number.isFinite(n))throw new Error(`Enter a valid ${label}.`);
    const min=input.getAttribute('min'),max=input.getAttribute('max'),step=input.getAttribute('step');
    if(min!==null&&n<Number(min)||max!==null&&n>Number(max))throw new Error(`Check ${label}: use ${min??'an allowed value'}${max!==null?' to '+max:''}.`);
    // Disabled form fields bypass native checkValidity; enforce the same constraints during work.
    if(input.type==='number'&&step!=='any') {
      const increment=Number(step||1),base=min!==null?Number(min):0,ticks=(n-base)/increment;
      if(!(increment>0)||Math.abs(ticks-Math.round(ticks))>1e-7)throw new Error(`Check ${label}: use increments of ${increment}.`);
    }
    if(!input.disabled&&!input.checkValidity())throw new Error(`Check ${label}.`);
    return n;
  };
  const log = (message, error=false) => {$('log').textContent=message;$('log').classList.toggle('error',error);};
  const symbol = () => Q.SYMBOLS.find(s=>s.id===state.symbol);
  const today = () => new Date().toISOString().slice(0,10);
  const plotConfig = {responsive:true,displaylogo:false,displayModeBar:false};
  const layout = extra => JSON.parse(JSON.stringify({font:{family:'Inter, Helvetica, sans-serif',size:11,color:'#222824'},paper_bgcolor:'#fff',plot_bgcolor:'#fff',margin:{l:56,r:20,t:40,b:44},xaxis:{gridcolor:'#edf0ea'},yaxis:{gridcolor:'#edf0ea'},showlegend:false,...extra}));
  let plotPromise;
  async function plot(id, traces, extra={}) {
    if(state.cancelled)throw new Error('Calculation cancelled.');
    if ($(id).closest('[role=tabpanel]')?.hidden) return;
    if(!window.Plotly) {
      plotPromise ||= new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/assets/js/quant/plotly.min.js';s.onload=resolve;s.onerror=()=>{s.remove();plotPromise=null;reject(new Error('Charts could not load. Results remain in the tables. Try running again.'));};document.head.append(s);});
      await plotPromise;
    }
    await new Promise(requestAnimationFrame);
    if(state.cancelled)throw new Error('Calculation cancelled.');
    if($(id).closest('[role=tabpanel]')?.hidden) return;
    await window.Plotly.newPlot($(id),traces,layout(extra),{...plotConfig});
  }
  function showPanel(p) {
    document.querySelectorAll('#steps button').forEach(b=>{const on=b.dataset.p===p;b.classList.toggle('on',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
    document.querySelectorAll('.quant-workspace [role=tabpanel]').forEach(el=>{el.hidden=el.id!==`p-${p}`;el.classList.toggle('on',!el.hidden);});
    requestAnimationFrame(()=>document.querySelectorAll(`#p-${p} .js-plotly-plot`).forEach(el=>window.Plotly?.Plots.resize(el)));
  }
  async function api(path, options={}) {
    const full='/api/quant'+path, url=window.FynxResearchService?.apiURL(full)??full;
    const ownerSignal=options.signal||state.jobAbort?.signal,ac=new AbortController(),abort=()=>ac.abort();
    if(ownerSignal?.aborted)throw new Error('Cancelled.');ownerSignal?.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(abort,120000);
    try {
      const response=await fetch(url,{...options,signal:ac.signal,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
      if(!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('The Quant research service did not return data. Try refreshing or use the published daily history.');
      const data=await response.json();
      if(!response.ok)throw new Error(data.error?.message||(typeof data.error==='string'?data.error:null)||data.message||`Data service returned ${response.status}.`);
      return data;
    } finally {clearTimeout(timeout);ownerSignal?.removeEventListener('abort',abort);}
  }
  // Daily research is portable across the static site and the full API. Other
  // timeframes must use their own data source, never daily bars as a substitute.
  async function getBars(query) {
    const route='/bars?'+query,params=new URLSearchParams(query);
    const archive=window.FynxQuantArchive,signal=state.jobAbort?.signal;
    if(params.get('tf')!=='D1'||!archive)return api(route);
    const published=()=>archive.bars(params,signal),live=()=>api(route);
    const preferArchive=window.FynxResearchService?.production;
    const [first,second]=preferArchive?[published,live]:[live,published];
    try{return await first();}catch(reason){
      if(signal?.aborted)throw reason;
      try{return await second();}catch(secondError){
        if(signal?.aborted)throw secondError;
        const detail=preferArchive?secondError.message:reason.message;
        throw new Error(`Daily history could not be loaded for ${params.get('symbol')} in this range. ${detail}`);
      }
    }
  }
  function progress(f) { $('progressBar').value=Math.max(0,Math.min(100,f<=1?f*100:f)); }
  async function calculate(action,payload) {
    if(state.cancelled)throw new Error('Cancelled.');
    if((action==='backtest'||action==='optimize')&&(payload.tf==='tick'||payload.params?.mode==='tick') || (payload.bars?.length||0)>50000) {
      const job=await api(`/${action}`,{method:'POST',body:JSON.stringify(payload)});state.serverJob=job.jobId||null;
      if(job.status==='complete'||job.status==='completed'){state.serverJob=null;progress(1);return job.result;}
      if(!job.jobId)return job.result||job;
      while(!state.cancelled) {
        const update=await api(`/jobs/${encodeURIComponent(job.jobId)}`);progress(update.progress||0);
        if(update.status==='completed'||update.status==='complete'){state.serverJob=null;return update.result;}
        if(update.status==='failed'){state.serverJob=null;throw new Error(update.error?.message||update.error||'Server calculation failed.');}
        await new Promise(resolve=>setTimeout(resolve,1500));
      }
      throw new Error('Stopped waiting for the server job.');
    }
    return new Promise((resolve,reject)=>{
      const worker=new Worker('/assets/js/quant/worker.js?v=20261113-edge-reauth-1'), id=++state.seq;
      state.worker=worker;state.reject=reject;
      const finish=()=>{worker.terminate();state.worker=null;state.reject=null;};
      worker.onmessage=({data})=>{if(data.id!==id)return;if(data.progress!==undefined){progress(data.progress);return;}finish();if(data.error)reject(new Error(data.error));else resolve(data.result);};
      worker.onerror=()=>{finish();reject(new Error('The calculation worker could not finish. Check the data and parameters.'));};
      worker.postMessage({id,action,payload});
    });
  }
  async function work(fn) {
    if(state.busy)return;
    state.busy=true;state.cancelled=false;state.jobAbort=new AbortController();$('jobProgress').hidden=false;$('quant-main').setAttribute('aria-busy','true');progress(0);
    const controls=[...document.querySelectorAll('.quant-workspace button,.quant-workspace input,.quant-workspace select')].filter(el=>el.id!=='cancelJob');
    const previous=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
    try{await fn();}catch(error){log(state.cancelled?'Calculation cancelled.':error.message||'The request failed.',!state.cancelled);}finally{state.busy=false;state.jobAbort=null;state.serverJob=null;$('jobProgress').hidden=true;$('quant-main').setAttribute('aria-busy','false');controls.forEach((el,i)=>el.disabled=previous[i]);$('applyBest').disabled=!state.optimized?.best;$('loadPortfolio').disabled=!state.savedPortfolios.length;$('downloadEa').disabled=!state.ea;$('copyEa').disabled=!state.ea;document.querySelectorAll('#sleeves input').forEach(el=>el.disabled=false);}
  }
  function clearResults(ids) {
    ids.forEach(id=>{const el=$(id);if(el.classList.contains('js-plotly-plot'))window.Plotly?.purge(el);el.replaceChildren();});
  }
  function invalidateMonteCarlo() {clearResults(['mcStats','mcFan','mcDD']);}
  function invalidateFtmo() {clearResults(['ftmoStats','ftmoScan']);$('ftmoVerdict').style.display='none';}
  function invalidatePortfolio() {state.portfolio=null;state.portfolioInputs=[];clearResults(['portStats','portEq','corr']);invalidateMonteCarlo();invalidateFtmo();}
  function invalidateOptimization() {state.optimized=null;clearResults(['surf','splitStats']);$('optVerdict').style.display='none';$('applyBest').disabled=true;}
  function invalidateEA() {state.ea=null;$('ea').hidden=true;$('ea').textContent='';$('eaNotes').textContent='';$('downloadEa').disabled=true;$('copyEa').disabled=true;}
  function invalidate() {
    state.backtest=null;state.tested=null;invalidateOptimization();invalidatePortfolio();invalidateEA();
    clearResults(['btStats','btEq','eventStudy']);$('btTrades').innerHTML='<caption>Run the backtest for these settings.</caption>';
  }
  function parameters() {
    return {lookback:value('N'),atrPeriod:value('AP'),entryK:value('K'),stopS:value('S'),targetTP:value('TP'),maxHold:value('H'),costPips:value('C'),riskPct:value('R'),pipSize:symbol().pipSize,spreadPips:value('spread'),slippagePips:value('slippage'),mode:$('timeframe').value==='tick'?'tick':$('executionMode').value!=='auto'?$('executionMode').value:state.bars?.every(b=>b.high!==undefined&&b.low!==undefined)?'ohlc':'close',strategy:$('strategyModel').value,meanLookback:value('meanLookback'),meanEntryZ:value('meanEntryZ'),events:state.events,eventType:$('eventType').value,newsWindowMinutes:value('newsWindow')};
  }
  function updateRange() {const date=new Date();date.setUTCFullYear(date.getUTCFullYear()-value('historyYears'));$('historyFrom').value=date.toISOString().slice(0,10);$('historyTo').value=today();}
  function rangeQuery(id=state.symbol,tf=$('timeframe').value) {if(!$('historyFrom').value||!$('historyTo').value)throw new Error('Choose both the start and end dates for the research range.');return new URLSearchParams({symbol:id,tf,from:$('historyFrom').value,to:$('historyTo').value}).toString();}
  function annualChange(id,bars) {
    const el=document.querySelector(`[data-market="${id}"] small`);if(!el||!bars?.length)return;
    const end=bars[bars.length-1],endTime=new Date(end.time),cutoff=new Date(endTime);cutoff.setUTCFullYear(cutoff.getUTCFullYear()-1);
    const base=[...bars].reverse().find(b=>new Date(b.time)<=cutoff);
    if(!base || cutoff-new Date(base.time)>10*86400000) {el.textContent='1y unavailable';return;}
    const change=end.close/base.close-1;el.textContent=`${change>=0?'+':''}${number(change*100,1)}% 1y`;el.className=change>=0?'up':'down';el.title=`${String(base.time).slice(0,10)} to ${String(end.time).slice(0,10)}`;marketChanges.set(id,{text:el.textContent,className:el.className,title:el.title});
  }
  async function loadData() {
    invalidate();state.bars=null;state.metadata=null;
    try {
    $('dataPill').textContent=`Loading ${symbol().label} · ${$('timeframe').value}`;log('Requesting real historical prices…');
    if($('timeframe').value==='tick'){const data=await api(`/history?${rangeQuery()}`);if(state.cancelled)throw new Error('Cancelled.');state.bars=[];state.metadata=data;$('dataPill').textContent=`${symbol().label} · stored tick coverage`;$('dataNote').textContent=`${data.source} · ${data.from} → ${data.to} · updated ${data.updatedAt}. ${data.granularityNote}`;$('btRange').textContent='Stored ticks · M1 signals';$('btTitle').textContent=`${strategyLabel()} · ${symbol().label}`;log('Tick archive coverage verified. The server will stream recorded quotes when you run the test.');return;}
    const data=await getBars(rangeQuery());
    if(!Array.isArray(data.bars)||data.bars.length<40)throw new Error('Too little price history for this research. Choose a longer available period.');
    if(state.cancelled)throw new Error('Cancelled.');state.bars=data.bars;state.metadata=data;renderMarketQuotes();
    const first=String(data.bars[0].time).slice(0,10),last=String(data.bars.at(-1).time).slice(0,10);
    $('dataPill').textContent=`${symbol().label} · ${first} → ${last}`;
    $('dataNote').textContent=`${data.source||'Dukascopy'} · ${number(data.bars.length,0)} ${data.timeframe||$('timeframe').value} bars. Last fetched ${data.updatedAt?new Date(data.updatedAt).toLocaleString():'not supplied'}. ${data.granularityNote||''} ${data.warning||''}`;
    $('btRange').textContent=`${first} — ${last}`;$('btTitle').textContent=`${strategyLabel()} · ${symbol().label}`;
    if($('timeframe').value==='D1')annualChange(state.symbol,state.bars);
    log(`Loaded ${number(data.bars.length,0)} bars from ${data.source||'Dukascopy'}. Ready to test.`);
    } catch(error){state.bars=null;state.metadata=null;$('dataPill').textContent='Requested data unavailable';$('dataNote').textContent=error.message;throw error;}
  }
  async function ensureData() {if(!state.bars)await loadData();if(state.news&&!state.events.length)await loadCalendar(true);}
  function statGrid(id,entries) {$(id).innerHTML=entries.map(([label,v,cls=''])=>`<div class="stat"><div>${esc(label)}</div><b class="${esc(cls)}">${esc(v)}</b></div>`).join('');}
  function stats(id,s) {if(id==='portStats'){statGrid(id,[['Total return',pct(s.totalReturn),s.totalReturn>=0?'up':'down'],['CAGR',pct(s.cagr)],['Sharpe',number(s.sharpe)],['Max drawdown',pct(s.maxDrawdown)],['Return / max DD',number(s.returnMaxDD)]]);return;}statGrid(id,[['Total return',pct(s.totalReturn),s.totalReturn>=0?'up':'down'],['CAGR',pct(s.cagr)],['Sharpe',number(s.sharpe)],['Max drawdown',pct(s.maxDrawdown)],['Trades',s.trades],['Win rate',pct(s.winRate)],['Profit factor',number(s.profitFactor)],['Average R',number(s.averageR)],['Return / max DD',number(s.returnMaxDD)]]);}
  function curveTrace(equity,name,color='#1f4d3a',width=2) {const base=10000;return {x:equity.map(x=>x.date),y:equity.map(x=>(x.equity/base-1)*100),type:'scatter',mode:'lines',name,line:{color,width},hovertemplate:'%{x}<br>%{y:.2f}%<extra>'+esc(name)+'</extra>'};}
  async function runBacktest() {
    showPanel('bt');await ensureData();log('Running ATR research in the calculation worker…');
    const params=parameters(),payload=$('timeframe').value==='tick'?{symbol:state.symbol,tf:'tick',from:$('historyFrom').value,to:$('historyTo').value,params}:{bars:state.bars,params};
    const result=await calculate('backtest',payload);if(state.cancelled)throw new Error('Cancelled.');if(result.provenance){const p=result.provenance;$('dataPill').textContent=`${symbol().label} · ${String(p.actualFrom||p.requestedFrom).slice(0,10)} → ${String(p.actualTo||p.requestedTo).slice(0,10)}`;$('dataNote').textContent=`${p.source} · ${number(p.recordedTicks,0)} recorded ticks · ${p.partitions} partitions · last updated ${p.updatedAt}. M1 completed-bar signals, recorded bid/ask execution.`;}
    state.backtest=result;state.tested={symbol:state.symbol,timeframe:$('timeframe').value,params:{...params,events:undefined},provenance:{source:state.metadata.source,from:state.metadata.from,to:state.metadata.to,updatedAt:state.metadata.updatedAt}};
    stats('btStats',result.stats);await plot('btEq',[curveTrace(result.equity,symbol().label)],{title:{text:'Strategy equity · return %'},yaxis:{ticksuffix:'%',gridcolor:'#eee'}});
    $('btTrades').innerHTML='<caption>Most recent '+Math.min(20,result.trades.length)+' trades · '+result.trades.length+' total</caption><thead><tr>'+['Entry','Exit','Side','Entry price','Exit price','R','Exit reason'].map(x=>`<th scope="col">${x}</th>`).join('')+'</tr></thead><tbody>'+result.trades.slice(-20).reverse().map(t=>`<tr><td>${esc(t.entryDate)}</td><td>${esc(t.exitDate)}</td><td>${esc(t.side)}</td><td class="n">${number(t.entryPrice,5)}</td><td class="n">${number(t.exitPrice,5)}</td><td class="n ${t.R>=0?'up':'down'}">${number(t.R)}</td><td>${esc(t.reason)}</td></tr>`).join('')+'</tbody>';
    $('fillNotes').textContent=result.notes.join(' ');
    log(result.trades.length<10?`Only ${result.trades.length} trades. This is too little evidence for optimization ranking.`:`Backtest complete · ${result.trades.length} trades. Returns include the selected costs.`);
  }
  const gridValues=id=>{const values=$(id).value.split(',').map(s=>Number(s.trim()));if(!values.length||values.length>30||values.some(v=>!Number.isFinite(v)))throw new Error('Grid values must be a comma-separated list of up to 30 numbers.');return values;};
  async function renderSurface() {
    const r=state.optimized;if(!r)return;
    const x=[...new Set(r.cells.map(c=>c.entryK))],y=[...new Set(r.cells.map(c=>c.stopS))];
    const z=y.map(s=>x.map(k=>r.cells.find(c=>c.entryK===k&&c.stopS===s)?.value??null));
    const colorscale=[[0,'#b74641'],[.5,'#f4f0db'],[1,'#2f8857']];
    const trace=$('surfaceView').value==='heatmap'?{type:'heatmap',x,y,z,colorscale,hoverongaps:false}:{type:'surface',x,y,z,colorscale,contours:{z:{show:true,usecolormap:true,project:{z:true}}}};
    await plot('surf',[trace],{height:$('surfaceView').value==='heatmap'?440:580,margin:{l:10,r:10,t:50,b:10},title:{text:'In-sample · '+$('metric').selectedOptions[0].text},xaxis:{title:'Entry K'},yaxis:{title:'Stop S'},scene:{aspectmode:'manual',aspectratio:{x:1.5,y:1.5,z:.85},camera:{eye:{x:1.45,y:-1.55,z:.95}},xaxis:{title:{text:'Entry K'}},yaxis:{title:{text:'Stop S'}},zaxis:{title:{text:$('metric').selectedOptions[0].text}}}});
  }
  async function runOptimize() {
    if($('strategyModel').value==='mean-reversion')throw new Error('This optimization grid varies entry ATR and stop ATR. Mean reversion requires a Z-score grid, which is not available yet. Its backtest and portfolio remain available.');
    showPanel('opt');await ensureData();log('Optimizing the training period; the final 30% is held out…');
    const r=await calculate('optimize',{...($('timeframe').value==='tick'?{symbol:state.symbol,tf:'tick',from:$('historyFrom').value,to:$('historyTo').value}:{bars:state.bars}),params:parameters(),options:{metric:$('metric').value,entryValues:gridValues('entryValues'),stopValues:gridValues('stopValues'),minTrades:10,trainFraction:.7}});if(state.cancelled)throw new Error('Cancelled.');state.optimized=r;
    await renderSurface();const verdict=$('optVerdict');verdict.style.display='block';verdict.className='verdict '+(r.verdict==='green'?'good':r.verdict==='red'?'bad':'mid');
    verdict.textContent=!r.best?'No cell has enough trades to rank. Expand the available history or change the grid.':`Best entry ${r.best.entryK} ATR, stop ${r.best.stopS} ATR. ${r.verdict==='green'?'Positive out-of-sample Sharpe retained at least half of training Sharpe.':r.verdict==='amber'?'Out-of-sample Sharpe stayed positive but weakened.':'Likely curve-fit: the held-out result did not retain a positive edge.'}`;
    if(r.inSample&&r.outOfSample)$('splitStats').innerHTML=`<div class="empty"><strong>First 70% · training</strong>Sharpe ${number(r.inSample.stats.sharpe)} · return ${pct(r.inSample.stats.totalReturn)} · ${r.inSample.stats.trades} trades</div><div class="empty"><strong>Last 30% · unseen</strong>Sharpe ${number(r.outOfSample.stats.sharpe)} · return ${pct(r.outOfSample.stats.totalReturn)} · ${r.outOfSample.stats.trades} trades</div>`;
    log('Walk-forward calculation complete. Cells with fewer than ten trades are excluded.');
  }
  function renderSleeves() {
    const checked=new Set([...document.querySelectorAll('#sleeves input:checked')].map(el=>el.value));const initial=!$('sleeves').children.length;
    const markets=Q.SYMBOLS.map(s=>({id:s.id,name:`ATR · ${s.label}`}));
    const entries=[...markets,{id:'news',name:`News · ${symbol().label}`},...state.sleeves.map((s,i)=>({id:`custom-${i}`,name:s.name}))];
    $('sleeves').innerHTML=entries.map(s=>`<label><input type="checkbox" value="${esc(s.id)}" ${state.busy?'disabled':''} ${(checked.has(s.id)||(initial&&s.id===state.symbol))?'checked':''}>${esc(s.name)}</label>`).join('');
    $('loadSaved').textContent=`My strategies (${state.saved.length})`;
    if(!$('newsSleeveStatus')){const note=document.createElement('p');note.id='newsSleeveStatus';note.className='note';note.textContent='The default portfolio adds a news sleeve only when verified historical releases are available.';$('sleeves').after(note);}
  }
  function confirmedHistory(data,market,from,to) {
    if(data.scheduled||data.status==='scheduled')throw new Error('A schedule cannot be used as a record of past news releases.');
    const start=Date.parse(from),end=Math.min(Date.parse(to),Date.now());
    const events=(data.events||[]).map(e=>({...e,name:e.name||e.title,impact:String(e.impact).toLowerCase()})).filter(e=>e.timing==='confirmed'&&e.impact==='high'&&market.currencies.includes(e.currency)&&Date.parse(e.time)>=start&&Date.parse(e.time)<end);
    if(!events.length)throw new Error(`No verified high-impact event history is available for ${market.label} in this research range.`);
    return events;
  }
  async function historicalEventsFor(marketId) {
    const market=Q.SYMBOLS.find(s=>s.id===marketId);if(!market)throw new Error('The saved strategy market is unsupported.');
    const from=$('historyFrom').value,to=$('historyTo').value;
    const data=await api('/news/calendar?'+new URLSearchParams({symbol:marketId,from,to,impact:'high'}));
    if(state.cancelled)throw new Error('Cancelled.');
    return confirmedHistory(data,market,from,to);
  }
  async function runPortfolio() {
    showPanel('port');const choices=[...document.querySelectorAll('#sleeves input:checked')].map(x=>x.value);if(!choices.length)throw new Error('Select at least one strategy sleeve.');
    const needsCurrentBars=choices.some(id=>!id.startsWith('custom-'));if(needsCurrentBars&&!state.bars)await loadData();
    let newsWarning='';
    if(needsCurrentBars&&!portfolioSelectionTouched){
      try{if(!state.events.length)state.events=await historicalEventsFor(state.symbol);if(!choices.includes('news'))choices.push('news');const news=document.querySelector('#sleeves input[value="news"]');if(news)news.checked=true;$('newsSleeveStatus').textContent=`News sleeve included: ${state.events.length} verified releases for ${symbol().label}.`;}
      catch(error){if(state.cancelled)throw error;const index=choices.indexOf('news');if(index>=0)choices.splice(index,1);const news=document.querySelector('#sleeves input[value="news"]');if(news)news.checked=false;newsWarning='News sleeve omitted: verified historical releases are unavailable for this range.';$('newsSleeveStatus').textContent=newsWarning;}
    }
    const sleeves=[];const params=parameters();
    // Keep the combined raw tick paths below the service response budget. Risk-weighted
    // portfolios use their first 60 return days only for weight calibration.
    const intradayCapture={maxIntradayMarks:Math.min(50000,Math.max(100,Math.floor(60000/choices.length))),captureAfterDays:$('weighting').value==='equal-weight'?0:60};
    for(let i=0;i<choices.length;i++) {
      if(state.cancelled)throw new Error('Cancelled.');const id=choices[i];log(`Building sleeve ${i+1} of ${choices.length}…`);
      if(id.startsWith('custom-')) {
        const item=state.sleeves[Number(id.slice(7))];if(item.returns?.length){sleeves.push(item);continue;}
        const market=Q.SYMBOLS.find(s=>s.id===item.symbol);if(!market)throw new Error('A saved strategy has an unsupported market.');
        const savedParams={...item.params,pipSize:market.pipSize,captureIntraday:item.timeframe==='tick',...intradayCapture};
        if(savedParams.strategy==='news')savedParams.events=await historicalEventsFor(item.symbol);
        const input=item.timeframe==='tick'?{symbol:item.symbol,tf:'tick',from:$('historyFrom').value,to:$('historyTo').value}:{bars:(await getBars(rangeQuery(item.symbol,item.timeframe))).bars};
        if(state.cancelled)throw new Error('Cancelled.');const r=await calculate('backtest',{...input,params:savedParams});sleeves.push({name:item.name,returns:r.dailyReturns});continue;
      }
      const sym=id==='news'?symbol():Q.SYMBOLS.find(s=>s.id===id);if(id==='news'&&!state.events.length)await loadCalendar(true);
      const bars=$('timeframe').value==='tick'?null:sym.id===state.symbol?state.bars:(await getBars(rangeQuery(sym.id))).bars;
      const r=await calculate('backtest',{...($('timeframe').value==='tick'?{symbol:sym.id,tf:'tick',from:$('historyFrom').value,to:$('historyTo').value}:{bars}),params:{...params,captureIntraday:$('timeframe').value==='tick',...intradayCapture,pipSize:sym.pipSize,strategy:id==='news'?'news':'breakout',events:state.events}});sleeves.push({name:`${id==='news'?'News':'ATR'} · ${sym.label}`,returns:r.dailyReturns});
    }
    const result=await calculate('portfolio',{sleeves,options:{method:$('weighting').value}});state.portfolio=result;state.portfolioInputs=sleeves;
    stats('portStats',result.stats);
    const traces=result.sleeves.map(s=>curveTrace(s.equity,s.name,'#c7ccc7',1));traces.push(curveTrace(result.equity,'Portfolio','#1f4d3a',2.5));
    await plot('portEq',traces,{title:{text:'Portfolio and sleeves · return %'},yaxis:{ticksuffix:'%'}});
    if(sleeves.length<2){if(window.Plotly)try{Plotly.purge($('corr'));}catch(_){}$('corr').innerHTML='<p class="note" style="padding:18px">Correlation needs at least two sleeves. Tick another market or strategy above and build the portfolio again to see how their daily returns move together.</p>';}
    else await plot('corr',[{type:'heatmap',z:result.correlation,x:sleeves.map(s=>s.name),y:sleeves.map(s=>s.name),zmin:-1,zmax:1,colorscale:[[0,'#b74641'],[.5,'#f5f3e9'],[1,'#2d7b50']],hoverongaps:false}],{title:{text:'Daily-return correlation'},margin:{l:140,r:35,t:45,b:100}});
    log(`Portfolio complete · ${sleeves.length} sleeves. ${newsWarning} ${result.notes?.join(' ')||'Weights use past returns; available overlap determines the research range.'}`);
  }
  async function ensurePortfolio() {if(!state.portfolio)await runPortfolio();}
  async function runMonteCarlo() {
    await ensurePortfolio();showPanel('mc');log('Bootstrapping observed daily returns…');
    const r=await calculate('montecarlo',{returns:state.portfolio.dailyReturns,options:{paths:value('paths'),horizon:value('mcDays'),blockSize:10,seed:value('seed')}});
    const s=r.stats;statGrid('mcStats',[['Median return',pct(s.medianReturn)],['5th percentile',pct(s.p05Return)],['95th percentile',pct(s.p95Return)],['P(loss)',pct(s.lossProbability)],['Median max DD',pct(s.medianDrawdown)],['95th pct max DD',pct(s.p95Drawdown)],['P(DD > 10%)',pct(s.drawdownOver10Probability)],['Seed',r.seed]]);
    const x=r.fan.map(p=>p.day), traces=r.samples.slice(0,40).map(p=>({x:p.map((_,i)=>i),y:p.map(v=>(v-1)*100),type:'scatter',mode:'lines',line:{color:'rgba(70,90,74,.09)',width:1},hoverinfo:'skip'}));
    for(const [key,fill,color] of [['p05',null,'rgba(84,143,104,.12)'],['p95','tonexty','rgba(84,143,104,.12)'],['p25',null,'rgba(52,119,75,.22)'],['p75','tonexty','rgba(52,119,75,.22)'],['median',null,'#1f4d3a']])traces.push({x,y:r.fan.map(p=>(p[key]-1)*100),name:key,mode:'lines',line:{color:key==='median'?'#1f4d3a':'transparent',width:2},fill,fillcolor:color});
    await plot('mcFan',traces,{title:{text:`${number(value('paths'),0)} stationary bootstrap paths · seed ${r.seed}`},yaxis:{ticksuffix:'%'},xaxis:{title:'Trading days'}});
    await plot('mcDD',[{type:'histogram',x:r.drawdowns.map(d=>d*100),marker:{color:'#1f4d3a'},nbinsx:35}],{title:{text:'Maximum drawdown distribution'},xaxis:{ticksuffix:'%',title:'Max drawdown'},yaxis:{title:'Paths'}});log('Monte Carlo complete. These are resampled historical scenarios, not forecasts.');
  }
  async function runFtmo() {
    await ensurePortfolio();showPanel('ftmo');log('Simulating challenge phases and risk scales…');
    const r=await calculate('ftmo',{returns:state.portfolio.dailyReturns,options:{attempts:value('attempts'),horizon:value('fDays'),riskScale:value('fScale'),intradayBufferPct:value('fBuf'),accountSize:value('accountSize'),ruleId:$('ruleId').value,seed:value('seed'),blockSize:10,includeRiskScan:true}});
    const s=r.stats;statGrid('ftmoStats',[['Pass phase 1',pct(s.phase1PassRate)],[$('ruleId').value==='2-step'?'Pass both':'Pass challenge',pct(s.bothPassRate)],['Daily loss breach',pct(s.dailyLossRate)],['Max loss breach',pct(s.maxLossRate)],['Horizon exceeded',pct(s.timeoutRate)],['Median days · P1',number(s.medianDaysPhase1,0)],['Median days · P2',number(s.medianDaysPhase2,0)]]);
    $('ftmoVerdict').style.display='block';$('ftmoVerdict').textContent=`${r.verdict} ${r.notes?.join(' ')||''}`;
    await plot('ftmoScan',[['passRate','Pass','#1f4d3a'],['breachRate','Breach','#b74641'],['timeoutRate','Timeout','#ac8b34']].map(([key,name,color])=>({x:r.riskScan.map(p=>p.riskScale),y:r.riskScan.map(p=>p[key]*100),type:'scatter',mode:'lines+markers',name,line:{color}})),{title:{text:'Risk scale sensitivity'},showlegend:true,legend:{orientation:'h',y:-.2},xaxis:{title:'Risk scale ×'},yaxis:{ticksuffix:'%'}});log('Challenge simulation complete. Check the current rules and intraday limitations.');
  }
  async function loadCalendar(historical=false) {
    const requestedSymbol=state.symbol;
    const from=historical?$('historyFrom').value:today(),to=historical?$('historyTo').value:new Date(Date.now()+14*86400000).toISOString().slice(0,10);
    const currencies=symbol().currencies;
    let data;
    try{data=await api(`/news/calendar?${new URLSearchParams({symbol:requestedSymbol,from,to,impact:'high'})}`);}
    catch(error){
      if(historical||!window.FynxQuantArchive)throw error;
      try{data=await window.FynxQuantArchive.upcoming(currencies,from,to);}catch{throw error;}
    }
    if(state.symbol!==requestedSymbol||(historical&&(from!==$('historyFrom').value||to!==$('historyTo').value))){if(historical)throw new Error('Research settings changed while calendar history was loading.');return;}
    const events=(data.events||[]).map(e=>({...e,name:e.name||e.title,impact:String(e.impact).toLowerCase()}));
    if(historical){state.events=confirmedHistory(data,symbol(),from,to);return;}
    $('calendarStatus').textContent=data.scheduled?`${data.source} · scheduled releases through ${String(data.to).slice(0,10)} · updated ${String(data.updatedAt).slice(0,10)}`:`${data.source||'Economic calendar'} · upcoming high-impact releases`;
    $('upcomingEvents').innerHTML=events.slice(0,5).map(e=>`<div class="event">${esc(e.name)}<small>${esc(e.currency)} · ${esc(new Date(e.time).toLocaleString())}${e.timing==='estimated'?' · estimated':''}</small><small>Actual ${esc(e.actual??'—')} · Forecast ${esc(e.forecast??'—')} · Previous ${esc(e.previous??'—')}</small></div>`).join('')||'<p class="note">No upcoming high-impact events reported for this market in the available calendar.</p>';
  }
  async function loadHeadlines() {
    const requestedSymbol=state.symbol;
    try{const data=await api(`/news/headlines?symbol=${requestedSymbol}`);if(state.symbol!==requestedSymbol)return;const items=data.headlines||data.items||data.articles||[];
      $('headlines').replaceChildren();for(const item of items.slice(0,4)){const a=document.createElement('a');const candidate=item.readerUrl||item.url||'/news.html';const u=new URL(candidate,location.origin);a.href=u.origin===location.origin||(u.protocol==='https:'&&['fynxfinanceworld.com','www.fynxfinanceworld.com'].includes(u.hostname))?candidate:'/news.html';a.className='headline';a.textContent=item.title||item.headline;const small=document.createElement('small'),sourceName=item.source?.name||(typeof item.source==='string'?item.source:'FYNX News'),published=item.pubDate||item.publishedAt||item.published_at||item.date;small.textContent=sourceName+' · ';if(published&&Number.isFinite(Date.parse(published))){const time=document.createElement('time');time.dateTime=new Date(published).toISOString();time.textContent=new Date(published).toLocaleString();small.append(time);}else small.append(document.createTextNode('publication time unavailable'));if(data.stale||data.status==='stale')small.append(document.createTextNode(' · cached feed'));a.append(small);$('headlines').append(a);}if(!items.length)$('headlines').innerHTML='<a href="/news.html">Read FYNX News →</a>';
    }catch{if(state.symbol!==requestedSymbol)return;
      // Fallback: the same attributed newsroom feed the News page uses, matched to this market's desk.
      const cat=/BTC|ETH/.test(requestedSymbol)?'crypto':/XAU|XAG/.test(requestedSymbol)?'commodities':/US30|NAS|SPX/.test(requestedSymbol)?'stocks':'forex';
      try{const D=window.FYNXMarketIntelligenceData;if(!D)throw 0;const r=await D.loadHeadlines(cat,{timeoutMs:8000});if(state.symbol!==requestedSymbol)return;
        const items=(r.items||[]).filter(i=>i.title&&i.url).slice(0,5);if(!items.length)throw 0;$('headlines').replaceChildren();
        for(const item of items){const a=document.createElement('a');a.className='headline';a.href=window.FYNXNewsReaderData?.href(item)||'/news.html';a.textContent=item.title;const small=document.createElement('small');small.textContent=(item.source||'FYNX News')+(item.publishedAt?' · '+new Date(item.publishedAt).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'');a.append(small);$('headlines').append(a);}
      }catch{$('headlines').innerHTML='<a href="/news.html">Open FYNX News for attributed headlines →</a>';}}
  }
  function renderMarketQuotes() {
    for(const market of Q.SYMBOLS){
      const cell=document.querySelector(`[data-market-quote="${market.id}"]`);if(!cell)continue;const current=marketQuotes.get(market.id),close=archiveCloses.get(market.id);
      const q=(!current||Date.parse(close?.asOf)>Date.parse(current.asOf))&&close?close:current;
      if(q){
        const timestamp=new Date(q.asOf);cell.innerHTML=`<b>${esc(number(q.price,market.pipSize<.001?5:market.pipSize<.1?3:2))}</b><small>${esc(q.source)} · ${esc(q.status||'indicative')}</small><time datetime="${esc(timestamp.toISOString())}" title="${esc(timestamp.toISOString())}">${esc(timestamp.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</time>`;
      }else{const code=quoteFailures.get(market.id);cell.textContent=code==='QUOTE_BUDGET'?'Quote queued · provider budget':quoteAttemptAt?'Quote unavailable':'Quote pending';}
    }
    const current=marketQuotes.get(state.symbol),close=archiveCloses.get(state.symbol);
    const displayed=(!current||Date.parse(close?.asOf)>Date.parse(current.asOf))&&close?close:current;
    $('quoteStatus').textContent=displayed?`${displayed.source} · ${number(displayed.price,5)} · ${new Date(displayed.asOf).toLocaleString()} · ${displayed.status||'indicative'}`:state.bars?.length?'Live quote unavailable. Loaded historical data remains available.':'Live quote unavailable. Historical data has not been loaded.';
  }
  function scheduleQuoteRefresh(delay=65000) {
    window.clearTimeout(quoteRefreshTimer);if(quotesUnconfigured)return;
    quoteRefreshTimer=window.setTimeout(()=>{if(document.hidden||state.busy){scheduleQuoteRefresh(15000);return;}refreshMarketQuotes();},delay);
  }
  async function refreshMarketQuotes() {
    renderMarketQuotes();if(quoteRequest||quotesUnconfigured||Date.now()-quoteAttemptAt<65000)return quoteRequest;
    quoteAttemptAt=Date.now();
    // One HTTP bulk request; server owns the provider-wide credit budget. Oldest/missing first.
    const ordered=[...Q.SYMBOLS].sort((a,b)=>(Date.parse(marketQuotes.get(a.id)?.fetchedAt||'')||0)-(Date.parse(marketQuotes.get(b.id)?.fetchedAt||'')||0));
    quoteRequest=(async()=>{
      try{
        const data=await api('/quotes?'+new URLSearchParams({symbols:ordered.map(s=>s.id).join(',')}));
        quoteFailures.clear();for(const [id,error]of Object.entries(data.errors||{}))quoteFailures.set(id,error.code||'QUOTE_UNAVAILABLE');
        quotesUnconfigured=data.configured===false||ordered.every(s=>quoteFailures.get(s.id)==='QUOTES_NOT_CONFIGURED');
        const received=new Set();for(const q of data.quotes||[]){
          const market=Q.SYMBOLS.find(s=>s.id===q.symbol||s.label===q.symbol),timestamp=Date.parse(q.asOf||q.timestamp);
          if(!market||!Number.isFinite(q.price)||q.price<=0||!Number.isFinite(timestamp)||timestamp>Date.now()+60000||typeof q.source!=='string')continue;
          marketQuotes.set(market.id,{...q,asOf:new Date(timestamp).toISOString()});received.add(market.id);
        }
        for(const [id,q]of marketQuotes)if(!received.has(id))marketQuotes.set(id,{...q,status:'stale'});
      }catch{for(const [id,q]of marketQuotes)marketQuotes.set(id,{...q,status:'stale'});}
      finally{quoteRequest=null;renderMarketQuotes();scheduleQuoteRefresh();}
    })();return quoteRequest;
  }
  async function refreshContext() {
    const requestedSymbol=state.symbol;state.events=[];renderMarketQuotes();await Promise.allSettled([loadCalendar().catch(e=>{if(state.symbol!==requestedSymbol)return;$('calendarStatus').textContent=/QUANT_.*KEY|not.*import|importer/i.test(e.message)?'Verified calendar history is not configured for this range. News research needs recorded releases.':e.message;$('upcomingEvents').replaceChildren();}),loadHeadlines(),refreshMarketQuotes()]);
  }
  // Saved work is isolated by resolved Firebase identity. Guest records never auto-migrate.
  let identityTask, identityReady=false, identityVersion=0, localReadFailed=false;
  function storageKey(uid=state.uid) {return `fynx.quant.workspace.v1.${uid?'user.'+encodeURIComponent(uid):'guest'}`;}
  function cleanStrategy(input) {
    const raw={...input,params:input.params?Object.fromEntries(Object.entries(input.params).filter(([,v])=>v!==undefined)):undefined};
    const item=Q.validateStrategy(raw);item.id=input.id||crypto.randomUUID();item.name=item.name.slice(0,100);
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(item.id))throw new Error('A saved strategy has an invalid ID.');
    if(!Q.SYMBOLS.some(s=>s.id===item.symbol))throw new Error(`Unsupported saved market: ${item.symbol}.`);
    if(input.provenance&&typeof input.provenance==='object'&&!Array.isArray(input.provenance)) {
      const source=input.provenance;item.provenance={};
      for(const k of ['source','from','to','updatedAt'])if(typeof source[k]==='string')item.provenance[k]=source[k].slice(0,300);
      if(Array.isArray(source.warnings))item.provenance.warnings=source.warnings.filter(x=>typeof x==='string').slice(0,10).map(x=>x.slice(0,1000));
    }
    return item;
  }
  function cleanPortfolio(input) {
    if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.name!=='string'||!input.name.trim()||input.name.length>100)throw new Error('A saved portfolio needs a name of 1–100 characters.');
    if(!Array.isArray(input.sleeves)||!input.sleeves.length||input.sleeves.length>50)throw new Error('A saved portfolio needs 1–50 strategy sleeves.');
    const method=input.method||input.options?.method||'equal-risk';if(!['equal-risk','equal-weight','inverse-volatility'].includes(method))throw new Error('Invalid saved portfolio weighting.');
    const sleeves=input.sleeves.map(s=>{const row=Q.validateStrategy({name:s.name,symbol:'CUSTOM',timeframe:'D1',returns:s.returns});return {name:row.name,returns:row.returns};});
    const id=input.id||crypto.randomUUID();if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new Error('A saved portfolio has an invalid ID.');
    return {id,name:input.name.trim(),sleeves,method,provenance:{source:'saved-return-series',warnings:['Saved portfolio snapshots contain daily returns. Rebuilding from a snapshot uses the daily-data intraday buffer.']}};
  }
  function readWorkspace(text) {
    let data;try{data=JSON.parse(text);}catch{throw new Error('Invalid workspace JSON.');}
    if(Array.isArray(data))data={version:1,strategies:data,portfolios:[]};
    if(data?.version!==1||!Array.isArray(data.strategies)||!Array.isArray(data.portfolios??[]))throw new Error('Expected a version 1 workspace with strategies and portfolios.');
    if(data.strategies.length>100||(data.portfolios||[]).length>100)throw new Error('A workspace can contain up to 100 strategies and 100 portfolios.');
    return {version:1,strategies:data.strategies.map(cleanStrategy),portfolios:(data.portfolios||[]).map(cleanPortfolio)};
  }
  function renderSavedPortfolios() {
    const select=$('savedPortfolio');if(!select)return;const selected=select.value;
    select.innerHTML='<option value="">Choose a saved portfolio</option>'+state.savedPortfolios.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${p.sleeves.length} sleeves</option>`).join('');
    if(state.savedPortfolios.some(p=>p.id===selected))select.value=selected;
    $('loadPortfolio').disabled=state.busy||!state.savedPortfolios.length;
  }
  function readLocal() {
    localReadFailed=false;
    try{const raw=localStorage.getItem(storageKey());const data=raw?readWorkspace(raw):{strategies:[],portfolios:[]};state.saved=data.strategies;state.savedPortfolios=data.portfolios;}
    catch{state.saved=[];state.savedPortfolios=[];localReadFailed=true;$('storageStatus').textContent='Stored workspace is invalid. Export JSON to recover the original file; it has not been overwritten.';}
    renderSleeves();renderSavedPortfolios();
  }
  function persist(owner) {
    if(owner)assertOwner(owner);
    if(localReadFailed)throw new Error('Stored workspace could not be validated. Export JSON to recover it before replacing it with a validated import.');
    try{localStorage.setItem(storageKey(),JSON.stringify({version:1,strategies:state.saved,portfolios:state.savedPortfolios}));}
    catch{throw new Error('Device storage is full or disabled. Export JSON to keep your strategies.');}
  }
  function assertOwner(owner) {
    if(owner.version!==identityVersion||owner.uid!==state.uid||(state.auth?.currentUser?.uid||null)!==owner.uid)throw new Error('Your account changed. The previous operation was stopped; open the current account’s saved workspace again.');
  }
  async function workspaceOwner() {if(identityTask)await identityTask;if(!identityReady)throw new Error('Account identity is still loading. Try again in a moment.');const owner={uid:state.uid,version:identityVersion};assertOwner(owner);return owner;}
  async function authHeaders(owner) {
    assertOwner(owner);const user=state.auth?.currentUser;if(!user||user.uid!==owner.uid)throw new Error('Sign in to sync your private strategies.');
    const token=await user.getIdToken();assertOwner(owner);return {Authorization:`Bearer ${token}`};
  }
  async function syncSaved(owner) {
    if(!owner.uid)return;
    const headers=await authHeaders(owner);const [strategies,portfolios]=await Promise.all([api('/strategies',{headers}),api('/portfolios',{headers})]);assertOwner(owner);
    const merge=(local,remote,validate)=>{const rows=new Map(local.map(s=>[s.id,s]));remote.forEach(s=>{const clean=validate(s);if(!rows.has(clean.id))rows.set(clean.id,clean);});if(rows.size>100)throw new Error('Saved workspace exceeds 100 records. Export a backup and reduce the saved items.');return [...rows.values()];};
    const nextStrategies=merge(state.saved,strategies.strategies||strategies.items||[],cleanStrategy),nextPortfolios=merge(state.savedPortfolios,portfolios.portfolios||portfolios.items||[],cleanPortfolio);
    state.saved=nextStrategies;state.savedPortfolios=nextPortfolios;persist(owner);renderSleeves();renderSavedPortfolios();
  }
  function changeIdentity(uid) {
    if(identityReady&&state.uid===uid)return;
    const replacingIdentity=identityReady;identityVersion++;state.uid=uid;identityReady=true;
    if(replacingIdentity){state.jobAbort?.abort();state.cancelled=true;state.worker?.terminate();state.reject?.(new Error('Account changed; calculation cancelled.'));state.worker=null;state.reject=null;}
    state.sleeves=[];state.portfolioInputs=[];state.portfolio=null;if(replacingIdentity)invalidate();$('csvNote').textContent='';
    readLocal();if(!localReadFailed)$('storageStatus').textContent=uid?'Signed in · this account’s private workspace. Guest work remains separate.':'Guest workspace · saved only on this device. Sign in from Profile for account sync.';
  }
  function initializeIdentity() {
    $('storageStatus').textContent='Checking account identity…';
    identityTask=(async()=>{
      try{
        const [{auth},{onAuthStateChanged}]=await Promise.all([import('/auth/firebase.js'),import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')]);
        state.auth=auth;await auth.authStateReady();changeIdentity(auth.currentUser?.uid||null);
        onAuthStateChanged(auth,user=>{
          if(!identityReady||(user?.uid||null)!==state.uid){changeIdentity(user?.uid||null);const owner={uid:state.uid,version:identityVersion};syncSaved(owner).catch(e=>{if(owner.version===identityVersion)$('storageStatus').textContent=`Account workspace loaded on this device. Cloud sync unavailable: ${e.message}`;});}
        });
        const owner={uid:state.uid,version:identityVersion};
        try{await syncSaved(owner);if(owner.uid&&!localReadFailed)$('storageStatus').textContent='Signed in · private strategies and portfolios loaded from your FYNX account.';}
        catch(e){if(owner.version===identityVersion)$('storageStatus').textContent=`This account’s device workspace is available. Cloud sync unavailable: ${e.message}`;}
      }catch{state.auth=null;changeIdentity(null);if(!localReadFailed)$('storageStatus').textContent='Guest workspace · account sign-in is unavailable; device saves and JSON export work.';}
      if(location.hash==='#saved-strategies'){showPanel('port');attachSavedSleeves();}
    })();return identityTask;
  }
  async function saveRecord(type,record,owner) {
    assertOwner(owner);if(localReadFailed)throw new Error('Export the invalid stored file before replacing it with a validated import.');if(new Blob([JSON.stringify(record)]).size>1000000)throw new Error('This saved item exceeds 1 MB. Use a smaller return history and keep an external JSON backup.');
    const key=type==='strategies'?'saved':'savedPortfolios';if(state[key].length>=100)throw new Error('Save limit is 100 records. Export a backup before adding more.');
    state[key].push(record);persist(owner);renderSleeves();renderSavedPortfolios();
    if(owner.uid){try{const headers=await authHeaders(owner);await api('/'+type,{method:'POST',headers,body:JSON.stringify(record)});assertOwner(owner);}
      catch(error){assertOwner(owner);throw new Error(`Saved to this account’s device workspace; cloud save failed: ${error.message}`);}}
  }
  async function saveStrategy() {
    const owner=await workspaceOwner();if(!state.backtest||!state.tested)throw new Error('Run a backtest with these settings before saving.');
    const record=cleanStrategy({id:crypto.randomUUID(),name:$('strategyName').value.trim()||`ATR ${symbol().label}`,...state.tested});
    await saveRecord('strategies',record,owner);log(owner.uid?'Strategy saved to your private FYNX profile.':'Strategy saved on this device. Export JSON for a portable backup.');
  }
  function attachSavedSleeves() {
    portfolioSelectionTouched=true;
    const previous=new Set(state.sleeves.map(s=>s.id));state.saved.forEach(s=>{if(!previous.has(s.id)){state.sleeves.push(s);previous.add(s.id);}});
    renderSleeves();document.querySelectorAll('#sleeves input[value^="custom-"]').forEach(i=>i.checked=true);invalidatePortfolio();
  }
  async function loadSaved() {
    const owner=await workspaceOwner();let warning='';try{await syncSaved(owner);}catch(error){assertOwner(owner);warning=` Cloud sync unavailable: ${error.message}`;}
    attachSavedSleeves();renderSavedPortfolios();
    log((state.saved.length?`Loaded ${state.saved.length} saved strategies. Build the portfolio to recompute their available history.`:'No saved strategies yet. Save a backtest or import a returns CSV.')+warning,!!warning);
  }
  async function loadSavedPortfolio() {
    const owner=await workspaceOwner();assertOwner(owner);const item=state.savedPortfolios.find(p=>p.id===$('savedPortfolio').value);if(!item)throw new Error('Choose a saved portfolio first.');
    portfolioSelectionTouched=true;state.sleeves=item.sleeves.map((s,i)=>({...s,id:`portfolio-${item.id}-${i}`}));invalidatePortfolio();$('weighting').value=item.method;
    renderSleeves();document.querySelectorAll('#sleeves input').forEach(i=>i.checked=i.value.startsWith('custom-'));
    await runPortfolio();assertOwner(owner);log(`Restored ${item.name}. ${item.provenance?.warnings?.join(' ')||''}`);
  }
  function download(name,text,mime='application/json') {const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  async function generateEA() {
    showPanel('dep');if(!state.tested)throw new Error('Run a backtest first. Exports use the settings of a completed test.');
    state.ea=Q.generateEA({platform:$('eaPlatform').value,...state.tested,dailyLossPct:value('eaDailyGuard'),maxLossPct:value('eaMaxGuard'),initialBalance:value('accountSize'),ruleId:$('ruleId').value});
    $('ea').textContent=state.ea.source;$('ea').hidden=false;$('eaNotes').textContent=state.ea.notes.join(' ');log('Source generated from the completed backtest. Compile and validate it in your trading platform.');
  }
  const actions={backtest:runBacktest,optimize:runOptimize,portfolio:runPortfolio,montecarlo:runMonteCarlo,ftmo:runFtmo,deploy:generateEA};
  async function ask(text) {
    const command=Q.parseAsk(text,{symbol:state.symbol,timeframe:$('timeframe').value,years:value('historyYears')});
    state.symbol=command.symbol;selectStrategyModel(/\b(news|nfp|cpi|fomc|gdp)\b/i.test(text)?'news':'breakout');$('timeframe').value=command.timeframe;$('historyYears').value=command.years;if(command.paths)$('paths').value=command.paths;
    updateRange();state.bars=null;invalidate();renderMarkets();renderSleeves();refreshContext();log(command.warnings.join(' '));
    for(const step of command.steps){if(state.cancelled)break;showPanel(steps[step]);await actions[step]();}
  }
  function renderMarkets() {
    $('mkts').innerHTML=Q.SYMBOLS.map(s=>`<button type="button" class="mkt ${s.id===state.symbol?'on':''}" data-market="${s.id}" aria-pressed="${s.id===state.symbol}"><span class="mkt-identity"><span>${esc(s.label)}</span><small class="${marketChanges.get(s.id)?.className||''}" title="${marketChanges.get(s.id)?.title||'One-year historical change'}">${marketChanges.get(s.id)?.text||'1y unavailable'}</small></span><span class="mkt-quote" data-market-quote="${s.id}">Quote pending</span></button>`).join('');renderMarketQuotes();
  }
  async function loadMarketSummary() {
    if(!window.FynxQuantArchive)return;
    try {
      const markets=await window.FynxQuantArchive.summary();
      for(const m of markets){
        archiveCloses.set(m.symbol,{source:m.source,price:m.price,asOf:m.asOf,status:'historical daily close'});
        const cell=document.querySelector(`[data-market="${m.symbol}"] small`);
        if(!cell||!Number.isFinite(m.yearChangePct)||!Number.isFinite(Date.parse(m.yearBaseAsOf)))continue;
        const item={text:`${m.yearChangePct>=0?'+':''}${number(m.yearChangePct,1)}% 1y`,className:m.yearChangePct>=0?'up':'down',title:`${m.yearBaseAsOf.slice(0,10)} to ${m.asOf.slice(0,10)} · ${m.source} historical closes`};
        marketChanges.set(m.symbol,item);cell.textContent=item.text;cell.className=item.className;cell.title=item.title;
      }
      renderMarketQuotes();
    } catch { /* Quotes and selected market history refresh independently. */ }
  }
  $('mkts').addEventListener('click',event=>{const b=event.target.closest('[data-market]');if(!b||state.busy)return;work(async()=>{state.symbol=b.dataset.market;selectStrategyModel('breakout');renderMarkets();renderSleeves();refreshContext();await loadData();showPanel('bt');});});
  document.querySelectorAll('#steps button').forEach(b=>{b.addEventListener('click',()=>{if(!b.disabled)showPanel(b.dataset.p);});b.addEventListener('keydown',e=>{if(b.disabled)return;if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('#steps button')];const index=tabs.indexOf(b);const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;showPanel(tabs[next].dataset.p);tabs[next].focus();});});
  for(const [id,action] of [['runBt',runBacktest],['runOpt',runOptimize],['runPort',runPortfolio],['runMc',runMonteCarlo],['runFtmo',runFtmo],['genEa',generateEA],['loadData',loadData],['saveStrategy',saveStrategy],['loadSaved',loadSaved]])$(id).onclick=()=>work(action);
  $('cancelJob').onclick=()=>{const job=state.serverJob;state.cancelled=true;state.jobAbort?.abort();state.worker?.terminate();state.reject?.(new Error('Calculation cancelled.'));state.worker=null;state.reject=null;if(job)api('/jobs/'+encodeURIComponent(job),{method:'DELETE',signal:new AbortController().signal}).catch(()=>{});invalidate();log('Cancellation requested.');};
  $('applyBest').onclick=()=>{if(!state.optimized?.best)return;const best=state.optimized.best;$('K').value=best.entryK;$('S').value=best.stopS;invalidate();showPanel('bt');log('Best training settings applied. Run a fresh backtest.');};
  $('surfaceView').onchange=()=>work(renderSurface);
  $('askForm').onsubmit=e=>{e.preventDefault();work(()=>ask($('ask').value));};document.querySelectorAll('.chips [data-q]').forEach(b=>b.onclick=()=>{$('ask').value=b.dataset.q;work(()=>ask(b.dataset.q));});
  $('newsMkt').onclick=()=>work(async()=>{selectStrategyModel('news');state.events=[];invalidate();showPanel('bt');await runBacktest();});
  $('studyEvents').onclick=()=>work(async()=>{showPanel('bt');await ensureData();await loadCalendar(true);const result=await calculate('eventstudy',{bars:state.bars,events:state.events,options:{mode:$('timeframe').value==='D1'?'daily':'intraday',currencies:symbol().currencies,eventType:$('eventType').value,windowMinutes:value('newsWindow')}});$('eventStudy').innerHTML='<h3>Event study · absolute moves</h3><p class="note">'+esc(result.notes.join(' '))+'</p><div class="table-scroll"><table><thead><tr><th>Event type</th><th>Observations</th><th>Mean absolute move</th></tr></thead><tbody><tr><td>All event days</td><td>'+result.eventDays+'</td><td>'+pct(result.averageEventMove)+'</td></tr><tr><td>Normal days</td><td>'+result.normalDays+'</td><td>'+pct(result.averageNormalMove)+'</td></tr>'+result.byType.map(r=>'<tr><td>'+esc(r.type)+'</td><td>'+r.count+'</td><td>'+pct(r.averageAbsoluteMove)+'</td></tr>').join('')+'</tbody></table></div>';log('Event study computed from verified release timestamps.');});
  $('historyYears').onchange=()=>{try{updateRange();state.bars=null;state.events=[];invalidate();$('dataPill').textContent='Range changed · refresh data';log('History changed. Refresh data before running new research.');}catch(e){log(e.message,true);}};
  ['timeframe','historyFrom','historyTo'].forEach(id=>$(id).onchange=()=>{state.bars=null;state.events=[];invalidate();$('dataPill').textContent='Range changed · refresh data';log('History changed. Results from the previous range were cleared.');});
  ['N','AP','K','S','TP','H','C','R','spread','slippage','newsWindow','eventType','meanLookback','meanEntryZ','executionMode'].forEach(id=>{for(const event of ['input','change'])$(id).addEventListener(event,()=>{invalidate();log('Strategy settings changed. Run a new backtest.');});});
  $('strategyModel').onchange=()=>{selectStrategyModel($('strategyModel').value);invalidate();log('Strategy model changed. Run a new backtest.');};
  ['metric','entryValues','stopValues'].forEach(id=>{for(const event of ['input','change'])$(id).addEventListener(event,()=>{invalidateOptimization();log('Optimization settings changed. Build a new surface.');});});
  $('sleeves').onchange=()=>{portfolioSelectionTouched=true;invalidatePortfolio();};$('weighting').onchange=invalidatePortfolio;
  ['paths','mcDays'].forEach(id=>{for(const event of ['input','change'])$(id).addEventListener(event,invalidateMonteCarlo);});
  ['attempts','fDays','fScale','fBuf'].forEach(id=>{for(const event of ['input','change'])$(id).addEventListener(event,invalidateFtmo);});
  $('seed').addEventListener('input',()=>{invalidateMonteCarlo();invalidateFtmo();});
  function updateRuleSummary() {
    const r=Q.FTMO_RULES[$('ruleId').value],size=Number($('accountSize').value)/1000;
    $('ftmoRules').textContent=`${r.label}: target ${r.phaseTargets.map(pct).join(' / ')}, daily loss ${pct(r.dailyLoss)}, ${r.trailing?'end-of-day trailing':'static'} max loss ${pct(r.maxLoss)}, ${r.minTradingDays} minimum trading days. ${r.bestDayBasis?'Best day ≤ 50% of '+(r.bestDayBasis==='net-profit'?'net profit.':'positive-day profit.'):'No consistency rule.'} Simulated horizon is not an FTMO deadline.`;
    $('p-ftmo').querySelector('h2').textContent=`FTMO ${size}k · ${$('ruleId').value==='2-step'?'2-Step':'1-Step'} check`;
    $('tab-ftmo').innerHTML=`<i>05</i>FTMO ${size}k`;invalidateFtmo();
  }
  $('ruleId').onchange=()=>{updateRuleSummary();invalidateEA();};$('accountSize').onchange=()=>{updateRuleSummary();invalidateEA();};
  $('csv').onchange=()=>work(async()=>{
    const owner=await workspaceOwner(),file=$('csv').files[0];if(!file)return;if(file.size>5*1024*1024)throw new Error('CSV files must be under 5 MB.');
    const text=await file.text();assertOwner(owner);
    const imported=Q.importReturnsCSV(text,{name:file.name.replace(/\.csv$/i,'').slice(0,100),initialEquity:$('csvEquity').value?value('csvEquity'):undefined});
    const record=cleanStrategy({id:crypto.randomUUID(),name:imported.name,symbol:state.symbol,timeframe:'D1',returns:imported.returns,provenance:{source:imported.source,warnings:imported.warnings}});
    let warning='';try{await saveRecord('strategies',record,owner);}catch(error){assertOwner(owner);if(!state.saved.some(s=>s.id===record.id))throw error;warning=error.message;}
    portfolioSelectionTouched=true;state.sleeves.push(record);renderSleeves();document.querySelector('#sleeves input[value="custom-'+(state.sleeves.length-1)+'"]').checked=true;invalidatePortfolio();
    $('csvNote').textContent=`${imported.returns.length} daily observations imported for ${symbol().label}. ${imported.warnings.join(' ')}`;
    log(warning||`Returns imported and saved ${owner.uid?'to your account':'on this device'}. Dates and values passed validation.`,!!warning);$('csv').value='';
  });
  $('savePortfolio').onclick=()=>work(async()=>{
    const owner=await workspaceOwner();if(!state.portfolio)throw new Error('Build the portfolio before saving.');
    const item=cleanPortfolio({id:crypto.randomUUID(),name:`Portfolio ${new Date().toLocaleDateString()}`,sleeves:state.portfolioInputs,method:$('weighting').value});
    await saveRecord('portfolios',item,owner);$('savedPortfolio').value=item.id;log(`Portfolio saved ${owner.uid?'to your account':'on this device'}. The saved return snapshot can be restored from Saved portfolios.`);
  });
  $('loadPortfolio').onclick=()=>work(loadSavedPortfolio);
  $('exportWorkspace').onclick=()=>work(async()=>{
    const owner=await workspaceOwner();assertOwner(owner);
    if(localReadFailed){download('fynx-quant-recovery.json',localStorage.getItem(storageKey())||'{}');log('Original stored file exported for recovery. Its contents were not accepted as a valid workspace.');return;}
    const data=readWorkspace(JSON.stringify({version:1,strategies:state.saved,portfolios:state.savedPortfolios}));
    download('fynx-quant-workspace.json',JSON.stringify(data,null,2));log('Strategies and portfolios exported as a version 1 workspace.');
  });
  $('importWorkspace').onchange=()=>work(async()=>{
    const owner=await workspaceOwner(),file=$('importWorkspace').files[0];if(!file)return;if(file.size>5*1024*1024)throw new Error('Workspace files must be under 5 MB.');
    const text=await file.text();assertOwner(owner);const data=readWorkspace(text);
    if(state.saved.length+data.strategies.length>100||state.savedPortfolios.length+data.portfolios.length>100)throw new Error('Import would exceed 100 strategies or 100 portfolios.');
    // Imports are explicit copies into the currently selected identity, never an implicit guest merge.
    data.strategies.forEach(s=>s.id=crypto.randomUUID());data.portfolios.forEach(p=>p.id=crypto.randomUUID());
    for(const item of [...data.strategies,...data.portfolios])if(new Blob([JSON.stringify(item)]).size>1000000)throw new Error('A workspace item exceeds the 1 MB save limit.');
    localReadFailed=false;state.saved.push(...data.strategies);state.savedPortfolios.push(...data.portfolios);persist(owner);renderSleeves();renderSavedPortfolios();
    let failed=0;if(owner.uid){for(const [type,items] of [['strategies',data.strategies],['portfolios',data.portfolios]])for(const item of items){assertOwner(owner);try{const headers=await authHeaders(owner);await api('/'+type,{method:'POST',headers,body:JSON.stringify(item)});assertOwner(owner);}catch(error){assertOwner(owner);failed++;}}}
    attachSavedSleeves();$('importWorkspace').value='';log(`Imported ${data.strategies.length} strategies and ${data.portfolios.length} portfolios into ${owner.uid?'this account’s':'the guest'} workspace.${failed?` ${failed} cloud saves failed; the device copies are retained.`:''}`,failed>0);
  });
  $('downloadEa').onclick=()=>{if(state.ea)download(state.ea.filename,state.ea.source,state.ea.mime);};$('copyEa').onclick=()=>work(async()=>{if(!state.ea)return;await navigator.clipboard.writeText(state.ea.source);log('Source copied.');});
  ['eaPlatform','eaDailyGuard','eaMaxGuard'].forEach(id=>{for(const event of ['input','change'])$(id).addEventListener(event,invalidateEA);});
  window.addEventListener('pagehide',()=>{state.worker?.terminate();window.clearTimeout(quoteRefreshTimer);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!state.busy)refreshMarketQuotes();});
  const deepLink=new URLSearchParams(location.search),deepSymbol=(deepLink.get('symbol')||'').toUpperCase().replace('/','');if(Q.SYMBOLS.some(s=>s.id===deepSymbol))state.symbol=deepSymbol;
  async function preloadStrategy(){const id=deepLink.get('strategy');if(!id)return;if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new Error('The linked strategy ID is invalid.');await identityTask;const item=state.saved.find(s=>s.id===id)||(Q.EDGE_DEFAULT_STRATEGIES||[]).find(s=>s.id===id);if(!item)throw new Error('The linked strategy is not in this account’s saved workspace. Sign in to its owner account.');if(!item.params)throw new Error('This saved return series has no executable strategy parameters. Open it from My strategies in Portfolio.');const p=item.params;selectStrategyModel(p.strategy||item.kind||'breakout');if(!deepSymbol&&item.symbol)state.symbol=item.symbol;$('timeframe').value=item.timeframe||'D1';$('executionMode').value=['close','ohlc'].includes(p.mode)?p.mode:'auto';$('strategyName').value=item.name;
    const fields={lookback:'N',atrPeriod:'AP',entryK:'K',stopS:'S',targetTP:'TP',maxHold:'H',costPips:'C',riskPct:'R',spreadPips:'spread',slippagePips:'slippage',eventType:'eventType',newsWindowMinutes:'newsWindow',meanLookback:'meanLookback',meanEntryZ:'meanEntryZ'};for(const [key,id]of Object.entries(fields))if(p[key]!==undefined)$(id).value=p[key];renderMarkets();renderSleeves();refreshContext();}
  updateRange();renderMarkets();renderSleeves();if(matchMedia('(max-width:700px)').matches)$('surfaceView').value='heatmap';
  initializeIdentity();refreshContext();loadMarketSummary();
  work(async()=>{try{if(deepLink.has('symbol')&&!Q.SYMBOLS.some(s=>s.id===deepSymbol))throw new Error('The linked market is unsupported.');await preloadStrategy();await loadData();if(deepLink.has('strategy'))log('Linked strategy settings loaded. Run a fresh backtest to calculate this market.');if(location.hash==='#dep')showPanel('dep');}catch(error){$('dataPill').textContent='Requested research unavailable';$('dataNote').textContent=error.message;throw error;}});
})();
