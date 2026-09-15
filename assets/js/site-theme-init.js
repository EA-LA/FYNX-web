/* Run before page-specific scripts so the first render uses the saved theme. */
(() => {
  let theme = 'dark';
  try {
    const saved = localStorage.getItem('fynx_theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
    else localStorage.setItem('fynx_theme', theme);
  } catch {}
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = theme === 'light' ? '#ffffff' : '#0b0c0c';
})();
