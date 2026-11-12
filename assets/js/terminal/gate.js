/* FYNX Terminal access. The website is free to browse; the Terminal requires a FYNX account.
   The account is the same one used on the website (one Firebase session per browser), so a
   member who is already signed in on the site goes straight in, and signing in here also
   signs them in on the website. */
import { auth, authPersistenceReady } from '/auth/firebase.js';
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  sendPasswordResetEmail, sendEmailVerification, GoogleAuthProvider, OAuthProvider, signInWithPopup,
  setPersistence, browserLocalPersistence, browserSessionPersistence, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const root = document.documentElement;
const MESSAGES = {
  'auth/invalid-credential': 'The FYNX ID or password is incorrect.',
  'auth/wrong-password': 'The FYNX ID or password is incorrect.',
  'auth/user-not-found': 'The FYNX ID or password is incorrect.',
  'auth/invalid-email': 'Enter the email address of your FYNX account.',
  'auth/email-already-in-use': 'An account already uses this email. Sign in instead.',
  'auth/weak-password': 'Use at least 8 characters with letters and a number.',
  'auth/password-does-not-meet-requirements': 'Use a longer password with uppercase and lowercase letters, a number and a symbol.',
  'auth/network-request-failed': 'We couldn’t reach FYNX. Check your connection and try again.',
  'auth/too-many-requests': 'Too many attempts. For your security, wait a few minutes and try again.',
  'auth/user-disabled': 'This account is unavailable. Contact FYNX support.',
  'auth/popup-closed-by-user': 'The sign-in window was closed.',
  'auth/popup-blocked': 'Allow pop-ups for this site to continue with Google or Apple.',
  'auth/account-exists-with-different-credential': 'Use the sign-in method you originally chose for this email.',
  'auth/unauthorized-domain': 'This sign-in method is unavailable on this address. Use your FYNX ID and password.',
  'auth/cancelled': 'Two-step verification was cancelled.'
};
const LOCK_KEY = 'fynx.terminal.lock';
let mode = 'login', busy = false, gate;

function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); }
  kids.flat().forEach(k => k != null && n.append(k)); return n;
}
function lockState() { try { return JSON.parse(sessionStorage.getItem(LOCK_KEY) || '{}'); } catch { return {}; } }
function noteFailure() {
  const s = lockState(); s.fails = (s.fails || 0) + 1;
  if (s.fails >= 5) { s.until = Date.now() + Math.min(300, 30 * 2 ** (s.fails - 5)) * 1000; }
  try { sessionStorage.setItem(LOCK_KEY, JSON.stringify(s)); } catch {}
}
function clearFailures() { try { sessionStorage.removeItem(LOCK_KEY); } catch {} }
function lockedFor() { const u = lockState().until || 0; return u > Date.now() ? Math.ceil((u - Date.now()) / 1000) : 0; }

function unlock() { root.classList.remove('ftg-locked', 'ftg-checking'); gate?.remove(); gate = null; }
function lock() { root.classList.remove('ftg-checking'); root.classList.add('ftg-locked'); render(); }

function strong(pw) { return pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw); }

