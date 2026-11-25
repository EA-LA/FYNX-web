/* Native Web Push worker for the existing FYNX delivery queue. */
function safeUrl(raw) {
  try {
    const u = new URL(raw || '/notifications.html', self.location.origin);
    if (u.origin === self.location.origin && ['/notifications.html','/news/article.html'].includes(u.pathname)) return u.href;
  } catch {}
  return new URL('/notifications.html', self.location.origin).href;
}
self.addEventListener('push', event => {
  let data;
  try { data = event.data?.json(); } catch { return; }
  if (!data || typeof data !== 'object') return;
  event.waitUntil(self.registration.showNotification(String(data.title || 'FYNX Intelligence').slice(0,120), {
    body: String(data.body || '').slice(0,600),
    tag: String(data.tag || data.notificationId || 'fynx-news'),
    data: {url:safeUrl(data.url)}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = safeUrl(event.notification.data?.url);
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list => {
    const existing = list.find(client => client.url === url);
    return existing ? existing.focus() : clients.openWindow(url);
  }));
});
