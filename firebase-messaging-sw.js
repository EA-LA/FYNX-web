/* FYNX Firebase Cloud Messaging service worker.
 * Handles background notifications and opens the internal FYNX Intelligence article on click.
 * Must be served from the site root.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

// Config is injected at registration time via the client, or falls back to a minimal init.
// The service worker itself does not contain secrets.
firebase.initializeApp({
  apiKey: 'AIzaSyDGSYIB_YIpbWyUMJ1d-v00-xADnvaWckk',
  authDomain: 'fynx-c7a28.firebaseapp.com',
  projectId: 'fynx-c7a28',
  storageBucket: 'fynx-c7a28.firebasestorage.app',
  messagingSenderId: self.FYNX_MESSAGING_SENDER_ID || '', // set by client postMessage or replace
  appId: '1:1011050657868:web:2c5ad5a1b275e669b05ce9'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const title = payload.notification?.title || payload.data?.title || 'FYNX Intelligence';
  const body = payload.notification?.body || payload.data?.body || '';
  const articleUrl = payload.data?.articleUrl || payload.fcmOptions?.link || '/notifications.html';
  const options = {
    body,
    icon: '/assets/images/fynx-icon.png',
    badge: '/assets/images/fynx-icon.png',
    data: { url: articleUrl },
    tag: payload.data?.tag || 'fynx-news',
    renotify: true
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = event.notification.data?.url || '/notifications.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
