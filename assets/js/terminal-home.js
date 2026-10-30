(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const node = (tag, text, className) => {const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el;};
  const date = value => new Date(value).toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  function sourceLink(item) {const a = node('a', item.title); a.href = item.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;}
  function kind(item) {return item.source + ' · ' + (item.kind === 'official-release' ? 'Official release' : 'Market news');}
  function time(item) {const el = node('time', date(item.publishedAt) + (item.stale ? ' · Saved coverage' : ''), 'nr-published'); el.dateTime = item.publishedAt; return el;}
  function miniStory(item) {const a = node('article'), title = node('h3'); title.append(sourceLink(item)); a.append(node('span', kind(item), 'nr-kind'), title, time(item)); return a;}
  function renderBriefing(result) {
    const lead = $('homeLeadStory'), latest = $('homeLatestStories'), secondary = $('homeSecondaryStories');
    lead.replaceChildren(); latest.replaceChildren(); secondary.replaceChildren();
    lead.setAttribute('aria-busy','false'); latest.setAttribute('aria-busy','false');
    const first = result.items[0];
    if (!first) {
      $('briefingSource').textContent = 'FYNX · Market intelligence';
      const title = node('h2','Your market briefing.'); title.id = 'briefing-title';
      const a = node('a','Explore the News desk →'); a.href = '/news.html';
      lead.append(title, node('p','Coverage is temporarily unavailable. Original source libraries remain available.','nr-empty'),a);
      latest.append(node('p','No verified stories are available right now. Use Refresh to check again.','nr-empty'));
    } else {
      $('briefingSource').textContent = kind(first);
      const title = node('h2'); title.id = 'briefing-title'; title.append(sourceLink(first)); lead.append(title,time(first));
      result.items.slice(1,3).forEach(item => secondary.append(miniStory(item)));
      result.items.slice(3,10).forEach(item => {
        const article = node('article',undefined,'nr-latest-story');
        const recent = new Date(item.publishedAt).toDateString() === new Date().toDateString();
        const stamp = node('time', new Date(item.publishedAt).toLocaleString([], recent ? {hour:'2-digit',minute:'2-digit',hourCycle:'h23'} : {month:'short',day:'numeric'})); stamp.dateTime = item.publishedAt; stamp.title = date(item.publishedAt);
        const detail = node('div'), title = node('h3'); title.append(sourceLink(item)); detail.append(title,node('span',kind(item)+(item.stale?' · Saved':''),'nr-kind')); article.append(stamp,detail); latest.append(article);
      });
      if (result.items.length <= 3) latest.append(node('p','You’re up to date with the available coverage.','nr-empty'));
    }
    $('homeBriefingStatus').textContent = result.message + (result.fetchedAt ? ' Retrieved ' + date(result.fetchedAt) + '.' : '');
  }
  let briefingPending = false;
  async function refreshBriefing(force = false) {
    if (briefingPending) return;
    briefingPending = true;
    const button = $('homeBriefingRefresh'); button.disabled = true; button.textContent = 'Refreshing…';
    try {renderBriefing(await window.FynxTerminalData.loadBriefing({force}));}
    finally {briefingPending = false; button.disabled = false; button.textContent = '↻ Refresh';}
  }
  function renderQuotes(data) {
    const rows = $('homeQuoteRows'); rows.replaceChildren();
    for (const item of window.FynxTerminalData.instruments) {
      const row = node('tr'), name = node('td'), price = node('td'), change = node('td'), q = data.quotes[item.symbol];
      name.append(node('strong',item.shortName),node('small',item.name));
      if (q) {
        const a = node('a',q.price.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:q.symbol === 'EURUSD=X' ? 4 : 2})); a.href = q.sourceURL; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = q.source + ' · ' + q.currency;
        price.append(a,node('small',new Date(q.asOf).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})));
        change.textContent = q.changePercent === null ? '—' : `${q.changePercent>0?'▲ ':q.changePercent<0?'▼ ':''}${Math.abs(q.changePercent).toFixed(2)}%`;
        change.className = q.changePercent>0?'nr-positive':q.changePercent<0?'nr-negative':''; change.title = q.basis;
      } else {price.textContent = '—'; change.textContent = 'Unavailable';}
      row.append(name,price,change); rows.append(row);
    }
    const sources = [...new Set(Object.values(data.quotes).map(q => q.source))];
    $('homeQuoteStatus').textContent = `${data.stale?'Saved quotes. ':''}Indicative · ${sources.join(' / ') || 'Source unavailable'}. ETFs are fund prices; changes use each source’s comparison period. Quote times are local.`;
  }
  function drawHistory(data) {
    const target = $('homeHistoryChart'); target.replaceChildren();
    if (!data.bars.length) {target.append(node('p','Daily price history is unavailable.')); $('homeChartSource').textContent = data.message; return;}
    const bars = data.bars.slice(-30), values = bars.map(b => b.close), low = Math.min(...values), high = Math.max(...values), span = high-low || high*.01;
    const coords = values.map((value,i) => [i/(values.length-1)*460+10, 170-(value-low)/span*145]);
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
    const wrap = $('homeEconomicCalendar'); wrap.replaceChildren();
    const loading=node('p','Loading the economic calendar…','nr-calendar-loading');loading.setAttribute('role','status');wrap.append(loading);
    const holder = node('div',undefined,'tradingview-widget-container'); holder.style.height = '100%';
    const widget = node('div',undefined,'tradingview-widget-container__widget');
    const script = document.createElement('script'); script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js'; script.async = true;
    script.textContent = JSON.stringify({colorTheme:document.documentElement.dataset.theme === 'dark'?'dark':'light',isTransparent:true,width:'100%',height:390,locale:'en',importanceFilter:'0,1',currencyFilter:'USD,EUR,GBP,JPY,AUD,NZD,CAD,CHF,CNY'});
    script.addEventListener('error', () => {wrap.replaceChildren(node('p','The calendar provider could not be reached. Use the full calendar or official schedule below.','nr-empty'));});
    holder.append(widget,script); wrap.append(holder);
    const observer=new MutationObserver(()=>{const frame=holder.querySelector('iframe');if(frame){frame.addEventListener('load',()=>loading.remove(),{once:true});observer.disconnect();}});observer.observe(holder,{childList:true,subtree:true});
    setTimeout(()=>{observer.disconnect();if(loading.isConnected)loading.textContent='Calendar loading slowly. The full calendar and official schedule remain available below.';},12000);
  }
  function mirrorSessions() {
    const host = document.querySelector('[data-terminal-sessions]'); if (!host) return;
    host.replaceChildren();
    for (const [key,name] of [['London','London'],['NewYork','New York'],['Sydney','Sydney'],['Asia','Asia']]) {
      const badge = $('badge'+key), label = node('span',undefined,badge.classList.contains('open')?'is-open':'');
      label.append(name+' ',node('b',badge.textContent)); host.append(label);
    }
  }
  function start() {
    if (!$('homeLeadStory') || !window.FynxTerminalData) return;
    refreshBriefing();
    window.FynxTerminalData.loadQuotes().then(renderQuotes);
    document.addEventListener('fynx:terminal-quotes',event=>renderQuotes(event.detail));
    window.FynxTerminalData.loadHistory().then(drawHistory);
    mountCalendar(); mirrorSessions();
    $('homeBriefingRefresh').addEventListener('click',()=>refreshBriefing(true));
    document.addEventListener('fynx:terminal-header',mirrorSessions);
    setInterval(()=>{if(!document.hidden){refreshBriefing();window.FynxTerminalData.loadQuotes().then(renderQuotes);mirrorSessions();}},300000);
    setInterval(()=>{if(!document.hidden)mirrorSessions();},20000);
    let theme = document.documentElement.dataset.theme;
    new MutationObserver(()=>{if(theme !== document.documentElement.dataset.theme){theme=document.documentElement.dataset.theme;mountCalendar();}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
