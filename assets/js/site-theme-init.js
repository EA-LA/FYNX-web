/* Run before page-specific scripts so the first render uses the saved theme. */
(() => {
  // Legacy controls remain inert for scripts that retain references to their IDs.
  const policy = document.createElement('style');
  policy.textContent = `:is([data-journal-theme],[data-fynx-theme-toggle],#themeToggle,#themeBtn,#theme-toggle,.theme-toggle,.theme-btn,.fynx-network-theme,.fynx-theme-toggle):not([data-theme-control]){display:none!important}`;
  document.head.appendChild(policy);
  const monitor = document.createElement('script');
  monitor.src = '/assets/js/monitoring.js?v=20260922-services';
  monitor.defer = true;
  document.head.appendChild(monitor);
  let theme = 'light';
  try {
    const saved = localStorage.getItem('fynx_theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
    else localStorage.setItem('fynx_theme', theme);
  } catch {}
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = theme === 'light' ? '#ffffff' : '#0b0c0c';
})();
