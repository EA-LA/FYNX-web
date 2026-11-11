export const C=globalThis.FynxResearch;
export const $=selector=>document.querySelector(selector);
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const number=(n,digits=2)=>C.finite(n)?n.toLocaleString('en-US',{maximumFractionDigits:digits,minimumFractionDigits:digits}):'—';
export const money=n=>C.finite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n):'—';
export const compact=n=>C.finite(n)?new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(n):'—';
export const percent=n=>C.finite(n)?`${n>0?'+':''}${number(n)}%`:'—';
export const tone=n=>C.finite(n)?n>0?'positive':n<0?'negative':'':'';
export const time=iso=>Number.isFinite(Date.parse(iso))?new Date(iso).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Time unavailable';
export const ageLabel=q=>Date.now()-Date.parse(q.asOf)>900000?'Older quote':'Indicative quote';
export const errorHTML=message=>`<div class="notice error" role="alert">${escape(message)}</div>`;
export const loading=message=>`<div class="loading" role="status">${escape(message)}</div>`;
export const empty=(title,description)=>`<div class="empty-state"><span class="empty-glyph" aria-hidden="true">↗</span><h3>${escape(title)}</h3><p>${escape(description)}</p></div>`;
export function toast(message) {const box=$('#toast');box.textContent=message;box.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>{box.hidden=true;},8000);}
export function download(name,text,type='application/json') {const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function options(select,filter=()=>true) {select.innerHTML=C.catalog.filter(filter).map(a=>`<option value="${escape(a.symbol)}">${escape(a.symbol)} · ${escape(a.name)}</option>`).join('');}
export function metric(label,value,foot='',className='') {return `<div class="metric"><span class="metric-label">${escape(label)}</span><div class="metric-value ${className}">${escape(value)}</div><span class="metric-foot">${escape(foot)}</span></div>`;}
const endpoint=['localhost','127.0.0.1'].includes(location.hostname)?'/api/research':'https://us-central1-fynx-c7a28.cloudfunctions.net/webResearchData';
export async function api(action,params={}) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try {
    const response=await fetch(endpoint+'?'+new URLSearchParams({action,...params}),{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Research data is unavailable. Please retry.');return data;
  }catch(error){if(error.name==='AbortError')throw Error('The source took too long to respond. Please retry.');throw error;}
  finally{clearTimeout(timer);}
}
export const reports=new Map();
export async function financials(company) {
  const previous=reports.get(company.cik);if(previous&&Date.now()-Date.parse(previous.fetchedAt)<43200000)return previous;
  const report=await api('financials',{cik:company.cik});
  if(report.cik!==company.cik||!Array.isArray(report.periods)||!report.annual)throw Error('The financial report could not be validated.');
  reports.set(company.cik,report);return report;
}
export const quoteCache={};
export async function quotes(symbols) {
  if(!symbols.length)return {quotes:{},errors:{}};
  const data=await api('quotes',{symbols:[...new Set(symbols)].join(',')});
  for(const s of symbols){delete quoteCache[s];if(data.quotes?.[s])quoteCache[s]=data.quotes[s];}
  return data;
}
