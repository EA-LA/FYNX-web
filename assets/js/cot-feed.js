/* Official weekly Legacy Futures Only observations, never synthetic positions. */
(() => {
 const host=document.getElementById('cotRows'),status=document.getElementById('cotStatus'),search=document.getElementById('cotSearch'),refresh=document.getElementById('cotRefresh');
 let rows=[];
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
 async function request(params){const u=new URL('https://publicreporting.cftc.gov/resource/6dca-aqww.json');for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);const r=await fetch(u,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('CFTC unavailable');const data=await r.json();if(!Array.isArray(data)||!data.length)throw Error('Empty report');return data;}
 async function load(){refresh.disabled=true;status.textContent='Loading the latest published CFTC report…';try{
  const latest=await request({'$select':'report_date_as_yyyy_mm_dd','$order':'report_date_as_yyyy_mm_dd DESC','$limit':'1'});
  const date=latest[0].report_date_as_yyyy_mm_dd;if(!/^\d{4}-\d\d-\d\dT[\d:.]+$/.test(date))throw Error('Invalid report date');
  const result=await request({'$where':`report_date_as_yyyy_mm_dd='${date}'`,'$limit':'1000','$order':'market_and_exchange_names','$select':'market_and_exchange_names,noncomm_positions_long_all,noncomm_positions_short_all,comm_positions_long_all,comm_positions_short_all,open_interest_all'});
  rows=result.filter(r=>typeof r.market_and_exchange_names==='string'&&['noncomm_positions_long_all','noncomm_positions_short_all','comm_positions_long_all','comm_positions_short_all','open_interest_all'].every(k=>r[k]!==undefined&&Number.isFinite(Number(r[k]))));
  if(!rows.length)throw Error('Invalid positions');render();status.textContent=`Positions as of ${date.slice(0,10)} · ${rows.length} contracts · Weekly CFTC report. Net positions = long minus short contracts.`;
 }catch(e){window.FynxMonitor?.report('feed','feed-load',e);status.textContent=rows.length?'Refresh unavailable. Previously loaded observations remain below. Check the official report.':'CFTC data is unavailable right now. Open the official report below or retry. No estimated positions are shown.';}finally{refresh.disabled=false;}}
 search.addEventListener('input',render);refresh.addEventListener('click',load);load();
})();
