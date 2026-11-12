/* Trading Glossary finder (site-qa 2026-11-12 run 76): search the term cards by word and filter by
   their topic badge. Works on the static page; the finder stays hidden if this script does not run.
   State is kept in ?q= and ?topic= (search words only, never account data) so Back, refresh and
   shared links reopen the same view.
   Run 77: a search also looks through the nine market glossaries (learn/*-glossary.html, fetched
   once on the first search) and lists matching terms with their definition and a link. */
(function () {
  const finder = document.getElementById('glossary-search');
  if (!finder) return;
  const input = finder.querySelector('#glossarySearch');
  const select = finder.querySelector('#glossaryTopic');
  const status = finder.querySelector('[data-glossary-status]');
  const clear = finder.querySelector('[data-glossary-clear]');
  const sections = [...document.querySelectorAll('section[id^="letter-"]')];
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%:]+/g, ' ').trim();
  const cards = [];
  const counts = new Map();
  for (const section of sections) {
    for (const card of section.querySelectorAll('.term-card')) {
      const title = card.querySelector('h3')?.textContent || '';
      const badge = card.querySelector('.badge')?.textContent || '';
      const topics = badge.split('/').map(t => t.trim()).filter(Boolean);
      topics.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
      cards.push({ card, section, title: fold(title), text: fold(title + ' ' + badge + ' ' + (card.querySelector('p')?.textContent || '')), topics: topics.map(t => t.toLowerCase()) });
    }
  }
  if (!cards.length) return;
  const topicNames = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
  for (const name of topicNames) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = `${name} (${counts.get(name)})`;
    select.append(option);
  }
  const alphaLinks = [...document.querySelectorAll('.alpha-nav a[href^="#letter-"]')];
  const total = cards.length;
  const topicFrom = value => topicNames.find(n => n.toLowerCase() === String(value || '').trim().toLowerCase()) || '';
  const plural = n => `${n} term${n === 1 ? '' : 's'}`;

  const more = finder.querySelector('[data-glossary-more]');
  const moreList = more && more.querySelector('ul');
  const moreNote = more && more.querySelector('[data-glossary-more-note]');
  const retry = finder.querySelector('[data-glossary-retry]');
  const MARKETS = [['stocks', 'Stocks'], ['funds', 'Funds'], ['futures', 'Futures'], ['options', 'Options'], ['forex', 'Forex'], ['crypto', 'Crypto'], ['indices', 'Indices'], ['bonds', 'Bonds'], ['economy', 'Economy']];
  const MORE_LIMIT = 8;
  const EXTRA_TIMEOUT_MS = 8000;
  let extra = null;
  let extraLoading = null;
  let unavailableCount = 0;
  function loadExtra() {
    if (extra !== null || extraLoading || !more || typeof fetch !== 'function') return extraLoading;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeout;
    // A stalled market page must not keep the cross-market search pending forever.
    const requests = Promise.all(MARKETS.map(([slug, market]) => {
      const href = `/learn/${slug}-glossary.html`;
      const options = controller ? { credentials: 'same-origin', signal: controller.signal } : { credentials: 'same-origin' };
      return fetch(href, options)
        .then(res => {
          if (!res.ok) return { items: [], failed: true };
          return res.text().then(html => {
            if (!html) return { items: [], failed: true };
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const items = [...doc.querySelectorAll('.glossary article.term')].map(node => {
              const term = (node.querySelector('strong')?.textContent || '').trim();
              const def = (node.querySelector('p')?.textContent || '').trim();
              return { term, def, market, href, title: fold(term), text: fold(term + ' ' + market + ' ' + def) };
            }).filter(item => item.term);
            return { items, failed: false };
          });
        })
        .catch(() => ({ items: [], failed: true }));
    }));
    extraLoading = Promise.race([
      requests,
      new Promise(resolve => { timeout = setTimeout(() => resolve(null), EXTRA_TIMEOUT_MS); })
    ]).then(lists => {
      clearTimeout(timeout);
      if (!lists && controller) controller.abort();
      extra = lists ? lists.flatMap(result => result.items) : [];
      unavailableCount = lists ? lists.filter(result => result.failed).length : MARKETS.length;
      extraLoading = null;
      apply(false);
    });
    return extraLoading;
  }
  function renderExtra(words, topic) {
    if (!more) return 0;
    if (!words.length || topic || !extra) { more.hidden = true; return 0; }
    // Whole-term matches first, then matches in the definition.
    const hits = extra.filter(item => words.every(w => item.text.includes(w)))
      .sort((a, b) => Number(!words.every(w => a.title.includes(w))) - Number(!words.every(w => b.title.includes(w))));
    moreList.textContent = '';
    for (const item of hits.slice(0, MORE_LIMIT)) {
      const li = document.createElement('li');
      const head = document.createElement('div');
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.term;
      const tag = document.createElement('span');
      tag.textContent = `${item.market} glossary`;
      head.append(link, tag);
      const def = document.createElement('p');
      def.textContent = item.def;
      li.append(head, def);
      moreList.append(li);
    }
    moreNote.textContent = hits.length > MORE_LIMIT ? `Showing ${MORE_LIMIT} of ${hits.length}. Add another word to narrow the list.` : '';
    moreNote.hidden = !moreNote.textContent;
    more.hidden = !hits.length;
    return hits.length;
  }

  function apply(save) {
    const words = fold(input.value).split(' ').filter(Boolean);
    const topic = select.value.toLowerCase();
    let shown = 0;
    for (const item of cards) {
      const ok = (!topic || item.topics.includes(topic)) && words.every(w => item.text.includes(w));
      item.card.hidden = !ok;
      if (ok) shown++;
    }
    const filtering = words.length > 0 || !!topic;
    for (const section of sections) {
      section.hidden = filtering && !section.querySelector('.term-card:not([hidden])');
    }
    for (const link of alphaLinks) {
      const target = document.getElementById(link.getAttribute('href').slice(1));
      link.hidden = !!target && target.hidden;
    }
    const topicLabel = select.value ? ` in ${select.value}` : '';
    const query = input.value.trim();
    if (words.length && !topic) loadExtra();
    const extraCount = renderExtra(words, topic);
    const searchingMarkets = !!(words.length && !topic && extraLoading);
    const incompleteMarkets = !!(words.length && !topic && unavailableCount);
    const extraLabel = extraCount ? ` Also ${plural(extraCount)} in the market glossaries below.` : '';
    const pendingLabel = searchingMarkets ? ' Checking other market glossaries…' : '';
    const incompleteLabel = incompleteMarkets ? ' Some market glossaries could not be checked; retry for complete results.' : '';
    if (retry) retry.hidden = !incompleteMarkets;
    if (!filtering) status.textContent = `${plural(total)} from A to Z.`;
    else if (shown) status.textContent = `Showing ${plural(shown)}${query ? ` for “${query}”` : ''}${topicLabel}.${extraLabel}${pendingLabel}${incompleteLabel}`;
    else if (extraCount) status.textContent = `No terms on this page match “${query}”. Found ${plural(extraCount)} in the market glossaries below.${incompleteLabel}`;
    else if (searchingMarkets) status.textContent = `No terms on this page match “${query}”. Checking the market glossaries…`;
    else if (incompleteMarkets) status.textContent = `No terms on this page match “${query}”. Some market glossaries are unavailable; retry before treating this as no results.`;
    else status.textContent = `No terms match${query ? ` “${query}”` : ''}${topicLabel}. Try a shorter word${select.value ? ' or All topics' : ''}.`;
    clear.hidden = !filtering;
    finder.classList.toggle('is-empty', filtering && !shown && !extraCount);
    if (save) {
      try {
        const url = new URL(location.href);
        query ? url.searchParams.set('q', query.slice(0, 80)) : url.searchParams.delete('q');
        select.value ? url.searchParams.set('topic', select.value) : url.searchParams.delete('topic');
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      } catch (error) { /* address bar update is optional */ }
    }
  }

  function restore() {
    const params = new URLSearchParams(location.search);
    input.value = (params.get('q') || '').slice(0, 80);
    select.value = topicFrom(params.get('topic'));
    apply(false);
  }

  input.addEventListener('input', () => apply(true));
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape' && input.value) { event.preventDefault(); input.value = ''; apply(true); }
  });
  select.addEventListener('change', () => apply(true));
  clear.addEventListener('click', () => { input.value = ''; select.value = ''; apply(true); input.focus(); });
  if (retry) retry.addEventListener('click', () => { extra = null; unavailableCount = 0; loadExtra(); apply(false); });
  finder.addEventListener('submit', event => { event.preventDefault(); input.blur(); });
  for (const link of document.querySelectorAll('[data-glossary-topic]')) {
    link.addEventListener('click', event => {
      const name = topicFrom(link.getAttribute('data-glossary-topic'));
      if (!name) return;
      event.preventDefault();
      input.value = '';
      select.value = name;
      apply(true);
      finder.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
  }
  // A letter link should still work while a filter hides other letters; clearing first if its section is hidden.
  for (const link of alphaLinks) {
    link.addEventListener('click', () => {
      const target = document.getElementById(link.getAttribute('href').slice(1));
      if (target && target.hidden) { input.value = ''; select.value = ''; apply(true); }
    });
  }
  window.addEventListener('popstate', restore);
  finder.hidden = false;
  restore();
})();
