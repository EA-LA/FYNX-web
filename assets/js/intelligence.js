/* FYNX Intelligence pages: bookmarks (this browser), sharing, hub search and filters, story photo. */
(function () {
  'use strict';
  const KEY = 'fynx_intel_saved_v1';
  const saved = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const store = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200))); } catch {} };
  function toast(text) { const t = document.createElement('div'); t.className = 'fx-toast'; t.setAttribute('role', 'status'); t.textContent = text; document.body.append(t); setTimeout(() => t.remove(), 2200); }

  function article() {
    const el = document.querySelector('[data-intel-id]'); if (!el) return;
    const id = el.dataset.intelId, url = el.dataset.intelUrl || location.href, title = el.dataset.intelTitle || document.title;
    const mark = document.querySelector('[data-intel-bookmark]');
    const paint = () => { const on = saved().some(x => x.id === id); mark.setAttribute('aria-pressed', String(on)); mark.textContent = on ? 'Bookmarked' : 'Bookmark'; };
    if (mark) { paint(); mark.addEventListener('click', () => { const list = saved(), on = list.some(x => x.id === id); store(on ? list.filter(x => x.id !== id) : [{id, url: location.pathname, title, at: new Date().toISOString()}, ...list]); paint(); toast(on ? 'Removed from saved stories' : 'Saved in this browser'); }); }
    const share = document.querySelector('[data-intel-share]');
    if (share) share.addEventListener('click', async () => {
      if (navigator.share) { try { await navigator.share({title, url}); return; } catch (e) { if (e?.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { prompt('Copy this link', url); }
    });
    const photo = document.querySelector('[data-story-photo]');
    if (photo && window.FYNXNewsroomMedia?.createFigure) {
      const fig = window.FYNXNewsroomMedia.createFigure('markets', {story: {url: photo.dataset.storyPhoto, title: photo.dataset.storyTitle}, loading: 'eager'});
      // Show only a real story photo; never a generic context picture.
      if (fig) { photo.hidden = true; photo.append(fig); const watch = new MutationObserver(() => { if (fig.dataset.storyImage) { photo.hidden = false; watch.disconnect(); } }); watch.observe(fig, {attributes: true, attributeFilter: ['data-story-image']}); }
    }
  }

  function hub() {
    const input = document.querySelector('[data-intel-search]'); if (!input) return;
    const items = [...document.querySelectorAll('[data-intel-item]')], buttons = [...document.querySelectorAll('[data-intel-filter]')], empty = document.querySelector('[data-intel-empty]'), count = document.querySelector('[data-intel-count]');
    const emptyText = empty ? empty.textContent : '';
    const params = new URLSearchParams(location.search), known = new Set(buttons.map(b => b.dataset.intelFilter));
    let filter = known.has(params.get('class')) ? params.get('class') : 'all';
    if (params.get('q')) input.value = params.get('q').slice(0, 80);
    const paint = () => buttons.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.intelFilter === filter)));
    // Keep the view in the address so Back from a story, a refresh or a shared link reopens it.
    function remember() {
      try {
        const url = new URL(location.href), q = input.value.trim();
        if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
        if (filter !== 'all') url.searchParams.set('class', filter); else url.searchParams.delete('class');
        if (url.href !== location.href) history.replaceState(history.state, '', url);
      } catch {}
    }
    function apply() {
      const q = input.value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean), list = saved(), mine = new Set(list.map(x => x.url));
      let shown = 0;
      for (const li of items) {
        const href = li.querySelector('a')?.getAttribute('href');
        const ok = words.every(w => li.dataset.search.includes(w)) && (filter === 'all' || (filter === 'saved' ? mine.has(href) : li.dataset.classes.split(' ').includes(filter)));
        li.hidden = !ok; if (ok) shown++;
      }
      if (empty) {
        empty.hidden = shown > 0;
        const onHub = items.some(li => mine.has(li.querySelector('a')?.getAttribute('href')));
        empty.textContent = filter === 'saved' && !q && !onHub
          ? (list.length ? 'Your saved stories are older than the stories listed here, so they are no longer shown.' : 'No saved stories yet. Open a story and tap Bookmark to keep it here. Saved stories stay in this browser only.')
          : emptyText;
      }
      if (count) count.textContent = `${shown} ${shown === 1 ? 'story' : 'stories'}${q ? ` matching “${input.value.trim()}”` : ''}`;
      remember();
    }
    input.addEventListener('input', apply);
    buttons.forEach(b => b.addEventListener('click', () => { filter = b.dataset.intelFilter; paint(); apply(); }));
    if (input.value || filter !== 'all') {
      paint(); apply();
      // On a phone the chip row scrolls sideways; bring the chosen chip into view without moving the page.
      const on = buttons.find(b => b.dataset.intelFilter === filter), row = on?.parentElement;
      if (row && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - 16);
    }
  }
  const go = () => { article(); hub(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
