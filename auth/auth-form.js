/* Bind the form before loading the SDK, so even a blocked SDK has useful feedback. */
(() => {
  const form = document.querySelector('#emailLoginForm, #emailSignupForm, #resetForm');
  if (!form) return;
  const signup = form.id === 'emailSignupForm', reset = form.id === 'resetForm';
  const status = document.createElement('p');
  status.id = 'authStatus'; status.className = 'auth-status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  form.before(status);
  const buttons = [...document.querySelectorAll('.actions button, form button')];
  const labels = new Map(buttons.map(button => [button, button.textContent]));
  let busy = false, sdkPromise;
  const messages = {
    'auth/invalid-credential': 'The email or password is incorrect. Please try again or reset your password.',
    'auth/wrong-password': 'The email or password is incorrect. Please try again or reset your password.',
    'auth/user-not-found': 'The email or password is incorrect. Please try again or reset your password.',
    'auth/invalid-email': 'Enter a valid email address, such as you@example.com.',
    'auth/email-already-in-use': 'An account already uses this email. Sign in or reset your password.',
    'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
    'auth/password-does-not-meet-requirements': 'This password does not meet the account requirements. Use a longer password with uppercase and lowercase letters, a number, and a symbol.',
    'auth/network-request-failed': 'We couldn’t connect. Check your internet connection and try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes, then try again.',
    'auth/user-disabled': 'This account is unavailable. Please contact FYNX support.',
    'auth/popup-closed-by-user': 'The sign-in window was closed. Try again when you’re ready.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled. Please try again.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow popups for this site and try again.',
    'auth/account-exists-with-different-credential': 'Use the sign-in method you originally chose for this email.',
    'auth/operation-not-allowed': 'This sign-in method is currently unavailable. Please use email or another method.',
    'auth/unauthorized-domain': 'This sign-in method is currently unavailable on this address. Please use email.'
  };
  function report(message, success = false) {
    status.textContent = message; status.dataset.kind = success ? 'success' : 'error';
  }
  function loadSdk() {
    if (!sdkPromise) {
      let timer;
      const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject({code: "auth/network-request-failed"}), 15000); });
      sdkPromise = Promise.race([Promise.all([
      import('./firebase.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
      import('../assets/js/mfa.js?v=20260915-cloud'),
      import('../assets/js/route-utils.js?v=20260922-routing')
    ]).then(async ([config, api, mfa, routes]) => {
      await config.authPersistenceReady;
      return { auth: config.auth, api, withMfa: mfa.withMfa, safeReturnTo: routes.safeReturnTo };
    }), deadline]).finally(() => clearTimeout(timer)).catch(error => { sdkPromise = null; throw error; });
    }
    return sdkPromise;
  }
  // Begin loading without allowing a rejected import to become an unhandled error.
  loadSdk().catch(() => report('Sign-in couldn’t load. Check your connection, then try again or reload this page.'));
  const returnTo = new URLSearchParams(location.search).get('returnTo');
  document.querySelectorAll('a[href="./login.html"], a[href="./signup.html"], a[href="./forgot.html"]').forEach(link => {
    if (returnTo) { const url = new URL(link.href); url.searchParams.set('returnTo', returnTo); link.href = url; }
  });
  async function run(button, operation) {
    if (busy) return;
    if (!navigator.onLine) { report('You’re offline. Reconnect to continue.'); return; }
    busy = true; buttons.forEach(item => item.disabled = true);
    form.setAttribute('aria-busy', 'true'); button.textContent = reset ? 'Sending…' : 'Please wait…';
    status.textContent = '';
    try { await operation(await loadSdk()); }
    catch (error) {
      window.FynxMonitor?.report('auth', reset ? 'auth-reset' : signup ? 'auth-signup' : 'auth-login', error);
      report(messages[error?.code] || 'We couldn’t complete this request. Check your connection and try again.');
    } finally {
      busy = false; buttons.forEach(item => { item.disabled = false; item.textContent = labels.get(item); });
      form.removeAttribute('aria-busy');
    }
  }
  function enter(sdk) {
    try { localStorage.setItem('mode', 'live'); localStorage.setItem('fynx_auth_email', sdk.auth.currentUser?.email || ''); } catch {}
    location.assign(sdk.safeReturnTo(returnTo));
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity() || busy) return;
    const email = form.elements.email.value.trim();
    const password = form.elements.password?.value;
    if (signup && !form.elements.name.value.trim()) { report('Enter your display name.'); form.elements.name.focus(); return; }
    if (signup && password.length < 8) { report('Use at least 8 characters for your password.'); form.elements.password.focus(); return; }
    if (signup && password !== form.elements.confirm.value) { report('Your passwords don’t match. Please re-enter them.'); form.elements.confirm.focus(); return; }
    run(form.querySelector('[type=submit]'), async sdk => {
      if (reset) {
        try { await sdk.api.sendPasswordResetEmail(sdk.auth, email); }
        catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
        report('If an account exists for this email, you’ll receive a reset link. Check your inbox and spam folder.', true);
        return;
      }
      if (signup) {
        const credential = await sdk.api.createUserWithEmailAndPassword(sdk.auth, email, password);
        try { await sdk.api.updateProfile(credential.user, { displayName: form.elements.name.value.trim() }); }
        catch { report('Your account was created. You can finish setting your name in Profile.', true); }
      } else await sdk.withMfa(() => sdk.api.signInWithEmailAndPassword(sdk.auth, email, password));
      enter(sdk);
    });
  });
  for (const provider of ['Google', 'Apple']) {
    const button = document.getElementById((signup ? 'signup' : 'login') + provider);
    button?.addEventListener('click', () => run(button, async sdk => {
      const instance = provider === 'Google' ? new sdk.api.GoogleAuthProvider() : new sdk.api.OAuthProvider('apple.com');
      await sdk.withMfa(() => sdk.api.signInWithPopup(sdk.auth, instance)); enter(sdk);
    }));
  }
  document.getElementById('loginApp')?.addEventListener('click', () => {
    const destination = new URL('../app-return.html', location.href);
    if (returnTo) destination.searchParams.set('returnTo', returnTo);
    const open = new URL('../open-app.html', location.href); open.searchParams.set('returnTo', destination.href); location.assign(open);
  });
  document.getElementById('viewDemo')?.addEventListener('click', () => {
    try { localStorage.setItem('mode', 'demo'); } catch {}
    location.assign('../home.html');
  });
  for (const input of form.querySelectorAll('input[type=password]')) {
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'password-toggle';
    toggle.textContent = 'Show'; toggle.setAttribute('aria-label', 'Show ' + (input.id === 'confirm' ? 'confirmation password' : 'password'));
    const wrap = document.createElement('div'); wrap.className = 'password-wrap'; input.before(wrap); wrap.append(input, toggle);
    toggle.addEventListener('click', () => { const show = input.type === 'password'; input.type = show ? 'text' : 'password'; toggle.textContent = show ? 'Hide' : 'Show'; toggle.setAttribute('aria-pressed', String(show)); });
  }
})();
