/* Public terminal data. No account state, invented prices or placeholder stories. */
(function (root, factory) {
  'use strict';
  const exports = factory();
  if (typeof module === 'object' && module.exports) module.exports = exports;
  else root.FynxTerminalData = exports.createTerminalData(root);
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const DAY = 86400000;
  const instruments = Object.freeze([
    Object.freeze({symbol:'SPY', name:'S&P 500 ETF', shortName:'SPY', group:'ETF'}),
    Object.freeze({symbol:'QQQ', name:'Nasdaq 100 ETF', shortName:'QQQ', group:'ETF'}),
    Object.freeze({symbol:'DIA', name:'Dow Jones ETF', shortName:'DIA', group:'ETF'}),
    Object.freeze({symbol:'BTC-USD', name:'Bitcoin', shortName:'BTC', group:'Crypto'}),
    Object.freeze({symbol:'EURUSD=X', name:'Euro / US dollar', shortName:'EUR/USD', group:'FX'})
  ]);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const text = value => typeof value === 'string' ? value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,1200) : '';
  function safeURL(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !url.hostname.includes('.') || url.hostname.endsWith('.local') || url.hostname.endsWith('.localhost') || /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.includes(':')) return null;
      return url.href;
    } catch { return null; }
  }
  function timestamp(value, now, maxAge = Infinity, future = 300000) {
    const at = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(at) && at <= now + future && now - at <= maxAge ? new Date(at).toISOString() : null;
  }
  function frozen(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
    return value;
  }
  function normalizeQuotes(payload, now = Date.now()) {
    const quotes = {}, errors = {}, fetchedAt = timestamp(payload?.fetchedAt, now, DAY);
    if (!payload || typeof payload.quotes !== 'object' || !fetchedAt) throw new Error('Quote response is unavailable.');
    for (const {symbol} of instruments) {
      const q = payload.quotes[symbol], asOf = timestamp(q?.asOf, now, 4 * DAY);
      const sourceURL = safeURL(q?.sourceURL), source = text(q?.source), basis = text(q?.basis);
      if (!q || q.symbol !== symbol || !finite(q.price) || q.price <= 0 || !asOf || !sourceURL || !source || !basis || !/^[A-Z]{3}$/.test(q.currency || '')) {
        errors[symbol] = text(payload.errors?.[symbol]) || 'A recent, validated quote is unavailable.';
        continue;
      }
      quotes[symbol] = {symbol, price:q.price, currency:q.currency, asOf,
        changePercent:finite(q.changePercent) ? q.changePercent : null,
        source, sourceURL, basis, delayed:q.delayed === true,
        fetchedAt:timestamp(q.fetchedAt, now, DAY) || fetchedAt};
    }
    const available = Object.keys(quotes).length, partial = available < instruments.length;
    return {kind:'quotes', quotes, errors, fetchedAt, status:available ? 'fresh' : 'unavailable', stale:false, partial,
      message:available ? (partial ? 'Some quotes are unavailable. Source times are shown for the available instruments.' : 'Indicative quotes. Source times and comparison periods are shown.') : 'Market quotes are temporarily unavailable.'};
  }
  function normalizeHistory(payload, now = Date.now()) {
    const fetchedAt = timestamp(payload?.fetchedAt, now, DAY), sourceURL = safeURL(payload?.sourceURL), source = text(payload?.source);
    if (payload?.symbol !== 'SPY' || payload.currency !== 'USD' || payload.adjusted !== true || !fetchedAt || !sourceURL || !source || !Array.isArray(payload.bars) || payload.bars.length > 20000) throw new Error('Daily price history is unavailable.');
    let previous = '';
    const bars = payload.bars.map(row => {
      const date = typeof row?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : '';
      const at = Date.parse(date + 'T00:00:00Z');
      if (!date || !Number.isFinite(at) || new Date(at).toISOString().slice(0,10) !== date || at > now || date <= previous || !['open','high','low','close'].every(key => finite(row[key]) && row[key] > 0) || row.low > Math.min(row.open,row.close) || row.high < Math.max(row.open,row.close) || row.low > row.high) throw new Error('Daily price history could not be validated.');
      previous = date;
      return {date, open:row.open, high:row.high, low:row.low, close:row.close};
    });
    if (bars.length < 2 || now - Date.parse(bars[bars.length-1].date + 'T00:00:00Z') > 7 * DAY) throw new Error('Recent daily price history is unavailable.');
    return {kind:'history', symbol:'SPY', name:'S&P 500 ETF', currency:'USD', bars, adjusted:true,
      omitted:Number.isSafeInteger(payload.omitted) && payload.omitted >= 0 ? payload.omitted : 0,
      source, sourceURL, fetchedAt, status:'fresh', stale:false, message:'Adjusted daily closes. Historical prices, not an intraday chart.'};
  }
  function normalizeBriefing(headlines, releases, now = Date.now()) {
    const feeds = {}, all = [];
    for (const [key, value, kind] of [['headlines',headlines,'headline'],['releases',releases,'official-release']]) {
      const fetchedAt = timestamp(value?.fetchedAt, now, key === 'headlines' ? DAY : 7 * DAY);
      const status = fetchedAt && ['fresh','cached'].includes(value?.status) ? value.status : 'unavailable';
      const sources = Array.isArray(value?.sources) ? value.sources.slice(0,12).map(source => ({id:text(source.id),name:text(source.name),status:['fresh','cached','unavailable'].includes(source.status) ? source.status : 'unavailable',fetchedAt:timestamp(source.fetchedAt,now,7 * DAY),message:text(source.message)})) : [];
      const feed = {kind, fetchedAt, status, stale:status !== 'fresh' || value?.stale === true, sources, message:text(value?.message), count:0};
      if (status !== 'unavailable' && Array.isArray(value?.items)) for (const row of value.items.slice(0,150)) {
        const url = safeURL(row.url || row.link), title = text(row.title), source = text(row.source);
        const publishedAt = timestamp(row.publishedAt || row.pubDate, now, kind === 'headline' ? 8 * DAY : Infinity, kind === 'headline' ? 300000 : DAY);
        if (!url || !title || !source || !publishedAt) continue;
        all.push({id:text(row.id) || kind + '|' + url, title, url, link:url, publishedAt, pubDate:publishedAt,
          source, sourceId:text(row.sourceId), category:kind === 'official-release' ? 'official' : text(row.category) || 'all', kind,
          via:row.via === 'Google News' ? 'Google News' : null, description:'', fetchedAt, stale:feed.stale, status:feed.status});
        feed.count++;
      }
      feeds[key] = feed;
    }
    const seen = new Set();
    const items = all.sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url); return true;
    }).slice(0,60);
    const headlineCount = items.filter(row => row.kind === 'headline').length, releaseCount = items.length - headlineCount;
    const usedFeeds = Object.values(feeds).filter(feed => feed.count > 0);
    const status = !items.length ? 'unavailable' : usedFeeds.some(feed => feed.status === 'fresh') ? 'fresh' : 'cached';
    const partial = !headlineCount || !releaseCount || Object.values(feeds).some(feed => feed.status === 'unavailable' || feed.stale);
    const coverage = headlineCount && releaseCount ? 'headlines-and-releases' : headlineCount ? 'headlines' : releaseCount ? 'official-releases' : 'unavailable';
    const fetchedAt = usedFeeds.length ? new Date(Math.min(...usedFeeds.map(feed => Date.parse(feed.fetchedAt)))).toISOString() : null;
    return {kind:'briefing', items, fetchedAt, publishedAt:items[0]?.publishedAt || null, status,
      stale:status === 'cached' || usedFeeds.some(feed => feed.stale), partial, coverage, headlineCount, releaseCount, feeds,
      sources:Object.values(feeds).flatMap(feed => feed.sources.map(source => ({...source,kind:feed.kind}))),
      message:!items.length ? 'Coverage is temporarily unavailable. Open the News page for original source links.' :
        !headlineCount ? 'Official releases are available. Publisher headlines could not be retrieved; source and publication dates are shown.' :
        status === 'cached' ? 'Showing dated saved coverage while sources are unavailable.' :
        partial ? 'Some sources could not be refreshed. Available coverage retains its source and publication date.' : 'Headlines and official releases. Publication dates are shown on each item.'};
  }
  function createTerminalData(environment, options = {}) {
    const now = options.now || (() => Date.now()), cache = new Map(), pending = new Map();
    const endpoint = ['localhost','127.0.0.1'].includes(environment.location?.hostname) ? '/api/research' : 'https://us-central1-fynx-c7a28.cloudfunctions.net/webResearchData';
    async function request(params) {
      const Controller = environment.AbortController || AbortController, controller = new Controller();
      let timer;
      try {
        return await Promise.race([(async () => {
          const response = await environment.fetch(endpoint + '?' + new URLSearchParams(params), {signal:controller.signal, credentials:'omit', referrerPolicy:'no-referrer', headers:{Accept:'application/json'}});
          if (!response.ok) throw new Error('The market source is unavailable.');
          const raw = await response.text();
          if (raw.length > 2000000) throw new Error('Market response is too large.');
          return JSON.parse(raw);
        })(), new Promise((_,reject) => { timer = setTimeout(() => {controller.abort(); reject(new Error('The market source took too long to respond.'));}, 25000); })]);
      } finally { clearTimeout(timer); }
    }
    function unavailable(key) {
      if (key === 'briefing') return normalizeBriefing(null,null,now());
      if (key === 'quotes') return {kind:'quotes',quotes:{},errors:Object.fromEntries(instruments.map(({symbol}) => [symbol,'Quote unavailable. Please refresh to retry.'])),fetchedAt:null,status:'unavailable',stale:true,partial:true,message:'Market quotes are temporarily unavailable.'};
      return {kind:'history',symbol:'SPY',name:'S&P 500 ETF',currency:'USD',bars:[],adjusted:true,source:null,sourceURL:null,fetchedAt:null,status:'unavailable',stale:true,message:'Daily price history is temporarily unavailable.'};
    }
    function load(key, settings, freshMs, staleMs, fetcher) {
      if (pending.has(key)) return pending.get(key);
      const old = cache.get(key);
      if (!settings?.force && old && now() - old.at < freshMs) return Promise.resolve(old.value);
      const task = (async () => {
        try {
          const value = await fetcher();
          if (value.status === 'unavailable') throw new Error('No valid records.');
          const result = frozen(value); cache.set(key,{at:now(),value:result}); return result;
        } catch {
          if (old && now() - old.at < staleMs) {
            const value = {...old.value,status:'cached',stale:true,message:'Refresh unavailable. Showing dated saved ' + (key === 'briefing' ? 'coverage' : key === 'quotes' ? 'quotes' : 'daily prices') + '.'};
            if (key === 'briefing') {
              value.items = value.items.map(item => ({...item,status:'cached',stale:true}));
              value.feeds = Object.fromEntries(Object.entries(value.feeds).map(([name,feed]) => [name,{...feed,status:feed.count ? 'cached' : feed.status,stale:true,sources:feed.sources.map(source => ({...source,status:source.status === 'unavailable' ? 'unavailable' : 'cached'}))}]));
              value.sources = value.sources.map(source => ({...source,status:source.status === 'unavailable' ? 'unavailable' : 'cached'}));
            }
            return frozen(value);
          }
          return frozen(unavailable(key));
        } finally { pending.delete(key); }
      })();
      pending.set(key,task); return task;
    }
    return Object.freeze({instruments,
      loadBriefing:settings => load('briefing',settings,300000,DAY,async () => {
        const D = environment.FYNXMarketIntelligenceData;
        if (!D) throw new Error('Coverage service is unavailable.');
        const results = await Promise.allSettled([D.loadHeadlines('all',{force:settings?.force === true,timeoutMs:6500}),D.loadOfficialReleases({force:settings?.force === true,timeoutMs:6500})]);
        return normalizeBriefing(results[0].status === 'fulfilled' ? results[0].value : null,results[1].status === 'fulfilled' ? results[1].value : null,now());
      }),
      loadQuotes:settings => load('quotes',settings,60000,900000,async () => normalizeQuotes(await request({action:'quotes',symbols:instruments.map(item => item.symbol).join(',')}),now())),
      loadHistory:settings => load('history',settings,3600000,DAY,async () => normalizeHistory(await request({action:'history',symbol:'SPY'}),now()))
    });
  }
  return {createTerminalData,normalizeBriefing,normalizeQuotes,normalizeHistory,instruments};
});
