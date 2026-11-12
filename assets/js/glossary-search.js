/* Trading Glossary finder (site-qa 2026-11-12 run 76): search the term cards by word and filter by
   their topic badge. Works on the static page; the finder stays hidden if this script does not run.
   State is kept in ?q= and ?topic= (search words only, never account data) so Back, refresh and
   shared links reopen the same view. */
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
    if (!filtering) status.textContent = `${plural(total)} from A to Z.`;
    else if (shown) status.textContent = `Showing ${plural(shown)}${query ? ` for “${query}”` : ''}${topicLabel}.`;
    else status.textContent = `No terms match${query ? ` “${query}”` : ''}${topicLabel}. Try a shorter word${select.value ? ' or All topics' : ''}.`;
    clear.hidden = !filtering;
    finder.classList.toggle('is-empty', filtering && !shown);
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
