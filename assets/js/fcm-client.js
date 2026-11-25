/* FYNX FCM client: service worker registration, token storage, removal on sign-out.
 * Uses the existing Firebase app. Does not replace any existing notification system.
 */
import { getMessaging, getToken, onMessage, deleteToken } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js';
import { app, auth } from '/auth/firebase.js';
const db = getFirestore(app);
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { VAPID_PUBLIC_KEY, FCM_SW_PATH } from './fcm-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

let messaging = null;
let currentToken = null;

function log(msg, err) {
  try {
    window.FynxMonitor?.report('notification', 'fcm', err || new Error(msg));
    if (location.search.includes('debug=1')) console.info('[FYNX FCM]', msg, err || '');
  } catch (_) {}
}

export async function registerFcm() {
  if (!VAPID_PUBLIC_KEY) {
    log('VAPID_PUBLIC_KEY is empty — set it in assets/js/fcm-config.js');
    return null;
  }
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return null;
  try {
    const registration = await navigator.serviceWorker.register(FCM_SW_PATH);
    messaging = getMessaging(app);
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      log('notification permission not granted');
      return null;
    }
    const token = await getToken(messaging, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: registration
    });
    if (!token) return null;
    currentToken = token;
    const user = auth.currentUser;
    if (user) await storeToken(user.uid, token);
    return token;
  } catch (err) {
    log('FCM registration failed', err);
    return null;
  }
}

async function storeToken(uid, token) {
  try {
    const ref = doc(db, 'users', uid, 'pushTokens', token.slice(0, 64));
    await setDoc(ref, {
      token,
      userAgent: navigator.userAgent.slice(0, 200),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    log('token store failed', err);
  }
}

export async function removeFcmToken() {
  if (!currentToken || !auth.currentUser) return;
  try {
    if (messaging) await deleteToken(messaging);
    const ref = doc(db, 'users', auth.currentUser.uid, 'pushTokens', currentToken.slice(0, 64));
    await deleteDoc(ref);
  } catch (err) {
    log('token removal failed', err);
  }
  currentToken = null;
}

// Foreground message handler (tab open)
export function listenForeground() {
  if (!messaging) return;
  onMessage(messaging, function (payload) {
    const title = payload.notification?.title || 'FYNX Intelligence';
    const body = payload.notification?.body || '';
    const url = payload.data?.articleUrl || '/notifications.html';
    if (Notification.permission === 'granted') {
      const n = new Notification(title, { body, data: { url } });
      n.onclick = function () { window.location.href = url; };
    }
  });
}

// Auto-register when a signed-in user is present and key is set
onAuthStateChanged(auth, function (user) {
  if (user && VAPID_PUBLIC_KEY) {
    registerFcm().then(function () { listenForeground(); });
  }
});

// Remove token on sign-out
auth.onAuthStateChanged(function (user) {
  if (!user && currentToken) removeFcmToken();
});
