/* FYNX FCM client: service worker registration, token storage, removal on sign-out.
 * Permission is requested only after an explicit user gesture (call enableFcmFromUserGesture).
 * Does not replace any existing notification system.
 */
import { getMessaging, getToken, onMessage, deleteToken } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js';
import { app, auth } from '/auth/firebase.js';
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { VAPID_PUBLIC_KEY, FCM_SW_PATH } from './fcm-config.js';

const db = getFirestore(app);
let messaging = null;
let currentToken = null;
let currentUid = null;
let foregroundUnsubscribe = null;

function log(msg, err) {
  try {
    window.FynxMonitor?.report('notification', 'fcm', err || new Error(msg));
    if (location.search.includes('debug=1')) console.info('[FYNX FCM]', msg, err || '');
  } catch (_) {}
}

export async function enableFcmFromUserGesture() {
  if (!VAPID_PUBLIC_KEY) {
    log('VAPID_PUBLIC_KEY is empty');
    return null;
  }
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return null;
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      log('notification permission not granted');
      return null;
    }
    const registration = await navigator.serviceWorker.register(FCM_SW_PATH);
    messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: registration
    });
    if (!token || auth.currentUser?.uid !== user.uid) return null;
    currentToken = token;
    currentUid = user.uid;
    await storeToken(user.uid, token);
    listenForeground();
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
    throw err;
  }
}

export async function removeFcmToken(uid) {
  const targetUid = uid || currentUid;
  const token = currentToken;
  if (!targetUid || !token) return;
  try {
    if (messaging) await deleteToken(messaging);
    const ref = doc(db, 'users', targetUid, 'pushTokens', token.slice(0, 64));
    await deleteDoc(ref);
  } catch (err) {
    log('token removal failed', err);
  }
  currentToken = null;
  currentUid = null;
}

function listenForeground() {
  if (!messaging) return;
  if (foregroundUnsubscribe) return;
  foregroundUnsubscribe = onMessage(messaging, function (payload) {
    if (!auth.currentUser || auth.currentUser.uid !== currentUid) return;
    const title = payload.notification?.title || payload.data?.title || 'FYNX Intelligence';
    const body = payload.notification?.body || payload.data?.body || '';
    const rawUrl = payload.data?.articleUrl || '/notifications.html';
    const url = (function () {
      try {
        const u = new URL(rawUrl, location.origin);
        if (u.origin !== location.origin) return '/notifications.html';
        if (u.pathname !== '/notifications.html' && u.pathname !== '/news/article.html') return '/notifications.html';
        return u.pathname + u.search;
      } catch { return '/notifications.html'; }
    })();
    if (Notification.permission === 'granted') {
      const n = new Notification(title, { body, data: { url } });
      n.onclick = function () { window.location.href = url; };
    }
  });
}

// Capture uid while still signed in, then clean up after sign-out.
onAuthStateChanged(auth, function (user) {
  if (user) {
    currentUid = user.uid;
  } else if (currentUid && currentToken) {
    removeFcmToken(currentUid);
  }
});
