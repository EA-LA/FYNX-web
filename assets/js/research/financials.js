import {C,$,escape,number,compact,percent,tone,time,errorHTML,loading,empty,toast,download,metric,api,financials,reports} from './shared.js';
import {store} from './store.js';
export let currentCompany=C.seedCompanies[0];
export let currentReport=null;
let directory=C.seedCompanies,reportPeriod=null,requestID=0,screenID=0,directoryLoaded=false,screenInputs=null;
function companyResults(companies) {
  $('#company-results').innerHTML=companies.map(c=>`<button type="button" class="company-result" data-cik="${c.cik}" aria-pressed="${c.cik===currentCompany.cik}"><span><strong>${escape(c.symbol)}</strong><small>${escape(c.name)}</small></span><span aria-hidden="true">↗</span></button>`).join('')||empty('No company found','Try another ticker or company name.');
}
async function search() {
  const query=$('#company-search').value.trim().toLowerCase();
  if(!directoryLoaded) {
    $('#directory-status').textContent='Loading the SEC company directory…';
    try{const data=await api('directory');directory=data.companies;directoryLoaded=true;$('#directory-status').textContent=`SEC directory · ${directory.length.toLocaleString()} companies · Retrieved ${time(data.fetchedAt)}`;}
    catch{$('#directory-status').textContent='The SEC directory is unavailable. Showing the built-in selection of 16 companies; retry Search to reload the full directory.';}
  }
  const found=directory.filter(c=>(c.symbol+' '+c.name).toLowerCase().includes(query)).sort((a,b)=>Number(b.symbol.toLowerCase().split(', ').includes(query))-Number(a.symbol.toLowerCase().split(', ').includes(query))).slice(0,12);
  companyResults(found);
}
export async function selectCompany(company) {
  currentCompany=company;currentReport=null;reportPeriod=null;const id=++requestID;
  companyResults(directory.filter(c=>[company.cik,...C.seedCompanies.slice(0,5).map(v=>v.cik)].includes(c.cik)).slice(0,6));
  $('#financial-output').innerHTML=loading(`Reading ${company.symbol} annual SEC facts…`);
  dispatchEvent(new Event('research-company'));
  try{
    const report=await financials(company);if(id!==requestID)return;
    currentReport=report;reportPeriod=report.periods[0];renderReport();dispatchEvent(new Event('research-company'));
  }catch(error){if(id===requestID){$('#financial-output').innerHTML=errorHTML(error.message)+`<div class="actions"><button class="secondary" data-action="retry-company">Retry</button><a href="https://www.sec.gov/edgar/browse/?CIK=${company.cik}" target="_blank" rel="noopener">Open company filings on SEC ↗</a></div>`;dispatchEvent(new Event('research-company'));}}
}
function renderReport() {
  const r=currentReport;if(!r)return;
  if(!r.periods.length){$('#financial-output').innerHTML=empty('No supported annual facts','This issuer may use different accounting standards or custom tags. Read its original SEC filings.');return;}
  const facts=r.annual[reportPeriod],margin=C.margin(r,reportPeriod),old=Date.now()-C.day(r.periods[0])>550*C.DAY;
  $('#financial-output').innerHTML=`<div class="report-heading"><div><h3>${escape(r.name)}</h3><p>${escape(currentCompany.symbol)} · CIK ${r.cik} · Retrieved ${time(r.fetchedAt)}</p></div><label>Annual period<select id="financial-period">${r.periods.map(p=>`<option ${p===reportPeriod?'selected':''}>${p}</option>`).join('')}</select></label></div>${old?'<div class="notice">The latest supported annual period is more than 550 days old. Check the original filings for newer information.</div>':''}<div class="metric-grid">${metric('Revenue',facts.revenue?'$'+compact(facts.revenue.value):'—','Annual reported revenue')}${metric('Net income',facts.income?'$'+compact(facts.income.value):'—','Annual reported profit',tone(facts.income?.value))}${metric('Net margin',percent(margin),'Matching annual periods',tone(margin))}${metric('Operating cash flow',facts.operatingCash?'$'+compact(facts.operatingCash.value):'—','Cash from operations',tone(facts.operatingCash?.value))}</div><div class="table-caption"><h3>Reported annual financials</h3><span class="small muted">Year ended ${reportPeriod} · USD</span></div><div class="table-wrap"><table class="research-table financial-table"><thead><tr><th scope="col">Metric</th><th scope="col" class="num">Reported value</th><th scope="col">Filed</th><th scope="col">Original source</th></tr></thead><tbody>${C.metrics.map(m=>{const f=facts[m.id];return `<tr><td>${m.title}${f?`<small>${f.start?f.start+' → ':''}${f.end}</small>`:''}</td><td class="num">${f?(m.id==='eps'?'$'+number(f.value):'$'+number(f.value,0)):'—'}</td><td>${f?f.filed:'Unavailable'}</td><td>${f?`<a href="${C.filingURL(r.cik,f)}" target="_blank" rel="noopener" title="${escape(f.tag)}">SEC filing ↗</a>`:'—'}</td></tr>`;}).join('')}</tbody></table></div><p class="mobile-table-hint">Swipe the table for filing dates and sources →</p><p class="method-note">Latest filed observation within each supported tag is preferred. “—” means unavailable, not zero. Debt components may omit other borrowings and leases. Net margin needs revenue and income with matching start and end dates.</p><div class="actions"><button type="button" class="secondary" data-action="screen-company">${store.state.companies.some(c=>c.cik===r.cik)?'In your screening list ✓':'Add to screening list +'}</button><a href="#assistant">Read the sourced company brief ↗</a><button class="text-button" data-action="export-financials">Export annual facts</button></div>`;
}
$('#company-form').addEventListener('submit',event=>{event.preventDefault();search();});
$('#company-results').addEventListener('click',event=>{const button=event.target.closest('[data-cik]');if(button){const company=directory.find(c=>c.cik===Number(button.dataset.cik));if(company)selectCompany(company);}});
$('#financial-output').addEventListener('change',event=>{if(event.target.id==='financial-period'){reportPeriod=event.target.value;renderReport();}});
$('#financial-output').addEventListener('click',async event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  try {
    if(action==='retry-company')selectCompany(currentCompany);
    if(action==='screen-company') {await store.transact(s=>{if(s.companies.some(c=>c.cik===currentCompany.cik))return;if(s.companies.length>=30)throw Error('Your screening list holds up to 30 companies. Remove one to add another.');s.companies.push(currentCompany);});toast(`${currentCompany.symbol} is in your screening list.`);renderReport();}
    if(action==='export-financials'&&currentReport)download(`fynx-${currentCompany.symbol.replace(/[^A-Z0-9]/g,'-')}-annual-facts.json`,JSON.stringify(currentReport,null,2));
  }catch(error){toast(error.message);}
});
export function renderScreen() {
  const s=store.state,f=s.filters;
  const inputs=JSON.stringify([store.key,s.companies,f]);
  if(inputs!==screenInputs){screenInputs=inputs;++screenID;$('#screen-output').innerHTML=empty('Your research list is ready','Set your filters and run the screen to compare the selected companies.');}
  if(document.activeElement?.closest('#screen-form')===null){$('#screen-revenue').value=f.minimumRevenue===null?'':f.minimumRevenue/1e9;$('#screen-margin').value=f.minimumMargin??'';$('#screen-profitable').checked=f.profitable;$('#screen-cash').checked=f.positiveOperatingCash;}
  $('#screen-list').innerHTML=s.companies.map(c=>`<span class="chip">${escape(c.symbol)}<button data-remove-company="${c.cik}" aria-label="Remove ${escape(c.name)} from screening list">×</button></span>`).join('');
  if(!s.companies.length)$('#screen-output').innerHTML=empty('Build your research list','Open Company financials, choose a company, and add it to your screening list.');
}
$('#screen-list').addEventListener('click',async event=>{
  const id=Number(event.target.dataset.removeCompany);if(!id)return;
  try{await store.transact(s=>{s.companies=s.companies.filter(c=>c.cik!==id);});++screenID;$('#screen-output').innerHTML=empty('Your list has changed','Run the screen again to update these results.');}catch(error){toast(error.message);}
});
$('#screen-form').addEventListener('submit',async event=>{
  event.preventDefault();const scope=store.key;
  try {
    const filters={minimumRevenue:$('#screen-revenue').value===''?null:Number($('#screen-revenue').value)*1e9,minimumMargin:$('#screen-margin').value===''?null:Number($('#screen-margin').value),profitable:$('#screen-profitable').checked,positiveOperatingCash:$('#screen-cash').checked};
    await store.transact(s=>{s.filters=filters;},scope);
    const companies=[...store.state.companies],id=++screenID,results=[],errors=[];
    if(!companies.length){renderScreen();return;}
    for(const company of companies) {
      if(id!==screenID||scope!==store.key)return;
      $('#screen-output').innerHTML=loading(`Reading company ${results.length+errors.length+1} of ${companies.length} · ${company.symbol}`);
      try{const report=await financials(company);results.push({company,report});}catch(error){errors.push({company,message:error.message});}
    }
    if(id!==screenID||scope!==store.key)return;
    const matches=results.filter(({report})=>C.screen(report,filters)).sort((a,b)=>(b.report.annual[b.report.periods[0]]?.revenue?.value??-Infinity)-(a.report.annual[a.report.periods[0]]?.revenue?.value??-Infinity));
    $('#screen-output').innerHTML=`<div class="table-caption"><h3>${matches.length} ${matches.length===1?'company matches':'companies match'}</h3><span class="small muted">${results.length} loaded · ${errors.length} unavailable · Sorted by revenue</span></div>${matches.length?`<div class="table-wrap"><table class="research-table"><thead><tr><th>Company</th><th>Annual period</th><th class="num">Revenue</th><th class="num">Net margin</th><th class="num">Operating cash</th></tr></thead><tbody>${matches.map(({company,report:r})=>{const p=r.periods[0],f=r.annual[p];return `<tr><td><button data-open-company="${company.cik}">${escape(company.symbol)} ↗</button><small>${escape(company.name)}</small></td><td>${p}<small>${Date.now()-C.day(p)>550*C.DAY?'Older annual report':'SEC annual facts'}</small></td><td class="num">${f.revenue?'$'+compact(f.revenue.value):'—'}</td><td class="num">${percent(C.margin(r))}</td><td class="num">${f.operatingCash?'$'+compact(f.operatingCash.value):'—'}</td></tr>`;}).join('')}</tbody></table></div>`:empty('No companies match these filters','Try a wider filter or add more companies. Missing required facts cannot pass a filter.')}<p class="method-note">Companies can have different fiscal year ends. Older annual facts remain labeled and may not represent current operations.</p>${errors.length?`<div class="notice error">Could not load: ${errors.map(e=>escape(e.company.symbol)).join(', ')}. Run the screen again to retry. These companies were not treated as non-matches.</div>`:''}`;
  }catch(error){$('#screen-output').innerHTML=errorHTML(error.message);}
});
$('#screen-output').addEventListener('click',event=>{const cik=Number(event.target.closest('[data-open-company]')?.dataset.openCompany),c=store.state.companies.find(c=>c.cik===cik);if(c){selectCompany(c);location.hash='financials';}});
store.addEventListener('change',()=>{renderScreen();if(currentReport)renderReport();});
export function initializeFinancials(){companyResults(C.seedCompanies.slice(0,6));renderScreen();selectCompany(currentCompany);}
