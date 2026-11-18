// Shared Firebase project callback. Never send action codes to arbitrary continue URLs.
const params = new URLSearchParams(location.search);
const mode = params.get('mode');
const code = params.get('oobCode');
let origin = '';
try { origin = new URL(params.get('continueUrl')).origin; } catch {}
const finance = ['https://www.fynxfinanceworld.com', 'https://fynxfinanceworld.com'].includes(origin);
const funded = ['https://fynxfunded.com', 'https://www.fynxfunded.com'].includes(origin);
const status = document.getElementById('status');
const heading = document.getElementById('heading');
const form = document.getElementById('resetForm');
const retry = document.getElementById('retry');
function report(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
function expired(error) {
  if (error?.code === 'auth/network-request-failed') return 'We couldn’t connect. Check your connection and reopen the email link.';
  if (error?.code === 'auth/too-many-requests') return 'Too many attempts. Please wait a few minutes and reopen the link.';
  return 'This link is invalid, expired, or already used. Please request a new email.';
}
async function run() {
  if (!finance && code) {
    // Preserve the existing Funded reset UI, including old links without product state.
    // Its reset page cannot process verification/recovery, so use Firebase's hosted handler for those.
    const target = new URL(mode === 'resetPassword' && (funded || !origin)
      ? 'https://fynxfunded.com/reset-password'
      : 'https://fynx-c7a28.firebaseapp.com/__/auth/action');
    for (const key of ['mode', 'oobCode', 'apiKey', 'lang']) if (params.has(key)) target.searchParams.set(key, params.get(key));
    target.searchParams.set('continueUrl', 'https://fynxfunded.com/login');
    location.replace(target.href);
    return;
  }
  // Drop the code from history before loading SDK resources. No analytics runs on this page.
  history.replaceState(null, '', location.pathname);
  if (!code || !['resetPassword', 'verifyEmail', 'recoverEmail'].includes(mode)) {
    heading.textContent = 'Link unavailable'; report('This link is incomplete or unsupported. Open the full link from your email.', true); retry.hidden = false; return;
  }
  try {
    const { auth } = await import('./firebase.js');
    const api = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    if (mode === 'resetPassword') {
      await api.verifyPasswordResetCode(auth, code);
      heading.textContent = 'Set a new password'; report('Choose a new password for your FYNX account.'); form.hidden = false;
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('button');
        if (button.disabled || !form.reportValidity()) return;
        const password = form.elements.password.value;
        if (password !== form.elements.confirm.value) { report('Your passwords don’t match. Please re-enter them.', true); return; }
        button.disabled = true; report('Saving your password…');
        try {
          await api.confirmPasswordReset(auth, code, password);
          form.reset(); form.hidden = true; heading.textContent = 'Password updated';
          report('Your new password is ready. Sign in to Finance World to continue.');
          document.getElementById('continue').textContent = 'Sign in to Finance World';
        } catch (error) {
          report(error?.code === 'auth/weak-password' || error?.code === 'auth/password-does-not-meet-requirements'
            ? 'Choose a stronger password with upper- and lowercase letters, a number, and a symbol.' : expired(error), true);
          retry.hidden = !['auth/expired-action-code', 'auth/invalid-action-code'].includes(error?.code);
        } finally { button.disabled = false; }
      });
    } else {
      await api.applyActionCode(auth, code);
      heading.textContent = mode === 'verifyEmail' ? 'Email verified' : 'Email restored';
      report('Your account has been updated. Return to Finance World to continue.');
      document.getElementById('continue').textContent = 'Continue to Finance World';
    }
  } catch (error) {
    heading.textContent = 'Unable to finish'; report(expired(error), true); retry.hidden = mode !== 'resetPassword';
  }
}
run();
