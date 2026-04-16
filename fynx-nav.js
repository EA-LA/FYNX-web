// Shared authenticated app shell (sidebar + top header) with route-based active state.
(function () {
  const VIEW_PAGES = {
    home: 'home.html',
    journal: 'journal.html',
    calculator: 'calculator.html',
    news: 'news.html',
    calendar: 'calendar.html',
    learn: 'learn.html',
    profile: 'profile.html',
  };

  const VIEW_LABELS = {
    home: 'Home',
    journal: 'Journal',
    calculator: 'Calculator',
    news: 'News',
    calendar: 'Calendar',
    learn: 'Learn',
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
    'learn.html': 'learn',
    'profile.html': 'profile',
  };

  function demoBannerMarkup() {
    if (!isDemoMode()) return '';
    return `<div style="padding:8px 14px;border-radius:12px;border:1px solid var(--line, rgba(255,255,255,.18));font-size:12px;font-weight:700;letter-spacing:.02em;opacity:.88;">DEMO MODE · SIMULATED DATA</div>`;
  }

  const NAV_ICONS = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
    journal: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>',
    calculator: '<rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="8" y1="10" x2="16" y2="10"></line><line x1="8" y1="14" x2="16" y2="14"></line><line x1="8" y1="18" x2="16" y2="18"></line>',
    news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"></path><line x1="12" y1="11" x2="18" y2="11"></line><line x1="12" y1="7" x2="18" y2="7"></line>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
    learn: '<path d="M2 7l10-4 10 4-10 4-10-4z"></path><path d="M6 10v5c0 2.2 2.7 4 6 4s6-1.8 6-4v-5"></path><path d="M22 10v6"></path>',
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
    .top-bar-left{
      display:flex;
      align-items:center;
      gap:10px;
      min-width:0;
    }

    .sidebar-toggle{
      width:32px;
      height:32px;
      border-radius:10px;
      border:1px solid var(--line, rgba(255, 255, 255, .2));
      background:transparent;
      color:inherit;
      cursor:pointer;
      font-size:14px;
      font-weight:900;
    }

    @media (min-width: 901px){
      body.sidebar-collapsed .nav-panel{ width:72px !important; }
      body.sidebar-collapsed .main-content{ margin-left:72px !important; width:calc(100% - 72px) !important; }
      body.sidebar-collapsed .nav-item{ width:56px !important; padding:12px 0 !important; }
      body.sidebar-collapsed .nav-label{ display:none !important; }
      body.sidebar-collapsed .nav-logo{ font-size:18px; }
    }

    @media (max-width: 900px){
      .sidebar-toggle{ display:none; }
    }
  `;

  document.head.appendChild(style);
}

function ensureNavConsistencyStyles() {
  if (document.getElementById('fynxNavConsistencyStyles')) return;
  const style = document.createElement('style');
  style.id = 'fynxNavConsistencyStyles';
  style.textContent = `
    .nav-item.active{
      background: var(--surface-2, #f7f7f7) !important;
      color: var(--text, #0f0f0f) !important;
      border-color: transparent !important;
      box-shadow: var(--shadow-2, 0 10px 30px rgba(23, 23, 23, 0.08)) !important;
    }
    .nav-item.active::after{
      content:"";
      position:absolute;
      left:-1px;
      top:50%;
      transform:translateY(-50%);
      width:3px;
      height:26px;
      background:var(--text, #0f0f0f);
      border-radius:0 3px 3px 0;
      opacity:.9;
    }
  `;
  document.head.appendChild(style);
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
    ensureNavConsistencyStyles();
    const disableSidebarToggle = document.body.hasAttribute('data-disable-sidebar-toggle');
topBar.innerHTML = `
  ${demoBannerMarkup()}

  <div class="top-bar-left">
    ${disableSidebarToggle ? '' : '<button class="sidebar-toggle" id="sidebarToggle" type="button" aria-label="Collapse sidebar">&lt;</button>'}
    <h1 class="page-title">${existingTitle}</h1>
  </div>

  <div class="top-bar-right">
    <span class="chip" id="dateChip">Loading...</span>
    <button class="icon-btn" title="Notifications" aria-label="Notifications">
      <svg viewBox="0 0 24 24">
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
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
    const sidebarKey = 'fynx_sidebar_collapsed';
    const toggleBtn = document.getElementById('sidebarToggle');
    const disableSidebarToggle = document.body.hasAttribute('data-disable-sidebar-toggle');
    const applySidebarState = (collapsed) => {
      document.body.classList.toggle('sidebar-collapsed', collapsed);
      if (toggleBtn) {
        toggleBtn.textContent = collapsed ? '>' : '<';
        toggleBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      }
      localStorage.setItem(sidebarKey, collapsed ? '1' : '0');
    };
    if (disableSidebarToggle) {
      document.body.classList.remove('sidebar-collapsed');
      localStorage.setItem(sidebarKey, '0');
    } else if (window.matchMedia('(min-width: 901px)').matches) {
      applySidebarState(localStorage.getItem(sidebarKey) === '1');
    }
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        applySidebarState(!document.body.classList.contains('sidebar-collapsed'));
      });
    }

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
      initialsEl.title = isDemoMode() ? 'Demo mode' : 'Log out';
      initialsEl.style.cursor = isDemoMode() ? 'default' : 'pointer';
      initialsEl.addEventListener('click', async () => {
        if (isDemoMode()) return;
        const ok = window.confirm('Log out from this browser?');
        if (!ok) return;
        try {
          if (window.FynxSession?.logout) {
            await window.FynxSession.logout('manual', 'auth/login.html');
          }
        } finally {
          window.location.href = 'auth/login.html';
        }
      });
    }

    document.addEventListener('click', (event) => {
      const anchor = event.target.closest('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (href === window.location.pathname.split('/').pop()) return;

      let shell = document.getElementById('fynxPageShell');
      if (!shell) {
        shell = document.createElement('div');
        shell.id = 'fynxPageShell';
        shell.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99998;opacity:0;pointer-events:none;transition:opacity .12s ease;';
        document.body.appendChild(shell);
      }
      requestAnimationFrame(() => { shell.style.opacity = '1'; });
    }, { capture: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();
