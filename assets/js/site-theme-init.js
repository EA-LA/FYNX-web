/* Run before page-specific scripts so the first render uses the saved theme. */
(() => {
  // Legacy controls remain inert for scripts that retain references to their IDs.
  const policy = document.createElement('style');
  policy.textContent = `:is([data-journal-theme],[data-fynx-theme-toggle],#themeToggle,#themeBtn,#theme-toggle,.theme-toggle,.theme-btn,.fynx-network-theme,.fynx-theme-toggle):not([data-theme-control]){display:none!important}`;
  document.head.appendChild(policy);
  // Capture early failures while the reporting script is still loading. Keep
  // only operation identifiers and codes, never exception messages or inputs.
  window.FynxMonitor ||= {
    report(category, operation, error) {
      const queue = window.__fynxMonitorQueue ||= [];
      if (queue.length < 12) queue.push([category, operation, {code: typeof error?.code === 'string' ? error.code : error?.name === 'TimeoutError' ? 'timeout' : error?.name === 'TypeError' ? 'network' : 'unknown'}]);
    },
    async track(category, operation, action) {
      try { return await action(); } catch (error) { window.FynxMonitor.report(category, operation, error); throw error; }
    }
  };
  const monitor = document.createElement('script');
  monitor.src = '/assets/js/monitoring.js?v=20260928-operations';
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
