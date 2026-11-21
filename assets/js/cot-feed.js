/* Official weekly Legacy Futures Only observations, never synthetic positions. */
(() => {
 const host=document.getElementById('cotRows'),status=document.getElementById('cotStatus'),search=document.getElementById('cotSearch'),refresh=document.getElementById('cotRefresh'),exportButton=document.getElementById('cotExport'),exportStatus=document.getElementById('cotExportStatus'),savedOnly=document.getElementById('cotSavedOnly'),savedStatus=document.getElementById('cotSavedStatus');
 if(!host||!status||!search||!refresh||!exportButton||!exportStatus||!savedOnly||!savedStatus)return;
 let rows=[],busy=false,reportDate=null,retrievedAt=null;
 const fields=['noncomm_positions_long_all','noncomm_positions_short_all','comm_positions_long_all','comm_positions_short_all','open_interest_all'];
 function summary(){return `${Date.now()-Date.parse(reportDate)>10*86400000?'Older report (over 10 days) — ':''}Positions as of ${reportDate.slice(0,10)} · ${rows.length} contracts · Retrieved ${new Date(retrievedAt).toLocaleString()} · Weekly CFTC Legacy Futures Only. Net positions = long minus short contracts.`;}
 const number=new Intl.NumberFormat(undefined,{signDisplay:'exceptZero'});
 // A local shortlist of contract identifiers, not positions, account data or live alerts.
 const SAVED_KEY='fynx:cot:saved-contract-codes:v1';
 const MAX_SAVED=100;
 const validCode=code=>typeof code==='string'&&/^[a-zA-Z0-9_-]{1,24}$/.test(code);
 let savedCodes=new Set(),savedIssue='';
 function parseSaved(raw){
  if(raw===null)return new Set();
  const values=JSON.parse(raw);
  if(!Array.isArray(values)||values.length>MAX_SAVED||values.some(code=>!validCode(code))||new Set(values).size!==values.length)throw Error('Invalid local shortlist');
  return new Set(values);
 }
 function restoreSaved(){
  try{savedCodes=parseSaved(window.localStorage.getItem(SAVED_KEY));}
  catch{savedIssue='Saved contracts could not be read. Existing browser data has not been overwritten; saving is disabled.';}
 }
 function updateSavedStatus(message=''){
  savedStatus.textContent=savedIssue||message||`${savedCodes.size} saved contract${savedCodes.size===1?'':'s'} on this browser only. Not synced to an account or used for alerts.`;
 }
 function persistSaved(code,shouldSave){
  if(savedIssue||!validCode(code))return false;
  try{
   // Re-read before writing, so another tab's more recent choices are not overwritten.
   const next=parseSaved(window.localStorage.getItem(SAVED_KEY));
   if(shouldSave&&next.size>=MAX_SAVED&&!next.has(code)){updateSavedStatus('You can save up to 100 contracts. Remove one before adding another.');return false;}
   if(shouldSave)next.add(code);else next.delete(code);
   window.localStorage.setItem(SAVED_KEY,JSON.stringify(Array.from(next)));
   savedCodes=next;
   updateSavedStatus((shouldSave?'Saved ':'Removed ')+`contract ${code}. ${next.size} saved on this browser only.`);
   return true;
  }catch{
   savedIssue='Saving is unavailable or saved data is unreadable. Existing browser data was left unchanged.';
   updateSavedStatus();return false;
  }
 }
 function setSavedButton(button,row){
  const code=row.cftc_contract_market_code,selected=savedCodes.has(code);
  button.textContent=selected?'Saved':'Save';
  button.setAttribute('aria-pressed',String(selected));
  button.setAttribute('aria-label',`${selected?'Remove':'Save'} ${row.market_and_exchange_names} ${selected?'from':'to'} saved contracts on this browser`);
  button.disabled=Boolean(savedIssue)||!validCode(code);
 }
 const matchingRows=()=>rows.filter(r=>
  (r.market_and_exchange_names.toLowerCase().includes(search.value.trim().toLowerCase())||r.cftc_contract_market_code.toLowerCase().includes(search.value.trim().toLowerCase()))&&
  (!savedOnly.checked||savedCodes.has(r.cftc_contract_market_code))
 );
 restoreSaved();updateSavedStatus();
 function updateExportAvailability(){
  exportButton.disabled=busy||!reportDate||!retrievedAt||matchingRows().length===0;
 }
 // Only the fetched, validated CFTC rows are exportable. No local estimates or account data.
 function csvField(value,untrusted=false){
  let str=String(value??'').replace(/[\u0000-\u001f]/g,' ');
  // Exchange names arrive from a remote service; prevent spreadsheet formula evaluation.
  if(untrusted&&/^[\s]*[=+@-]/.test(str))str="'"+str;
  return '"'+str.replace(/"/g,'""')+'"';
 }
 function downloadCSV(){
  if(busy||!reportDate||!retrievedAt||!rows.length)return;
  const selected=matchingRows();
  if(!selected.length){exportStatus.textContent='No matching contracts to export. Clear or change the search.';updateExportAvailability();return;}
  const header=['Source','Report date','Retrieved UTC','Contract / exchange','Non-commercial long','Non-commercial short','Non-commercial net','Commercial long','Commercial short','Commercial net','Open interest'];
  const lines=[header.map(v=>csvField(v)).join(',')];
  for(const r of selected){
   const long=Number(r.noncomm_positions_long_all),short=Number(r.noncomm_positions_short_all);
   const commercialLong=Number(r.comm_positions_long_all),commercialShort=Number(r.comm_positions_short_all);
   lines.push([
    'CFTC Legacy Futures Only',reportDate.slice(0,10),retrievedAt,
    r.market_and_exchange_names,long,short,long-short,
    commercialLong,commercialShort,commercialLong-commercialShort,Number(r.open_interest_all)
   ].map((value,index)=>csvField(value,index===3)).join(','));
  }
  let objectUrl;
  try{
   const csv='\uFEFF'+lines.join('\r\n')+'\r\n';
   objectUrl=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   const anchor=document.createElement('a');
   anchor.href=objectUrl;
   anchor.download='fynx-cftc-legacy-futures-'+reportDate.slice(0,10)+'.csv';
   anchor.hidden=true;
   document.body.append(anchor);
   anchor.click();
   anchor.remove();
   exportStatus.textContent='Prepared '+selected.length+' verified contract'+(selected.length===1?'':'s')+' for CSV export, as of '+reportDate.slice(0,10)+'. Search filter applied. Weekly observations, not live quotes.';
  }catch{
   exportStatus.textContent='CSV export could not start in this browser. Try again or use the official CFTC report.';
  }finally{
   if(objectUrl)setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  }
 }
 function render(){
  host.replaceChildren();
  const filtered=matchingRows();
  for(const r of filtered){
   const tr=document.createElement('tr');
   for(const value of [r.market_and_exchange_names,number.format(Number(r.noncomm_positions_long_all)-Number(r.noncomm_positions_short_all)),number.format(Number(r.comm_positions_long_all)-Number(r.comm_positions_short_all)),Number(r.open_interest_all).toLocaleString()]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
   const cell=document.createElement('td'),button=document.createElement('button');
   button.type='button';button.className='cot-save';setSavedButton(button,r);
   button.addEventListener('click',()=>{
    const code=r.cftc_contract_market_code;
    if(!persistSaved(code,!savedCodes.has(code))){setSavedButton(button,r);return;}
    if(savedOnly.checked){render();savedOnly.focus();}else{setSavedButton(button,r);}
   });
   cell.append(button);tr.append(cell);host.append(tr);
  }
  if(rows.length&&!filtered.length){
   const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;
   td.textContent=savedOnly.checked?(savedCodes.size?'No saved contracts match the current search or published report. Clear the search or show all contracts.':'No saved contracts yet. Show all contracts and select Save next to a market.'):'No matching contracts. Try a currency, commodity or exchange name.';
   tr.append(td);host.append(tr);
  }
  updateExportAvailability();
 }
 async function request(params){const u=new URL('https://publicreporting.cftc.gov/resource/6dca-aqww.json');for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);const r=await fetch(u,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('CFTC unavailable');const data=await r.json();if(!Array.isArray(data))throw Error('Invalid report');return data;}
 async function load(){if(busy)return;busy=true;refresh.disabled=true;updateExportAvailability();status.textContent='Loading the latest published CFTC report…';try{
  const latest=await request({'$select':'report_date_as_yyyy_mm_dd','$order':'report_date_as_yyyy_mm_dd DESC','$limit':'1'});
  const date=latest[0]?.report_date_as_yyyy_mm_dd;if(typeof date!=='string'||!/^\d{4}-\d\d-\d\dT[\d:.]+$/.test(date)||!Number.isFinite(Date.parse(date))||Date.parse(date)>Date.now())throw Error('Invalid report date');
  const result=[];
  for(let offset=0;offset<10000;offset+=1000){
   const page=await request({'$where':`report_date_as_yyyy_mm_dd='${date}'`,'$limit':'1000','$offset':String(offset),'$order':'market_and_exchange_names,cftc_contract_market_code','$select':'market_and_exchange_names,cftc_contract_market_code,report_date_as_yyyy_mm_dd,'+fields.join(',')});
   result.push(...page);if(page.length<1000)break;if(offset===9000)throw Error('Report exceeds supported size');
  }
  if(!result.length||result.some(r=>typeof r.market_and_exchange_names!=='string'||!r.market_and_exchange_names.trim()||r.report_date_as_yyyy_mm_dd!==date||fields.some(k=>typeof r[k]!=='string'||!/^\d+$/.test(r[k])||!Number.isSafeInteger(Number(r[k])))))throw Error('Invalid positions');
  rows=result;reportDate=date;retrievedAt=new Date().toISOString();render();status.textContent=summary();exportStatus.textContent='';
 }catch(e){window.FynxMonitor?.report('feed','feed-load',e);status.textContent=rows.length?summary()+' Refresh failed — previous observations retained; check the official report.':'CFTC data is unavailable right now. Open the official report below or retry. No estimated positions are shown.';}finally{busy=false;refresh.disabled=false;updateExportAvailability();}}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 window.addEventListener('pageshow',event=>{if(event.persisted)load();});
 search.addEventListener('input',()=>{render();exportStatus.textContent='';});
 savedOnly.addEventListener('change',()=>{render();exportStatus.textContent='';updateSavedStatus();});
 window.addEventListener('storage',event=>{
  if(event.key!==SAVED_KEY)return;
  try{savedCodes=parseSaved(event.newValue);savedIssue='';}
  catch{savedIssue='Saved contracts changed in another tab but could not be read. Existing data was left unchanged.';}
  render();updateSavedStatus();
 });
 refresh.addEventListener('click',load);exportButton.addEventListener('click',downloadCSV);updateExportAvailability();load();
})();
