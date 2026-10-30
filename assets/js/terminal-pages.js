/* Page composition using the existing Finance World content and controls. */
(function () {
  'use strict';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function copyLink(source, label, className) {
    const a = el('a', className, label || source.textContent.trim());
    a.setAttribute('href', source.getAttribute('href'));
    return a;
  }

  function sectionTitle(title, detail) {
    const row = el('div', 'terminal-section-heading');
    row.append(el('h2', '', title));
    if (detail) row.append(el('span', '', detail));
    return row;
  }

  function learn() {
    const wrap = document.querySelector('.learn-wrap');
    const learning = document.getElementById('learn-content');
    const quizzes = document.getElementById('quiz-content');
    const related = wrap?.querySelector('.resource-related');
    const grid = learning?.querySelector('.learning-grid');
    if (!wrap || !learning || !quizzes || !related || !grid) return;
    const title = el('h1', 'terminal-page-title', 'Learning center');
    wrap.querySelector('.editorial-label')?.after(title);
    grid.before(sectionTitle('Topics', grid.children.length + ' learning paths'));
    const layout = el('div', 'terminal-learning-layout');
    const main = el('div', 'terminal-learning-main');
    const aside = el('aside', 'terminal-reading-rail');
    aside.setAttribute('aria-label', 'Continue learning');
    learning.before(layout);
    main.append(learning, quizzes);
    aside.append(related);
    const originalQuiz = quizzes.querySelector('.learning-card');
    if (originalQuiz) {
      const card = el('section', 'terminal-quiz-prompt');
      for (const selector of ['h2', 'p', 'a']) {
        const source = originalQuiz.querySelector(selector);
        if (source) card.append(selector === 'a' ? copyLink(source, null, 'terminal-solid-link') : el(selector, '', source.textContent));
      }
      aside.append(card);
    }
    layout.append(main, aside);
  }

  function research() {
    const workspace = document.querySelector('.desk-workspace');
    const panel = document.getElementById('research-panel');
    const nav = document.getElementById('desk-nav');
    const sidebar = document.querySelector('.desk-sidebar');
    if (!workspace || !panel || !nav || !sidebar) return;
    const layout = el('div', 'terminal-research-layout');
    const rail = el('aside', 'terminal-research-rail');
    rail.setAttribute('aria-label', 'Research workbench');
    const label = sidebar.querySelector('.eyebrow');
    if (label) rail.append(label);
    const links = el('nav', 'terminal-workbench-links');
    links.setAttribute('aria-label', 'Research tools');
    nav.querySelectorAll('a').forEach(function (source) {
      const label = source.children[1];
      const a = copyLink(source, '', '');
      a.textContent = '';
      const name = label ? Array.from(label.childNodes).filter(function (node) { return node.nodeType === 3; }).map(function (node) { return node.textContent; }).join('').trim() : source.textContent.trim();
      a.append(el('strong', '', name));
      const description = source.querySelector('small');
      if (description) a.append(el('small', '', description.textContent));
      links.append(a);
    });
    rail.append(links);
    const foot = sidebar.querySelector('.sidebar-foot');
    if (foot) rail.append(foot);
    panel.before(layout);
    layout.append(panel, rail);
  }

  function profile() {
    const area = document.querySelector('.content-area');
    const settings = area?.querySelector('.settings-list');
    const title = area?.querySelector('.settings-section-title');
    const appearance = settings?.querySelector('.settings-item:has([data-theme-control])');
    if (!settings || !title || !appearance) return;
    const layout = el('div', 'terminal-profile-layout');
    const main = el('div', 'terminal-profile-settings');
    const aside = el('aside', 'terminal-profile-aside');
    aside.setAttribute('aria-label', 'Appearance and workspace');
    title.before(layout);
    main.append(title, settings);
    aside.append(appearance);
    const pro = document.querySelector('a[href="/pro.html"]');
    if (pro) {
      const promo = copyLink(pro, 'Pro tools & plans', 'terminal-pro-link');
      promo.prepend(el('span', '', 'FYNX / PRO'));
      aside.append(promo);
    }
    layout.append(main, aside);
  }

  function calendar() {
    const area = document.querySelector('.calendar-wrap');
    const tabs = area?.querySelector('.calendar-mode-toggle');
    const panels = area ? Array.from(area.querySelectorAll(':scope > .mode-content')) : [];
    const directory = area?.querySelector('.hub-directory');
    if (!tabs || !panels.length || !directory) return;
    const firstTab = tabs.querySelector('button');
    const heading = el('div', 'terminal-calendar-heading');
    heading.append(el('p', 'editorial-label', 'FYNX / NEWS & EVENTS'), el('h1', 'terminal-page-title', firstTab?.textContent.trim() || 'Economic Calendar'));
    tabs.before(heading);
    const layout = el('div', 'terminal-calendar-layout');
    const main = el('div', 'terminal-calendar-main');
    const aside = el('aside', 'terminal-calendar-rail');
    aside.setAttribute('aria-label', 'Calendar resources');
    tabs.after(layout);
    panels.forEach(function (panel) { main.append(panel); });
    aside.append(directory);
    layout.append(main, aside);
  }

  function calculator() {
    const hero = document.querySelector('.hero:has(.quick-calc)');
    const intro = hero?.querySelector('.hero-card');
    const calculator = hero?.querySelector('.quick-calc');
    if (!intro || !calculator) return;
    calculator.prepend(sectionTitle('Basic calculator', 'Arithmetic & %'));
    const source = document.querySelector('#toolsGrid a[href="/tools/position-size.html"]');
    if (source) {
      const sizing = el('section', 'terminal-position-sizing');
      const heading = sectionTitle('Position sizing');
      heading.append(copyLink(source, 'Open full tool ↗', 'terminal-full-tool'));
      const frame = el('iframe', 'terminal-position-frame');
      frame.title = 'Forex position sizing calculator';
      frame.loading = 'lazy';
      frame.height = '620';
      frame.addEventListener('load', function () { preparePositionFrame(frame); });
      frame.src = source.getAttribute('href');
      sizing.append(heading, frame);
      intro.after(sizing);
    }
    const filters = document.querySelector('.filters');
    if (filters) filters.before(sectionTitle('All tools', document.getElementById('countText')?.textContent.trim()));
  }

  function preparePositionFrame(frame) {
    try {
      const doc = frame.contentDocument;
      if (!doc?.body || frame.contentWindow.location.origin !== location.origin || !doc.getElementById('calcBtn')) return;
      doc.body.classList.add('terminal-position-embedded');
      const stylesheet = doc.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = '/assets/css/terminal-position-embed.css?v=20261029-r2';
      const resize = function () {
        const height = Math.ceil(doc.body.getBoundingClientRect().height);
        if (height > 0 && Math.abs(frame.getBoundingClientRect().height - height) > 2) frame.style.height = (height + 2) + 'px';
      };
      stylesheet.addEventListener('load', resize);
      doc.head.append(stylesheet);
      // The native preset fields remain intact, inside an optional disclosure.
      const name = doc.getElementById('presetName');
      const hint = doc.getElementById('presetHint');
      const chips = doc.getElementById('presetChips');
      if (name && hint && chips) {
        const details = doc.createElement('details');
        details.className = 'terminal-position-presets';
        const summary = doc.createElement('summary');
        summary.textContent = 'Saved presets';
        details.append(summary);
        name.parentElement.before(details);
        details.append(name.parentElement, hint, chips);
      }
      const syncTheme = function () {
        const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        doc.documentElement.dataset.theme = theme;
        doc.body.classList.toggle('dark-mode', theme === 'dark');
      };
      syncTheme();
      if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(doc.body);
      new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      resize();
    } catch (_) { /* The complete tool is still available through its normal link. */ }
  }

  function pro() {
    const plans = document.querySelector('.plans');
    const products = document.querySelector('#productCards');
    if (!plans || !products) return;
    const names = Array.from(plans.querySelectorAll('.plan > .eyebrow')).map(function (n) { return n.textContent.trim(); });
    if (names.length !== 3) return;
    const rows = Array.from(products.querySelectorAll('.product')).map(function (card) {
      return { link: card.querySelector('h3 a'), tier: card.querySelector(':scope > span')?.textContent.trim() };
    });
    if (!rows.length || rows.some(function (row) { return !row.link || !names.includes(row.tier); })) return;
    const section = el('section', 'terminal-plan-comparison');
    section.append(sectionTitle('Compare tiers', 'Included tools'));
    const scroll = el('div', 'terminal-comparison-scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'Membership tool comparison');
    const table = el('table');
    const caption = el('caption', 'terminal-sr-only', 'Tools included in each paid membership, based on the product tiers listed below.');
    const thead = el('thead'), head = el('tr');
    ['Product'].concat(names).forEach(function (name) { const th = el('th', '', name); th.scope = 'col'; head.append(th); });
    thead.append(head);
    const tbody = el('tbody');
    rows.forEach(function (row) {
      const tr = el('tr'), label = el('th');
      label.scope = 'row'; label.append(copyLink(row.link)); tr.append(label);
      names.forEach(function (_, index) {
        const included = index >= names.indexOf(row.tier);
        const td = el('td', included ? 'terminal-included' : '', included ? '✓' : '—');
        td.setAttribute('aria-label', included ? 'Included' : 'Not included');
        tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(caption, thead, tbody); scroll.append(table); section.append(scroll);
    document.querySelector('#products').before(section);
  }

  function enhance() {
    const body = document.body;
    if (!body?.hasAttribute('data-fynx-terminal') || body.hasAttribute('data-terminal-page')) return;
    const path = location.pathname.split('/').pop() || 'index.html';
    const routes = { 'journal.html': 'journal', 'calculator.html': 'calculator', 'learn.html': 'learn', 'calendar.html': 'calendar', 'profile.html': 'profile', 'pro.html': 'pro', 'index.html': 'landing' };
    const page = body.classList.contains('research-page') ? 'research' : routes[path];
    if (!page) return;
    body.dataset.terminalPage = page;
    const actions = { learn: learn, research: research, profile: profile, calendar: calendar, calculator: calculator, pro: pro };
    actions[page]?.();
  }

  document.addEventListener('fynx:terminal-header', enhance, { once: true });
  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', function () { queueMicrotask(enhance); }, { once: true });
    window.addEventListener('load', enhance, { once: true });
  } else queueMicrotask(enhance);
})();
