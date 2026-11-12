/* FYNX account menu: the avatar in the header shows the member's photo (or initials) and opens a
   menu with their workspace, settings, membership and sign-out. Signed out, it goes to sign in. */
(function () {
  'use strict';
  if (window.__fynxAccountMenu) return; window.__fynxAccountMenu = true;
  const SECTIONS = [
    ['Your workspace', [
      ['Your News', '/news/your-news.html', 'Followed topics and reading history'],
      ['Journal', '/journal.html', 'Trades, notes and performance'],
      ['Watchlist & heatmap', '/tools/research-desk.html#heatmap', 'Your symbols, live'],
      ['Price alerts', '/tools/price-alerts.html', 'Levels you are watching'],
      ['Saved strategies', '/quant-analyst.html#port', 'Quant Analyst workspaces']
    ]],
    ['Settings', [
      ['Profile overview', '/profile.html'], ['Account', '/account-settings.html'], ['Security', '/security.html'],
      ['Notifications', '/notifications.html'], ['Preferences', '/preferences.html'], ['Trading accounts', '/profile/accounts/']
    ]]
  ];
  const ICON = {
    'Your News': 'M4 5h16M4 10h16M4 15h10M4 20h7', 'Journal': 'M6 3h11a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h7M8 11h7',
    'Watchlist & heatmap': 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z', 'Price alerts': 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
    'Saved strategies': 'M3 17l6-6 4 4 8-8M15 7h6v6'
  };
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function initials(id) { const s = (id.displayName || id.email || 'F').trim(); return s.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || 'F'; }
  function style() {
    if (document.getElementById('fx-acct-style')) return;
    const st = el('style'); st.id = 'fx-acct-style';
    st.textContent = `
.fx-acct{position:relative;display:inline-flex}
.fx-acct-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border-radius:50%;border:2px solid rgba(255,255,255,.18);background:#cfeedd;color:#173f2d;font:800 13px/1 Manrope,Inter,Arial,sans-serif;cursor:pointer;overflow:hidden;transition:border-color .15s,box-shadow .15s}
.fx-acct-btn:hover,.fx-acct-btn[aria-expanded=true]{border-color:#7fd3a6;box-shadow:0 0 0 3px rgba(127,211,166,.25)}
.fx-acct-btn:focus-visible{outline:2px solid #f5b301;outline-offset:2px}
.fx-acct-btn img{width:100%;height:100%;object-fit:cover;display:block}
.fx-acct-menu{position:fixed;right:12px;top:64px;z-index:5000;width:min(340px,calc(100vw - 20px));max-height:min(80vh,680px);overflow:auto;background:#fff;color:#0f1512;border:1px solid #dfe4e1;border-radius:14px;box-shadow:0 18px 50px rgba(8,14,11,.22);padding:8px;font-family:Inter,Arial,sans-serif;text-align:left}
.fx-acct-menu[hidden]{display:none}
.fx-acct-who{display:grid;grid-template-columns:48px 1fr;gap:12px;align-items:center;padding:12px 10px 14px;border-bottom:1px solid #edf0ee;margin-bottom:6px}
.fx-acct-who .fx-acct-av{width:48px;height:48px;border-radius:50%;background:#cfeedd;color:#173f2d;display:grid;place-items:center;font:800 16px Manrope,Inter,sans-serif;overflow:hidden}
.fx-acct-who .fx-acct-av img{width:100%;height:100%;object-fit:cover}
.fx-acct-who strong{display:block;font-size:15px;line-height:1.25}.fx-acct-who small{display:block;font-size:12px;color:#6a756f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-acct-who a{display:inline-block;margin-top:4px;font-size:12px;font-weight:700;color:#1f5a3f;text-decoration:none}.fx-acct-who a:hover{text-decoration:underline}
.fx-acct-h{margin:10px 10px 4px;font:700 10.5px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#7a857f}
.fx-acct-menu a.fx-acct-item{display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:center;padding:9px 10px;border-radius:9px;color:inherit;text-decoration:none;font-size:13.5px;font-weight:600}
.fx-acct-menu a.fx-acct-item.plain{grid-template-columns:1fr;font-weight:500}
.fx-acct-menu a.fx-acct-item small{display:block;font-size:11.5px;font-weight:400;color:#6a756f;margin-top:1px}
.fx-acct-menu a.fx-acct-item:hover,.fx-acct-menu a.fx-acct-item:focus-visible{background:#f0f4f2;outline:none}
.fx-acct-menu a.fx-acct-item[aria-current=page]{background:#e8f2ec;color:#1f5a3f}
.fx-acct-menu svg{width:18px;height:18px;fill:none;stroke:#1f5a3f;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.fx-acct-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px}
.fx-acct-pro{display:block;margin:8px 4px 6px;padding:12px 14px;border-radius:11px;background:linear-gradient(135deg,#173f2d,#1f5a3f);color:#fff;text-decoration:none}
.fx-acct-pro strong{display:block;font-size:14px}.fx-acct-pro span{display:block;font-size:12px;opacity:.85;margin-top:3px}
.fx-acct-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid #edf0ee;margin-top:6px;padding:8px 6px 2px}
.fx-acct-foot a{font-size:12.5px;color:#4a554f;text-decoration:none;font-weight:600}.fx-acct-foot a:hover{color:#1f5a3f}
.fx-acct-out{border:0;background:transparent;color:#c42828;font:700 13px Inter,Arial,sans-serif;padding:8px 10px;border-radius:8px;cursor:pointer}.fx-acct-out:hover{background:#fdeeee}
html[data-theme=dark] .fx-acct-menu,body.dark-mode .fx-acct-menu{background:#111614;color:#e8ece9;border-color:#27302b}
@media (max-width:600px){.fx-acct-menu{left:10px!important;right:10px!important;width:auto}}`;
    document.head.append(st);
  }
  function paintAvatar(node, id) {
    node.replaceChildren();
    if (id.photoURL) { const img = el('img'); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = id.photoURL; img.onerror = () => { node.textContent = initials(id); }; node.append(img); }
    else node.textContent = id.uid ? initials(id) : '';
  }
  function build(menu, id) {
    menu.replaceChildren();
    const who = el('div', 'fx-acct-who'), av = el('span', 'fx-acct-av'), meta = el('div');
    paintAvatar(av, id); meta.append(el('strong', '', id.displayName || 'FYNX member'), el('small', '', id.email || ''));
    const edit = el('a', '', 'Edit profile →'); edit.href = '/account-settings.html'; meta.append(edit);
    who.append(av, meta); menu.append(who);
    for (const [title, items] of SECTIONS) {
      menu.append(el('p', 'fx-acct-h', title));
      const box = el('div', title === 'Settings' ? 'fx-acct-grid' : '');
      for (const [label, href, hint] of items) {
        const a = el('a', 'fx-acct-item' + (ICON[label] ? '' : ' plain')); a.href = href; a.setRole = 'menuitem'; a.setAttribute('role', 'menuitem');
        if (location.pathname === href.split('#')[0]) a.setAttribute('aria-current', 'page');
        if (ICON[label]) { const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); p.setAttribute('d', ICON[label]); svg.append(p); a.append(svg); }
        const text = el('span', '', label); if (hint) text.append(el('small', '', hint)); a.append(text); box.append(a);
      }
      menu.append(box);
    }
    const pro = el('a', 'fx-acct-pro'); pro.href = '/pro.html'; pro.setAttribute('role', 'menuitem');
    pro.append(el('strong', '', 'Membership & Pro tools →'), el('span', '', 'Plans, billing and the tools each tier unlocks')); menu.append(pro);
    const foot = el('div', 'fx-acct-foot'), help = el('a', '', 'Help & support'); help.href = '/contact.html';
    const out = el('button', 'fx-acct-out', 'Sign out'); out.type = 'button';
    out.addEventListener('click', async () => {
      out.disabled = true; out.textContent = 'Signing out…';
      try { if (window.FynxSession?.logout) await window.FynxSession.logout('manual', '/auth/login.html'); else { const m = await import('/auth/firebase.js'); const a = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'); await a.signOut(m.auth); } location.href = '/auth/login.html'; }
      catch (_) { out.disabled = false; out.textContent = 'Sign out'; }
    });
    foot.append(help, out); menu.append(foot);
  }
  function mount(host) {
    if (host.dataset.fxAcct) return; host.dataset.fxAcct = '1'; style();
    const wrap = el('span', 'fx-acct'), btn = el('button', 'fx-acct-btn'), menu = el('div', 'fx-acct-menu');
    btn.type = 'button'; btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Account menu');
    menu.hidden = true; menu.setAttribute('role', 'menu');
    host.replaceWith(wrap); wrap.append(btn); document.body.append(menu); wrap.id = host.id || 'avatarInitials'; wrap.classList.add('user-avatar-menu');
    const id = () => window.FynxIdentity || {};
    const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    const place = () => { const r = btn.getBoundingClientRect(); menu.style.top = Math.round(r.bottom + 10) + 'px'; menu.style.right = Math.max(10, Math.round(innerWidth - r.right)) + 'px'; };
    const open = () => { build(menu, id()); place(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); menu.querySelector('a')?.focus({preventScroll: true}); };
    btn.addEventListener('click', e => { e.stopPropagation(); if (!id().uid) { location.href = '/auth/login.html?returnTo=' + encodeURIComponent(location.pathname + location.search); return; } menu.hidden ? open() : close(); });
    document.addEventListener('click', e => { if (!wrap.contains(e.target) && !menu.contains(e.target)) close(); });
    addEventListener('resize', () => { if (!menu.hidden) place(); }); addEventListener('scroll', () => { if (!menu.hidden) place(); }, {passive: true});
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });
    const paint = () => { const v = id(); paintAvatar(btn, v); btn.title = v.uid ? (v.displayName || v.email || 'Your account') : 'Sign in'; if (!v.uid) { btn.textContent = ''; btn.append(svgUser()); } };
    window.addEventListener('fynx:identity', paint); paint();
  }
  function svgUser() { const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '18'); s.setAttribute('height', '18'); s.style.cssText = 'fill:none;stroke:currentColor;stroke-width:1.8'; p.setAttribute('d', 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'); s.append(p); return s; }
  function scan() { document.querySelectorAll('div.user-avatar#avatarInitials').forEach(mount); return !!document.querySelector('.fx-acct'); }
  const watch = new MutationObserver(() => { if (scan()) watch.disconnect(); });
  if (!scan()) { watch.observe(document.documentElement, {childList: true, subtree: true}); setTimeout(() => watch.disconnect(), 20000); }
})();
