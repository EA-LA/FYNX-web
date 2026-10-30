/* Presentation enhancement for the existing Finance World shell.
 * Existing account, notification, navigation and theme controls keep their nodes
 * and handlers. The original page remains usable if this asset cannot load.
 */
(function () {
  'use strict';

  let clockInterval;
  let quickAddTimer;
  let quickAddAttempts = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function link(label, href, className) {
    const node = element('a', className, label);
    node.href = href;
    return node;
  }

  function searchForm() {
    const form = element('form', 'terminal-header-search');
    form.action = '/explore.html';
    form.method = 'get';
    form.setAttribute('role', 'search');
    form.setAttribute('aria-label', 'Search Finance World');
    const input = element('input');
    input.type = 'search';
    input.name = 'q';
    input.placeholder = 'Search tools, lessons, market topics';
    input.setAttribute('aria-label', 'Search tools, lessons and market topics');
    const submit = element('button');
    submit.type = 'submit';
    submit.setAttribute('aria-label', 'Search');
    submit.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 5 5"></path></svg>';
    form.append(submit, input);
    return form;
  }

  function quickAdd() {
    const action = link('+ Quick Add', '/journal.html#quick-add', 'terminal-quick-add');
    action.setAttribute('aria-label', 'Add a trade in your journal');
    action.addEventListener('click', function (event) {
      const nativeAction = document.getElementById('quickAddBtn');
      if (!nativeAction) return;
      event.preventDefault();
      requestQuickAdd();
    });
    return action;
  }

  function requestQuickAdd() {
    const button = document.getElementById('quickAddBtn');
    const entry = document.getElementById('view-entry');
    if (!button || !entry) return;
    window.clearTimeout(quickAddTimer);
    button.click();
    if (entry.classList.contains('active')) {
      quickAddAttempts = 0;
      if (typeof entry.scrollIntoView === 'function') entry.scrollIntoView({ block: 'start' });
      return;
    }
    // Journal's native module waits for authentication persistence. Retry its
    // existing action briefly rather than duplicating Journal state or logic.
    if (++quickAddAttempts < 40) quickAddTimer = window.setTimeout(requestQuickAdd, 250);
  }

  function mountTicker(body) {
    const navigation = body.querySelector('.dashboard-container .nav-menu, :scope > .terminal-navigation');
    if (!navigation || body.querySelector('[data-terminal-ticker]')) return;
    const ticker = element('div', 'terminal-ticker-host');
    ticker.dataset.terminalTicker = '';
    ticker.setAttribute('role', 'region');
    ticker.setAttribute('aria-label', 'Market snapshot');
    navigation.after(ticker);
  }

  function utilityBar(dateChip) {
    const bar = element('div', 'terminal-utility');
    const inner = element('div', 'terminal-header-inner');
    const clock = element('div', 'terminal-header-clock');
    const date = dateChip || element('span');
    date.dataset.terminalDate = '';
    const time = element('time');
    time.dataset.terminalTime = '';
    clock.append(date, element('span', 'terminal-clock-separator', '·'), time);
    const sessions = element('div', 'terminal-header-sessions');
    sessions.dataset.terminalSessions = '';
    const actions = element('div', 'terminal-utility-actions');
    actions.append(link('API', '/api/'), link('Pro tools & plans', '/pro.html'));
    if (window.FynxEdition) {
      const label = element('label','terminal-edition');
      const select = element('select'); select.dataset.editionSelect = '';
      select.setAttribute('aria-label','News edition');
      window.FynxEdition.editions.forEach(function (edition) {const option=element('option','',edition.label+' edition');option.value=edition.id;select.append(option);});
      select.value=window.FynxEdition.get();label.append(select);actions.append(label);
    }
    inner.append(clock, sessions, actions);
    bar.append(inner);
    return { bar, actions };
  }

  function mountTopics(body) {
    if (!window.FynxEdition || body.querySelector('.terminal-topic-nav')) return;
    const original=body.querySelector('.dashboard-container .nav-menu, :scope > .terminal-navigation');
    if (!original) return;
    const nav=element('nav','terminal-topic-nav'), inner=element('div','terminal-topic-inner');nav.setAttribute('aria-label','News sections');
    inner.append(link('Newsroom','/news.html','terminal-topic-home'));
    window.FynxEdition.sections.slice(0,6).forEach(function(section){const a=link(section.label,section.href);if(location.pathname===section.href)a.setAttribute('aria-current','page');inner.append(a);});
    const more=element('details','terminal-topic-more');more.append(element('summary','','More'));
    const menu=element('div','terminal-topic-menu');
    window.FynxEdition.sections.slice(6).forEach(section=>menu.append(link(section.label,section.href)));
    menu.append(link('Watch & listen','/news.html#watch-listen'),link('Official sources','/news.html#official-sources'));more.append(menu);inner.append(more);nav.append(inner);original.before(nav);
  }

  function updateClock() {
    if (document.hidden) return;
    const now = new Date();
    const date = document.querySelector('[data-terminal-date]');
    const time = document.querySelector('[data-terminal-time]');
    if (date) date.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    if (time) {
      time.dateTime = now.toISOString();
      time.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    }
  }

  function startClock() {
    updateClock();
    if (!clockInterval) clockInterval = window.setInterval(updateClock, 30000);
  }

  function enhanceWorkspace(body, topBar) {
    const logo = body.querySelector('.nav-logo');
    const left = topBar.querySelector('.top-bar-left') || element('div', 'top-bar-left');
    const right = topBar.querySelector('.top-bar-right');
    if (!logo || !right) return false;

    const utility = utilityBar(topBar.querySelector('#dateChip'));
    body.querySelector('.dashboard-container').before(utility.bar);
    const api = right.querySelector('a[href="/api/"]');
    if (api) utility.actions.firstElementChild.replaceWith(api);
    const accountLinks = topBar.querySelector('#publicAccountLinks');
    if (accountLinks) {
      const pro = accountLinks.querySelector('a[href="/pro.html"]');
      if (pro) utility.actions.querySelector('a[href="/pro.html"]').replaceWith(pro);
      right.append(accountLinks);
    }

    const title = topBar.querySelector('.page-title');
    if (title && !left.contains(title)) left.append(title);
    left.append(searchForm());
    if (!left.isConnected) topBar.prepend(left);
    const brand = link('', '/', 'terminal-brand');
    brand.setAttribute('aria-label', 'FYNX Finance World home');
    const existingWordmark = logo.querySelector('h1');
    if (existingWordmark) brand.append(existingWordmark);
    else brand.append(element('strong', '', 'FYNX'));
    brand.append(element('span', 'terminal-brand-subtitle', 'FINANCE WORLD'));
    logo.append(brand);
    topBar.prepend(logo);
    right.insertBefore(quickAdd(), right.querySelector('#avatarInitials') || accountLinks || null);
    topBar.classList.add('terminal-masthead');
    body.querySelectorAll('.nav-item.active').forEach(function (item) { item.setAttribute('aria-current', 'page'); });
    return true;
  }

  function enhancePublic(body, header) {
    const container = header.querySelector('.nav-container') || header;
    const utility = utilityBar();
    if (header.id === 'header') header.prepend(utility.bar);
    else header.before(utility.bar);
    const brand = container.querySelector('.logo, .discovery-brand, .brand');
    if (!brand) return false;
    header.classList.add('terminal-masthead');
    container.classList.add('terminal-public-masthead');
    brand.classList.add('terminal-brand');
    if (brand.classList.contains('discovery-brand') || brand.classList.contains('brand')) {
      Array.from(brand.childNodes).filter(function (node) { return node.nodeType === 3 && node.textContent.trim(); }).forEach(function (node) {
        node.replaceWith(element('strong', '', node.textContent.replace('↗', '').trim()));
      });
      const subtitle = brand.querySelector('span');
      if (subtitle) subtitle.classList.add('terminal-brand-subtitle');
    }
    if (brand.classList.contains('logo')) {
      brand.append(element('small', 'terminal-brand-subtitle', 'FINANCE WORLD'));
      brand.setAttribute('role', 'link');
      brand.setAttribute('tabindex', '0');
      brand.setAttribute('aria-label', 'FYNX Finance World home');
      brand.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') brand.click();
      });
    }
    brand.after(searchForm());

    // The landing page's original category dropdowns remain available in the
    // utility row. Their original IDs and click handlers are preserved.
    if (header.id === 'header') {
      const categories = container.querySelector(':scope > nav');
      if (categories) {
        categories.classList.add('terminal-category-links');
        utility.actions.prepend(categories);
      }
      const quickActions = container.querySelector('.fynx-top-actions');
      if (quickActions) {
        quickActions.querySelectorAll('a.fynx-network-btn').forEach(function (action) {
          const path = new URL(action.href, location.href).pathname;
          if (path === '/home.html' || path === '/pro.html') {
            action.classList.add('terminal-utility-native-link');
            utility.actions.append(action);
          }
        });
        quickActions.insertBefore(quickAdd(), quickActions.firstChild);
      }
      const refreshMenuPosition = function () {
        document.documentElement.style.setProperty('--header-h', header.getBoundingClientRect().height + 'px');
      };
      refreshMenuPosition();
      if (typeof ResizeObserver === 'function') new ResizeObserver(refreshMenuPosition).observe(header);
    } else {
      const actions = container.querySelector(':scope > nav');
      if (actions) actions.prepend(quickAdd());
    }
    return true;
  }

  function enhance() {
    const body = document.body;
    if (!body || !body.hasAttribute('data-fynx-terminal') || body.classList.contains('terminal-masthead-ready')) return;
    const workspaceHeader = body.querySelector('.dashboard-container .top-bar');
    const publicHeader = body.querySelector('#header, .discovery-header, .pro-nav');
    const ready = workspaceHeader ? enhanceWorkspace(body, workspaceHeader) : publicHeader ? enhancePublic(body, publicHeader) : false;
    if (!ready) return;
    body.classList.add('terminal-masthead-ready');
    mountTopics(body);
    mountTicker(body);
    startClock();
    document.addEventListener('visibilitychange', updateClock);
    window.addEventListener('pagehide', function () { window.clearInterval(clockInterval); clockInterval = null; window.clearTimeout(quickAddTimer); });
    window.addEventListener('pageshow', startClock);
    if (location.hash === '#quick-add') requestQuickAdd();
    window.addEventListener('hashchange', function () {
      if (location.hash === '#quick-add') { quickAddAttempts = 0; requestQuickAdd(); }
    });
    document.dispatchEvent(new CustomEvent('fynx:terminal-header', { bubbles: true }));
  }

  // Deferred scripts execute while readyState is "interactive", before
  // DOMContentLoaded. fynx-nav renders on that event, so both "loading" and
  // "interactive" must wait for it before enhancing the rendered shell.
  function scheduleEnhancement() { queueMicrotask(enhance); }
  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', scheduleEnhancement, { once: true });
    // Also cover a late-injected script after DOMContentLoaded but before load.
    window.addEventListener('load', scheduleEnhancement, { once: true });
  } else scheduleEnhancement();
})();
