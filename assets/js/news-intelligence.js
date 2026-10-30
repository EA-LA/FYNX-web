/* Shared News experience: public data renders independently of membership services. */
(function () {
  'use strict';
  const app = document.querySelector('[data-news-intelligence]');
  if (!app) return;
  function positionNewsHeading() {
    if (location.pathname !== '/news.html' || !document.body.hasAttribute('data-fynx-terminal')) return;
    const shell = app.closest('.fn-news-page'), heading = app.querySelector('.fn-heading');
    const tabs = shell?.querySelector('.news-mode-toggle');
    if (heading && tabs && tabs.parentElement === shell) shell.insertBefore(heading,tabs);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',positionNewsHeading,{once:true});
  else positionNewsHeading();
  const D = window.FYNXMarketIntelligenceData, started = performance.now();
  const $ = selector => app.querySelector(selector), $$ = selector => [...app.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const date = value => { const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined, {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) : 'Date unavailable'; };
  const link = value => D?.safeURL(value);
  const bookmark = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4V4Z"/></svg>';
  const REFRESH_MS = 600000;
  let edition = window.FynxEdition?.get() || 'us';
  let category = 'all', rows = [], limit = 10, newsRun = 0, releaseRun = 0, headlineState = 'loading', mediaCategory = 'videos', region = 'all', releaseRows = [], releaseState;
  let newsInFlight = false, releasesInFlight = false, newsRequestedAt = 0, releasesRequestedAt = 0;
  const releaseRequests = new Map();
  const savedItems = new Map();
  const isOfficial = item => item.kind === 'official-release' || item.category === 'official';
  const editionLabel = () => window.FynxEdition?.editions?.find(item => item.id === edition)?.label || ({us:'US',uk:'UK',global:'Global','middle-east':'Middle East','latin-america':'Latin America'}[edition] || edition.charAt(0).toUpperCase()+edition.slice(1));
  const editionSources = code => D?.sourcesForEdition ? D.sourcesForEdition(code) : D?.officialSources || [];
  function currentItems(items, code = edition, selected = category, official = false) {
    const now = Date.now(), allowed = new Set(editionSources(code).map(source => source.id));
    return (items || []).filter(item => {
      const time = Date.parse(item.publishedAt || item.pubDate), release = official || isOfficial(item);
      const hours = release ? 720 : item.kind === 'analysis' || item.category === 'analysis' || selected === 'analysis' ? 168 : 48;
      return Number.isFinite(time) && time <= now + 300000 && time >= now - hours*3600000 && (!item.edition || item.edition === code) && (!release || !D?.sourcesForEdition || allowed.has(item.sourceId));
    });
  }
  function sameEdition(result, code) { return result && (result.edition === code || (!result.edition && code === 'us')); }
  function requestReleases(force, code) {
    if (releaseRequests.has(code)) return releaseRequests.get(code);
    let request;
    try { request = D.loadOfficialReleases({force,edition:code,timeoutMs:6500}); } catch (error) { request = Promise.reject(error); }
    const task = Promise.resolve(request).finally(() => { if (releaseRequests.get(code) === task) releaseRequests.delete(code); });
    releaseRequests.set(code,task); return task;
  }
  function contextSection() {
    const mapped = {all:'markets',stocks:'markets',forex:'finance',crypto:'technology',macro:'economics',commodities:'energy',analysis:'economics'}[category] || category;
    // Country editions should not acquire a misleading US Capitol/NYSE image.
    if (edition !== 'us' && ['markets','economics','politics','energy'].includes(mapped)) return 'world';
    if (mapped === 'finance' && !['global','uk','europe'].includes(edition)) return 'world';
    return mapped;
  }
  function addLeadImage(item) {
    const container = $('.fn-lead .fn-story-content'); if (!container || !item) return;
    const media = item.image, url = link(media?.url), source = link(media?.sourceURL), license = link(media?.licenseURL);
    let figure;
    if (url && source && license && media.credit && /^https:\/\/creativecommons\.org\/(?:licenses\/(?:by|by-sa)\/(?:3\.0|4\.0)|publicdomain\/zero\/1\.0)\/?$/.test(license)) {
      figure = document.createElement('figure'); figure.className = 'fn-lead-image fn-source-image';
      const img = document.createElement('img'); img.src = url; img.alt = media.alt || 'Image supplied by '+(media.source || item.source); img.loading = 'eager'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      img.addEventListener('error',() => figure.remove(),{once:true});
      const caption = document.createElement('figcaption'); caption.append(document.createTextNode('Source image · '));
      const credit = document.createElement('a'); credit.href = source; credit.textContent = media.credit;
      const rights = document.createElement('a'); rights.href = license; rights.textContent = media.license || 'Image license';
      [credit,rights].forEach(anchor => {anchor.target = '_blank';anchor.rel = 'noopener noreferrer';});
      caption.append(credit,document.createTextNode(' · '),rights); figure.append(img,caption);
    } else figure = window.FYNXNewsroomMedia?.createFigure(contextSection(),{className:'fn-lead-image',loading:'eager'});
    if (figure) container.insertBefore(figure,container.firstChild);
  }
  function saveButton(item, prefix) {
    const id = prefix + item.id; savedItems.set(id, item);
    return '<button type="button" class="fn-save" data-save-source="'+esc(id)+'" aria-label="Save source: '+esc(item.title)+'" title="Save with your research notes">'+bookmark+'</button>';
  }
  function empty(title, detail) { return '<div class="fn-empty"><h3>'+esc(title)+'</h3><p>'+esc(detail)+'</p><a href="#watch-listen">Explore publisher libraries ↓</a></div>'; }
  function renderHeadlines() {
    rows = currentItems(rows);
    for (const key of savedItems.keys()) if (key.startsWith('headline:')) savedItems.delete(key);
    const query = $('[data-news-search]').value.trim().toLowerCase();
    const matched = rows.filter(item => !query || [item.title,item.source,item.sourceId,isOfficial(item)?'official release':'headline'].join(' ').toLowerCase().includes(query));
    const countLabel = matched.some(isOfficial) ? ' item' : ' headline';
    $('[data-news-count]').textContent = matched.length + countLabel + (matched.length === 1 ? '' : 's');
    $('[data-news-more]').hidden = matched.length <= limit;
    $('[data-news-more]').textContent = matched.some(isOfficial) ? 'Show more coverage' : 'Show more headlines';
    $('[data-news-stories]').innerHTML = matched.length ? matched.slice(0,limit).map((item,index) => {
      const url = link(item.url); if (!url) return '';
      const official = isOfficial(item), saved = item.status === 'cached' || item.stale === true;
      return (index===1?'<div class="fn-following-heading"><span>Latest coverage</span><span>Source · publication date</span></div>':'')+'<article class="fn-story '+(index===0?'fn-lead':'')+'" data-story-kind="'+(official?'official-release':item.kind==='analysis'?'analysis':'headline')+'"><div class="fn-story-content"><div class="fn-story-topline">'+(index===0?'<span class="fn-lead-flag">'+(official?'OFFICIAL RELEASE':'TOP STORY')+'</span>':'')+'<span class="fn-story-source">'+esc(item.source)+'</span><span class="fn-story-category">'+esc(official?'Official release':category==='all'?'Market news':category)+'</span></div><h3><a class="fn-story-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(item.title)+' <span aria-hidden="true">↗</span></a></h3><div class="fn-story-date"><time datetime="'+esc(item.publishedAt)+'">'+esc(date(item.publishedAt))+'</time>'+(item.via?' · via '+esc(item.via):'')+(saved?'<span class="fn-story-saved">Saved coverage</span>':'')+'</div></div>'+saveButton(item,'headline:')+'</article>';
    }).join('') : empty(query?'No headlines match your search.':headlineState==='loading'?'Checking the latest coverage.':headlineState==='unavailable'?'Headlines are temporarily unavailable.':'No recent headlines in this category.',query?'Try another phrase or choose a different market.':'The official video, audio and institution libraries below are ready to explore.');
    addLeadImage(matched[0]);
  }
  function status(result, target) {
    const prefix = result.status === 'cached' ? 'Saved coverage' : result.status === 'unavailable' ? 'Refresh unavailable' : result.coverage === 'official-releases' ? 'Official releases' : result.stale || result.partial ? 'Partly refreshed' : 'Updated';
    target.textContent = prefix + (result.fetchedAt ? ' · retrieved '+date(result.fetchedAt) : '') + (result.status !== 'fresh' || result.stale || result.partial ? '. '+result.message : ' · publication times shown on each story.');
  }
  async function loadNews(force=false) {
    const run = ++newsRun, requested = category, code = edition;
    newsInFlight = true; newsRequestedAt = Date.now();
    const candidate = D.getCachedHeadlines(requested,{edition:code}), cached = sameEdition(candidate,code) ? candidate : null;
    rows = currentItems(cached?.items,code,requested); headlineState = cached?.status || 'loading'; limit = 10;
    if (cached) { renderHeadlines(); status(cached,$('[data-news-status]')); }
    else { renderHeadlines(); $('[data-news-status]').textContent = 'Checking '+editionLabel()+' '+(requested==='all'?'all markets':requested)+' coverage…'; }
    $('[data-news-refresh]').disabled = true; $('[data-news-stories]').setAttribute('aria-busy','true');
    let result;
    try { result = await D.loadHeadlines(requested,{force,edition:code,timeoutMs:6500}); }
    catch { result = cached || {edition:code,items:[],status:'unavailable',message:'Open the publisher libraries below or try again.'}; }
    if (run !== newsRun || code !== edition) return;
    if (!sameEdition(result,code)) result = {edition:code,items:[],status:'unavailable',message:'This edition could not be refreshed. Try again.'};
    let items = currentItems(result.items,code,requested).filter(item => requested === 'all' || !isOfficial(item));
    if (requested === 'all' && !items.length) {
      try {
        const releases = await requestReleases(force,code);
        if (run !== newsRun || code !== edition) return;
        const official = sameEdition(releases,code) ? currentItems(releases.items,code,requested,true) : [];
        if (official.length) { items = official.map(item => isOfficial(item) ? item : {...item,kind:'official-release',category:'official'}); result = {...releases,coverage:'official-releases',partial:true,message:'Publisher headlines could not be refreshed. Dated official releases are shown.'}; }
      } catch { /* The headline status and independently rendered source links remain usable. */ }
    }
    if (run !== newsRun || code !== edition) return;
    rows = items; headlineState = result.status; renderHeadlines(); status(result,$('[data-news-status]'));
    newsInFlight = false; $('[data-news-refresh]').disabled = false; $('[data-news-stories]').setAttribute('aria-busy','false');
    app.dataset.feedReady = result.status; app.dataset.feedEdition = code; app.dataset.feedMs = String(Math.round(performance.now()-started));
  }
  function availablePublishers() {
    return D.publishers.filter(p => Array.isArray(p.editions) ? p.editions.includes(edition) || p.editions.includes('global') : ['us','global'].includes(edition) || !['cnbc','wsj','yahoo'].includes(p.id));
  }
  function renderMediaOptions() {
    const select = $('[data-media-publisher]'), previous = select.value;
    select.innerHTML = '<option value="all">All publishers</option>';
    availablePublishers().forEach(p => select.add(new Option(p.name,p.id)));
    if (availablePublishers().some(p => p.id === previous)) select.value = previous;
    let note = $('.fn-media-edition');
    if (!note) {note = document.createElement('p');note.className = 'fn-media-edition fn-source-note';$('[data-media-grid]').before(note);}
    note.textContent = editionLabel()+' edition · Global publisher libraries. Library contents and regional access are set by each publisher.';
  }
  function renderMedia() {
    const publisher = $('[data-media-publisher]').value, topic = $('[data-media-topic]').value;
    const selected = availablePublishers().filter(p => (publisher==='all'||p.id===publisher) && (topic==='all'||p.topics.includes(topic)));
    const cards = selected.flatMap(p => p.destinations.filter(d => d.category===mediaCategory).map(d => {
      const url = link(d.url); if (!url) return '';
      return '<article class="fn-media-card"><div class="fn-media-brand"><span class="fn-media-monogram" aria-hidden="true">'+esc(p.name==='The Wall Street Journal'?'WSJ':p.name==='Financial Times'?'FT':p.id==='cnbc'?'CNBC':p.id==='bloomberg'?'B':p.id==='yahoo'?'Y!':p.name.slice(0,3).toUpperCase())+'</span><span class="fn-media-type">'+esc(d.categoryLabel)+'</span></div><h3>'+esc(p.name)+'</h3><p>'+esc(p.summary)+'</p><div class="fn-media-topics">'+p.topics.map(t=>'<span>'+esc(t)+'</span>').join('<span aria-hidden="true"> · </span>')+'</div><p class="fn-media-access">'+esc(d.access)+'</p><a class="fn-media-action" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+(mediaCategory==='podcasts'?'Explore podcasts':mediaCategory==='live'?'Open broadcast page':'Explore videos')+' <span aria-hidden="true">↗</span></a></article>';
    }));
    $('[data-media-grid]').innerHTML = cards.length ? cards.join('') : '<div class="fn-empty"><h3>No libraries match these filters.</h3><p>Choose another publisher or topic to see available destinations.</p><button type="button" class="fn-refresh" data-media-reset>Clear filters</button></div>';
    $('[data-media-grid]').setAttribute('aria-live','polite');
  }
  function institutionRegion(item) {
    if (['fed','bea','bls','imf'].includes(item.id) || item.region === 'United States') return 'us';
    if (item.id === 'boj' || item.region === 'Japan') return 'japan';
    if (['boe','ecb'].includes(item.id) || ['Europe','United Kingdom'].includes(item.region)) return 'europe';
    return item.editions?.[0] || item.region;
  }
  function sourceMatchesRegion(source) { return region === 'all' || institutionRegion(source) === region; }
  function renderOfficialSidebar() {
    const target = $('.fn-terminal-sources'); if (!target) return;
    const sources = editionSources(edition);
    target.innerHTML = '<div class="fn-terminal-sources-heading"><h3>Official sources</h3><a href="#official-sources">All sources ↗</a></div><p class="fn-source-note">'+esc(editionLabel())+' edition</p>'+sources.map(source => '<a href="'+esc(link(source.website))+'" target="_blank" rel="noopener noreferrer"><span>'+esc(source.name)+'</span><span aria-hidden="true">↗</span></a>').join('')+(sources.length?'':'<p class="fn-source-note">No official release feed is configured for this edition.</p>');
  }
  function renderInstitutions() {
    const sources = editionSources(edition), ids = new Set(sources.map(source => source.id));
    let institutions = D.institutions;
    if (D.sourcesForEdition) {
      institutions = D.institutions.filter(item => edition === 'global' || ids.has(item.id) || (edition === 'us' && item.id === 'bls'));
      institutions = [...institutions,...sources.filter(source => !institutions.some(item => item.id === source.id)).map(source => ({...source,url:source.website,region:editionLabel(),summary:'Official publications and announcements.'}))];
    }
    const filtered = institutions.filter(sourceMatchesRegion);
    $('[data-institution-list]').innerHTML = filtered.length ? filtered.map(item => '<a class="fn-institution" href="'+esc(link(item.url))+'" target="_blank" rel="noopener noreferrer"><div><span>'+esc(item.region)+'</span><h3>'+esc(item.name)+'</h3><p>'+esc(item.summary)+'</p></div><b aria-hidden="true">↗</b></a>').join('') : '<p class="fn-source-note">No institutions match this edition and regional filter.</p>';
    $$('[data-region]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.region === region)));
    renderOfficialSidebar(); renderReleases();
  }
  function renderReleases() {
    releaseRows = currentItems(releaseRows,edition,'all',true);
    for (const key of savedItems.keys()) if (key.startsWith('release:')) savedItems.delete(key);
    const configured = editionSources(edition), allowed = new Set(configured.filter(sourceMatchesRegion).map(source => source.id));
    const items = releaseRows.filter(item => region === 'all' || allowed.has(item.sourceId));
    const sources = releaseState?.sources || [];
    const sourceLinks = configured.filter(sourceMatchesRegion).map(source => {
      const state = sources.find(row => row.id === source.id);
      return '<a href="'+esc(link(source.website))+'" target="_blank" rel="noopener noreferrer">'+esc(source.name)+' ↗</a>'+(state?'<span> '+esc(state.status==='fresh'?'Refreshed':state.status==='cached'?'Saved releases':'Website available')+(state.fetchedAt?' · '+esc(date(state.fetchedAt)):'')+'</span>':'');
    });
    $('[data-release-list]').innerHTML = (items.length ? items.slice(0,12).map(item => '<article class="fn-release"><div class="fn-story-topline"><span class="fn-story-source">'+esc(item.source)+'</span>'+saveButton(item,'release:')+'</div><h4><a href="'+esc(link(item.url))+'" target="_blank" rel="noopener noreferrer">'+esc(item.title)+' ↗</a></h4><time datetime="'+esc(item.publishedAt)+'">'+esc(date(item.publishedAt))+'</time></article>').join('') : '<div class="fn-empty"><h3>'+(region==='japan'?'Explore Japan’s official policy calendar.':'Open the original releases.')+'</h3><p>'+(region==='japan'?'The Bank of Japan website includes scheduled meetings, decisions and minutes.':sourceLinks.length?'Recent dated releases will appear when the selected institutions publish them.':'No official release feed matches this edition and regional filter.')+'</p></div>')+(sourceLinks.length?'<div class="fn-release-sources">'+sourceLinks.map(source => '<p>'+source+'</p>').join('')+'</div>':'');
  }
  async function loadReleases(force=false) {
    const run = ++releaseRun, code = edition;
    releasesInFlight = true; releasesRequestedAt = Date.now();
    const candidate = D.getCachedOfficialReleases({edition:code}), cached = sameEdition(candidate,code) ? candidate : null;
    releaseRows = currentItems(cached?.items,code,'all',true); releaseState = cached; renderReleases();
    if (cached) status(cached,$('[data-release-status]'));
    else $('[data-release-status]').textContent = 'Checking '+editionLabel()+' official releases…';
    $('[data-release-refresh]').disabled = true;
    let result;
    try { result = await requestReleases(force,code); }
    catch { result = cached || {edition:code,items:[],status:'unavailable',message:'Official source websites remain available below.'}; }
    if (run !== releaseRun || code !== edition) return;
    releaseState = sameEdition(result,code) ? result : {edition:code,items:[],status:'unavailable',message:'Official releases for this edition could not be refreshed.'};
    releaseRows = currentItems(releaseState.items,code,'all',true); renderReleases(); status(releaseState,$('[data-release-status]'));
    releasesInFlight = false; $('[data-release-refresh]').disabled = false; app.dataset.releasesReady = releaseState.status; app.dataset.releasesEdition = code;
  }
  function pruneExpired() {
    const nextRows = currentItems(rows), nextReleases = currentItems(releaseRows,edition,'all',true);
    if (nextRows.length !== rows.length) { rows = nextRows; renderHeadlines(); }
    if (nextReleases.length !== releaseRows.length) { releaseRows = nextReleases; renderReleases(); }
  }
  function refreshVisible() {
    if (document.visibilityState !== 'visible') return;
    pruneExpired(); const now = Date.now();
    if (!newsInFlight && now-newsRequestedAt >= REFRESH_MS) loadNews();
    if (!releasesInFlight && now-releasesRequestedAt >= REFRESH_MS) loadReleases();
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
  renderMediaOptions();
  for (const t of D.topics.filter(t=>t!=='All topics')) $('[data-media-topic]').add(new Option(t,t));
  $('[data-media-publisher]').addEventListener('change',renderMedia); $('[data-media-topic]').addEventListener('change',renderMedia);
  if (document.body.hasAttribute('data-fynx-terminal')) {
    const sidebar = $('.fn-sidebar'), context = $('.fn-research-links');
    if (sidebar && context) {
      const sources = document.createElement('section'); sources.className = 'fn-terminal-sources'; sources.setAttribute('aria-label','Official briefing sources');
      sources.dataset.editionSources = 'true';
      sidebar.insertBefore(sources,context);
    }
  }
  renderMedia(); renderInstitutions(); app.dataset.newsReady='true'; app.dataset.renderMs=String(Math.round(performance.now()-started));
  loadNews(); loadReleases();
  document.addEventListener('fynx:edition-change',event => {
    const next = event.detail?.edition || window.FynxEdition?.get();
    if (!next || next === edition) return;
    try { if (D.sourcesForEdition) D.sourcesForEdition(next); } catch { return; }
    edition = next; region = 'all'; rows = []; releaseRows = []; releaseState = null; savedItems.clear();
    renderMediaOptions(); renderMedia(); renderInstitutions(); loadNews(); loadReleases();
  });
  document.addEventListener('visibilitychange',refreshVisible);
  window.setInterval(refreshVisible,REFRESH_MS);
  window.setInterval(() => {if(document.visibilityState==='visible') pruneExpired();},60000);
})();
