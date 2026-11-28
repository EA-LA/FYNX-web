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
  /* FYNX Intelligence: stories with an analysis page open there instead of the quick reader. */
  let intelMap = null;
  function intelPath(id) {
    if (!intelMap || typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) return null;
    const key = id.slice(0, 16);
    if (!Object.prototype.hasOwnProperty.call(intelMap, key)) return null;
    const slug = intelMap[key];
    // Generated Intelligence destinations are single lowercase path segments.
    // A corrupt cached or downloaded map must never replace the working reader URL.
    return typeof slug === 'string' && slug.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
      ? '/intelligence/' + slug + '/' : null;
  }
  const validIntelMap = map => map !== null && typeof map === 'object' && !Array.isArray(map);
  function intelFromReader(href) { try { const u = new URL(href, root.location.href); return u.origin === root.location.origin && u.pathname === '/news/article.html' && u.searchParams.has('edition') ? intelPath(u.searchParams.get('id')) : null; } catch { return null; } }
  (function loadIntel() {
    const KEY = 'fynx_intel_map_v1';
    const apply = map => {
      intelMap = map;
      if (root.location.pathname === '/news/article.html') { const to = intelFromReader(root.location.href); if (to) { root.location.replace(to); return; } }
      root.document?.querySelectorAll?.('a[href*="/news/article.html?"]').forEach(a => { const to = intelFromReader(a.getAttribute('href')); if (to) a.setAttribute('href', to); });
    };
    // Register before the cached-map fast path: dynamically loaded feed links need the same route.
    root.document?.addEventListener?.('click', event => { const a = event.target?.closest?.('a[href*="/news/article.html?"]'); if (!a) return; const to = intelFromReader(a.getAttribute('href')); if (to) a.setAttribute('href', to); }, true);
    try { const c = JSON.parse(root.sessionStorage?.getItem(KEY) || 'null'); if (c && Number.isFinite(c.at) && c.at <= Date.now() && Date.now() - c.at < 600000 && validIntelMap(c.map)) { apply(c.map); return; } } catch {}
    if (typeof root.fetch !== 'function') return;
    root.fetch('/intelligence/data/map.json', {credentials: 'omit', cache: 'no-cache'}).then(r => r.ok ? r.json() : null).then(d => { if (!d || !validIntelMap(d.map)) return; try { root.sessionStorage?.setItem(KEY, JSON.stringify({at: Date.now(), map: d.map})); } catch {} apply(d.map); }).catch(() => {});
  })();
  function href(item) { const o = options(item); return (o && intelPath(o.id)) || route(item) || '/news/article.html'; }
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
    if(raw&&raw.length<1500000) {
      const stored=JSON.parse(raw);
      if(Array.isArray(stored)) for(const entry of stored.slice(-MAX)) {
        if(!Array.isArray(entry)||entry.length!==2)continue;
        const [k,r]=entry;
        if(typeof k!=='string'||!r||typeof r!=='object'||Array.isArray(r))continue;
        const parts=k.split('|');
        if(parts.length!==4)continue;
        const o=options({id:parts[0],edition:parts[1],category:parts[2],symbol:parts[3]});
        if(!o||key(o)!==k||!Number.isFinite(r.at)||r.at>Date.now()||Date.now()-r.at>=FRESH)continue;
        // A single damaged item must not discard other verified, recent briefs.
        try{records.set(k,{article:normalized(r.article,o),at:r.at,complete:r.complete===true});}catch{}
      }
    }
  } catch { /* Unreadable storage is treated as an empty cache. */ }
  function getCachedArticle(value) {
    const o=options(value); if(!o)return null;
    const r=records.get(key(o)); return r&&Date.now()-r.at<FRESH ? r.article : null;
  }
  function remember(items) {
    for(const item of (Array.isArray(items)?items:[]).slice(0,60)) {
      const o=options(item); if(!o||!item.reader)continue;
      try { const article=normalized(item.reader,o),old=records.get(key(o));
        if(old&&Date.now()-old.at<FRESH){
          // Background feed previews can arrive out of order. Keep the more
          // recent report, and do not downgrade complete reports on equal dates.
          const revision = report => {
            const updated = Date.parse(report.updatedAt);
            return Number.isFinite(updated) ? updated : Date.parse(report.preparedAt);
          };
          const previous = revision(old.article), incoming = revision(article);
          if(incoming < previous || (old.complete && incoming === previous))continue;
        }
        put(o,article,false);
      } catch {}
    }
  }
  // Bound headers and body together, even when a WebView has no abort support
  // or a network implementation ignores cancellation. Only the winning result
  // reaches the article validation and cache writes below.
  async function fetchArticleText(params, maxLength, httpError, sizeError) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeout;
    try {
      return await Promise.race([
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error('The story request timed out. Please try again.'));
            if (controller) controller.abort();
          }, 14000);
        }),
        (async () => {
          const response = await root.fetch(endpoint+'?'+new URLSearchParams(params),{
            ...(controller ? {signal:controller.signal} : {}),
            credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json'}
          });
          if (!response.ok) throw httpError(response.status);
          const raw = await response.text();
          if (raw.length > maxLength) throw Error(sizeError);
          return raw;
        })()
      ]);
    } finally {clearTimeout(timeout);}
  }
  async function loadArticle(value={}) {
    const o=options(value); if(!o)throw new Error('Choose a report from the FYNX newsroom to start reading.');
    const k=key(o),old=records.get(k);
    if(!value.force&&old?.complete&&Date.now()-old.at<FRESH)return old.article;
    if(pending.has(k))return pending.get(k);
    // Defer the request until pending is registered, including synchronous fetch errors.
    const task=Promise.resolve().then(async()=>{
      try {
        const raw=await fetchArticleText({kind:'article',...o},500000,
          status=>new Error(status===404||status===410?'This story is no longer in the current feed. Open the newsroom for the latest reporting.':'The source could not be checked just now. Please try again.'),
          'The report could not be verified.');
        const result=JSON.parse(raw); if(result.kind!=='article')throw new Error('The report could not be verified.');
        return put(o,normalized(result.article,o),true);
      } catch(error) {
        if(old&&Date.now()-old.at<FRESH) return {...old.article,refreshUnavailable:true};
        throw error;
      } finally {pending.delete(k);}
    });pending.set(k,task);return task;
  }
  function canonicalSource(value){const safe=safeURL(value);if(!safe)return null;const u=new URL(safe);u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid|oc)$/i.test(key))u.searchParams.delete(key);return u.href;}
  async function resolveArticle(value={}) {
    const params={kind:'resolve'};
    if(value.url){const url=safeURL(value.url);if(!url)throw Error('Invalid source URL.');params.url=url;}
    else if(/^[a-f0-9]{64}$/.test(value.id||''))params.id=value.id;
    else throw Error('Invalid story identifier.');
    const raw=await fetchArticleText(params,180000,status=>{
      const error=Error(status===404||status===410?'This exact story is not available in the shared newsroom.':'The shared reader is temporarily unavailable.');
      error.status=status;return error;
    },'This story response is too large.');
    const result=JSON.parse(raw),article=result.article;
    if(result.kind!=='article'||!article||value.id&&article.id!==value.id)throw Error('The story identity could not be verified.');
    if(params.url&&canonicalSource(article.sourceUrl)!==canonicalSource(params.url))throw Error('The source does not match this story.');
    if(article.contentExpiresAt&&(!Number.isFinite(Date.parse(article.contentExpiresAt))||Date.parse(article.contentExpiresAt)<=Date.now()))throw Error('This story has expired.');
    return normalized(article,{id:article.id,edition:article.edition||'us',category:article.category||'all'});
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
  root.FYNXNewsReaderData=Object.freeze({href,remember,prefetch,loadArticle,getCachedArticle,resolveArticle});
})(typeof window==='undefined'?globalThis:window);
