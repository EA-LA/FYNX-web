/* FYNX Firebase Cloud Messaging service worker.
 * Handles data-only background messages and opens authorized internal pages on click.
 * Must be served from the site root. Does not call skipWaiting or claim clients,
 * so it does not disrupt any other service worker.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDGSYIB_YIpbWyUMJ1d-v00-xADnvaWckk',
  authDomain: 'fynx-c7a28.firebaseapp.com',
  projectId: 'fynx-c7a28',
  storageBucket: 'fynx-c7a28.firebasestorage.app',
  messagingSenderId: '1011050657868',
  appId: '1:1011050657868:web:2c5ad5a1b275e669b05ce9'
});

const messaging = firebase.messaging();

function isAuthorizedInternal(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url, self.location.origin);
    if (u.origin !== self.location.origin) return false;
    return u.pathname === '/notifications.html' || u.pathname === '/news/article.html';
  } catch { return false; }
}

// Only manually display for data-only payloads. If the payload already contains
// a notification field, FCM displays it automatically — calling showNotification
// here would create a duplicate.
messaging.onBackgroundMessage(function (payload) {
  if (payload.notification) return;
  const title = payload.data?.title || 'FYNX Intelligence';
  const body = payload.data?.body || '';
  const rawUrl = payload.data?.articleUrl || '/notifications.html';
  const articleUrl = isAuthorizedInternal(rawUrl) ? rawUrl : '/notifications.html';
  const options = {
    body,
    data: { url: articleUrl },
    tag: payload.data?.tag || 'fynx-news'
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const raw = event.notification.data?.url || '/notifications.html';
  const url = isAuthorizedInternal(raw) ? raw : '/notifications.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
