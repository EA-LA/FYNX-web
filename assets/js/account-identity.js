/* Current account identity only; never reuse another account's browser-local profile. */
import { auth, app } from '../../auth/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
let stop, generation = 0;
function publish(user, displayName = '', photoURL = '') {
  window.FynxIdentity = { uid: user?.uid || null, displayName, email: user?.email || '', photoURL: /^https:\/\//.test(photoURL) || /^data:image\//.test(photoURL) ? photoURL : '' };
  window.dispatchEvent(new CustomEvent('fynx:identity', { detail: window.FynxIdentity }));
}
onAuthStateChanged(auth, user => {
  const version = ++generation;
  stop?.(); stop = null;
  publish(user, user?.displayName || '', user?.photoURL || '');
  if (!user) return;
  stop = onSnapshot(doc(getFirestore(app), 'users', user.uid, 'account', 'profile'), snapshot => {
    if (version !== generation) return;
    const data = snapshot.data() || {};
    publish(user, String(data.displayName || user.displayName || ''), String(data.photoURL || user.photoURL || ''));
  }, () => { if (version === generation) publish(user, user.displayName || '', user.photoURL || ''); });
});
