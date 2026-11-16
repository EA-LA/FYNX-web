/* Notification destinations may come from feeds or saved account data. */
export function safeNotificationUrl(value, base = window.location.href) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, base);
    const page = new URL(base);
    // Never follow credentials-bearing links or downgrade production navigation to HTTP.
    if (url.username || url.password) return '';
    if (url.protocol === 'https:') return url.href;
    // Preserve relative links when developing locally over HTTP, but not external HTTP links.
    if (page.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname) &&
        url.origin === page.origin) return url.href;
    return '';
  } catch { return ''; }
}

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}