function render() {
  gate?.remove();
  const signup = mode === 'signup', reset = mode === 'reset';
  const status = h('p', {class: 'ftg-status', role: 'status', 'aria-live': 'polite'});
  const say = (msg, ok = false) => { status.textContent = msg; status.dataset.kind = ok ? 'ok' : 'error'; };
  const email = h('input', {id: 'ftg-email', name: 'username', type: 'email', autocomplete: 'username', required: true, placeholder: 'you@domain.com', spellcheck: 'false'});
  const pw = h('input', {id: 'ftg-password', name: 'password', type: 'password', autocomplete: signup ? 'new-password' : 'current-password', required: !reset, placeholder: 'Password', minlength: signup ? 8 : false});
  const name = h('input', {id: 'ftg-name', name: 'name', type: 'text', autocomplete: 'name', maxlength: 80, placeholder: 'Your name', required: signup});
  const show = h('button', {type: 'button', class: 'ftg-show', 'aria-label': 'Show password', 'aria-pressed': 'false', text: 'Show'});
  show.onclick = () => { const on = pw.type === 'password'; pw.type = on ? 'text' : 'password'; show.textContent = on ? 'Hide' : 'Show'; show.setAttribute('aria-pressed', String(on)); };
  const keep = h('input', {type: 'checkbox', id: 'ftg-keep', checked: true});
  const submit = h('button', {type: 'submit', class: 'ftg-next', text: reset ? 'Send reset link' : signup ? 'Create account' : 'Next'});
  const field = (label, input, extra) => h('div', {class: 'ftg-field'}, h('div', {class: 'ftg-label-row'}, h('label', {for: input.id, text: label}), extra || null), input);
  const forgot = h('button', {type: 'button', class: 'ftg-link', text: 'Forgot password'}); forgot.onclick = () => { mode = 'reset'; render(); };
  const form = h('form', {class: 'ftg-form', novalidate: true, autocomplete: 'on'},
    signup ? field('Name', name) : null,
    field('FYNX ID (email)', email),
    reset ? null : field('Password', h('div', {class: 'ftg-pw'}, pw, show), signup ? null : forgot),
    signup ? h('p', {class: 'ftg-hint', text: 'At least 8 characters, with letters and a number.'}) : null,
    reset ? null : h('label', {class: 'ftg-keep'}, keep, h('span', {text: 'Keep me signed in on this device'})),
    status,
    h('div', {class: 'ftg-actions'}, submit));
  const providers = reset ? null : h('div', {class: 'ftg-providers'},
    h('p', {class: 'ftg-or'}, h('span', {text: 'or'})),
    h('button', {type: 'button', class: 'ftg-provider', 'data-provider': 'google', text: 'Continue with Google'}),
    h('button', {type: 'button', class: 'ftg-provider', 'data-provider': 'apple', text: 'Continue with Apple'}));
  const swap = h('p', {class: 'ftg-swap'});
  const toLogin = h('button', {type: 'button', class: 'ftg-link', text: 'Sign in'}); toLogin.onclick = () => { mode = 'login'; render(); };
  const toSignup = h('button', {type: 'button', class: 'ftg-link', text: 'Create a free account'}); toSignup.onclick = () => { mode = 'signup'; render(); };
  if (mode === 'login') swap.append('New to FYNX? ', toSignup); else swap.append(signup ? 'Already have a FYNX account? ' : 'Remembered it? ', toLogin);
  const panel = h('section', {class: 'ftg-panel', 'aria-labelledby': 'ftg-title'},
    h('h1', {id: 'ftg-title', text: reset ? 'Reset password' : signup ? 'Create Terminal access' : 'Terminal login'}),
    h('p', {class: 'ftg-lead', text: reset ? 'Enter your FYNX ID and we’ll email a secure reset link.' : 'Secure FYNX authentication for the Terminal. Your FYNX website account works here: sign in once and you’re signed in on both.'}),
    form, providers, swap);
  gate = h('div', {class: 'ftg', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ftg-title'},
    h('header', {class: 'ftg-top'}, h('a', {class: 'ftg-brand', href: '/home.html'}, h('strong', {text: 'FYNX'}), h('span', {text: 'TERMINAL'})), h('a', {class: 'ftg-back', href: '/home.html', text: 'Back to FYNX website'})),
    h('main', {class: 'ftg-main'}, panel),
    h('footer', {class: 'ftg-foot'}, h('span', {text: `© ${new Date().getFullYear()} FYNX Finance World`}), h('nav', {}, h('a', {href: '/contact.html', text: 'Contact us'}), h('a', {href: 'https://ea-la.github.io/FYNX-Site/terms.html', text: 'Terms of Service'}), h('a', {href: 'https://ea-la.github.io/FYNX-Site/privacy.html', text: 'Privacy Policy'}))));
  document.body.append(gate);
  try { const last = localStorage.getItem('fynx_auth_email'); if (last && !signup) email.value = last; } catch {}
  (signup ? name : email.value && !reset ? pw : email).focus();

  async function run(fn) {
    if (busy) return;
    const wait = lockedFor(); if (wait) { say(`Too many failed attempts. Try again in ${wait} s.`); return; }
    if (!navigator.onLine) { say('You’re offline. Reconnect to continue.'); return; }
    busy = true; gate.querySelectorAll('button,input').forEach(b => b.disabled = true); submit.dataset.label = submit.textContent; submit.textContent = 'Please wait…'; status.textContent = '';
    try { await authPersistenceReady; await fn(); }
    catch (e) { if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(e?.code)) noteFailure(); say(MESSAGES[e?.code] || 'We couldn’t complete this request. Please try again.'); }
    finally { busy = false; gate?.querySelectorAll('button,input').forEach(b => b.disabled = false); if (submit.isConnected) submit.textContent = submit.dataset.label; }
  }
  async function persistence() { await setPersistence(auth, keep.checked ? browserLocalPersistence : browserSessionPersistence); }
  async function mfa(op) { try { const m = await import('/assets/js/mfa.js?v=20260930-errors'); return await m.withMfa(op); } catch (e) { if (e?.code) throw e; return op(); } }
  form.addEventListener('submit', e => {
    e.preventDefault();
    const id = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) { say(MESSAGES['auth/invalid-email']); email.focus(); return; }
    if (reset) return run(async () => { try { await sendPasswordResetEmail(auth, id, {url: location.origin + '/terminal.html'}); } catch (err) { if (err.code !== 'auth/user-not-found') throw err; } say('If an account exists for this email, a reset link is on its way. Check your inbox and spam folder.', true); });
    if (!pw.value) { say('Enter your password.'); pw.focus(); return; }
    if (signup && !name.value.trim()) { say('Enter your name.'); name.focus(); return; }
    if (signup && !strong(pw.value)) { say('Use at least 8 characters with letters and a number.'); pw.focus(); return; }
    run(async () => {
      await persistence();
      if (signup) {
        const cred = await createUserWithEmailAndPassword(auth, id, pw.value);
        try { await updateProfile(cred.user, {displayName: name.value.trim()}); } catch {}
        try { await sendEmailVerification(cred.user, {url: location.origin + '/terminal.html'}); } catch {}
      } else await mfa(() => signInWithEmailAndPassword(auth, id, pw.value));
      clearFailures(); try { localStorage.setItem('fynx_auth_email', id); localStorage.setItem('mode', 'live'); } catch {}
    });
  });
  gate.querySelectorAll('[data-provider]').forEach(b => b.addEventListener('click', () => run(async () => {
    await persistence();
    const provider = b.dataset.provider === 'google' ? new GoogleAuthProvider() : new OAuthProvider('apple.com');
    await mfa(() => signInWithPopup(auth, provider)); clearFailures();
  })));
}

/* Signed out (or session expired) → lock; signed in on the website or here → open the Terminal. */
let first = true;
onAuthStateChanged(auth, user => {
  if (user) { unlock(); first = false; return; }
  if (first || !gate) lock(); first = false;
});
// If Firebase cannot load at all, still show the login (the Terminal never opens without an account).
setTimeout(() => { if (root.classList.contains('ftg-checking') && !auth.currentUser) lock(); }, 8000);
window.FynxTerminalSignOut = () => signOut(auth);
