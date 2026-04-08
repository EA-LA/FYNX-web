// Shared authenticated app shell (single source of truth for sidebar/header).
(function () {
  const VIEW_PAGES = {
    home: 'home.html',
    journal: 'journal.html',
    calculator: 'calculator.html',
    news: 'news.html',
    calendar: 'calendar.html',
    profile: 'profile.html',
  };

  const VIEW_LABELS = {
    home: 'Home',
    journal: 'Journal',
    calculator: 'Calculator',
    news: 'News',
    calendar: 'Calendar',
    profile: 'Profile',
  };

  const FILE_TO_VIEW = {
    'home.html': 'home',
    'index.html': 'home',
    'dashboard.html': 'home',
    'journal.html': 'journal',
    'calculator.html': 'calculator',
    'news.html': 'news',
    'calendar.html': 'calendar',
    'profile.html': 'profile',
  };

  const NAV_ICONS = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
    journal: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>',
    calculator: '<rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="8" y1="10" x2="16" y2="10"></line><line x1="8" y1="14" x2="16" y2="14"></line><line x1="8" y1="18" x2="16" y2="18"></line>',
    news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"></path><line x1="12" y1="11" x2="18" y2="11"></line><line x1="12" y1="7" x2="18" y2="7"></line>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
    profile: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
  };

  function detectCurrentView() {
    let file = window.location.pathname.split('/').pop() || 'home.html';
    if (!file.includes('.html')) file = 'home.html';
    return FILE_TO_VIEW[file] || 'home';
  }

  function getPageTitle(currentView) {
    const current = document.querySelector('.page-title');
    return (current?.textContent || VIEW_LABELS[currentView] || 'Home').trim();
  }

  function renderNav(currentView) {
    return Object.keys(VIEW_PAGES)
      .map((view) => {
        const active = view === currentView ? ' active' : '';
        return `<a class="app-shell-nav-item${active}" href="${VIEW_PAGES[view]}" data-view="${view}">
          <svg class="app-shell-icon" viewBox="0 0 24 24">${NAV_ICONS[view]}</svg>
          <span class="app-shell-label">${VIEW_LABELS[view]}</span>
        </a>`;
      })
      .join('');
  }

  function renderShell() {
    const currentView = detectCurrentView();
    const title = getPageTitle(currentView);

    const oldContainer = document.querySelector('.dashboard-container');
    const oldContent = document.querySelector('.content-area');
    if (!oldContainer || !oldContent) return;

    const contentChildren = Array.from(oldContent.childNodes);

    const root = document.createElement('div');
    root.className = 'app-shell-root';
    root.innerHTML = `
      <nav class="app-shell-sidebar" aria-label="Primary">
        <div class="app-shell-logo"><h1>FYNX</h1></div>
        <div class="app-shell-nav">${renderNav(currentView)}</div>
      </nav>
      <main class="app-shell-main">
        <header class="app-shell-header">
          <h1 class="app-shell-title page-title">${title}</h1>
          <div class="app-shell-header-right">
            <span class="app-shell-chip chip" id="dateChip">Loading...</span>
            <button class="app-shell-icon-btn icon-btn" title="Notifications" aria-label="Notifications">
              <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
            </button>
            <div class="app-shell-avatar user-avatar" id="avatarInitials">FX</div>
          </div>
        </header>
        <section class="app-shell-content content-area"></section>
      </main>
    `;

    const newContent = root.querySelector('.app-shell-content');
    contentChildren.forEach((node) => newContent.appendChild(node));

    oldContainer.replaceWith(root);
    document.body.classList.add('app-shell');

    const chip = document.getElementById('dateChip');
    if (chip) {
      chip.textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
      });
    }

    const initialsEl = document.getElementById('avatarInitials');
    if (initialsEl) {
      const userName = localStorage.getItem('fynxUserName') || localStorage.getItem('fynx_user_name') || 'FYNX';
      const initials = userName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((chunk) => chunk.charAt(0).toUpperCase())
        .join('') || 'FX';
      initialsEl.textContent = initials;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderShell);
  } else {
    renderShell();
  }
})();
