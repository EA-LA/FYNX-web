/* FYNX sign in / create account / reset: one simple centered card (no video), the same on its
   own page and inside the site-wide sign-in window (?embed=1). Form IDs and auth-form.js logic are
   unchanged; this file only rearranges and labels the markup. */
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const embed = params.get('embed') === '1' && window.parent !== window;
  const page = /signup/.test(location.pathname) ? 'signup' : /forgot/.test(location.pathname) ? 'forgot' : 'login';
  document.body.classList.add('fx-auth', 'fx-auth-' + page);
  if (embed) document.body.classList.add('fx-auth-embed');
  document.body.classList.remove('dark-mode');
  function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  const G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  const A = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.6 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.5.9-1.4 1.3-2.8 1.3-2.8s-2.5-1-2.5-4.2zM14 4.9c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 2.9 1.1.1 2.2-.6 2.9-1.4z"/></svg>';
  const P = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>';
  const keep = href => { const u = new URL(href, location.href); for (const k of ['returnTo', 'embed']) if (params.get(k)) u.searchParams.set(k, params.get(k)); return u.pathname + u.search; };
  function init() {
    if (document.querySelector('.fx-card')) return;
    const main = document.querySelector('main.wrap'); if (!main) return;
    const form = document.querySelector('#emailLoginForm, #emailSignupForm, #resetForm');
    const status = document.getElementById('authStatus');
    const providers = [...document.querySelectorAll('#loginGoogle,#signupGoogle,#loginApple,#signupApple,#loginApp')];
    const card = el('section', 'fx-card'); card.setAttribute('aria-labelledby', 'fx-card-title');
    const title = {login: 'Sign in', signup: 'Create your FYNX account', forgot: 'Reset your password'}[page];
    const lead = {login: 'Your journal, Your News, alerts and saved research, on every device.', signup: 'Free. Save your journal, follow markets and sync across devices.', forgot: 'Enter your account email and we’ll send a secure reset link.'}[page];
    card.append(el('div', 'fx-card-brand', '<strong>FYNX</strong><span>FINANCE WORLD</span>'), el('h1', '', title)); card.querySelector('h1').id = 'fx-card-title';
    card.append(el('p', 'fx-card-lead', lead));
    if (page !== 'forgot') card.append(el('p', 'fx-card-terms', 'By continuing, I agree to the FYNX <a href="https://ea-la.github.io/FYNX-Site/terms.html" target="_blank" rel="noopener">Terms of Service</a> and <a href="https://ea-la.github.io/FYNX-Site/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.'));
    if (status) card.append(status);
    if (form) {
      form.querySelectorAll('.foot, .row').forEach(n => n.remove());
      const btn = form.querySelector('[type=submit]');
      if (btn) { btn.classList.add('btn', 'primary'); btn.textContent = page === 'login' ? 'Sign in' : page === 'signup' ? 'Create account' : 'Send reset link'; }
      if (page === 'login') { const pw = form.querySelector('#password'); const f = el('a', 'fx-forgot', 'Forgot password?'); f.href = keep('./forgot.html'); (pw?.closest('.field') || pw)?.after(f); }
      card.append(form);
    }
    if (providers.length) {
      card.append(el('div', 'fx-or', '<span>or</span>'));
      const box = el('div', 'fx-providers');
      for (const b of providers) {
        const svg = /Google/.test(b.id) ? G : /Apple/.test(b.id) ? A : P;
        b.className = 'btn fx-provider'; b.innerHTML = svg + '<span>' + (/Google/.test(b.id) ? 'Continue with Google' : /Apple/.test(b.id) ? 'Continue with Apple' : 'Continue with the FYNX app') + '</span>';
        box.append(b);
      }
      card.append(box);
    }
    const alt = el('p', 'fx-alt');
    if (page === 'login') alt.innerHTML = `Don’t have an account? <a href="${keep('./signup.html')}">Create one</a>`;
    else if (page === 'signup') alt.innerHTML = `Already have an account? <a href="${keep('./login.html')}">Sign in</a>`;
    else alt.innerHTML = `Remembered it? <a href="${keep('./login.html')}">Back to sign in</a>`;
    card.append(alt, el('p', 'fx-help', '<a href="/contact.html" target="_top">Need help?</a>'));
    main.replaceChildren(card);
    document.querySelector('.bg')?.remove();
    if (!embed && !document.querySelector('.fx-auth-bar')) document.body.prepend(el('header', 'fx-auth-bar', '<a class="fx-auth-logo" href="/home.html" aria-label="FYNX Finance World home"><strong>FYNX</strong><span>FINANCE WORLD</span></a><a class="fx-auth-back" href="/home.html">Back to FYNX</a>'));
    // In the site-wide window, keep the frame height in step with the card.
    if (embed) {
      const send = () => parent.postMessage({fynxAuth: 'size', height: Math.ceil(card.getBoundingClientRect().height)}, location.origin);
      new ResizeObserver(send).observe(card); send();
      document.addEventListener('keydown', e => { if (e.key === 'Escape') parent.postMessage({fynxAuth: 'close'}, location.origin); });
      card.querySelectorAll('a[target=_top]').forEach(a => a.addEventListener('click', () => parent.postMessage({fynxAuth: 'close'}, location.origin)));
    }
    (card.querySelector('#name') || card.querySelector('#email'))?.focus({preventScroll: true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
