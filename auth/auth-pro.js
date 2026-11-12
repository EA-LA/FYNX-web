/* FYNX sign-in / sign-up presentation: brand bar, provider icons, an "or" divider and a
   member-benefits panel. Form fields, IDs and the Firebase logic in each page are untouched. */
(function () {
  'use strict';
  const page = /signup/.test(location.pathname) ? 'signup' : /forgot/.test(location.pathname) ? 'forgot' : 'login';
  document.body.classList.add('fx-auth', 'fx-auth-' + page);
  document.body.classList.remove('dark-mode');
  function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  const G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  const A = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.6 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.5.9-1.4 1.3-2.8 1.3-2.8s-2.5-1-2.5-4.2zM14 4.9c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 2.9 1.1.1 2.2-.6 2.9-1.4z"/></svg>';
  const P = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>';
  function init() {
    // Brand bar
    if (!document.querySelector('.fx-auth-bar')) {
      const bar = el('header', 'fx-auth-bar', `<a class="fx-auth-logo" href="/home.html" aria-label="FYNX Finance World home"><strong>FYNX</strong><span>FINANCE WORLD</span></a>
        <nav aria-label="FYNX"><a href="/news.html">News</a><a href="/terminal.html" class="fx-auth-term">FYNX Terminal</a><a href="/pro.html">Pro plans</a><a href="/contact.html">Help</a></nav>`);
      document.body.prepend(bar);
    }
    // Provider icons
    for (const [sel, svg] of [['#loginGoogle,#signupGoogle', G], ['#loginApple,#signupApple', A], ['#loginApp', P]]) {
      document.querySelectorAll(sel).forEach(b => { if (!b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', svg); b.classList.add('fx-auth-provider'); });
    }
    // Continue-with wording
    const g = document.querySelector('#loginGoogle'), a = document.querySelector('#loginApple');
    if (g && /^Login with Google$/.test(g.textContent.trim())) g.lastChild.textContent = 'Continue with Google';
    if (a && /^Login with Apple$/.test(a.textContent.trim())) a.lastChild.textContent = 'Continue with Apple';
    const app = document.querySelector('#loginApp'); if (app && /^Login with App$/.test(app.textContent.trim())) app.lastChild.textContent = 'Sign in with the FYNX app';
    const submit = document.querySelector('#emailLoginForm button[type=submit]'); if (submit && /Login with email/.test(submit.textContent)) submit.textContent = 'Sign in';
    const sub2 = document.querySelector('#emailSignupForm button[type=submit]'); if (sub2 && /Sign up with email/.test(sub2.textContent)) sub2.textContent = 'Create account';
    // "or" divider between providers and the email form
    const actions = document.querySelector('.panel.left .actions'), form = document.querySelector('.panel.left form');
    if (actions && form && !document.querySelector('.fx-auth-or')) form.before(el('div', 'fx-auth-or', '<span>or continue with email</span>'));
    // Login with app sits after the email button: move it up with the other providers
    if (app && actions && app.parentElement !== actions) actions.append(app);
    // Member benefits on the art panel
    const right = document.querySelector('.panel.right');
    if (right && !right.querySelector('.fx-auth-benefits')) {
      right.removeAttribute('aria-hidden');
      const items = [
        ['Your News', 'Topics, companies and markets you follow, in one feed.'],
        ['Journal, synced', 'Your trades, notes and win rate on every device.'],
        ['Alerts & watchlists', 'Price levels and symbols you care about.'],
        ['Quant & Edge tools', 'Backtests, saved strategies and account protection.'],
        ['Pro tools when you need them', 'Risk planner, stress tests, drawdown simulator.']
      ];
      const box = el('div', 'fx-auth-benefits', `<p class="fx-auth-k">${page === 'signup' ? 'FREE ACCOUNT' : 'YOUR FYNX ACCOUNT'}</p><h2>${page === 'signup' ? 'Everything you track, in one place.' : 'Pick up exactly where you left off.'}</h2><ul>${items.map(([t, d]) => `<li><strong>${t}</strong><span>${d}</span></li>`).join('')}</ul><p class="fx-auth-safe">Read-only by design · Your data stays yours</p>`);
      right.append(box);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
