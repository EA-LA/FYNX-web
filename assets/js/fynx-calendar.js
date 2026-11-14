/* FYNX economic calendar — FYNX's own design, no third-party widget.
 * Data: FYNX research snapshot of the Forex Factory weekly calendar (calendar.json on the research-data branch),
 * refreshed hourly by .github/workflows/refresh-public-research.yml. Every country and importance level, with
 * forecast and previous values. Release results are linked to the source; nothing is estimated.
 * Usage: FynxCalendar.mount(host, {compact: true, currencies: ['USD'], limit: 8}) → cleanup function.
 * Text is inserted with textContent only. */
(function (root) {
  'use strict';
  const URLS = ['https://raw.githubusercontent.com/EA-LA/FYNX-web/research-data/assets/data/research/calendar.json', '/assets/data/research/calendar.json'];
  const REFRESH_MS = 60000; // the file changes hourly; checking every minute picks up a new copy quickly
  const CCY = {USD: ['United States', '#3b6fd8'], EUR: ['Euro area', '#2f5fbf'], GBP: ['United Kingdom', '#c8423b'], JPY: ['Japan', '#d0394a'], CNY: ['China', '#d6402f'], AUD: ['Australia', '#1f7a5c'],
    NZD: ['New Zealand', '#2b4f8f'], CAD: ['Canada', '#d23c3c'], CHF: ['Switzerland', '#d43a3a'], INR: ['India', '#e08a2c'], ALL: ['All', '#6b7280']};
  const IMPACT = {high: [3, 'High importance'], medium: [2, 'Medium importance'], low: [1, 'Low importance'], holiday: [0, 'Bank holiday'], other: [0, 'Other']};
  let cache = null, cacheAt = 0, inflight = null;

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined && text !== null) n.textContent = String(text); return n; };
  async function load(force) {
    if (!force && cache && Date.now() - cacheAt < REFRESH_MS - 1000) return cache;
    if (inflight) return inflight;
    inflight = (async () => {
      for (const url of URLS) {
        try {
          const r = await fetch(url + (url.startsWith('https:') ? `?t=${Math.floor(Date.now() / REFRESH_MS)}` : ''), {cache: 'no-store', signal: AbortSignal.timeout?.(15000)});
          if (!r.ok) continue;
          const d = await r.json(); const week = Array.isArray(d?.all) && d.all.length ? d.all : Array.isArray(d?.events) ? d.events.map(e => ({...e, title: e.title || e.name})) : null;
          const seen = new Set((week || []).map(e => e.id)), list = week && [...week, ...(Array.isArray(d.nextWeek) ? d.nextWeek.filter(e => !seen.has(e.id)) : [])].sort((a, b) => a.time.localeCompare(b.time));
          if (list) { cache = {...d, list}; cacheAt = Date.now(); return cache; }
        } catch {}
      }
      return cache;
    })().finally(() => { inflight = null; });
    return inflight;
  }
  const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const dayLabel = t => { const d = new Date(t), now = new Date(), tm = new Date(now); tm.setDate(now.getDate() + 1); const y = new Date(now); y.setDate(now.getDate() - 1);
    const base = d.toLocaleDateString(undefined, {weekday: 'long', month: 'short', day: 'numeric'});
    return dayKey(t) === dayKey(now) ? `Today · ${base}` : dayKey(t) === dayKey(tm) ? `Tomorrow · ${base}` : dayKey(t) === dayKey(y) ? `Yesterday · ${base}` : base; };
  const timeLabel = (t, allDay) => allDay ? 'All day' : new Date(t).toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'});
  function until(ms) { const m = Math.round(ms / 60000); if (m < 1) return 'now'; if (m < 60) return `in ${m}m`; const h = Math.floor(m / 60); if (h < 24) return `in ${h}h ${m % 60}m`; return `in ${Math.floor(h / 24)}d ${h % 24}h`; }
  const isAllDay = e => e.impact === 'holiday' || /^\d{4}-\d{2}-\d{2}T00:00:00/.test(e.time) && e.impact === 'other';

  function bars(impact) { const [n, label] = IMPACT[impact] || IMPACT.other; const b = el('span', 'fc-imp fc-imp-' + (impact || 'other')); b.title = label; b.setAttribute('aria-label', label); for (let i = 0; i < 3; i++) b.append(el('i', i < n ? 'on' : '')); return b; }
  function chip(ccy) { const c = el('span', 'fc-ccy', ccy); const meta = CCY[ccy]; c.title = meta?.[0] || ccy; if (meta) c.style.setProperty('--fc-c', meta[1]); return c; }
  function value(label, v, cls = '') { const s = el('span', 'fc-val ' + cls); s.append(el('small', '', label), el('b', '', v || '—')); return s; }

  function mount(host, opts = {}) {
    if (!host) return () => {};
    const o = {compact: false, limit: 8, currencies: null, ...opts};
    const st = {imp: new Set(o.compact ? ['high', 'medium'] : ['high', 'medium', 'low', 'holiday']), ccy: new Set(o.currencies || []), day: o.compact ? 'upcoming' : 'week', q: ''};
    try { const saved = !o.compact && JSON.parse(localStorage.getItem('fynx-cal-filters') || 'null'); if (saved) { st.imp = new Set(saved.imp); st.ccy = new Set(saved.ccy); st.day = saved.day || 'week'; } } catch {}
    const save = () => { if (o.compact) return; try { localStorage.setItem('fynx-cal-filters', JSON.stringify({imp: [...st.imp], ccy: [...st.ccy], day: st.day})); } catch {} };
    host.classList.add('fc', o.compact ? 'fc-compact' : 'fc-full'); host.replaceChildren(el('p', 'fc-status', 'Loading the economic calendar…'));
    host.setAttribute('aria-busy', 'true');
    let data = null, alive = true;
    const head = el('div', 'fc-head'), next = el('div', 'fc-next'), controls = el('div', 'fc-controls'), list = el('div', 'fc-list'), foot = el('p', 'fc-foot');
    list.setAttribute('role', 'list');

    function filtered() {
      const now = Date.now(), today = dayKey(now), tm = new Date(); tm.setDate(tm.getDate() + 1);
      return data.list.filter(e => {
        if (!st.imp.has(e.impact === 'other' ? 'low' : e.impact)) return false;
        if (st.ccy.size && !st.ccy.has(e.currency)) return false;
        if (st.q && !`${e.title} ${e.currency} ${CCY[e.currency]?.[0] || ''}`.toLowerCase().includes(st.q)) return false;
        const t = Date.parse(e.time);
        if (st.day === 'today') return dayKey(t) === today;
        if (st.day === 'tomorrow') return dayKey(t) === dayKey(tm);
        if (st.day === 'upcoming') return t >= now - 30 * 60000;
        return true;
      });
    }
    function renderControls() {
      controls.replaceChildren();
      const group = (label, items, isOn, toggle) => { const g = el('div', 'fc-group'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label); g.append(el('span', 'fc-glabel', label));
        for (const [k, text] of items) { const b = el('button', 'fc-chip' + (isOn(k) ? ' on' : ''), text); b.type = 'button'; b.setAttribute('aria-pressed', String(isOn(k))); b.addEventListener('click', () => { toggle(k); save(); draw(); }); g.append(b); } controls.append(g); };
      group('Day', [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['upcoming', 'Upcoming'], ['week', 'This week']], k => st.day === k, k => { st.day = k; });
      group('Importance', [['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['holiday', 'Holidays']], k => st.imp.has(k), k => { st.imp.has(k) ? st.imp.delete(k) : st.imp.add(k); });
      const present = [...new Set(data.list.map(e => e.currency))].sort((a, b) => (Object.keys(CCY).indexOf(a) + 99 * !CCY[a]) - (Object.keys(CCY).indexOf(b) + 99 * !CCY[b]));
      group('Currency', [['*', 'All'], ...present.map(c => [c, c])], k => k === '*' ? !st.ccy.size : st.ccy.has(k), k => { if (k === '*') st.ccy.clear(); else st.ccy.has(k) ? st.ccy.delete(k) : st.ccy.add(k); });
      const q = el('input', 'fc-search'); q.type = 'search'; q.placeholder = 'Search events (CPI, payrolls, ECB…)'; q.value = st.q; q.setAttribute('aria-label', 'Search events');
      q.addEventListener('input', () => { st.q = q.value.trim().toLowerCase(); drawList(); }); controls.append(q);
    }
    function drawNext() {
      next.replaceChildren(); const now = Date.now();
      const up = data.list.filter(e => Date.parse(e.time) > now && (e.impact === 'high' || e.impact === 'medium') && (!st.ccy.size || st.ccy.has(e.currency)) && !isAllDay(e));
      const n = up.find(e => e.impact === 'high') || up[0]; if (!n) return;
      next.append(el('span', 'fc-next-k', 'NEXT ' + (n.impact === 'high' ? 'HIGH-IMPACT' : 'EVENT')), chip(n.currency), el('b', '', n.title), el('span', 'fc-next-t', `${until(Date.parse(n.time) - now)} · ${timeLabel(n.time)}`));
    }
    function drawList() {
      list.replaceChildren(); const now = Date.now();
      let rows = filtered();
      let recap = false;
      if (o.compact && !rows.length && st.day === 'upcoming') { // nothing left this week: show the latest releases instead of an empty box
        rows = data.list.filter(e => Date.parse(e.time) <= now && st.imp.has(e.impact === 'other' ? 'low' : e.impact) && (!st.ccy.size || st.ccy.has(e.currency)) && !isAllDay(e)).slice(-o.limit); recap = rows.length > 0;
      }
      if (o.compact) rows = rows.slice(0, o.limit);
      if (recap) list.append(el('p', 'fc-recap', 'No more important releases are scheduled until the next week’s calendar is published. Latest releases:'));
      if (!rows.length) { list.append(el('p', 'fc-status', o.compact ? 'No more high or medium importance releases scheduled this week.' : 'No events match these filters.')); return; }
      let last = '', firstUpcoming = null;
      for (const e of rows) {
        const t = Date.parse(e.time), key = dayKey(t);
        if (key !== last) { list.append(el('div', 'fc-day', dayLabel(t))); last = key; }
        const past = t <= now, allDay = isAllDay(e);
        const r = el('div', 'fc-row' + (past ? ' fc-past' : '') + (e.impact === 'high' ? ' fc-high' : '')); r.setAttribute('role', 'listitem');
        r.setAttribute('aria-label', `${timeLabel(e.time, allDay)}, ${CCY[e.currency]?.[0] || e.currency}, ${e.title}, ${IMPACT[e.impact]?.[1] || ''}${e.forecast ? ', forecast ' + e.forecast : ''}${e.previous ? ', previous ' + e.previous : ''}`);
        const when = el('div', 'fc-when'); when.append(el('time', '', timeLabel(e.time, allDay))); when.lastChild.dateTime = e.time;
        when.append(el('small', past ? 'fc-done' : 'fc-soon', past ? (allDay ? '' : 'Released') : until(t - now)));
        const what = el('div', 'fc-what'); const meta = el('div', 'fc-meta'); meta.append(chip(e.currency), bars(e.impact)); what.append(meta, el('span', 'fc-title', e.title));
        const nums = el('div', 'fc-nums'); nums.append(value('Forecast', e.forecast), value('Previous', e.previous));
        if (past && !allDay) { const a = el('a', 'fc-actual', 'Result ↗'); const dd = new Date(t); a.href = `https://www.forexfactory.com/calendar?day=${['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][dd.getUTCMonth()]}${dd.getUTCDate()}.${dd.getUTCFullYear()}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'Open the released result at the source'; nums.append(a); }
        r.append(when, what, nums); list.append(r);
        if (!past && !firstUpcoming) firstUpcoming = r;
      }
      if (!o.compact && firstUpcoming && st.day === 'week' && !list.dataset.scrolled) { list.dataset.scrolled = '1'; requestAnimationFrame(() => { try { list.scrollTop = Math.max(0, firstUpcoming.offsetTop - list.offsetTop - 40); } catch {} }); }
    }
    function drawFoot() {
      foot.replaceChildren();
      const src = el('a', '', 'Forex Factory'); src.href = 'https://www.forexfactory.com/calendar'; src.target = '_blank'; src.rel = 'noopener noreferrer';
      foot.append(`Times in your time zone (${Intl.DateTimeFormat().resolvedOptions().timeZone}). Schedule, forecasts and previous values from `, src, ` via FYNX research, updated ${new Date(data.updatedAt).toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'})}. “Result ↗” opens the published figure at the source.`);
    }
    function draw() { if (!data) return; renderControls(); drawNext(); drawList(); drawFoot(); }
    async function refresh(force) {
      const d = await load(force); if (!alive) return;
      host.removeAttribute('aria-busy');
      if (!d) { if (!data) host.replaceChildren(el('p', 'fc-status', 'The economic calendar could not be loaded right now. Check back in a minute.')); return; }
      const first = !data; data = d;
      if (first) { host.replaceChildren(); head.replaceChildren(next); if (!o.compact) head.append(controls); host.append(head, list, foot); }
      draw();
    }
    refresh(false);
    const tick = setInterval(() => { if (!document.hidden && data) { drawNext(); drawList(); } }, 30000); // countdowns and "Released" flips
    const poll = setInterval(() => { if (!document.hidden) refresh(true); }, REFRESH_MS);
    const vis = () => { if (!document.hidden) refresh(false); }; document.addEventListener('visibilitychange', vis);
    return () => { alive = false; clearInterval(tick); clearInterval(poll); document.removeEventListener('visibilitychange', vis); };
  }
  root.FynxCalendar = {mount, load};
})(window);
