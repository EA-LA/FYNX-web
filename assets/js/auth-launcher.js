/* FYNX sign-in window: any "Sign in" / "Create account" link on the site opens a centered window
   over the current page (the same card as /auth/login.html). After signing in, the reader stays on
   the page they were reading. Modifier-clicks and no-JS still go to the full sign-in page. */
(function () {
  'use strict';
  if (window.FynxAuth || /^\/auth\//.test(location.pathname)) return;
  let overlay, frame, lastFocus;
  const PAGES = {login: '/auth/login.html', signup: '/auth/signup.html', forgot: '/auth/forgot.html'};
  function style() {
    if (document.getElementById('fx-signin-style')) return;
    const st = document.createElement('style'); st.id = 'fx-signin-style';
    st.textContent = '.fx-signin{position:fixed;inset:0;z-index:6000;display:grid;place-items:start center;padding:clamp(16px,8vh,90px) 12px 24px;background:rgba(10,14,12,.58);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);overflow:auto;animation:fx-signin-in .18s ease}'
      + '.fx-signin[hidden]{display:none}'
      + '.fx-signin-box{position:relative;width:min(460px,100%);background:#fff;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.35);overflow:hidden}'
      + '.fx-signin-box iframe{display:block;width:100%;height:620px;border:0;transition:height .15s}'
      + '.fx-signin-close{position:absolute;top:10px;right:10px;z-index:2;width:38px;height:38px;border:0;border-radius:50%;background:transparent;color:#0f1512;font:400 26px/1 Arial,sans-serif;cursor:pointer}'
      + '.fx-signin-close:hover{background:#f0f3f1}.fx-signin-close:focus-visible{outline:2px solid #1f5a3f;outline-offset:2px}'
      + '.fx-signin-wait{position:absolute;inset:0;display:grid;place-items:center;background:#fff;font:600 13px Inter,Arial,sans-serif;color:#5f6b64}'
      + '@keyframes fx-signin-in{from{opacity:0}to{opacity:1}}'
      + 'html.fx-signin-open,html.fx-signin-open body{overflow:hidden!important}';
    document.head.append(st);
  }
  function build() {
    style();
    overlay = document.createElement('div'); overlay.className = 'fx-signin'; overlay.hidden = true;
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Sign in to FYNX');
    const box = document.createElement('div'); box.className = 'fx-signin-box';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'fx-signin-close'; close.setAttribute('aria-label', 'Close'); close.textContent = '×';
    const wait = document.createElement('div'); wait.className = 'fx-signin-wait'; wait.textContent = 'Loading secure sign-in…';
    frame = document.createElement('iframe'); frame.title = 'FYNX sign in';
    frame.addEventListener('load', () => { wait.hidden = true; try { frame.contentDocument.querySelector('#email, #name')?.focus(); } catch (_) {} });
    box.append(close, wait, frame); overlay.append(box); document.body.append(overlay);
    close.addEventListener('click', hide);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) hide(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay && !overlay.hidden) hide(); });
    addEventListener('message', e => {
      if (e.origin !== location.origin || !e.data || !e.data.fynxAuth) return;
      if (e.data.fynxAuth === 'size' && e.data.height) frame.style.height = Math.min(Math.max(e.data.height, 360), 1200) + 'px';
      if (e.data.fynxAuth === 'close') hide();
    });
  }
  function open(mode, returnTo) {
    if (!overlay) build();
    const page = PAGES[mode] || PAGES.login;
    const url = new URL(page, location.origin); url.searchParams.set('embed', '1');
    url.searchParams.set('returnTo', returnTo || (location.pathname + location.search + location.hash));
    lastFocus = document.activeElement;
    overlay.querySelector('.fx-signin-wait').hidden = false;
    frame.src = url.pathname + url.search;
    overlay.hidden = false; document.documentElement.classList.add('fx-signin-open');
    overlay.querySelector('.fx-signin-close').focus();
  }
  function hide() {
    if (!overlay) return; overlay.hidden = true; document.documentElement.classList.remove('fx-signin-open');
    frame.src = 'about:blank'; lastFocus?.focus?.();
  }
  window.FynxAuth = {open, close: hide};
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]'); if (!a || a.target === '_blank') return;
    let url; try { url = new URL(a.getAttribute('href'), location.href); } catch (_) { return; }
    if (url.origin !== location.origin) return;
    const m = url.pathname.match(/\/auth\/(login|signup|forgot)\.html$/); if (!m) return;
    if (window.FynxIdentity?.uid && m[1] !== 'forgot') return;
    e.preventDefault();
    open(m[1], url.searchParams.get('returnTo') || undefined);
  }, true);
})();
