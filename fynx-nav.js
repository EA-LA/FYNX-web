// Shared sidebar navigation + active-state logic
// Works across: home, journal, calculator, news, calendar, profile.
(function () {
  const VIEW_PAGES = {
    home: 'home.html',
    journal: 'journal.html',
    calculator: 'calculator.html',
    news: 'news.html',
    calendar: 'calendar.html',
    profile: 'profile.html',
  };

  const FILE_TO_VIEW = {
    'home.html': 'home',
    'index.html': 'home',
    'dashboard.html': 'home', // legacy redirect
    'journal.html': 'journal',
    'calculator.html': 'calculator',
    'news.html': 'news',
    'calendar.html': 'calendar',
    'profile.html': 'profile',
  };

  function detectCurrentView() {
    try {
      let file = window.location.pathname.split('/').pop() || 'home.html';
      if (FILE_TO_VIEW[file]) return FILE_TO_VIEW[file];

      const href = window.location.href;
      for (const [fname, key] of Object.entries(FILE_TO_VIEW)) {
        if (href.endsWith('/' + fname)) return key;
      }
    } catch (e) {
      // ignore and fall through
    }
    return null;
  }

  function initNav() {
    const items = document.querySelectorAll('.nav-panel .nav-item[data-view]');
    if (!items.length) return;

    const currentView = detectCurrentView();

    items.forEach((item) => {
      const viewName = item.getAttribute('data-view');

      // Reset any hard-coded active classes first
      item.classList.remove('active');
      if (currentView && viewName === currentView) {
        item.classList.add('active');
      }

      item.addEventListener('click', function (event) {
        const view = this.getAttribute('data-view');
        const target = VIEW_PAGES[view];
        if (!target) return;

        // If we're already on the correct page, just keep the active state
        const path = window.location.pathname || '';
        if (path.endsWith('/' + target) || path === '/' + target || path === target) {
          return;
        }

        // Prevent default so anchors with placeholder hrefs don't jump
        if (event && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        window.location.href = target;
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();

