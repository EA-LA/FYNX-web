/* Native Web Push client for the existing webNotificationSettings callable. */
import { app, auth } from '/auth/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js';
const settings = httpsCallable(getFunctions(app, 'us-central1'), 'webNotificationSettings');
const scope = '/fynx-web-push/';
function decodeKey(key) {
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4-key.length%4)%4));
  return Uint8Array.from(raw, ch => ch.charCodeAt(0));
}
export async function enableFcmFromUserGesture() {
  const uid = auth.currentUser?.uid;
  if (!uid || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return null;
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return null;
  const status = (await settings({action:'status'})).data;
  if (!status?.publicKey || auth.currentUser?.uid !== uid) return null;
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {scope});
  if (!registration.active) {
    const worker = registration.installing || registration.waiting;
    if (!worker) throw new Error('Push worker unavailable');
    await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(new Error('Push worker activation timed out')), 15000);
      const check = () => { if (worker.state === 'activated') { clearTimeout(timer); resolve(); } else if (worker.state === 'redundant') { clearTimeout(timer); reject(new Error('Push worker failed')); } };
      worker.addEventListener('statechange',check); check();
    });
  }
  let sub = await registration.pushManager.getSubscription();
  const key = decodeKey(status.publicKey);
  if (sub && sub.options.applicationServerKey && String(new Uint8Array(sub.options.applicationServerKey)) !== String(key)) {
    await sub.unsubscribe(); sub = null;
  }
  if (!sub) sub = await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  if (auth.currentUser?.uid !== uid) { await sub.unsubscribe(); return null; }
  const result = await settings({action:'subscribe',subscription:sub.toJSON()});
  if (result.data?.enabled !== true) throw new Error('Push registration not confirmed');
  return sub;
}
export async function removeFcmToken() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration(scope);
  const sub = await registration?.pushManager.getSubscription();
  if (!sub) return;
  try { if (auth.currentUser) await settings({action:'unsubscribe',subscription:sub.toJSON()}); }
  finally { await sub.unsubscribe(); }
}
