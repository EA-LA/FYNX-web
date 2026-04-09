// Shared authenticated app shell (sidebar + top header) with route-based active state.
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



  function isDemoMode() {
    return localStorage.getItem('mode') === 'demo';
  }

  function ensureDemoStyles() {
    if (document.getElementById('fynxDemoStyles')) return;
    const style = document.createElement('style');
    style.id = 'fynxDemoStyles';
    style.textContent = `
      .demo-banner {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin-bottom:10px;
        padding:10px 12px;
        border:1px solid var(--line, rgba(255,255,255,.12));
        border-radius:12px;
        background: color-mix(in oklab, var(--panel, #111) 88%, transparent);
      }
      .demo-banner-title { font-size:13px; font-weight:900; }
      .demo-banner-sub { font-size:11px; opacity:.75; margin-top:2px; }
      .demo-banner-actions { display:flex; gap:8px; flex-wrap:wrap; }
      .demo-banner-btn {
        border:1px solid var(--line, rgba(255,255,255,.2));
        background:transparent;
        color:inherit;
        border-radius:999px;
        font-size:11px;
        font-weight:800;
        padding:6px 10px;
        text-decoration:none;
      }
    `;
    document.head.appendChild(style);
  }

  function demoBannerMarkup() {
    if (!isDemoMode()) return '';
    return `
      <div class="demo-banner" role="status" aria-live="polite">
        <div>
          <div class="demo-banner-title">Demo Mode</div>
          <div class="demo-banner-sub">You are viewing demo data — Sign up to unlock real account</div>
        </div>
        <div class="demo-banner-actions">
          <a class="demo-banner-btn" href="auth/signup.html">Sign Up</a>
          <a class="demo-banner-btn" href="auth/login.html">Log In</a>
        </div>
      </div>
    `;
  }

  function detectCurrentView() {
    let file = window.location.pathname.split('/').pop() || 'home.html';
    if (!file.includes('.html')) file = 'home.html';
    return FILE_TO_VIEW[file] || 'home';
  }

  function navMarkup(currentView) {
    return Object.keys(VIEW_PAGES)
      .map((view) => {
        const active = view === currentView ? ' active' : '';
        return `
          <a class="nav-item${active}" href="${VIEW_PAGES[view]}" data-view="${view}">
            <svg class="nav-icon" viewBox="0 0 24 24">${NAV_ICONS[view]}</svg>
            <span class="nav-label">${VIEW_LABELS[view]}</span>
          </a>
        `;
      })
      .join('');
  }

  function renderShell() {
    const navPanel = document.querySelector('.nav-panel');
    const topBar = document.querySelector('.top-bar');
    if (!navPanel || !topBar) return;

    const currentView = detectCurrentView();
    const existingTitle = (topBar.querySelector('.page-title')?.textContent || VIEW_LABELS[currentView] || 'Home').trim();

    navPanel.innerHTML = `<div class="nav-logo"><h1>FYNX</h1></div><div class="nav-menu">${navMarkup(currentView)}</div>`;

    ensureDemoStyles();
    topBar.innerHTML = `
      ${demoBannerMarkup()}
      <h1 class="page-title">${existingTitle}</h1>
      <div class="top-bar-right">
        <span class="chip" id="dateChip">Loading...</span>
        <button class="icon-btn" title="Notifications" aria-label="Notifications">
          <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
        </button>
        <div class="user-avatar" id="avatarInitials">FX</div>
      </div>
    `;

    const chip = document.getElementById('dateChip');
    if (chip) {
      chip.textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  function initNav() {
    renderShell();

    const initialsEl = document.getElementById('avatarInitials');
    if (initialsEl) {
      const userName = isDemoMode()
        ? 'Demo User'
        : (localStorage.getItem('fynxUserName') || localStorage.getItem('fynx_user_name') || 'FYNX');
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
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();
