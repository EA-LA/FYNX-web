/* FYNX guest gate for personal tools.
   The website and dashboard are open to everyone. Personal tools ask for an account:
     <script src="/assets/js/guest-gate.js" data-mode="required" data-tool="journal" defer></script>
       required: the tool stays covered until the visitor signs in (Journal).
     data-mode="ask": a dismissable invitation, shown once per browser session (Your News).
   The panel disappears by itself as soon as a session appears (for example, sign-in in another tab). */
(() => {
  'use strict';
  const script = document.currentScript;
  const mode = script?.dataset.mode === 'ask' ? 'ask' : 'required';
  const tool = script?.dataset.tool || 'tool';
  const COPY = {
    journal: {
      kicker: 'FYNX JOURNAL',
      title: 'Sign in to use your Journal',
      body: 'Your trades, notes and performance are saved to your account, so they stay private and follow you to every device. A FYNX account is free.',
      points: ['Record trades and review realized results', 'See win rate, profit factor and streaks', 'Sync with the FYNX iPhone app']
    },
    news: {
      kicker: 'YOUR NEWS',
      title: 'Sign in to make Your News yours',
      body: 'Follow topics, keep your reading history and save stories to your account. You can look around first and sign in whenever you are ready.',
      points: ['Follow topics, regions and companies', 'Continue reading across web and iPhone', 'Save stories to your workspace']
    }
  };
  const c = COPY[tool] || {kicker: 'FYNX', title: 'Sign in to continue', body: 'This tool saves to your FYNX account. A FYNX account is free.', points: []};
  const SEEN = 'fynx.guest-gate.dismissed.' + tool;
  if (mode === 'ask') { try { if (sessionStorage.getItem(SEEN)) return; } catch (_) {} }

  const returnTo = encodeURIComponent(location.pathname + location.search + location.hash);
  let root = null, lastFocus = null;

  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function style() {
    if (document.getElementById('fx-gg-style')) return;
    const st = el('style'); st.id = 'fx-gg-style';
    st.textContent = `
.fx-gg{position:fixed;inset:0;z-index:6000;display:grid;place-items:center;padding:20px;background:rgba(9,14,12,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:fxggIn .2s ease-out}
.fx-gg-card{position:relative;width:min(460px,100%);max-height:calc(100vh - 40px);overflow:auto;background:#fff;color:#111815;border:1px solid #d9dddb;border-radius:14px;box-shadow:0 30px 80px rgba(8,14,11,.35);padding:30px 28px 24px;font-family:Inter,Arial,Helvetica,sans-serif;text-align:left}
.fx-gg-kicker{margin:0 0 10px;font:700 11px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.14em;color:#1f5a3f}
.fx-gg-card h2{margin:0 0 10px;font:800 25px/1.2 Manrope,Inter,Arial,sans-serif;letter-spacing:-.02em}
.fx-gg-card p{margin:0 0 16px;font-size:14.5px;line-height:1.6;color:#4d5953}
.fx-gg-card ul{margin:0 0 22px;padding:0;list-style:none;display:grid;gap:8px}
.fx-gg-card li{display:grid;grid-template-columns:20px 1fr;gap:8px;font-size:13.5px;line-height:1.45;color:#26302b}
.fx-gg-card li::before{content:"";width:16px;height:16px;margin-top:1px;border-radius:50%;background:#e3f1e9 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.5 8.2l2.2 2.2 4.8-4.8' fill='none' stroke='%231f5a3f' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/16px no-repeat}
.fx-gg-actions{display:grid;gap:10px}
.fx-gg-actions a,.fx-gg-actions button{display:flex;align-items:center;justify-content:center;min-height:46px;padding:10px 16px;border-radius:10px;font:700 14px/1.2 Inter,Arial,sans-serif;text-decoration:none;cursor:pointer;transition:background .15s,border-color .15s,transform .12s}
.fx-gg-primary{background:#174c3b;border:1px solid #174c3b;color:#fff}
.fx-gg-primary:hover{background:#103b2d;transform:translateY(-1px)}
.fx-gg-secondary{background:#fff;border:1px solid #c9d0cc;color:#111815}
.fx-gg-secondary:hover{background:#f2f5f3}
.fx-gg-quiet{background:transparent;border:0;color:#4d5953;min-height:40px!important;font-weight:600!important}
.fx-gg-quiet:hover{color:#174c3b;text-decoration:underline}
.fx-gg :focus-visible{outline:3px solid #f5b301;outline-offset:2px}
.fx-gg-x{position:absolute;top:10px;right:10px;width:40px;height:40px;border:0;border-radius:50%;background:transparent;color:#4d5953;font-size:24px;line-height:1;cursor:pointer}
.fx-gg-x:hover{background:#f0f3f1}
html.fx-gg-lock,html.fx-gg-lock body{overflow:hidden!important}
html[data-theme=dark] .fx-gg-card,body.dark-mode .fx-gg-card{background:#121815;color:#edf2ef;border-color:#2c3630}
html[data-theme=dark] .fx-gg-card p,body.dark-mode .fx-gg-card p,html[data-theme=dark] .fx-gg-quiet,body.dark-mode .fx-gg-quiet{color:#a6b4ab}
html[data-theme=dark] .fx-gg-card li,body.dark-mode .fx-gg-card li{color:#d7dfda}
html[data-theme=dark] .fx-gg-kicker,body.dark-mode .fx-gg-kicker{color:#7fd3a6}
html[data-theme=dark] .fx-gg-secondary,body.dark-mode .fx-gg-secondary{background:#19211c;border-color:#354039;color:#edf2ef}
html[data-theme=dark] .fx-gg-x,body.dark-mode .fx-gg-x{color:#a6b4ab}
@keyframes fxggIn{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.fx-gg{animation:none}.fx-gg-primary:hover{transform:none}}
@media (max-width:480px){.fx-gg-card{padding:26px 20px 20px}.fx-gg-card h2{font-size:22px}}`;
    document.head.append(st);
  }
  function dismiss() {
    try { sessionStorage.setItem(SEEN, '1'); } catch (_) {}
    close();
  }
  function close() {
    if (!root) return;
    root.remove(); root = null;
    document.documentElement.classList.remove('fx-gg-lock');
    lastFocus?.focus?.({preventScroll: true});
  }
  function show() {
    if (root) return;
    if (mode === 'ask') { try { if (sessionStorage.getItem(SEEN)) return; } catch (_) {} }
    style();
    lastFocus = document.activeElement;
    root = el('div', 'fx-gg');
    const card = el('div', 'fx-gg-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'fx-gg-title'); card.setAttribute('aria-describedby', 'fx-gg-body');
    const h = el('h2', '', c.title); h.id = 'fx-gg-title';
    const p = el('p', '', c.body); p.id = 'fx-gg-body';
    card.append(el('p', 'fx-gg-kicker', c.kicker), h, p);
    if (c.points.length) { const ul = el('ul'); c.points.forEach(t => ul.append(el('li', '', t))); card.append(ul); }
    const actions = el('div', 'fx-gg-actions');
    const signIn = el('a', 'fx-gg-primary', 'Sign in'); signIn.href = '/auth/login.html?returnTo=' + returnTo;
    const signUp = el('a', 'fx-gg-secondary', 'Create a free account'); signUp.href = '/auth/signup.html?returnTo=' + returnTo;
    actions.append(signIn, signUp);
    if (mode === 'ask') {
      const later = el('button', 'fx-gg-quiet', 'Not now, keep browsing'); later.type = 'button'; later.addEventListener('click', dismiss);
      const x = el('button', 'fx-gg-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', dismiss);
      actions.append(later); card.append(x);
      root.addEventListener('click', e => { if (e.target === root) dismiss(); });
    } else {
      const back = el('a', 'fx-gg-quiet', '← Back to the dashboard'); back.href = '/home.html';
      actions.append(back);
    }
    card.append(actions); root.append(card);
    document.body.append(root);
    document.documentElement.classList.add('fx-gg-lock');
    // Keep keyboard focus inside the panel.
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape' && mode === 'ask') { e.preventDefault(); dismiss(); return; }
      if (e.key !== 'Tab') return;
      const f = [...card.querySelectorAll('a,button')]; const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    signIn.focus({preventScroll: true});
  }
  async function start() {
    try {
      const [{auth}, {onAuthStateChanged}] = await Promise.all([import('/auth/firebase.js'), import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')]);
      await auth.authStateReady?.();
      onAuthStateChanged(auth, user => { if (user) close(); else show(); });
    } catch (_) {
      // If the sign-in service cannot load, still explain what the tool needs rather than failing silently.
      if (mode === 'required') show();
    }
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, {once: true});
})();
