/* Shared News experience: public data renders independently of membership services. */
(function () {
  'use strict';
  const app = document.querySelector('[data-news-intelligence]');
  if (!app) return;
  const D = window.FYNXMarketIntelligenceData, started = performance.now();
  const $ = selector => app.querySelector(selector), $$ = selector => [...app.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const date = value => { const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined, {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) : 'Date unavailable'; };
  const link = value => D?.safeURL(value);
  const bookmark = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4V4Z"/></svg>';
  let category = 'all', rows = [], limit = 10, newsRun = 0, headlineState = 'loading', mediaCategory = 'videos', region = 'all', releaseRows = [], releaseState;
  const savedItems = new Map();
  function saveButton(item, prefix) {
    const id = prefix + item.id; savedItems.set(id, item);
    return '<button type="button" class="fn-save" data-save-source="'+esc(id)+'" aria-label="Save source: '+esc(item.title)+'" title="Save with your research notes">'+bookmark+'</button>';
  }
  function empty(title, detail) { return '<div class="fn-empty"><h3>'+esc(title)+'</h3><p>'+esc(detail)+'</p><a href="#watch-listen">Explore publisher libraries ↓</a></div>'; }
  function renderHeadlines() {
    const query = $('[data-news-search]').value.trim().toLowerCase();
    const matched = rows.filter(item => !query || (item.title+' '+item.source).toLowerCase().includes(query));
    $('[data-news-count]').textContent = matched.length + (matched.length === 1 ? ' headline' : ' headlines');
    $('[data-news-more]').hidden = matched.length <= limit;
    $('[data-news-stories]').innerHTML = matched.length ? matched.slice(0,limit).map((item,index) => {
      const url = link(item.url); if (!url) return '';
      return '<article class="fn-story '+(index===0?'fn-lead':'')+'"><div class="fn-story-content"><div class="fn-story-topline"><span class="fn-story-source">'+esc(item.source)+'</span><span class="fn-story-category">'+esc(category==='all'?'Market news':category)+'</span></div><h3><a class="fn-story-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(item.title)+' <span aria-hidden="true">↗</span></a></h3><div class="fn-story-date"><time datetime="'+esc(item.publishedAt)+'">'+esc(date(item.publishedAt))+'</time>'+(item.via?' · via '+esc(item.via):'')+'</div></div>'+saveButton(item,'headline:')+'</article>';
    }).join('') : empty(query?'No headlines match your search.':headlineState==='loading'?'Checking the latest coverage.':headlineState==='unavailable'?'Headlines are temporarily unavailable.':'No recent headlines in this category.',query?'Try another phrase or choose a different market.':'The official video, audio and institution libraries below are ready to explore.');
  }
  function status(result, target) {
    const prefix = result.status === 'cached' ? 'Saved coverage' : result.status === 'unavailable' ? 'Refresh unavailable' : result.stale ? 'Partly refreshed' : 'Updated';
    target.textContent = prefix + (result.fetchedAt ? ' · retrieved '+date(result.fetchedAt) : '') + (result.status !== 'fresh' || result.stale ? '. '+result.message : ' · publication times shown on each story.');
  }
  async function loadNews(force=false) {
    const run = ++newsRun, requested = category;
    const cached = D.getCachedHeadlines(category);
    rows = cached?.items || []; headlineState = cached?.status || 'loading'; limit = 10;
    if (cached) { renderHeadlines(); status(cached,$('[data-news-status]')); }
    else { renderHeadlines(); $('[data-news-status]').textContent = 'Checking '+(category==='all'?'all markets':category)+' coverage…'; }
    $('[data-news-refresh]').disabled = true; $('[data-news-stories]').setAttribute('aria-busy','true');
    let result;
    try { result = await D.loadHeadlines(requested,{force,timeoutMs:6500}); }
    catch { result = cached || {items:[],status:'unavailable',message:'Open the publisher libraries below or try again.'}; }
    if (run !== newsRun) return;
    rows = result.items || []; headlineState = result.status; renderHeadlines(); status(result,$('[data-news-status]'));
    $('[data-news-refresh]').disabled = false; $('[data-news-stories]').setAttribute('aria-busy','false');
    app.dataset.feedReady = result.status; app.dataset.feedMs = String(Math.round(performance.now()-started));
  }
  function renderMedia() {
    const publisher = $('[data-media-publisher]').value, topic = $('[data-media-topic]').value;
    const selected = D.publishers.filter(p => (publisher==='all'||p.id===publisher) && (topic==='all'||p.topics.includes(topic)));
    const cards = selected.flatMap(p => p.destinations.filter(d => d.category===mediaCategory).map(d => {
      const url = link(d.url); if (!url) return '';
      return '<article class="fn-media-card"><div class="fn-media-brand"><span class="fn-media-monogram" aria-hidden="true">'+esc(p.name==='The Wall Street Journal'?'WSJ':p.name==='Financial Times'?'FT':p.id==='cnbc'?'CNBC':p.id==='bloomberg'?'B':p.id==='yahoo'?'Y!':p.name.slice(0,3).toUpperCase())+'</span><span class="fn-media-type">'+esc(d.categoryLabel)+'</span></div><h3>'+esc(p.name)+'</h3><p>'+esc(p.summary)+'</p><div class="fn-media-topics">'+p.topics.map(t=>'<span>'+esc(t)+'</span>').join('<span aria-hidden="true"> · </span>')+'</div><p class="fn-media-access">'+esc(d.access)+'</p><a class="fn-media-action" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+(mediaCategory==='podcasts'?'Explore podcasts':mediaCategory==='live'?'Open broadcast page':'Explore videos')+' <span aria-hidden="true">↗</span></a></article>';
    }));
    $('[data-media-grid]').innerHTML = cards.length ? cards.join('') : '<div class="fn-empty"><h3>No libraries match these filters.</h3><p>Choose another publisher or topic to see available destinations.</p><button type="button" class="fn-refresh" data-media-reset>Clear filters</button></div>';
    $('[data-media-grid]').setAttribute('aria-live','polite');
  }
  function institutionRegion(item) { return item.region==='United States'?'us':item.region==='Japan'?'japan':'europe'; }
  function renderInstitutions() {
    $('[data-institution-list]').innerHTML = D.institutions.filter(item=>region==='all'||institutionRegion(item)===region).map(item=>'<a class="fn-institution" href="'+esc(link(item.url))+'" target="_blank" rel="noopener noreferrer"><div><span>'+esc(item.region)+'</span><h3>'+esc(item.name)+'</h3><p>'+esc(item.summary)+'</p></div><b aria-hidden="true">↗</b></a>').join('');
    $$('[data-region]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.region===region)));
    renderReleases();
  }
  function renderReleases() {
    const items = releaseRows.filter(item=>region==='all'||(region==='us'&&['fed','bea'].includes(item.sourceId))||(region==='europe'&&item.sourceId==='ecb'));
    const sources = releaseState?.sources || [];
    const sourceLinks = D.officialSources.filter(s=>region==='all'||(region==='us'&&s.id!=='ecb')||(region==='europe'&&s.id==='ecb')).map(s=>{
      const state = sources.find(row=>row.id===s.id);
      return '<a href="'+esc(link(s.website))+'" target="_blank" rel="noopener noreferrer">'+esc(s.name)+' ↗</a>'+(state?'<span> '+esc(state.status==='fresh'?'Refreshed':state.status==='cached'?'Saved releases':'Website available')+(state.fetchedAt?' · '+esc(date(state.fetchedAt)):'')+'</span>':'');
    });
    $('[data-release-list]').innerHTML = (items.length ? items.slice(0,12).map(item=>'<article class="fn-release"><div class="fn-story-topline"><span class="fn-story-source">'+esc(item.source)+'</span>'+saveButton(item,'release:')+'</div><h4><a href="'+esc(link(item.url))+'" target="_blank" rel="noopener noreferrer">'+esc(item.title)+' ↗</a></h4><time datetime="'+esc(item.publishedAt)+'">'+esc(date(item.publishedAt))+'</time></article>').join('') : '<div class="fn-empty"><h3>'+(region==='japan'?'Explore Japan’s official policy calendar.':'Open the original releases.')+'</h3><p>'+(region==='japan'?'The Bank of Japan link above includes scheduled meetings, decisions and minutes.':'The institutions’ full publications remain available at the links below.')+'</p></div>') + (sourceLinks.length?'<div class="fn-release-sources">'+sourceLinks.map(s=>'<p>'+s+'</p>').join('')+'</div>':'');
  }
  async function loadReleases(force=false) {
    const cached = D.getCachedOfficialReleases();
    if (cached) { releaseRows=cached.items; releaseState=cached; renderReleases(); status(cached,$('[data-release-status]')); }
    $('[data-release-refresh]').disabled = true;
    try { releaseState = await D.loadOfficialReleases({force,timeoutMs:6500}); }
    catch { releaseState = cached || {items:[],status:'unavailable',message:'Official source websites remain available below.'}; }
    releaseRows=releaseState.items||[]; renderReleases(); status(releaseState,$('[data-release-status]'));
    $('[data-release-refresh]').disabled=false; app.dataset.releasesReady=releaseState.status;
  }
  app.addEventListener('click',event=>{
    const button=event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-news-plan')) { if(window.FYNXNewsMembership) window.FYNXNewsMembership.openPlans(); else location.href='/pro.html?tool=watchlist#plans'; }
    if (button.hasAttribute('data-save-source')) { $('[data-news-announcement]').textContent=''; const item=savedItems.get(button.dataset.saveSource); if(item&&window.FYNXNewsMembership) Promise.resolve(window.FYNXNewsMembership.saveResearch(item)).catch(error=>{ $('[data-news-announcement]').textContent=error.message||'This source could not be saved. Please try again.'; }); else $('[data-news-announcement]').textContent='Research saving is temporarily unavailable. Your source remains free to read.'; }
    if (button.hasAttribute('data-news-category')&&D) { category=button.dataset.newsCategory; $$('[data-news-category]').forEach(b=>b.setAttribute('aria-pressed',String(b===button))); loadNews(); }
    if (button.hasAttribute('data-news-refresh')&&D) loadNews(true);
    if (button.hasAttribute('data-news-more')) { limit+=10; renderHeadlines(); }
    if (button.hasAttribute('data-media-category')&&D) { mediaCategory=button.dataset.mediaCategory; $$('[data-media-category]').forEach(b=>b.setAttribute('aria-pressed',String(b===button))); renderMedia(); }
    if (button.hasAttribute('data-media-reset')&&D) { $('[data-media-publisher]').value='all'; $('[data-media-topic]').value='all'; renderMedia(); }
    if (button.hasAttribute('data-region')&&D) { region=button.dataset.region; renderInstitutions(); }
    if (button.hasAttribute('data-release-refresh')&&D) loadReleases(true);
  });
  if (!D) { $('[data-news-status]').textContent='The feed could not start. Reload the page to retry.'; $('[data-news-stories]').innerHTML=empty('Explore the original publishers.','CNBC, Bloomberg and official institution websites remain available directly.'); $('[data-news-stories]').setAttribute('aria-busy','false'); $('[data-release-status]').textContent='Reload to connect the official release feeds.'; return; }
  $('[data-news-search]').addEventListener('input',()=>{limit=10;renderHeadlines();});
  for (const p of D.publishers) $('[data-media-publisher]').add(new Option(p.name,p.id));
  for (const t of D.topics.filter(t=>t!=='All topics')) $('[data-media-topic]').add(new Option(t,t));
  $('[data-media-publisher]').addEventListener('change',renderMedia); $('[data-media-topic]').addEventListener('change',renderMedia);
  renderMedia(); renderInstitutions(); app.dataset.newsReady='true'; app.dataset.renderMs=String(Math.round(performance.now()-started));
  loadNews(); loadReleases();
  window.setInterval(()=>{if(document.visibilityState==='visible'){loadNews();loadReleases();}},300000);
})();
