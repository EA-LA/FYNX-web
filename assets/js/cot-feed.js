/* Official weekly Legacy Futures Only observations, never synthetic positions. */
(() => {
 const host=document.getElementById('cotRows'),status=document.getElementById('cotStatus'),search=document.getElementById('cotSearch'),refresh=document.getElementById('cotRefresh');
 let rows=[],busy=false,reportDate=null,retrievedAt=null;
 const fields=['noncomm_positions_long_all','noncomm_positions_short_all','comm_positions_long_all','comm_positions_short_all','open_interest_all'];
 function summary(){return `${Date.now()-Date.parse(reportDate)>10*86400000?'Older report (over 10 days) — ':''}Positions as of ${reportDate.slice(0,10)} · ${rows.length} contracts · Retrieved ${new Date(retrievedAt).toLocaleString()} · Weekly CFTC Legacy Futures Only. Net positions = long minus short contracts.`;}
 const number=new Intl.NumberFormat(undefined,{signDisplay:'exceptZero'});
 function render(){
  host.replaceChildren();
  const filtered=rows.filter(r=>r.market_and_exchange_names.toLowerCase().includes(search.value.trim().toLowerCase()));
  for(const r of filtered){
   const tr=document.createElement('tr');
   for(const value of [r.market_and_exchange_names,number.format(Number(r.noncomm_positions_long_all)-Number(r.noncomm_positions_short_all)),number.format(Number(r.comm_positions_long_all)-Number(r.comm_positions_short_all)),Number(r.open_interest_all).toLocaleString()]){const td=document.createElement('td');td.textContent=value;tr.append(td);}host.append(tr);
  }
  if(rows.length&&!filtered.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='No matching contracts. Try a currency, commodity or exchange name.';tr.append(td);host.append(tr);}
 }
 async function request(params){const u=new URL('https://publicreporting.cftc.gov/resource/6dca-aqww.json');for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);const r=await fetch(u,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('CFTC unavailable');const data=await r.json();if(!Array.isArray(data))throw Error('Invalid report');return data;}
 async function load(){if(busy)return;busy=true;refresh.disabled=true;status.textContent='Loading the latest published CFTC report…';try{
  const latest=await request({'$select':'report_date_as_yyyy_mm_dd','$order':'report_date_as_yyyy_mm_dd DESC','$limit':'1'});
  const date=latest[0]?.report_date_as_yyyy_mm_dd;if(typeof date!=='string'||!/^\d{4}-\d\d-\d\dT[\d:.]+$/.test(date)||!Number.isFinite(Date.parse(date))||Date.parse(date)>Date.now())throw Error('Invalid report date');
  const result=[];
  for(let offset=0;offset<10000;offset+=1000){
   const page=await request({'$where':`report_date_as_yyyy_mm_dd='${date}'`,'$limit':'1000','$offset':String(offset),'$order':'market_and_exchange_names,cftc_contract_market_code','$select':'market_and_exchange_names,cftc_contract_market_code,report_date_as_yyyy_mm_dd,'+fields.join(',')});
   result.push(...page);if(page.length<1000)break;if(offset===9000)throw Error('Report exceeds supported size');
  }
  if(!result.length||result.some(r=>typeof r.market_and_exchange_names!=='string'||!r.market_and_exchange_names.trim()||r.report_date_as_yyyy_mm_dd!==date||fields.some(k=>typeof r[k]!=='string'||!/^\d+$/.test(r[k])||!Number.isSafeInteger(Number(r[k])))))throw Error('Invalid positions');
  rows=result;reportDate=date;retrievedAt=new Date().toISOString();render();status.textContent=summary();
 }catch(e){window.FynxMonitor?.report('feed','feed-load',e);status.textContent=rows.length?summary()+' Refresh failed — previous observations retained; check the official report.':'CFTC data is unavailable right now. Open the official report below or retry. No estimated positions are shown.';}finally{busy=false;refresh.disabled=false;}}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 window.addEventListener('pageshow',event=>{if(event.persisted)load();});
 search.addEventListener('input',render);refresh.addEventListener('click',load);load();
})();
