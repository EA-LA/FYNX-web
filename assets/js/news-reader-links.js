/* Shared internal destinations and bounded, source-verified reader prefetch. */
(function (root) {
  'use strict';
  const endpoint = /^(localhost|127\.0\.0\.1)$/.test(root.location?.hostname || '') ? '/api/market-feed' : 'https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketFeed';
  const FRESH = 300000, MAX = 80, storageKey = 'fynx_reader_cache_v1';
  const editions = new Set(['global','us','uk','canada','europe','asia','india','middle-east','africa','latin-america','japan','australia']);
  const categories = new Set(['all','forex','crypto','stocks','macro','commodities','world','finance','economics','technology','politics','industries','energy','analysis','official']);
  const records = new Map(), pending = new Map(), queued = new Set(), queue = [];
  let active = 0;
  const clean = (value, max = 1800) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0,max) : '';
  function safeURL(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && u.hostname.includes('.') && !u.hostname.endsWith('.') && !/\.(local|localhost|internal)$/.test(u.hostname) && !/^[\d.]+$/.test(u.hostname) && !u.hostname.includes(':') ? u.href : null; } catch { return null; }
  }
  function readerOptions(value) {
    if (typeof value !== 'string' || !value || value.length > 2000) return null;
    try {
      const u = new URL(value, root.location?.origin || 'https://www.fynxfinanceworld.com');
      const allowed = new Set(['https://www.fynxfinanceworld.com','https://fynxfinanceworld.com',root.location?.origin]);
      if (!allowed.has(u.origin) || u.username || u.password || u.pathname !== '/news/article.html') return null;
      const allowedKeys = ['id','edition','category','symbol'];
      if (allowedKeys.some(k => u.searchParams.getAll(k).length > 1)) return null;
      return Object.fromEntries(allowedKeys.filter(k => u.searchParams.has(k)).map(k => [k,u.searchParams.get(k)]));
    } catch { return null; }
  }
  function options(value = {}) {
    if (!value || typeof value !== 'object') return null;
    const provided = value.articleId || value.id, linked = readerOptions(value.readerUrl);
    // A feed card's category is often broader than the API query that produced it.
    // The verified internal route preserves that query, including a symbol filter.
    if (linked && provided && linked.id !== provided) return null;
    const id = linked?.id || provided, edition = linked?.edition || value.edition || root.FynxEdition?.get() || 'us';
    const category = linked?.category || (value.kind === 'official-release' ? 'official' : value.category || 'all');
    const rawSymbol = linked?.symbol ?? value.symbol;
    const symbol = typeof rawSymbol === 'string' ? rawSymbol.trim() : '';
    if (!/^[a-f0-9]{64}$/.test(id || '') || !editions.has(edition) || !categories.has(category) || (symbol && (symbol.length > 80 || !/^[\p{L}\p{N} .&/^:_-]+$/u.test(symbol)))) return null;
    return {id,edition,category,...(symbol ? {symbol} : {})};
  }
  const key = value => [value.id,value.edition,value.category,value.symbol || ''].join('|');
  function route(value) { const o = options(value); return o ? '/news/article.html?' + new URLSearchParams(o) : null; }
  function href(item) { return route(item) || '/news/article.html'; }
  function normalized(value, o) {
    if (!value || value.id !== o.id || value.edition !== o.edition || value.category !== o.category || !safeURL(value.sourceUrl) || !clean(value.title) || !clean(value.source)) throw new Error('This report could not be verified.');
    const at = Date.parse(value.publishedAt), prepared = Date.parse(value.preparedAt);
    if (!Number.isFinite(at) || at > Date.now() + 300000 || !Number.isFinite(prepared) || prepared > Date.now() + 300000 || !['source-text','publisher-excerpt','headline-only'].includes(value.coverageLevel)) throw new Error('This report has invalid source metadata.');
    const list = (v, fn, count = 8) => Array.isArray(v) ? v.slice(0,count).map(fn).filter(Boolean) : [];
    const image = value.image && safeURL(value.image.url) && safeURL(value.image.sourceURL || value.image.sourceUrl) ? {...value.image,url:safeURL(value.image.url),credit:clean(value.image.credit,200),alt:clean(value.image.alt,300)} : null;
    return {...value, id:o.id, edition:o.edition, category:o.category, title:clean(value.title,500), source:clean(value.source,160), sourceUrl:safeURL(value.sourceUrl), image,
      summary:clean(value.summary,2400), coverageNote:clean(value.coverageNote,700), method:clean(value.method,80),
      keyPoints:list(value.keyPoints,p => p && clean(p.text) ? {text:clean(p.text,700),evidence:clean(p.evidence,700)} : null),
      numbers:list(value.numbers,p => p && clean(p.value) ? {value:clean(p.value,100),context:clean(p.context,500)} : null),
      context:list(value.context,p => p && clean(p.title) && clean(p.text) ? {title:clean(p.title,200),text:clean(p.text,1000)} : null),
      questions:list(value.questions,p=>clean(p,500)), terms:list(value.terms,p=>p&&clean(p.term)&&clean(p.definition)?{term:clean(p.term,100),definition:clean(p.definition,700)}:null),
      related:list(value.related,p=>p && /^[a-f0-9]{64}$/.test(p.articleId || '') && clean(p.title) ? {...p,title:clean(p.title,500),source:clean(p.source,160),readerUrl:href({...p,edition:p.edition||o.edition,category:p.category||o.category})} : null,5),
      sources:list(value.sources,p=>p&&safeURL(p.url)&&clean(p.name)?{name:clean(p.name,160),url:safeURL(p.url),accessedAt:p.accessedAt}:null,8)
    };
  }
  function persist() { try { root.sessionStorage?.setItem(storageKey,JSON.stringify([...records].slice(-MAX))); } catch {} }
  function put(o, article, complete) {
    records.delete(key(o)); records.set(key(o),{article,at:Date.now(),complete});
    while(records.size>MAX) records.delete(records.keys().next().value);
    persist(); return article;
  }
  try {
    const raw=root.sessionStorage?.getItem(storageKey);
    if(raw&&raw.length<1500000) for(const [k,r] of JSON.parse(raw).slice(-MAX)) {
      const parts=k.split('|'),o=options({id:parts[0],edition:parts[1],category:parts[2],symbol:parts[3]});
      if(o&&Number.isFinite(r.at)&&r.at<=Date.now()&&Date.now()-r.at<FRESH) records.set(k,{article:normalized(r.article,o),at:r.at,complete:r.complete===true});
    }
  } catch { records.clear(); }
  function getCachedArticle(value) {
    const o=options(value); if(!o)return null;
    const r=records.get(key(o)); return r&&Date.now()-r.at<FRESH ? r.article : null;
  }
  function remember(items) {
    for(const item of (Array.isArray(items)?items:[]).slice(0,60)) {
      const o=options(item); if(!o||!item.reader)continue;
      try { const article=normalized(item.reader,o),old=records.get(key(o));
        if(old?.complete&&Date.now()-old.at<FRESH&&old.article.updatedAt===article.updatedAt)continue;
        put(o,article,false);
      } catch {}
    }
  }
  async function loadArticle(value={}) {
    const o=options(value); if(!o)throw new Error('Choose a report from the FYNX newsroom to start reading.');
    const k=key(o),old=records.get(k);
    if(!value.force&&old?.complete&&Date.now()-old.at<FRESH)return old.article;
    if(pending.has(k))return pending.get(k);
    // Defer the request until pending is registered, including synchronous fetch errors.
    const task=Promise.resolve().then(async()=>{
      const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),14000);
      try {
        const response=await root.fetch(endpoint+'?'+new URLSearchParams({kind:'article',...o}),{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error(response.status===404||response.status===410?'This story is no longer in the current feed. Open the newsroom for the latest reporting.':'The source could not be checked just now. Please try again.');
        const raw=await response.text(); if(raw.length>500000)throw new Error('The report could not be verified.');
        const result=JSON.parse(raw); if(result.kind!=='article')throw new Error('The report could not be verified.');
        return put(o,normalized(result.article,o),true);
      } catch(error) {
        if(old&&Date.now()-old.at<FRESH) return {...old.article,refreshUnavailable:true};
        throw error;
      } finally {clearTimeout(timeout);pending.delete(k);}
    });pending.set(k,task);return task;
  }
  function drain() {
    if(root.document?.hidden)return;
    while(active<3&&queue.length) {
      const o=queue.shift(); active++;
      loadArticle(o).catch(()=>{}).finally(()=>{active--;queued.delete(key(o));drain();});
    }
  }
  function prefetch(items) {
    remember(items);
    for(const item of (Array.isArray(items)?items:[]).slice(0,8)) {
      const o=options(item);if(!o||queued.has(key(o)))continue;
      const saved=records.get(key(o));if(saved?.complete&&Date.now()-saved.at<FRESH)continue;
      if(queue.length>=16)break;queued.add(key(o));queue.push(o);
    }
    drain();
  }
  root.document?.addEventListener('visibilitychange',drain);
  root.document?.addEventListener('pointerover',event=>{const a=event.target.closest?.('a[href*="/news/article.html?"]');if(!a)return;try{prefetch([Object.fromEntries(new URL(a.href).searchParams)]);}catch{}},{passive:true});
  root.document?.addEventListener('focusin',event=>{const a=event.target.closest?.('a[href*="/news/article.html?"]');if(!a)return;try{prefetch([Object.fromEntries(new URL(a.href).searchParams)]);}catch{}});
  root.FYNXNewsReaderData=Object.freeze({href,remember,prefetch,loadArticle,getCachedArticle});
})(typeof window==='undefined'?globalThis:window);
