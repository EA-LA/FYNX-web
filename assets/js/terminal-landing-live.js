/* Public reporting and quotes for the landing page; no sample account figures. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const cadence = 600000, day = 86400000;
  let request = 0, pending = '', activeEdition = '', lastAttempt = 0, briefing = null, visibleStories = '';
  const node = (tag, text, className) => {const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
  const edition = () => window.FynxEdition?.get() || 'global';
  const label = code => window.FynxEdition?.editions?.find(item=>item.id===code)?.label || code;
  const date = value => new Date(value).toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  function url(value) {try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&u.hostname.includes('.')&&!u.hostname.endsWith('.local')&&!u.hostname.endsWith('.localhost')&&!/^[\d.]+$/.test(u.hostname)&&!u.hostname.includes(':')?u.href:null;}catch{return null;}}
  function recent() {
    const seen=new Set(),titles=new Set();
    return (briefing?.items || []).filter(item=>{
      const at=Date.parse(item.publishedAt), key=String(item.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
      if(!url(item.url)||!key||!item.source||!Number.isFinite(at)||at>Date.now()+300000||Date.now()-at>(item.kind==='official-release'?30:2)*day||(item.edition&&item.edition!==activeEdition)||seen.has(item.url)||titles.has(key))return false;
      seen.add(item.url);titles.add(key);return true;
    }).slice(0,2);
  }
  function renderNews() {
    const target=$('landingLiveNews'), items=recent();target.replaceChildren();target.setAttribute('aria-busy','false');visibleStories=items.map(item=>item.url).join('|');
    const photo=window.FYNXNewsroomMedia?.createFigure(activeEdition==='uk'?'finance':activeEdition==='us'?'markets':'world');if(photo)target.append(photo);
    if(!items.length){target.append(node('p','Recent verified coverage is unavailable for the '+label(activeEdition)+' edition.','fw-live-status'));const a=node('a','Explore original sources at the News desk →');a.href='/news.html';target.append(a);}
    for(const item of items){
      const article=node('article',undefined,'fw-live-story'), a=node('a',item.title), title=node('h4'), time=node('time',date(item.publishedAt));
      a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';title.append(a);time.dateTime=item.publishedAt;
      article.append(node('span',item.source+(item.kind==='official-release'?' · Official release':''),'fw-live-source'),title,time);
      if(item.stale || item.status==='cached')article.append(node('span',' · Saved coverage','fw-live-source'));
      target.append(article);
    }
    $('landingNewsStatus').textContent=label(activeEdition)+' edition · '+(briefing?.message || 'Coverage could not be refreshed.')+(briefing?.fetchedAt?' Retrieved '+date(briefing.fetchedAt)+'.':'')+' Headlines: past 48 hours. Official releases: past 30 days.';
  }
  async function refresh(force=false) {
    const code=edition();if(pending===code)return;pending=code;lastAttempt=Date.now();const serial=++request;
    try{
      const result=await window.FynxTerminalData.loadBriefing({edition:code,force});
      if(serial!==request||code!==edition())return;
      briefing=result.edition&&result.edition!==code?{items:[],message:'The selected edition could not be loaded.'}:result;renderNews();
    }catch{
      if(serial!==request||code!==edition())return;
      briefing=briefing?{...briefing,message:'Refresh unavailable. Dated saved coverage is shown.'}:{items:[],message:'Coverage could not be refreshed.'};renderNews();
    }finally{if(serial===request)pending='';}
  }
  function renderQuotes(data) {
    if(!data?.quotes)return;const target=$('landingQuoteRows');target.replaceChildren();
    for(const instrument of window.FynxTerminalData.instruments.slice(0,5)){
      const row=node('tr'),name=node('td'),last=node('td'),change=node('td'),q=data.quotes[instrument.symbol];
      name.append(node('strong',instrument.shortName),node('small',instrument.name));
      if(q){
        const a=node('a',q.price.toLocaleString('en-US',{minimumFractionDigits:['EURUSD=X','GBPUSD=X'].includes(q.symbol)?4:2,maximumFractionDigits:['EURUSD=X','GBPUSD=X'].includes(q.symbol)?4:2}));a.href=q.sourceURL;a.target='_blank';a.rel='noopener noreferrer';a.title=q.source+' · '+q.currency;
        const time=node('time',new Date(q.asOf).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}));time.dateTime=q.asOf;
        last.append(a,node('small',q.currency+' · '+q.source),time);
        change.textContent=q.changePercent===null?'—':`${q.changePercent>0?'▲ ':q.changePercent<0?'▼ ':''}${Math.abs(q.changePercent).toFixed(2)}%`;change.className=q.changePercent>0?'nr-positive':q.changePercent<0?'nr-negative':'';change.title=q.basis;
      }else{last.textContent='—';change.textContent='Unavailable';}
      row.append(name,last,change);target.append(row);
    }
    $('landingQuoteStatus').textContent=(data.stale?'Saved quotes. ':'')+'Global indicative instruments, independent of your news edition. ETFs are fund prices. Changes use each source’s comparison period; quote times are local.';
  }
  function start(){
    if(!$('landingLiveNews')||!window.FynxTerminalData)return;
    activeEdition=edition();refresh();
    const quotes=()=>window.FynxTerminalData.loadQuotes().then(renderQuotes).catch(()=>{$('landingQuoteStatus').textContent='Global quote sources are temporarily unavailable. Open the research heat map to check again.';});quotes();
    document.addEventListener('fynx:terminal-quotes',event=>renderQuotes(event.detail));
    document.addEventListener('fynx:edition-change',()=>{activeEdition=edition();++request;pending='';briefing=null;visibleStories='';$('landingLiveNews').replaceChildren(node('p','Checking '+label(activeEdition)+' reporting…'));$('landingLiveNews').setAttribute('aria-busy','true');$('landingNewsStatus').textContent='Checking published sources for the selected edition.';refresh();});
    function check(){if(document.hidden)return;if(briefing&&recent().map(item=>item.url).join('|')!==visibleStories)renderNews();if(Date.now()-lastAttempt>=cadence)refresh();quotes();}
    setInterval(check,60000);document.addEventListener('visibilitychange',check);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
