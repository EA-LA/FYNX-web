/* Explicit, device-local news preferences. No account entitlement or tracking service. */
(function (root) {
  'use strict';
  const KEY = 'fynx_your_news_v1', MAX_HISTORY = 60, HISTORY_AGE = 7 * 86400000;
  const topics = Object.freeze([
    ['stocks','Markets','markets'], ['finance','Finance','finance'], ['economics','Economics','economics'],
    ['technology','Technology','technology'], ['politics','Politics & Policy','politics'],
    ['industries','Industries','industries'], ['energy','Energy','energy'], ['world','World','world']
  ].map(([id,label,desk]) => Object.freeze({id,label,href:'/news/'+desk+'.html'})));
  const defaults = ['stocks','economics','technology'];
  const editions = new Set(['global','us','uk','canada','europe','asia','india','middle-east','africa','latin-america','japan','australia']);
  const categories = new Set(['all','forex','crypto','stocks','macro','commodities','world','finance','economics','technology','politics','industries','energy','analysis','official']);
  const clean = (value,max) => typeof value === 'string' ? value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max) : '';
  let state = {topics:defaults.slice(),history:[]}, persistent = true;
  function selected(values) { return [...new Set(Array.isArray(values) ? values.filter(id => topics.some(topic => topic.id === id)) : defaults)].slice(0,8); }
  function record(value) {
    if (!value || typeof value !== 'object') return null;
    const id = value.articleId || value.id;
    if (!/^[a-f0-9]{64}$/.test(id || '')) return null;
    let linked;
    try {
      const raw = value.readerUrl || root.FYNXNewsReaderData?.href(value);
      if (typeof raw !== 'string' || raw.length > 2000) return null;
      const url = new URL(raw, root.location.origin);
      if (![root.location.origin,'https://www.fynxfinanceworld.com','https://fynxfinanceworld.com'].includes(url.origin) || url.pathname !== '/news/article.html' || url.username || url.password || url.searchParams.get('id') !== id) return null;
      if (['id','edition','category','symbol'].some(key => url.searchParams.getAll(key).length > 1)) return null;
      const edition = url.searchParams.get('edition'), category = url.searchParams.get('category'), symbol = url.searchParams.get('symbol');
      if (!editions.has(edition) || !categories.has(category) || (symbol && (symbol.length > 80 || !/^[\p{L}\p{N} .&/^:_-]+$/u.test(symbol)))) return null;
      linked = {edition,category,readerUrl:'/news/article.html?'+new URLSearchParams({id,edition,category,...(symbol?{symbol}:{})})};
    } catch { return null; }
    const title = clean(value.title,500), source = clean(value.source,160), published = Date.parse(value.publishedAt || value.pubDate), opened = Number(value.openedAt || Date.now());
    if (!title || !source || !Number.isFinite(published) || published > Date.now()+300000 || Date.now()-published > HISTORY_AGE || !Number.isFinite(opened) || opened > Date.now()+300000 || Date.now()-opened > HISTORY_AGE) return null;
    return {id,title,source,publishedAt:new Date(published).toISOString(),openedAt:opened,...linked};
  }
  function normalize(value) {
    if (!value || value.version !== 1) return null;
    const seen = new Set();
    const history = (Array.isArray(value.history)?value.history:[]).slice(0,MAX_HISTORY).map(record).filter(item => item && !seen.has(item.id) && seen.add(item.id)).sort((a,b)=>b.openedAt-a.openedAt);
    return {topics:selected(value.topics),history};
  }
  function read() {
    try { const raw=root.localStorage.getItem(KEY); return raw && raw.length<=120000 ? normalize(JSON.parse(raw)) : null; }
    catch { persistent=false; return null; }
  }
  function persist() {
    try {root.localStorage.setItem(KEY,JSON.stringify({version:1,...state}));persistent=true;}
    catch {persistent=false;}
  }
  function emit(name) { document.dispatchEvent(new CustomEvent(name)); }
  state = read() || state;
  function history() {state.history=state.history.map(record).filter(Boolean).slice(0,MAX_HISTORY);return state.history.map(item=>({...item}));}
  function setTopics(values) {
    const next=selected(values);if(JSON.stringify(next)===JSON.stringify(state.topics))return;
    state.topics=next;persist();emit('fynx:news-preferences-change');
  }
  function markOpened(value) {
    const next=record({...value,openedAt:Date.now()});if(!next)return false;
    state.history=[next,...history().filter(item=>item.id!==next.id)].slice(0,MAX_HISTORY);persist();emit('fynx:news-history-change');return true;
  }
  function clearHistory() {state.history=[];persist();emit('fynx:news-history-change');}
  root.FYNXYourNews = Object.freeze({topics,getTopics:()=>state.topics.slice(),setTopics,getHistory:history,markOpened,isRead:value=>{const id=typeof value==='string'?value:value?.articleId||value?.id;return history().some(item=>item.id===id);},clearHistory,isPersistent:()=>persistent});
  root.addEventListener('storage',event=>{
    if(event.key!==KEY)return;
    if(event.newValue===null)state={topics:defaults.slice(),history:[]};
    else {try{if(event.newValue.length>120000)return;const next=normalize(JSON.parse(event.newValue));if(!next)return;state=next;}catch{return;}}
    emit('fynx:news-preferences-change');emit('fynx:news-history-change');
  });
})(window);
