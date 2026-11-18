/* Members-only pages: load right after site-theme-init.js, before any page content renders.
   Hides the page until session-bootstrap.js confirms a signed-in account, so signed-out visitors
   never see dashboard content; they are sent to sign in (or sign up) and brought back afterwards.
   Account data itself is protected server-side by Firebase rules; this gate controls what renders. */
(() => {
  const PRIVATE_PAGES = ['home.html', 'dashboard.html', 'profile.html', 'account-settings.html', 'security.html', 'notifications.html', 'preferences.html'];
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  const isPrivate = PRIVATE_PAGES.includes(page);
  const loginUrl = reason => '/auth/login.html?returnTo=' + encodeURIComponent(location.pathname + location.search + location.hash) + (reason ? '&reason=' + reason : '');
  let released = false, timer = null;
  function release() {
    released = true;
    if (timer) clearTimeout(timer);
    document.documentElement.classList.remove('fynx-auth-pending');
  }
  window.FynxAuthGate = { PRIVATE_PAGES, isPrivate, release, loginUrl };
  if (!isPrivate) return;
  document.documentElement.classList.add('fynx-auth-pending');
  const style = document.createElement('style');
  style.textContent = 'html.fynx-auth-pending body{visibility:hidden!important}';
  document.head.appendChild(style);
  // If the sign-in service never answers (blocked or offline), do not leave a blank page:
  // send the visitor to sign in, which explains the problem and returns here on success.
  timer = setTimeout(() => { if (!released) location.replace(loginUrl('verify')); }, 15000);
})();
