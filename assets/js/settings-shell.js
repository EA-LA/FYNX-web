/* FYNX account settings shell: one tab bar across Profile, Account, Security, Notifications,
   Preferences, Trading accounts and Membership, inside the site's standard header. Page logic stays
   in each page; this file only adds navigation and the account summary card. */
(function () {
  'use strict';
  const page = document.body.dataset.fynxSettings; if (!page) return;
  const TABS = [
    ['profile', 'Overview', '/profile.html'],
    ['account-settings', 'Account', '/account-settings.html'],
    ['security', 'Security', '/security.html'],
    ['notifications', 'Notifications', '/notifications.html'],
    ['preferences', 'Preferences', '/preferences.html'],
    ['accounts', 'Trading accounts', '/profile/accounts/'],
    ['membership', 'Membership', '/pro.html#plans']
  ];
  const BLURB = {
    'account-settings': 'Your name, photo, trading profile and support links.',
    security: 'Password, email verification, two-factor and signed-in devices.',
    notifications: 'What FYNX alerts you about, and where.',
    preferences: 'Defaults for time, currency, risk and market focus across every tool.'
  };
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function init() {
    const area = document.querySelector('.content-area'); if (!area || area.querySelector('.st-tabs')) return;
    const nav = el('nav', 'st-tabs'); nav.setAttribute('aria-label', 'Account settings');
    for (const [key, label, href] of TABS) { const a = el('a', '', label); a.href = href; if (key === page) a.setAttribute('aria-current', 'page'); nav.append(a); }
    const head = area.querySelector(':scope > .section-header, :scope > div:first-child');
    const hero = el('header', 'st-hero');
    const eyebrow = el('p', 'st-eyebrow', 'ACCOUNT');
    const title = head?.querySelector('h2')?.textContent?.trim() || document.title;
    hero.append(eyebrow, el('h1', 'st-title', title === 'Notification Center' ? 'Notifications' : title), el('p', 'st-sub', BLURB[page] || ''));
    if (head && head.querySelector('h2')) head.classList.add('st-hidden-head');
    const who = el('div', 'st-who'); who.hidden = true;
    const avatar = el('span', 'st-avatar'), meta = el('span', 'st-who-meta'), name = el('strong'), mail = el('small');
    meta.append(name, mail); who.append(avatar, meta); hero.append(who);
    const paint = () => {
      const id = window.FynxIdentity || {}; if (!id.uid) { who.hidden = true; return; }
      who.hidden = false; name.textContent = id.displayName || 'FYNX member'; mail.textContent = id.email || '';
      const photo = id.photoURL; avatar.replaceChildren();
      if (photo) { const img = el('img'); img.alt = ''; img.src = photo; img.referrerPolicy = 'no-referrer'; img.onerror = () => { avatar.textContent = initials(id); }; avatar.append(img); }
      else avatar.textContent = initials(id);
    };
    area.prepend(hero, nav);
    window.addEventListener('fynx:identity', paint); paint();
    nav.querySelector('[aria-current]')?.scrollIntoView({block: 'nearest', inline: 'center'});
  }
  function initials(id) { const s = (id.displayName || id.email || 'F').trim(); return s.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || 'F'; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
