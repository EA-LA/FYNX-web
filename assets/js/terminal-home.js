(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const node = (tag, text, className) => {const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el;};
  const cadence = 600000, day = 86400000;
  let briefingRequest = 0, topicRequest = 0, briefingPending = '', topicPending = '', lastAttempt = 0, activeEdition = '', briefing = null, topicResults = [], calendarCleanup = () => {}, briefingSignature = '', topicSignature = '';
  const topics = [ ['finance','Finance'], ['economics','Economics'], ['technology','Technology'], ['politics','Politics & Policy'], ['industries','Industries'], ['energy','Energy'] ];
  const edition = () => window.FynxEdition?.get() || 'global';
  const editionLabel = code => window.FynxEdition?.editions?.find(item => item.id === code)?.label || code;
  function safeURL(value) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && url.hostname.includes('.') && !url.hostname.endsWith('.local') && !url.hostname.endsWith('.localhost') && !/^[\d.]+$/.test(url.hostname) && !url.hostname.includes(':') ? url.href : null; } catch { return null; } }
  function recent(items, code) {
    const seen = new Set(), titles = new Set(), now = Date.now();
    return (Array.isArray(items) ? items : []).filter(item => {
      const published = Date.parse(item?.publishedAt), url = safeURL(item?.url), title = typeof item?.title === 'string' ? item.title.trim() : '', key = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if (!url || !title || !item.source || !Number.isFinite(published) || published > now + 300000 || now - published > (item.kind === 'official-release' ? 30 : 2) * day || (item.edition && item.edition !== code) || seen.has(url) || titles.has(key)) return false;
      seen.add(url); titles.add(key); return true;
    }).sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }
  function leadImage(item) {
    const meta = item?.image, context = () => window.FYNXNewsroomMedia?.createFigure(activeEdition === 'us' ? 'markets' : activeEdition === 'uk' ? 'finance' : 'world', {loading:'eager'});
    const permitted = meta && (meta.licensed === true || /^(cc0|cc[- ]by(?:[- ]sa)?(?:[ -][34]\.0)?|public domain|publisher[- ]licensed)$/i.test(meta.license));
    if (!permitted || !safeURL(meta.url) || !meta.credit || !meta.license) return context();
    const figure = node('figure',undefined,'nr-story-image'), img = node('img'); img.src=meta.url; img.alt=typeof meta.alt==='string'?meta.alt:''; img.loading='eager'; img.decoding='async'; img.referrerPolicy='no-referrer';
    const caption=node('figcaption',meta.credit+' · '+meta.license);
    const source=safeURL(meta.sourceUrl || meta.sourceURL), license=safeURL(meta.licenseUrl || meta.licenseURL);
    for (const [url,label] of [[source,'Image source'],[license,'License']]) if(url) {const a=node('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';caption.append(' · ',a);}
    img.addEventListener('error',()=>{const fallback=context();if(fallback)figure.replaceWith(fallback);else figure.remove();},{once:true});figure.append(img,caption);return figure;
  }
  const date = value => new Date(value).toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  function sourceLink(item) {const a = node('a', item.title); a.href = item.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;}
  function kind(item) {return item.source + ' · ' + (item.kind === 'official-release' ? 'Official release' : 'Market news');}
  function time(item) {const el = node('time', date(item.publishedAt) + (item.stale ? ' · Saved coverage' : ''), 'nr-published'); el.dateTime = item.publishedAt; return el;}
  function miniStory(item) {const a = node('article'), title = node('h3'); title.append(sourceLink(item)); a.append(node('span', kind(item), 'nr-kind'), title, time(item)); return a;}
  function renderBriefing(result) {
    const lead = $('homeLeadStory'), latest = $('homeLatestStories'), secondary = $('homeSecondaryStories');
    lead.replaceChildren(); latest.replaceChildren(); secondary.replaceChildren();
    lead.setAttribute('aria-busy','false'); latest.setAttribute('aria-busy','false');
    const items = recent(result.items, activeEdition), first = items[0];
    briefingSignature = items.map(item=>item.url).join('|');
    const photograph = leadImage(first); if (photograph) lead.append(photograph);
    if (!first) {
      $('briefingSource').textContent = 'FYNX · Market intelligence';
      const title = node('h2','Your market briefing.'); title.id = 'briefing-title';
      const a = node('a','Explore the News desk →'); a.href = '/news.html';
      lead.append(title, node('p','No recent verified coverage is available for the '+editionLabel(activeEdition)+' edition. Original source libraries remain available.','nr-empty'),a);
      latest.append(node('p','No verified stories are available right now. Use Refresh to check again.','nr-empty'));
    } else {
      $('briefingSource').textContent = kind(first);
      const title = node('h2'); title.id = 'briefing-title'; title.append(sourceLink(first)); lead.append(title,time(first));
      items.slice(1,3).forEach(item => secondary.append(miniStory(item)));
      items.slice(3,10).forEach(item => {
        const article = node('article',undefined,'nr-latest-story');
        const recent = new Date(item.publishedAt).toDateString() === new Date().toDateString();
        const stamp = node('time', new Date(item.publishedAt).toLocaleString([], recent ? {hour:'2-digit',minute:'2-digit',hourCycle:'h23'} : {month:'short',day:'numeric'})); stamp.dateTime = item.publishedAt; stamp.title = date(item.publishedAt);
        const detail = node('div'), title = node('h3'); title.append(sourceLink(item)); detail.append(title,node('span',kind(item)+(item.stale?' · Saved':''),'nr-kind')); article.append(stamp,detail); latest.append(article);
      });
      if (items.length <= 3) latest.append(node('p','You’re up to date with the available coverage.','nr-empty'));
    }
    $('homeBriefingStatus').textContent = editionLabel(activeEdition)+' edition · '+(result.message || (items.length ? 'Dated source coverage.' : 'Coverage is temporarily unavailable.'))+(result.fetchedAt?' Retrieved '+date(result.fetchedAt)+'.':'')+' Headlines: past 48 hours. Official releases: past 30 days.';
    $('homeEditionStatus').textContent = editionLabel(activeEdition)+' edition';
  }
  async function refreshBriefing(force = false) {
    const code = edition(); if (briefingPending === code) return;
    const request = ++briefingRequest; briefingPending = code; lastAttempt = Date.now();
    const button = $('homeBriefingRefresh'); button.disabled = true; button.textContent = 'Refreshing…';
    try {
      const result = await window.FynxTerminalData.loadBriefing({edition:code, force});
      if (request !== briefingRequest || code !== edition()) return;
      briefing = result.edition && result.edition !== code ? {items:[],message:'The selected edition could not be loaded.'} : result;
      renderBriefing(briefing);
    } catch (_) {
      if (request !== briefingRequest || code !== edition()) return;
      if (!briefing) briefing = {items:[],message:'Coverage could not be refreshed. Use the News desk or try again.'};
      else briefing = {...briefing, message:'Refresh unavailable. Dated saved coverage is shown.'};
      renderBriefing(briefing);
    } finally {
      if (request === briefingRequest) {briefingPending = ''; button.disabled = false; button.textContent = '↻ Refresh';}
    }
  }
  function renderTopics() {
    const host = $('homeTopicSections'); if (!host) return;
    host.replaceChildren(); host.setAttribute('aria-busy','false');
    topicSignature = topicResults.map(value=>value.id+':'+recent(value.result?.items,activeEdition).map(item=>item.url).join('|')).join(';');
    const seen = new Set();
    for (const [id,label] of topics) {
      const result = topicResults.find(value => value.id === id)?.result;
      const section = node('section',undefined,'nr-topic-section'), head = node('div',undefined,'nr-section-head'), title = node('h3'), link = node('a',label+' →');
      link.href = '/news/'+id+'.html?edition='+encodeURIComponent(activeEdition); title.append(link); head.append(title); section.append(head);
      const contextId = activeEdition !== 'us' && ['politics','economics','energy'].includes(id) ? 'world' : id;
      const photo = window.FYNXNewsroomMedia?.createFigure(contextId); if(photo) section.append(photo);
      const list = node('div',undefined,'nr-topic-stories');
      const rows = recent(result?.items,activeEdition).filter(item => !seen.has(item.url)).slice(0,3);
      rows.forEach(item => {seen.add(item.url);list.append(miniStory(item));});
      if (!rows.length) list.append(node('p', result ? 'No additional recent reporting is available for this edition. Explore the desk’s source guide.' : 'Checking recent reporting…', 'nr-empty'));
      section.append(list,node('p',result ? (result.stale || result.status==='cached' ? 'Saved coverage · ' : '')+editionLabel(activeEdition)+' edition'+(result.fetchedAt?' · Retrieved '+date(result.fetchedAt):' · Source temporarily unavailable') : editionLabel(activeEdition)+' edition', 'nr-source-note'));
      host.append(section);
    }
  }
  async function refreshTopics(force = false) {
    const code=edition(); if(topicPending===code)return;
    const request=++topicRequest; topicPending=code;
    const service=window.FYNXMarketIntelligenceData;
    try {
      const values=await Promise.all(topics.map(async ([id])=>{try {const result=await service?.loadHeadlines(id,{edition:code,force});return {id,result:result && (!result.edition || result.edition===code)?result:{items:[],status:'unavailable'}};}catch{return {id,result:{items:[],status:'unavailable'}};}}));
      if(request!==topicRequest || code!==edition())return;
      topicResults=values; renderTopics();
    } finally {if(request===topicRequest)topicPending='';}
  }
  function switchEdition() {
    activeEdition=edition(); briefing=null;topicResults=[];briefingSignature='';topicSignature='';
    ++briefingRequest;++topicRequest;briefingPending='';topicPending='';
    $('homeLeadStory').replaceChildren(node('h2','Checking '+editionLabel(activeEdition)+' reporting…'));
    $('homeLeadStory').setAttribute('aria-busy','true');$('homeLatestStories').replaceChildren();$('homeSecondaryStories').replaceChildren();
    $('briefingSource').textContent='FYNX · Market intelligence';
    $('homeEditionStatus').textContent=editionLabel(activeEdition)+' edition';$('homeBriefingStatus').textContent='Checking published sources for the selected edition.';
    renderTopics();refreshBriefing();refreshTopics();mountCalendar();
  }
  function renderQuotes(data) {
    if (!data?.quotes) return;
    const rows = $('homeQuoteRows'); rows.replaceChildren();
    for (const item of window.FynxTerminalData.instruments) {
      const row = node('tr'), name = node('td'), price = node('td'), change = node('td'), q = data.quotes[item.symbol];
      name.append(node('strong',item.shortName),node('small',item.name));
      if (q) {
        const a = node('a',q.price.toLocaleString('en-US',{minimumFractionDigits:['EURUSD=X','GBPUSD=X'].includes(q.symbol)?4:2,maximumFractionDigits:['EURUSD=X','GBPUSD=X'].includes(q.symbol)?4:2})); a.href = q.sourceURL; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = q.source + ' · ' + q.currency;
        price.append(a,node('small',new Date(q.asOf).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})));
        change.textContent = q.changePercent === null ? '—' : `${q.changePercent>0?'▲ ':q.changePercent<0?'▼ ':''}${Math.abs(q.changePercent).toFixed(2)}%`;
        change.className = q.changePercent>0?'nr-positive':q.changePercent<0?'nr-negative':''; change.title = q.basis;
      } else {price.textContent = '—'; change.textContent = 'Unavailable';}
      row.append(name,price,change); rows.append(row);
    }
    const sources = [...new Set(Object.values(data.quotes).map(q => q.source))];
    $('homeQuoteStatus').textContent = `${data.stale?'Saved quotes. ':''}Global instruments · Indicative · ${sources.join(' / ') || 'Source unavailable'}. ETFs are fund prices; changes use each source’s comparison period. Quote times are local. News edition does not change these global instruments.`;
  }
  function drawHistory(data) {
    const target = $('homeHistoryChart'); target.replaceChildren();
    if (!data.bars.length) {target.append(node('p','Daily price history is unavailable.')); $('homeChartSource').textContent = data.message; return;}
    const bars = data.bars.slice(-30), values = bars.map(b => b.close), low = Math.min(...values), high = Math.max(...values), span = high-low || high*.01;
    const coords = values.map((value,i) => [i/Math.max(1,values.length-1)*460+10, 170-(value-low)/span*145]);
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns,'svg'); svg.setAttribute('viewBox','0 0 480 195'); svg.setAttribute('role','img');
    const title = document.createElementNS(ns,'title'); title.textContent = `SPY adjusted daily closes, ${bars[0].date} to ${bars.at(-1).date}. From ${values[0].toFixed(2)} to ${values.at(-1).toFixed(2)} USD.`; svg.append(title);
    for (const y of [25,73,121,170]) {const line = document.createElementNS(ns,'line'); Object.entries({x1:0,x2:480,y1:y,y2:y,stroke:'#24332b','stroke-width':1}).forEach(([k,v]) => line.setAttribute(k,v)); svg.append(line);}
    const area = document.createElementNS(ns,'path'); area.setAttribute('d',`M ${coords.map(c=>c.join(',')).join(' L ')} L 470,180 L 10,180 Z`); area.setAttribute('fill','#275d4533'); svg.append(area);
    const line = document.createElementNS(ns,'polyline'); line.setAttribute('points',coords.map(c=>c.join(',')).join(' ')); line.setAttribute('fill','none'); line.setAttribute('stroke','#71c7a0'); line.setAttribute('stroke-width','2.5'); svg.append(line); target.append(svg);
    $('homeChartValue').textContent = '$'+values.at(-1).toFixed(2);
    const caption = $('homeChartSource'); caption.replaceChildren();
    const source = node('a',data.source); source.href = data.sourceURL; source.target = '_blank'; source.rel = 'noopener noreferrer';
    caption.append(`${bars[0].date} — ${bars.at(-1).date} · Adjusted daily close · `,source,data.stale?' · Saved history':'');
  }
  function mountCalendar() {
    calendarCleanup();
    const wrap = $('homeEconomicCalendar'); wrap.replaceChildren();
    const currencies={us:'USD',uk:'GBP',canada:'CAD',europe:'EUR',japan:'JPY',australia:'AUD',india:'INR'}, currency=currencies[edition()];
    $('homeCalendarScope').textContent='Calendar supplied by TradingView · '+(currency ? editionLabel(edition())+' edition: '+currency+' releases.' : edition()==='global' ? 'Global currency coverage.' : 'Global currency coverage; a dedicated '+editionLabel(edition())+' calendar filter is not available.');
    const loading=node('p','Loading the economic calendar…','nr-calendar-loading');loading.setAttribute('role','status');wrap.append(loading);
    const holder=node('div',undefined,'tradingview-widget-container');holder.style.height='100%';
    const widget=node('div',undefined,'tradingview-widget-container__widget'), script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-events.js';script.async=true;
    script.textContent=JSON.stringify({colorTheme:document.documentElement.dataset.theme==='dark'?'dark':'light',isTransparent:true,width:'100%',height:390,locale:'en',importanceFilter:'0,1',currencyFilter:currency || 'USD,EUR,GBP,JPY,AUD,NZD,CAD,CHF,CNY'});
    script.addEventListener('error',()=>{if(holder.isConnected)wrap.replaceChildren(node('p','The calendar provider could not be reached. Use the full calendar and its official sources.','nr-empty'));});
    holder.append(widget,script);wrap.append(holder);
    const observer=new MutationObserver(()=>{const frame=holder.querySelector('iframe');if(frame){frame.addEventListener('load',()=>loading.remove(),{once:true});observer.disconnect();}});observer.observe(holder,{childList:true,subtree:true});
    const timeout=setTimeout(()=>{observer.disconnect();if(loading.isConnected)loading.textContent='Calendar loading slowly. The full calendar and its official sources remain available below.';},12000);
    calendarCleanup=()=>{observer.disconnect();clearTimeout(timeout);};
  }
  function mirrorSessions() {
    const host = document.querySelector('[data-terminal-sessions]'); if (!host) return;
    host.replaceChildren();
    for (const [key,name] of [['London','London'],['NewYork','New York'],['Sydney','Sydney'],['Asia','Asia']]) {
      const badge = $('badge'+key); if (!badge) continue; const label = node('span',undefined,badge.classList.contains('open')?'is-open':'');
      label.append(name+' ',node('b',badge.textContent)); host.append(label);
    }
  }
  function start() {
    if (!$('homeLeadStory') || !window.FynxTerminalData) return;
    activeEdition=edition();refreshBriefing();renderTopics();refreshTopics();
    const refreshQuotes=()=>window.FynxTerminalData.loadQuotes().then(renderQuotes).catch(()=>{});
    refreshQuotes();document.addEventListener('fynx:terminal-quotes',event=>renderQuotes(event.detail));
    window.FynxTerminalData.loadHistory().then(drawHistory).catch(()=>{$('homeChartSource').textContent='Daily price history is temporarily unavailable.';});
    mountCalendar();mirrorSessions();
    $('homeBriefingRefresh').addEventListener('click',()=>{refreshBriefing(true);refreshTopics(true);});
    document.addEventListener('fynx:terminal-header',mirrorSessions);
    document.addEventListener('fynx:edition-change',switchEdition);
    function checkCoverage() {
      if(document.hidden)return;
      if(briefing && recent(briefing.items,activeEdition).map(item=>item.url).join('|')!==briefingSignature)renderBriefing(briefing);
      if(topicResults.map(value=>value.id+':'+recent(value.result?.items,activeEdition).map(item=>item.url).join('|')).join(';')!==topicSignature)renderTopics();
      if(Date.now()-lastAttempt>=cadence){refreshBriefing();refreshTopics();}
    }
    setInterval(checkCoverage,60000);
    setInterval(()=>{if(!document.hidden){refreshQuotes();mirrorSessions();}},60000);
    setInterval(()=>{if(!document.hidden)mirrorSessions();},20000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkCoverage();refreshQuotes();mirrorSessions();}});
    let theme=document.documentElement.dataset.theme;
    new MutationObserver(()=>{if(theme!==document.documentElement.dataset.theme){theme=document.documentElement.dataset.theme;mountCalendar();}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
