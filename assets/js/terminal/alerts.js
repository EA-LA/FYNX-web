/* FYNX Terminal: personalised market alerts and the notification bell.
 *
 * Uses FYNX's existing notification system: every alert is created through the account's notification engine
 * (users/{uid}/notifications, with its preferences, de-duplication, burst limit and browser delivery) and every
 * followed market is the account's own watchlist record (account sync 'newsWatchlists' · id 'terminal-default'),
 * the same lists Your News and the Research Desk use. The module bridge (notify-bridge.js) connects them; this
 * plugin never stores alerts or watchlists anywhere else.
 *
 * Alerts are raised only for markets the member follows (any of their watchlists) or has an alert rule for, and only
 * for things that matter: a large move for that kind of market, news that names the market, earnings for it today or
 * tomorrow, high-impact economic releases and central bank decisions for its currencies, and Research Desk price
 * rules that are met. Each is sent once (per market, day and direction; per story; per event; per rule and day). */
(function (root) {
  'use strict';
  /* ------------------------- pure signal logic (unit-tested in Node) ------------------------- */
  // Daily move worth an alert, by kind of market (percent), unless the move is also ≥ 3× its typical daily move.
  const MOVE = {stock: 4, fund: 2.5, crypto: 6, fx: 1, other: 2};
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
  function moveSignal(sym, cls, q, now = Date.now()) {
    if (!q || !finite(q.changePercent) || !finite(q.price)) return null;
    const ch = q.changePercent, a = Math.abs(ch), lim = MOVE[cls] || MOVE.other, z = finite(q.vol20) && q.vol20 > 0 ? a / q.vol20 : null;
    if (!(a >= lim || (z !== null && z >= 3 && a >= lim / 2))) return null;
    const dir = ch > 0 ? 'up' : 'down';
    return {kind: 'move', key: `move:${sym}:${dayKey(now)}:${dir}`, priority: a >= lim * 2 || (z !== null && z >= 4) ? 'high' : 'medium', change: ch, z};
  }
  // Words that identify a market in a headline: the ticker (3+ letters, as a whole word) and the company's first name.
  function marketWords(sym, name) {
    const tick = String(sym).replace(/=X$|=F$|-USD$|^\^/g, '').toUpperCase(), out = [];
    if (/^[A-Z]{3,6}$/.test(tick)) out.push({re: new RegExp(`(^|[^A-Za-z])${tick}([^A-Za-z]|$)`), w: tick});
    const first = String(name || '').replace(/,? (Inc|Corp|Corporation|Ltd|plc|Holdings|Group|N\.V\.|S\.A\.|AG|SE|Co|USD|US Dollar)\.?$/i, '').split(/[\s/]+/)[0] || '';
    if (first.length >= 4 && !/^(the|bank|first|global|united|american|international|general|national)$/i.test(first)) out.push({re: new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), w: first});
    return out;
  }
  function newsSignals(sym, name, headlines, now = Date.now(), maxAgeMs = 3 * 3600e3) {
    const words = marketWords(sym, name); if (!words.length) return [];
    return (headlines || []).filter(h => h && h.title && Date.parse(h.publishedAt) > now - maxAgeMs && words.some(w => w.re.test(h.title)))
      .map(h => ({kind: 'news', key: `news:${sym}:${(h.url || h.title).slice(0, 180)}`, priority: h.breaking || h.isBreaking || h.importance === 'high' ? 'high' : 'medium', headline: h}));
  }
  function earningsSignal(sym, events, now = Date.now()) {
    const today = dayKey(now), tomorrow = dayKey(now + 86400e3), t = String(sym).replace('.', '-');
    const e = (events || []).find(x => String(x.symbol).replace('.', '-') === t && (x.date === today || x.date === tomorrow));
    return e ? {kind: 'earnings', key: `earn:${t}:${e.date}`, priority: e.date === today ? 'high' : 'medium', event: e, when: e.date === today ? 'today' : 'tomorrow'} : null;
  }
  // High-impact releases for the market's currencies within the next 45 minutes.
  function calendarSignals(ccys, events, now = Date.now()) {
    const want = new Set(ccys || []);
    return (events || []).filter(e => want.has(e.currency) && String(e.impact).toLowerCase() === 'high' && Date.parse(e.time) > now && Date.parse(e.time) - now <= 45 * 60e3)
      .map(e => ({kind: 'calendar', key: `cal:${e.currency}:${e.title}:${e.time}`, priority: 'high', event: e}));
  }
  function ruleSignal(rule, q, now = Date.now()) {
    if (!rule?.enabled || !q || !finite(rule.threshold)) return null;
    const v = rule.kind.startsWith('price') ? q.price : q.changePercent; if (!finite(v)) return null;
    const hit = rule.kind === 'priceAbove' ? v >= rule.threshold : rule.kind === 'priceBelow' ? v <= rule.threshold : rule.kind === 'changeAbove' ? v >= rule.threshold : rule.kind === 'changeBelow' ? v <= rule.threshold : false;
    return hit ? {kind: 'rule', key: `rule:${rule.id}:${dayKey(now)}`, priority: 'high', rule, value: v} : null;
  }
  const followedFrom = records => [...new Set((records || []).filter(r => r && !r.deleted && r.data && Array.isArray(r.data.symbols)).flatMap(r => r.data.symbols.map(s => String(s).toUpperCase())))].slice(0, 200);
  root.FynxAlertsCore = {MOVE, moveSignal, marketWords, newsSignals, earningsSignal, calendarSignals, ruleSignal, followedFrom, dayKey};
  if (!root.document) return;

  /* ------------------------- Terminal plugin ------------------------- */
  (root.FynxTerminalPlugins = root.FynxTerminalPlugins || []).push((T, PG) => {
    const {S, el, btn, store, shortOf, nameOf, quoteFor, symClass, signed, fmt, digitsOf, say} = T;
    const $ = id => document.getElementById(id);
    const A = {bridge: null, user: null, items: [], followed: [], rules: [], prefs: null, sent: new Set(), open: false};
    const C = root.FynxAlertsCore;
    // Bell in the Terminal header, next to Edit.
    const top = document.querySelector('.fx-top-actions, #fx-edit')?.parentElement;
    const wrap = el('span', 'fx-bellwrap'), bell = btn('', 'fx-editbtn fx-bell', () => toggle(), 'Notifications'), badge = el('b', 'fx-bellbadge'), drop = el('div', 'fx-belldrop');
    bell.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v3.6L4.5 16h15L18 12.6V9a6 6 0 0 0-6-6zm-2 15a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
    bell.append(badge); badge.hidden = true; drop.hidden = true; drop.id = 'fx-belldrop'; bell.setAttribute('aria-controls', drop.id); bell.setAttribute('aria-expanded', 'false');
    wrap.append(bell); if (top && $('fx-edit')) top.insertBefore(wrap, $('fx-edit')); document.body.append(drop);
    function toggle(force) {
      A.open = force ?? !A.open; drop.hidden = !A.open; bell.setAttribute('aria-expanded', String(A.open));
      if (A.open) { const r = bell.getBoundingClientRect(); drop.style.top = Math.round(r.bottom + 6) + 'px'; const vw = document.documentElement.clientWidth, w = Math.min(400, vw - 16); drop.style.right = 'auto'; drop.style.left = Math.round(Math.min(Math.max(8, r.right - w), vw - w - 8)) + 'px'; draw(); drop.querySelector('button, a')?.focus({preventScroll: true}); }
    }
    document.addEventListener('click', e => { if (A.open && !drop.contains(e.target) && !wrap.contains(e.target)) toggle(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && A.open) { toggle(false); bell.focus(); } });
    const unread = () => A.items.filter(i => !i.read && !i.archived);
    function paintBadge() { const n = unread().length; badge.hidden = !n; badge.textContent = n > 99 ? '99+' : String(n); bell.setAttribute('aria-label', n ? `Notifications: ${n} unread` : 'Notifications'); }
    const SYM_OF = i => i.metadata?.symbol || null;
    const when = iso => { const t = Date.parse(iso); if (!Number.isFinite(t)) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : new Date(t).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}); };
    function openItem(i) {
      if (A.bridge && !i.read) A.bridge.markRead(i.id).catch(() => {});
      i.read = true; paintBadge();
      let u; try { u = new URL(i.sourceUrl || '/notifications.html', location.href); } catch { return; }
      if (u.origin !== location.origin) return;
      // Terminal destinations open inside this Terminal (no reload); FYNX articles and pages open in a new tab.
      if (/^\/terminal(\.html)?$/.test(u.pathname)) {
        toggle(false); const p = u.searchParams;
        if (p.get('cmp')) return T.setCompare(p.get('cmp').split(','));
        if (p.get('sym')) return T.setSymbol({symbol: p.get('sym')});
        if (p.get('desk')) return T.setDesk(p.get('desk'));
        return;
      }
      window.open(u.href, '_blank', 'noopener');
    }
    function draw() {
      drop.replaceChildren();
      const head = el('div', 'fx-bellhead'); head.append(el('b', '', 'NOTIFICATIONS'), el('span', '', A.user ? `${unread().length} unread` : ''));
      if (A.user && unread().length) head.append(btn('Mark all read', 'fx-belllink', async () => { const ids = unread().map(i => i.id); A.items.forEach(i => { i.read = true; }); paintBadge(); draw(); try { await A.bridge.markAllRead(ids); } catch (e) { T.report('notify-readall', e); } }));
      drop.append(head);
      if (!A.bridge) { drop.append(el('p', 'fx-bellnote', 'Notifications are loading…')); return; }
      if (!A.user) { const p = el('p', 'fx-bellnote', 'Sign in to follow markets and get alerts for them here and on your desktop. '); const a = el('a', 'fx-belllink', 'Sign in'); a.href = '/auth/login.html?returnTo=' + encodeURIComponent(location.pathname + location.search); p.append(a); drop.append(p); return; }
      const list = el('div', 'fx-belllist');
      const shown = A.items.filter(i => !i.archived).slice(0, 30);
      if (!shown.length) list.append(el('p', 'fx-bellnote', A.followed.length ? `No alerts yet for the ${A.followed.length} markets you follow.` : 'Follow markets with ★ (focus a market, then ★ Follow) to get alerts for them.'));
      for (const i of shown) {
        const r = btn('', 'fx-bellitem' + (i.read ? '' : ' unread') + ' p-' + (i.priority || 'medium'), () => openItem(i), `${i.read ? '' : 'Unread. '}${i.title}`);
        const sym = SYM_OF(i), line = el('span', 'fx-belltop');
        if (sym) line.append(el('em', 'fx-bellsym', shortOf(sym)));
        line.append(el('span', 'fx-bellcat', ({market_alerts: 'MARKET', breaking_news: 'BREAKING', market_news: 'NEWS', economic_calendar: 'CALENDAR', account_security: 'SECURITY', platform_updates: 'FYNX'})[i.category] || 'FYNX'), el('time', '', when(i.timestamp)));
        r.append(line, el('strong', '', i.title), i.message ? el('small', '', i.message) : '');
        list.append(r);
      }
      drop.append(list);
      // Preferences: the account's own notification preferences (shared with the Notification Center).
      const pr = A.prefs || {}, row = el('div', 'fx-bellprefs');
      const toggleBtn = (label, key, on) => { const b = btn(`${on ? '●' : '○'} ${label}`, 'fx-bellpref' + (on ? ' on' : ''), async () => {
        if (key === 'browserEnabled' && !on) { const r = await A.bridge.requestDesktop(); if (r?.permission !== 'granted') return say('Desktop notifications are blocked in this browser. Allow them in the site settings to turn them on.'); }
        A.prefs = {...pr, [key]: !on}; draw(); try { await A.bridge.savePrefs({[key]: !on}); } catch (e) { say('Could not save the preference. Check your connection.'); T.report('notify-pref', e); } }); b.setAttribute('aria-pressed', String(on)); return b; };
      row.append(toggleBtn('Market alerts', 'marketAlerts', pr.marketAlerts !== false), toggleBtn('Desktop', 'browserEnabled', !!pr.browserEnabled));
      const center = el('a', 'fx-belllink', 'Notification Center ↗'); center.href = '/notifications.html'; center.target = '_blank'; center.rel = 'noopener';
      row.append(center); drop.append(row);
      drop.append(el('p', 'fx-bellfoot', A.followed.length ? `Following ${A.followed.length}: ${A.followed.slice(0, 12).map(shortOf).join(', ')}${A.followed.length > 12 ? '…' : ''}` : 'Follow markets with ★ to personalise alerts.'));
    }

    /* Follow (★): the account watchlist 'terminal-default'. Other watchlists also count as followed. */
    const canonical = s => T.canon ? T.canon(s) || s : s;
    const isFollowed = sym => A.followed.includes(String(sym).toUpperCase());
    async function setFollow(sym, on) {
      if (!A.bridge) return say('Notifications are still loading.');
      if (!A.user) { say('Sign in to follow markets and get alerts.'); return toggle(true); }
      const id = String(canonical(sym)).toUpperCase(), mine = new Set(A.bridge.terminalList());
      if (on) mine.add(id); else { mine.delete(id); if (A.followed.includes(id) && !A.bridge.terminalList().includes(id)) return say(`${shortOf(id)} is followed through another of your watchlists. Edit it in My workspace.`); }
      if (mine.size > 100) return say('Follow up to 100 markets in the Terminal watchlist.');
      try { await A.bridge.saveTerminalList([...mine]); say(on ? `Following ${shortOf(id)}: alerts for big moves, news, earnings and events` : `Stopped following ${shortOf(id)}`); }
      catch (e) { say('Could not update your watchlist. Check your connection.'); T.report('notify-follow', e); }
    }
    T.Alerts = {isFollowed, setFollow, followed: () => [...A.followed]};
    // ★ on the focus chip and in the comparison table.
    function decorate() {
      const chip = $('fx-symchip'); if (!chip) return;
      chip.querySelector('.fx-follow')?.remove();
      const sym = S.sym?.symbol; if (!sym) return;
      const on = isFollowed(canonical(sym)), b = btn(on ? '★' : '☆', 'fx-symx fx-follow' + (on ? ' on' : ''), () => setFollow(sym, !on), on ? `Stop following ${sym}` : `Follow ${sym}: alerts for moves, news, earnings and events`);
      b.title = on ? 'Following · click to stop' : 'Follow for alerts'; chip.insertBefore(b, chip.querySelector('.fx-symx'));
    }
    // The desk bar redraws its chip on every change; add the star back each time.
    const mo = new MutationObserver(() => { if (!$('fx-symchip')?.querySelector('.fx-follow') && S.sym) decorate(); }); const chipEl = $('fx-symchip'); if (chipEl) mo.observe(chipEl, {childList: true});
    // Followed markets as a watchlist tab in the Markets box on every desk.
    for (const d of Object.values(T.DESK_DEFS)) if (Array.isArray(d.mkts) && !d.mkts.some(t => t[0] === '★')) d.mkts.push(['★', {get syms() { return A.followed.map(canonical); }}]);

    /* Scanning: runs after each refresh of quotes, headlines and calendars; only while signed in with alerts on. */
    const sentKey = () => `alerts-sent-${A.user?.uid || ''}-${C.dayKey()}`;
    function loadSent() { try { A.sent = new Set(JSON.parse(store.get(sentKey()) || '[]')); } catch { A.sent = new Set(); } }
    function remember(key) { A.sent.add(key); try { store.set(sentKey(), JSON.stringify([...A.sent].slice(-500))); } catch {} }
    let scanning = false;
    async function scan() {
      if (scanning || !A.bridge || !A.user || A.prefs?.marketAlerts === false || !A.followed.length && !A.rules.length) return;
      scanning = true;
      try {
        const out = [], now = Date.now(), heads = [...(S.briefing || []), ...Object.values(S.desks || {}).flatMap(x => x.items || [])];
        for (const raw of A.followed) {
          const sym = canonical(raw), cls = symClass(sym), q = quoteFor(sym), nm = S.symData?.[sym]?.name || nameOf(sym);
          // Only real, current quotes: never alert from a stale snapshot older than a day.
          const fresh = q && (!q.asOf || now - Date.parse(q.asOf) < 36 * 3600e3);
          const m = fresh ? C.moveSignal(sym, cls, q, now) : null;
          if (m) out.push({sig: m, sym, title: `${shortOf(sym)} ${signed(m.change, 2, '%')} today`, message: `${nm !== shortOf(sym) ? nm + ' · ' : ''}${m.z ? m.z.toFixed(1) + '× its typical daily move · ' : ''}last ${fmt(q.price, digitsOf(sym))}${q.delayed || q.snapshot ? ' (delayed)' : ''}`, url: `/terminal.html?sym=${encodeURIComponent(sym)}`, type: 'market.move'});
          for (const n of C.newsSignals(sym, nm, heads, now).slice(0, 2)) { const h = n.headline, link = /^https:\/\//.test(h.url || '') ? '/news/article.html?url=' + encodeURIComponent(h.url) : `/terminal.html?sym=${encodeURIComponent(sym)}`; out.push({sig: n, sym, title: h.title.slice(0, 180), message: `${shortOf(sym)} in the news · ${h.source || 'FYNX'}`, url: link, type: 'market.news'}); }
          if (cls === 'stock') { const e = C.earningsSignal(sym, S.earn?.events, now); if (e) out.push({sig: e, sym, title: `${shortOf(sym)} reports earnings ${e.when}`, message: `${e.event.time || 'Time not confirmed'}${Number.isFinite(e.event.epsForecast) ? ` · EPS forecast $${e.event.epsForecast.toFixed(2)}` : ''}`, url: `/terminal.html?sym=${encodeURIComponent(sym)}`, type: 'market.earnings'}); }
          if (cls === 'fx' || /^(GC|SI)=F$/.test(sym)) for (const c of C.calendarSignals(T.symCurrencies ? T.symCurrencies(sym) : [], S.calendar?.events, now)) out.push({sig: c, sym, title: `${c.event.currency} ${c.event.title} at ${new Date(c.event.time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`, message: `High impact for ${shortOf(sym)}${c.event.forecast ? ` · forecast ${c.event.forecast}` : ''}${c.event.previous ? ` · previous ${c.event.previous}` : ''}`, url: `/terminal.html?sym=${encodeURIComponent(sym)}`, type: 'market.calendar'});
        }
        for (const rule of A.rules) { const q = quoteFor(rule.symbol), r = C.ruleSignal(rule, q, now); if (r) out.push({sig: r, sym: rule.symbol, title: `${shortOf(rule.symbol)} alert: ${({priceAbove: 'price at or above', priceBelow: 'price at or below', changeAbove: 'day change at or above', changeBelow: 'day change at or below'})[rule.kind]} ${rule.kind.startsWith('change') ? rule.threshold + '%' : fmt(rule.threshold, digitsOf(rule.symbol))}`, message: `Now ${rule.kind.startsWith('change') ? signed(r.value, 2, '%') : fmt(r.value, digitsOf(rule.symbol))} · Research Desk rule`, url: `/terminal.html?sym=${encodeURIComponent(rule.symbol)}`, type: 'market.price-alert'}); }
        for (const a of out.slice(0, 12)) {
          if (A.sent.has(a.sig.key)) continue; remember(a.sig.key);
          try { await A.bridge.emit({type: a.type, category: 'market_alerts', title: a.title, message: a.message, source: 'FYNX Terminal', sourceUrl: a.url, priority: a.sig.priority, metadata: {symbol: a.sym, kind: a.sig.kind}, deliveryChannels: ['in_app', 'browser'], dedupeKey: a.sig.key}); }
          catch (e) { T.report('notify-emit', e); }
        }
      } finally { scanning = false; }
    }
    root.addEventListener('fynx:ticks', () => scan());
    // A desktop notification clicked while this Terminal is open: go straight to the market.
    root.addEventListener('fynx:notification-open', e => { const i = A.items.find(x => x.sourceUrl && new URL(x.sourceUrl, location.href).href === e.detail?.url); openItem(i || {sourceUrl: e.detail?.url, read: true}); });
    setInterval(() => { if (!document.hidden) scan(); }, 60000);

    /* Bridge (module): account, notifications, preferences, watchlists. */
    function attach(b) {
      if (A.bridge) return; A.bridge = b;
      b.onUser(user => { A.user = user; A.items = []; loadSent(); paintBadge(); if (A.open) draw(); });
      b.onNotifications(items => { A.items = items; paintBadge(); if (A.open) draw(); });
      b.onAccount(({followed, rules, prefs}) => { A.followed = (followed || []).map(s => String(s).toUpperCase()); A.rules = rules || []; A.prefs = prefs || A.prefs; decorate(); if (A.open) draw(); T.R?.('mkts'); scan(); });
      if (A.open) draw();
    }
    if (root.FynxNotifyBridge) attach(root.FynxNotifyBridge); else root.addEventListener('fynx:notify-bridge', () => attach(root.FynxNotifyBridge), {once: true});
  });
})(typeof window !== 'undefined' ? window : globalThis);
