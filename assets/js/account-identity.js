/* Current account identity only; never reuse another account's browser-local profile. */
import { auth, app } from '../../auth/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
let stop, generation = 0;
function publish(user, displayName = '') {
  window.FynxIdentity = { uid: user?.uid || null, displayName, email: user?.email || '' };
  window.dispatchEvent(new CustomEvent('fynx:identity', { detail: window.FynxIdentity }));
}
onAuthStateChanged(auth, user => {
  const version = ++generation;
  stop?.(); stop = null;
  publish(user, user?.displayName || '');
  if (!user) return;
  stop = onSnapshot(doc(getFirestore(app), 'users', user.uid, 'account', 'profile'), snapshot => {
    if (version !== generation) return;
    publish(user, String(snapshot.data()?.displayName || user.displayName || ''));
  }, () => { if (version === generation) publish(user, user.displayName || ''); });
});
