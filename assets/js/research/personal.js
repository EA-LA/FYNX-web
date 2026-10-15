import {C,$,escape,number,money,percent,tone,time,ageLabel,errorHTML,empty,toast,options,metric,quotes,quoteCache} from './shared.js';
import {store} from './store.js';
let portfolioBusy=false,alertBusy=false,lastCheck='';
export function renderPortfolio(){
  const p=C.portfolio(store.state.holdings,store.state.cash,quoteCache);
  if(document.activeElement!==$('#portfolio-cash'))$('#portfolio-cash').value=store.state.cash;
  $('#portfolio-output').innerHTML=`<div class="metric-grid">${metric('Total value',money(p.total),p.complete?'Cash + marked positions':'Incomplete · missing marks')}${metric('Positions marked',money(p.markedValue),`${p.rows.length-p.missing.length} of ${p.rows.length} positions`)}${metric('Unrealized P&L',money(p.unrealized),'Priced positions only',tone(p.unrealized))}${metric('Cash balance',money(p.cash),'Manually recorded USD')}</div>${p.missing.length?`<div class="notice">Total value is incomplete. A current USD mark is unavailable for ${[...new Set(p.missing)].map(escape).join(', ')}. Refresh marks to retry. Unpriced positions are not counted as zero.</div>`:''}${p.rows.length?`<div class="table-caption"><h3>Your positions</h3><span class="small muted">${p.rows.length} / 100 positions · USD</span></div><div class="table-wrap"><table class="research-table"><thead><tr><th>Instrument</th><th class="num">Units / avg cost</th><th class="num">Mark</th><th class="num">Value</th><th class="num">Unrealized P&L</th><th>Manage</th></tr></thead><tbody>${p.rows.map(h=>`<tr><td><strong>${escape(h.symbol)}</strong><small>${escape(C.symbolMap[h.symbol].name)}</small></td><td class="num">${number(h.units,6)}<small>${money(h.averageCost)} / unit</small></td><td class="num">${h.value===null?'—':money(h.quote.price)}<small>${h.quote?time(h.quote.asOf)+' · '+ageLabel(h.quote):'No validated quote'}</small></td><td class="num">${money(h.value)}<small>Cost ${money(h.cost)}</small></td><td class="num ${tone(h.profit)}">${money(h.profit)}<small>${h.cost>0&&h.profit!==null?percent(h.profit/h.cost*100):'—'}</small></td><td><button data-edit-holding="${h.id}">Edit</button><button data-delete-holding="${h.id}">Remove</button></td></tr>`).join('')}</tbody></table></div><p class="method-note">USD quotes are accepted up to four days old to cover market closures. Every mark includes its observation time. P&L excludes realized trades, dividends, fees and taxes.</p>`:empty('Start with your first position','Add an instrument, its units and your average cost. Your holdings stay in this browser.')}`;
}
export async function refreshPortfolio(){
  if(portfolioBusy)return;portfolioBusy=true;const scope=store.key;
  const button=$('#refresh-portfolio');button.disabled=true;button.textContent='Updating marks…';
  try {await quotes(store.state.holdings.map(h=>h.symbol));if(scope===store.key)renderPortfolio();}
  catch(error){if(scope===store.key)toast(error.message);}
  finally{portfolioBusy=false;button.disabled=false;button.textContent='Refresh marks ↻';}
}
options($('#holding-symbol'),a=>a.group!=='FX');
function clearHolding(){ $('#holding-form').reset();$('#holding-id').value='';$('#holding-form-title').textContent='ADD A POSITION';$('#cancel-holding').hidden=true; }
$('#cancel-holding').addEventListener('click',clearHolding);
$('#holding-form').addEventListener('submit',async event=>{
  event.preventDefault();const id=$('#holding-id').value;
  const holding={id:id||crypto.randomUUID(),symbol:$('#holding-symbol').value,units:Number($('#holding-units').value),averageCost:Number($('#holding-cost').value)};
  try {
    await store.transact(s=>{
      if(!id){if(s.holdings.length>=100)throw Error('A portfolio can contain up to 100 positions.');s.holdings.push(holding);}
      else {const index=s.holdings.findIndex(h=>h.id===id);if(index<0)throw Error('This position was removed in another tab. Add it again if needed.');s.holdings[index]=holding;}
    });clearHolding();toast('Position saved in this browser.');refreshPortfolio();
  }catch(error){toast(error.message);}
});
$('#cash-form').addEventListener('submit',async event=>{event.preventDefault();const cash=Number($('#portfolio-cash').value);try{await store.transact(s=>{s.cash=cash;});toast('Cash balance saved.');}catch(error){toast(error.message);}});
$('#portfolio-output').addEventListener('click',async event=>{
  const edit=event.target.dataset.editHolding,remove=event.target.dataset.deleteHolding;
  if(edit){const h=store.state.holdings.find(h=>h.id===edit);if(h){$('#holding-id').value=h.id;$('#holding-symbol').value=h.symbol;$('#holding-units').value=h.units;$('#holding-cost').value=h.averageCost;$('#holding-form-title').textContent='EDIT POSITION';$('#cancel-holding').hidden=false;$('#holding-units').focus();}}
  if(remove&&confirm('Remove this position from your manual portfolio?'))try{await store.transact(s=>{s.holdings=s.holdings.filter(h=>h.id!==remove);});if($('#holding-id').value===remove)clearHolding();toast('Position removed.');}catch(error){toast(error.message);}
});
$('#refresh-portfolio').addEventListener('click',refreshPortfolio);
const kindLabel={priceAbove:'price crosses above',priceBelow:'price crosses below',changeAbove:'change crosses above',changeBelow:'change crosses below'};
const threshold=a=>`${number(a.threshold,a.kind.startsWith('price')&&a.threshold<10?4:2)}${a.kind.startsWith('change')?'%':' '+(quoteCache[a.symbol]?.currency||({'JPY=X':'JPY','CAD=X':'CAD','CHF=X':'CHF'}[a.symbol]||'USD'))}`;
export function renderAlerts(){
  const s=store.state;
  $('#check-alerts').disabled=!store.ready||alertBusy;
  $('#alerts-output').innerHTML=`<div class="table-caption"><h3>Your alert rules</h3><span class="small muted">${s.alerts.filter(a=>a.enabled).length} armed · ${s.alerts.length} / 50 rules</span></div>${s.alerts.length?s.alerts.map(a=>`<div class="alert-card"><div><h3>${escape(a.symbol)} · ${kindLabel[a.kind]} ${threshold(a)}</h3><p>${a.triggeredAt?'Triggered '+time(a.triggeredAt):a.enabled?a.baseline?'Armed · baseline '+number(a.baseline.value,4)+' at '+time(a.baseline.asOf):'Armed · waiting for first fresh baseline':'Paused'}</p></div><div class="actions"><button data-toggle-alert="${a.id}">${a.enabled?'Pause':'Rearm'}</button><button data-delete-alert="${a.id}">Remove</button></div></div>`).join(''):empty('Watch a level that matters','Create a rule, then keep this page visible. It starts watching after the first fresh quote.')}<div class="table-caption"><h3>Recent crossings</h3><span class="small muted">Saved locally · last 100</span></div>${s.history.length?`<div class="table-wrap"><table class="research-table"><thead><tr><th>Observed</th><th>Instrument</th><th>Rule</th><th class="num">Crossing value</th></tr></thead><tbody>${[...s.history].reverse().map(h=>`<tr><td>${time(h.at)}</td><td>${escape(h.symbol)}</td><td>${kindLabel[h.kind]} ${threshold(h)}</td><td class="num">${number(h.value,4)}${h.kind.startsWith('change')?'%':''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="small muted">No crossing recorded yet.</p>'}`;
  $('#alert-status').textContent=lastCheck||('Notification' in window?`Browser notifications: ${Notification.permission}. In-page alerts are available.`:'Browser notifications are not supported. In-page alerts are available.');
}
options($('#alert-symbol'));
$('#alert-kind').addEventListener('change',()=>{
  const change=$('#alert-kind').value.startsWith('change'),input=$('#alert-threshold');
  input.min=change?'-100':'0.00000001';input.max=change?'10000':'1000000000000';
  $('#threshold-label').firstChild.textContent=change?'Threshold, %':'Threshold (quote currency)';
});
$('#alert-form').addEventListener('submit',async event=>{
  event.preventDefault();const rule={id:crypto.randomUUID(),symbol:$('#alert-symbol').value,kind:$('#alert-kind').value,threshold:Number($('#alert-threshold').value),enabled:true,baseline:null,triggeredAt:null};
  try{await store.transact(s=>{if(s.alerts.length>=50)throw Error('Remove a rule before adding more than 50 alerts.');s.alerts.push(rule);});$('#alert-threshold').value='';toast('Alert saved. The first fresh quote will set its baseline.');checkAlerts(true);}catch(error){toast(error.message);}
});
$('#alerts-output').addEventListener('click',async event=>{
  const toggle=event.target.dataset.toggleAlert,remove=event.target.dataset.deleteAlert;if(!toggle&&!remove)return;
  try{await store.transact(s=>{if(remove)s.alerts=s.alerts.filter(a=>a.id!==remove);else{const rule=s.alerts.find(a=>a.id===toggle);if(rule){rule.enabled=!rule.enabled;rule.baseline=null;rule.triggeredAt=null;}}});if(toggle)checkAlerts(true);}catch(error){toast(error.message);}
});
$('#notification-permission').addEventListener('click',async()=>{
  if(!('Notification' in window)){toast('This browser does not support notifications. Crossings will appear on this page.');return;}
  try{const permission=await Notification.requestPermission();lastCheck='';renderAlerts();toast(permission==='granted'?'Browser notifications enabled. Keep this page visible.':'In-page alerts remain available. You can change notification permissions in browser settings.');}catch{toast('Notifications are unavailable in this browser. In-page alerts remain active.');}
});
export async function checkAlerts(manual=false){
  if(alertBusy||document.visibilityState!=='visible'||!store.ready||store.readOnly)return;
  if(!navigator.locks&&!manual){lastCheck='Automatic checks unavailable in this browser. Use Check now.';renderAlerts();return;}
  const symbols=[...new Set(store.state.alerts.filter(a=>a.enabled).map(a=>a.symbol))];
  if(!symbols.length){if(manual){lastCheck='No armed alerts to check.';renderAlerts();}return;}
  alertBusy=true;$('#check-alerts').disabled=true;const scope=store.key;
  const run=async()=>{
    try {
      const data=await quotes(symbols);if(scope!==store.key||document.visibilityState!=='visible')return;
      const triggered=await store.transact(s=>{
        const events=[];
        s.alerts=s.alerts.map(rule=>{const next=C.advanceAlert(rule,data.quotes[rule.symbol]);if(next.triggered){const h={id:crypto.randomUUID(),symbol:rule.symbol,kind:rule.kind,threshold:rule.threshold,value:next.rule.baseline.value,at:next.rule.baseline.asOf};s.history.push(h);events.push(h);}return next.rule;});s.history=s.history.slice(-100);return events;
      },scope);
      if(scope!==store.key)return;
      for(const h of triggered){const message=`${h.symbol}: ${kindLabel[h.kind]} ${threshold(h)}. Observed ${number(h.value,4)}.`;toast(message);if('Notification' in window&&Notification.permission==='granted')try{new Notification('FYNX price alert',{body:message,tag:'fynx-'+h.id});}catch{/* In-page delivery remains visible. */}}
      const usable=Object.values(data.quotes).filter(q=>C.usableQuote(q,Date.now(),900000)).length;
      lastCheck=`Checked ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} · ${usable}/${symbols.length} fresh quotes. ${usable<symbols.length?'Older or unavailable quotes ignored.':''}`;renderAlerts();
    }catch(error){if(scope===store.key){lastCheck='Check failed. '+error.message;renderAlerts();if(manual)toast(error.message);}}
  };
  try{if(navigator.locks)await navigator.locks.request('alert-check:'+scope,{ifAvailable:true},lock=>lock?run():undefined);else await run();}
  finally{alertBusy=false;$('#check-alerts').disabled=false;}
}
$('#check-alerts').addEventListener('click',()=>checkAlerts(true));
setInterval(()=>checkAlerts(),60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkAlerts();});
let previousScope=null;
store.addEventListener('change',()=>{const changed=previousScope!==store.key;if(changed){previousScope=store.key;clearHolding();lastCheck='';}renderPortfolio();renderAlerts();if(changed){if(location.hash==='#portfolio')refreshPortfolio();checkAlerts();}});
