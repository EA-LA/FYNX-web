// Only show a confirmed login-alert preference. No Firestore or auth dependencies here.
export function createLoginAlertsController({ button, status, save }) {
  if (!button || !status || typeof save !== 'function') {
    throw new TypeError('Login alert controls require a button, status, and save callback.');
  }

  let uid = null;
  let confirmed = false;
  let loaded = false;
  let pending = false;
  let revision = 0;

  function render(message = '') {
    button.classList.toggle('on', loaded && confirmed);
    button.setAttribute('aria-checked', String(loaded && confirmed));
    button.setAttribute('aria-busy', String(pending));
    button.disabled = !loaded || pending;
    status.textContent = message;
  }

  function setAccount(userId, savedValue) {
    revision += 1; // Ignore a pending save from any previous account/session.
    uid = typeof userId === 'string' && userId.length ? userId : null;
    loaded = !!uid && typeof savedValue === 'boolean';
    confirmed = loaded ? savedValue : false;
    pending = false;
    render(loaded ? '' : uid
      ? 'Could not load login alert settings. Reload to retry.'
      : 'Sign in to manage login alerts.');
  }

  async function toggle() {
    if (!loaded || pending || !uid) return;
    const requestUid = uid;
    const requestRevision = ++revision;
    const previous = confirmed;
    const next = !previous;
    pending = true;
    render('Saving login alert preference…');

    let message = '';
    try {
      await save(requestUid, next);
      if (requestRevision !== revision || requestUid !== uid) return;
      confirmed = next;
      message = next ? 'Login alerts enabled.' : 'Login alerts disabled.';
    } catch (_) {
      if (requestRevision !== revision || requestUid !== uid) return;
      confirmed = previous;
      message = 'Could not save login alerts. Try again.';
    } finally {
      if (requestRevision === revision && requestUid === uid) {
        pending = false;
        render(message);
      }
    }
  }

  button.addEventListener('click', toggle);
  render('Checking login alert settings…');
  return { setAccount, toggle };
}
