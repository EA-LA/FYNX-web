import {C,$,escape,number,money,percent,tone,time,errorHTML,empty,toast,download,options,metric,api} from './shared.js';
let history=null,result=null,loadID=0;
options($('#history-symbol'),a=>a.group!=='FX');$('#history-symbol').value='SPY';
function resetHistory(){history=null;result=null;$('#strategy-output').innerHTML=empty('Load your data first','A new data source clears the previous result, so every backtest uses the displayed history.');}
function showHistory(){
  $('#history-status').innerHTML=history?`${escape(history.symbol)} · ${history.bars.length.toLocaleString()} daily rows · ${history.bars[0].date} → ${history.bars.at(-1).date}<br>${history.adjusted?'Provider-adjusted USD prices; no separate dividend credit.':'User-supplied OHLC prices treated as USD. Adjustments depend on your file.'} ${history.omitted?`${history.omitted} incomplete/current-day rows omitted.`:''} ${history.sourceURL?`<a class="inline-link" href="${escape(history.sourceURL)}" target="_blank" rel="noopener">${escape(history.source)} ↗</a> · Retrieved ${time(history.fetchedAt)}`:escape(history.source)}`:'';
}
$('#history-form').addEventListener('submit',async event=>{
  event.preventDefault();const symbol=$('#history-symbol').value,id=++loadID;resetHistory();
  const button=event.target.querySelector('button');button.disabled=true;$('#history-status').textContent=`Loading ${symbol} adjusted daily history…`;
  try{const data=await api('history',{symbol});if(id!==loadID)return;C.validateBars(data.bars);history=data;showHistory();$('#strategy-output').innerHTML=empty('History is ready','Review your settings below, then run the backtest.');}
  catch(error){if(id===loadID)$('#history-status').innerHTML=errorHTML(error.message);}
  finally{button.disabled=false;}
});
$('#history-file').addEventListener('change',async event=>{
  const file=event.target.files[0],id=++loadID;event.target.value='';if(!file)return;resetHistory();
  try{if(file.size>3000000)throw Error('Use a CSV smaller than 3 MB.');const bars=C.parseCSV(await file.text());if(id!==loadID)return;history={symbol:file.name,bars,source:'Your CSV file · stays in this browser',adjusted:false,omitted:0};showHistory();$('#strategy-output').innerHTML=empty('Your CSV is ready','Review the strategy settings and run the simulation.');}
  catch(error){if(id===loadID)$('#history-status').innerHTML=errorHTML(error.message);}
});
function chart(points){
  const values=points.map(p=>p.equity),min=Math.min(...values),max=Math.max(...values),spread=Math.max(max-min,Math.abs(max)*0.01,1),bottom=min-spread*.1,top=max+spread*.1,w=760,h=210,pad=54;
  const coordinates=points.filter((_,i)=>i===0||i===points.length-1||i%Math.max(1,Math.ceil(points.length/800))===0).map(p=>{const i=points.indexOf(p);return `${(pad+i/(points.length-1)*(w-pad-8)).toFixed(2)},${(12+(top-p.equity)/(top-bottom)*(h-25)).toFixed(2)}`;}).join(' ');
  return `<div class="equity-chart"><div class="chart-title"><strong>Strategy equity</strong><span class="muted">USD · daily closing value</span></div><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Strategy equity from ${points[0].date} to ${points.at(-1).date}, ending at ${money(points.at(-1).equity)}"><title>Strategy equity over time</title>${[0,.5,1].map(t=>{const y=12+t*(h-25),value=top-t*(top-bottom);return `<line x1="${pad}" x2="${w}" y1="${y}" y2="${y}" stroke="var(--fynx-line)"/><text x="${pad-8}" y="${y+3}" text-anchor="end" fill="var(--fynx-muted)" font-size="9">${escape(new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(value))}</text>`;}).join('')}<polyline fill="none" stroke="var(--desk-positive)" stroke-width="2" stroke-linejoin="round" points="${coordinates}"/></svg><div class="chart-dates"><span>${points[0].date}</span><span>${points.at(-1).date}</span></div></div>`;
}
function renderResult(){
  const r=result;
  $('#strategy-output').innerHTML=`<div class="table-caption"><h3>${escape(history.symbol)} · SMA ${r.settings.fast} / ${r.settings.slow}</h3><span class="small muted">${r.points[0].date} → ${r.points.at(-1).date}</span></div><div class="metric-grid">${metric('Strategy return',percent(r.returnPercent),`Ending equity ${money(r.endingEquity)}`,tone(r.returnPercent))}${metric('Buy & hold return',percent((r.benchmarkEquity/r.settings.startingCash-1)*100),`Ending equity ${money(r.benchmarkEquity)}`)}${metric('Max closing drawdown',number(r.drawdownPercent)+'%','Daily closing equity',r.drawdownPercent>0?'negative':'')}${metric('Completed trades',String(r.trades.length),`Win rate ${r.winRate===null?'—':number(r.winRate)+'%'}`)}</div>${chart(r.points)}<p class="method-note">Run settings: ${money(r.settings.startingCash)} starting cash · ${r.settings.costBasisPoints} bps slippage each side · ${money(r.settings.commission)} commission each side. Total modeled strategy costs: ${money(r.totalCosts)}. Buy-and-hold uses the same tradable window and cost assumptions.</p><div class="table-caption"><h3>Trade ledger</h3><button class="text-button" id="export-backtest">Export full result</button></div>${r.trades.length?`<div class="table-wrap"><table class="research-table"><thead><tr><th>Entry → exit</th><th class="num">Entry fill</th><th class="num">Exit fill</th><th class="num">Net profit</th><th>Exit reason</th></tr></thead><tbody>${r.trades.slice(0,100).map(t=>`<tr><td>${t.entryDate}<small>→ ${t.exitDate}</small></td><td class="num">${money(t.entryPrice)}</td><td class="num">${money(t.exitPrice)}</td><td class="num ${tone(t.profit)}">${money(t.profit)}<small>${percent(t.returnPercent)}</small></td><td>${t.reason}</td></tr>`).join('')}</tbody></table></div>${r.trades.length>100?'<p class="small muted">Showing the first 100 trades. Export includes the full ledger and equity series.</p>':''}`:empty('No trade signals in this period','With these settings, the strategy stayed in cash. Try another period or parameter combination.')}`;
}
$('#strategy-form').addEventListener('submit',event=>{
  event.preventDefault();
  try {
    if(!history)throw Error('Load history or upload a CSV before running a backtest.');
    const settings={fast:Number($('#strategy-fast').value),slow:Number($('#strategy-slow').value),startingCash:Number($('#strategy-cash').value),costBasisPoints:Number($('#strategy-cost').value),commission:Number($('#strategy-commission').value)};
    result=C.backtest(history.bars,settings);renderResult();
  }catch(error){result=null;$('#strategy-output').innerHTML=errorHTML(error.message);}
});
$('#strategy-output').addEventListener('click',event=>{if(event.target.id==='export-backtest'&&result)download('fynx-strategy-result.json',JSON.stringify({version:1,instrument:history.symbol,source:history.source,sourceURL:history.sourceURL,adjusted:history.adjusted,generatedAt:new Date().toISOString(),...result},null,2));});
