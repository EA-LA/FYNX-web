/* Source-attributed section coverage. No generated news or invented market data. */
(function () {
  'use strict';
  const app = document.querySelector('[data-newsroom-page]');
  if (!app || app.dataset.newsroomReady) return;
  const configuration = document.getElementById('newsroom-config');
  let config;
  try { config = JSON.parse(configuration.textContent); } catch (_) { return; }
  if (!config?.category || !config?.title) return;
  app.dataset.newsroomReady = 'true';
  const $ = selector => app.querySelector(selector);
  const cadence = 5 * 60 * 1000;
  let requestNumber = 0, lastAttempt = 0, timer, rows = [], visibleLatest = 8, activeEdition = '', lastResult = null;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function plain(value, length) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, length) : ''; }
  function safeURL(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
      if (!url.hostname.includes('.') || url.hostname.includes(':') || url.hostname.endsWith('.local') || url.hostname.endsWith('.localhost') || /^[\d.]+$/.test(url.hostname)) return null;
      return url.href;
    } catch (_) { return null; }
  }
  function edition() {
    try { return window.FynxEdition?.get() || 'global'; } catch (_) { return 'global'; }
  }
  function editionInfo(code) {
    const item = window.FynxEdition?.editions?.find(item => item.id === code);
    return { label: item?.label || (code === 'global' ? 'Global' : code), locale: item?.locale };
  }
  function date(value, options) {
    if (!value) return "";
    const time = new Date(value);
    if (!Number.isFinite(time.getTime())) return '';
    const settings = options || { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
    try { return time.toLocaleString(editionInfo(activeEdition).locale || undefined, settings); }
    catch (_) { return time.toLocaleString(undefined, settings); }
  }
  let windowHours = 24, windowEdition = null, widenNote = '';
  function normalized(items, hours = windowHours, ed = windowEdition || activeEdition) {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const url = safeURL(item.url || item.link), title = plain(item.title, 500), source = plain(item.source, 160);
      const published = Date.parse(item.publishedAt || item.pubDate);
      if (!url || !title || !source || seen.has(url) || !Number.isFinite(published) || published > Date.now() + 300000 || Date.now() - published > hours * 60 * 60 * 1000 || (item.edition && item.edition !== ed)) return [];
      seen.add(url);
      return [{ ...item, url, title, source, publishedAt: new Date(published).toISOString() }];
    }).sort((a, b) => (a.rank||1000)-(b.rank||1000) || (b.priorityScore||0)-(a.priorityScore||0) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 60);
  }
  function imageFor(item) {
    const metadata = item.image;
    if (!metadata || typeof metadata !== 'object') return null;
    const url = safeURL(metadata.url), credit = plain(metadata.credit, 200), license = plain(metadata.license, 160);
    const permitted = metadata.licensed === true || /^(cc0|cc[- ]by(?:[- ]sa)?(?:[ -]4\.0)?|public domain|publisher[- ]licensed)$/i.test(license);
    if (!url || !credit || !license || !permitted) return null;
    const figure = node('figure', 'newsroom-story-image');
    const image = node('img');
    image.src = url;
    image.alt = plain(metadata.alt, 300);
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => { const fallback = contextFigure(); if (fallback) figure.replaceWith(fallback); else figure.remove(); }, { once: true });
    const caption = node('figcaption', '', credit + ' · ' + license);
    const licenseURL = safeURL(metadata.licenseUrl || metadata.licenseURL);
    if (licenseURL) { const link = node('a', '', 'Image license'); link.href = licenseURL; link.target = '_blank'; link.rel = 'noopener noreferrer'; caption.append(document.createTextNode(' · '), link); }
    figure.append(image, caption);
    return figure;
  }
  function contextFigure(story) {
    let contextId = config.id;
    if (activeEdition !== 'us' && ['politics','economics','energy'].includes(contextId)) contextId = 'world';
    if (activeEdition !== 'us' && contextId === 'markets') contextId = activeEdition === 'uk' ? 'finance' : 'world';
    return window.FYNXNewsroomMedia?.createFigure(contextId, story ? {story} : undefined) || null;
  }
  function story(item, kind) {
    const article = node('article', 'newsroom-story newsroom-story-' + kind);
    const source = node('p', 'newsroom-story-source', item.source);
    if (kind === 'lead') source.prepend(node('span', 'newsroom-lead-label', 'LATEST LEAD'), document.createTextNode(' '));
    const title = node(kind === 'lead' ? 'h2' : 'h3');
    const link = node('a', '', item.title);
    link.href = window.FYNXNewsReaderData?.href(item) || '/news/article.html';
    const arrow = node('span', 'newsroom-story-arrow', '→'); arrow.setAttribute('aria-hidden', 'true'); link.append(document.createTextNode(' '), arrow);
    title.append(link);
    const meta = node('div', 'newsroom-story-meta');
    const published = node('time', '', date(item.publishedAt)); published.dateTime = item.publishedAt;
    meta.append(published);
    if (item.via) meta.append(node('span', '', 'Via ' + plain(item.via, 100)));
    if (item.status === 'cached' || item.stale === true) meta.append(node('span', 'newsroom-saved-label', 'Saved coverage'));
    if (kind === 'lead') { const image = imageFor(item) || contextFigure(item); if (image) article.append(image); }
    article.append(source, title, meta);
    if (kind === 'lead') article.append(node('p', 'newsroom-story-access', 'Read the FYNX brief: key facts, context and the original source.'));
    return article;
  }
  function message(title, detail) {
    const box = node('div', 'newsroom-feed-message');
    const image = contextFigure();
    if (image) box.append(image);
    box.append(node('p', 'newsroom-kicker', config.title.toUpperCase() + ' / ' + editionInfo(activeEdition).label.toUpperCase()), node('h2', '', title), node('p', '', detail));
    const sources = node('a', '', 'Explore the primary sources →');
    sources.href = '#newsroom-sources'; box.append(sources);
    return box;
  }
  function render() {
    window.FYNXNewsReaderData?.prefetch(rows.slice(0,6));
    $('[data-newsroom-lead]').replaceChildren(story(rows[0], 'lead'));
    const secondary = $('[data-newsroom-secondary]');
    secondary.replaceChildren(...rows.slice(1, 4).map(item => story(item, 'secondary')));
    secondary.hidden = rows.length < 2;
    const latest = rows.slice(4);
    $('[data-newsroom-latest-section]').hidden = !latest.length;
    $('[data-newsroom-latest]').replaceChildren(...latest.slice(0, visibleLatest).map(item => story(item, 'latest')));
    $('[data-newsroom-count]').textContent = latest.length + (latest.length === 1 ? ' report' : ' reports');
    const more = $('[data-newsroom-more]');
    more.hidden = latest.length <= visibleLatest;
    more.textContent = 'Show more reporting (' + Math.max(0, latest.length - visibleLatest) + ')';
  }
  function setStatus(result) {
    const saved = result.status === 'cached';
    const unavailable = result.status === 'unavailable';
    const partial = result.stale === true || result.partial === true;
    const label = saved ? 'Saved coverage' : unavailable ? 'Sources unavailable' : partial ? 'Partly refreshed' : 'Coverage updated';
    $('[data-newsroom-status-label]').textContent = label;
    const retrieved = date(result.fetchedAt);
    $('[data-newsroom-status]').textContent = [editionInfo(activeEdition).label + ' edition', retrieved ? 'Retrieved ' + retrieved : '', rows.length + (rows.length === 1 ? ' report' : ' reports'), saved || unavailable || partial ? plain(result.message, 400) : 'Past 24 hours · Checks every 5 minutes · Publication times shown.'].filter(Boolean).join(' · ');
    app.dataset.feedState = saved ? 'cached' : unavailable ? 'unavailable' : partial ? 'partial' : 'fresh';
    if (widenNote) $('[data-newsroom-status]').textContent += ' · ' + widenNote;
  }
  function pruneCoverage() {
    const recent = normalized(rows);
    if (recent.length === rows.length) return;
    rows = recent;
    if (rows.length) render();
    else {
      $('[data-newsroom-secondary]').hidden = true;
      $('[data-newsroom-latest-section]').hidden = true;
      $('[data-newsroom-lead]').replaceChildren(message('No recent reports in this edition.', 'Reports older than 24 hours have been removed. The source directory and FYNX reading guide remain available while fresh coverage is checked.'));
    }
    if (lastResult) setStatus(lastResult);
  }
  async function refresh(force) {
    const requestedEdition = edition();
    const run = ++requestNumber;
    const changedEdition = requestedEdition !== activeEdition;
    activeEdition = requestedEdition;
    lastAttempt = Date.now();
    $('[data-newsroom-edition]').textContent = editionInfo(activeEdition).label + ' edition';
    if (changedEdition || !rows.length) {
      rows = []; visibleLatest = 8; lastResult = null;
      $('[data-newsroom-secondary]').hidden = true;
      $('[data-newsroom-latest-section]').hidden = true;
      $('[data-newsroom-lead]').replaceChildren(message('Checking the latest coverage.', 'Reading ' + config.title.toLowerCase() + ' reporting for the ' + editionInfo(activeEdition).label + ' edition.'));
    }
    pruneCoverage();
    // Retain only recently validated coverage from this edition during a source outage.
    // A changed edition must never inherit reports from the previous selection.
    const priorRows = changedEdition ? [] : rows.slice();
    const priorWindowHours = windowHours;
    const priorWindowEdition = windowEdition;
    const priorWidenNote = widenNote;
    const priorFetchedAt = lastResult?.fetchedAt || null;
    $('[data-newsroom-status-label]').textContent = 'Checking sources';
    $('[data-newsroom-status]').textContent = 'Refreshing ' + editionInfo(activeEdition).label + ' edition coverage…';
    $('[data-newsroom-refresh]').disabled = true;
    $('[data-newsroom-stories]').setAttribute('aria-busy', 'true');
    let result;
    try {
      if (!window.FYNXMarketIntelligenceData?.loadHeadlines) throw new Error('Feed unavailable');
      result = await window.FYNXMarketIntelligenceData.loadHeadlines(config.category, { edition: requestedEdition, force: force === true });
      if (!result || !Array.isArray(result.items)) throw new Error('Invalid feed');
    } catch (_) {
      result = { items: [], status: 'unavailable', fetchedAt: null, message: 'Reporting could not be refreshed. Try again or use the primary sources and FYNX reading guide below.' };
    }
    // An old edition response must never replace the selection made afterwards.
    if (run !== requestNumber || requestedEdition !== edition()) return;
    // A failed refresh should not erase still-valid, source-checked stories.
    // Preserve the retrieval timestamp and show an explicit Saved coverage state;
    // a genuine successful empty response may still clear the previous list.
    if (result.status === 'unavailable' && priorRows.length) {
      const retained = normalized(priorRows, priorWindowHours, priorWindowEdition || activeEdition);
      if (retained.length) {
        rows = retained;
        windowHours = priorWindowHours;
        windowEdition = priorWindowEdition;
        widenNote = priorWidenNote;
        lastResult = {
          ...result,
          status: 'cached',
          fetchedAt: priorFetchedAt,
          message: 'Source refresh unavailable. Showing previously verified reports; use Refresh to try again.'
        };
        render();
        setStatus(lastResult);
        $('[data-newsroom-refresh]').disabled = false;
        $('[data-newsroom-stories]').setAttribute('aria-busy', 'false');
        return;
      }
    }
    lastResult = result;
    windowHours = 24; windowEdition = null; widenNote = '';
    rows = normalized(result.items);
    // Never leave the desk empty: widen to the past week, then use the Global edition's desk.
    if (!rows.length) { const week = normalized(result.items, 168); if (week.length) { rows = week; windowHours = 168; widenNote = 'No reports in the past 24 hours for this edition — showing the latest from the past 7 days.'; } }
    if (!rows.length && requestedEdition !== 'global') {
      // The market-data module may not have loaded (or its method may throw
      // synchronously). Failure of the optional Global fallback must not leave
      // Refresh disabled or the reporting area stuck in aria-busy state.
      let g = null;
      try {
        if (typeof window.FYNXMarketIntelligenceData?.loadHeadlines === 'function') {
          g = await window.FYNXMarketIntelligenceData.loadHeadlines(config.category, {edition: 'global'});
        }
      } catch (_) { /* The selected-edition failure state is shown below. */ }
      if (run !== requestNumber || requestedEdition !== edition()) return;
      const gr = g ? normalized(g.items, 72, 'global') : [];
      if (gr.length) { rows = gr; windowHours = 72; windowEdition = 'global'; widenNote = 'No reports for this edition right now — showing the Global edition desk.'; }
    }
    if (rows.length) render();
    else {
      $('[data-newsroom-secondary]').hidden = true;
      $('[data-newsroom-latest-section]').hidden = true;
      $('[data-newsroom-lead]').replaceChildren(message(result.status === 'unavailable' ? 'Coverage is temporarily unavailable.' : 'No recent reports in this edition.', 'The source directory and original FYNX reading guide remain available. You can refresh or choose another edition.'));
    }
    setStatus(result);
    $('[data-newsroom-refresh]').disabled = false;
    $('[data-newsroom-stories]').setAttribute('aria-busy', 'false');
  }
  function checkCoverage() {
    if (document.hidden) return;
    pruneCoverage();
    if (Date.now() - lastAttempt >= cadence) refresh(false);
  }
  function schedule() { clearInterval(timer); timer = window.setInterval(checkCoverage, 60000); }
  const sources = app.querySelector('.newsroom-source-list');
  if (sources) sources.id = 'newsroom-sources';
  const follow = $('[data-newsroom-follow]');
  function syncFollow() {
    if (!follow) return;
    const preferences = window.FYNXYourNews;
    follow.hidden = !preferences;
    const following = preferences?.getTopics().includes(config.category);
    follow.setAttribute('aria-pressed', String(!!following));
    follow.textContent = following ? 'Following ' + config.title + ' ✓' : 'Follow ' + config.title;
    follow.title = 'Personalize Your News in this browser';
  }
  follow?.addEventListener('click', () => {
    const preferences = window.FYNXYourNews;
    if (!preferences) return;
    const topics = preferences.getTopics();
    preferences.setTopics(topics.includes(config.category) ? topics.filter(id => id !== config.category) : [...topics, config.category]);
    syncFollow();
  });
  document.addEventListener('fynx:news-preferences-change', syncFollow);
  syncFollow();
  $('[data-newsroom-refresh]').addEventListener('click', () => refresh(true));
  $('[data-newsroom-more]').addEventListener('click', () => { visibleLatest += 8; if (rows.length) render(); });
  document.addEventListener('fynx:edition-change', () => refresh(true));
  document.addEventListener('visibilitychange', checkCoverage);
  window.addEventListener('pagehide', () => clearInterval(timer));
  window.addEventListener('pageshow', event => { schedule(); if (event.persisted) checkCoverage(); });
  schedule();
  refresh(false);
})();
