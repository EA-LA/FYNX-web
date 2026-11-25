'use strict';
/* Server-side automatic news notification delivery.
 * Must be exported from the existing functions entry point:
 *   exports.webNewsPush = require('./news-notifications').webNewsPush;
 * Deploy from the existing functions project (see backend/README.md).
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const FEED_URL = 'https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketFeed';
const MAX_AGE_MS = 15 * 60 * 1000;
const MAX_USERS_PER_RUN = 50;
const MAX_ITEMS_PER_USER = 5;

function inQuietHours(prefs) {
  const q = prefs?.quietHours;
  if (!q || !q.enabled) return false;
  const tz = q.timezone || 'UTC';
  let minutes;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    const parts = fmt.formatToParts(new Date());
    const h = Number(parts.find(p => p.type === 'hour')?.value || 0);
    const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
    minutes = h * 60 + m;
  } catch {
    minutes = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  }
  const [sh, sm] = (q.start || '22:00').split(':').map(Number);
  const [eh, em] = (q.end || '07:00').split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start <= end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

function isAuthorizedInternal(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('https://') || url.startsWith('http://')) return false;
  return url === '/notifications.html' || url.startsWith('/news/article.html?');
}

async function alreadySent(uid, itemId) {
  const ref = db.collection('users').doc(uid).collection('notifications').doc(String(itemId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100));
  const snap = await ref.get();
  return snap.exists;
}

async function markSent(uid, itemId, item) {
  const id = String(itemId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const ref = db.collection('users').doc(uid).collection('notifications').doc(id);
  await ref.set({
    title: item.title || 'FYNX Intelligence',
    source: item.source || 'FYNX',
    sourceUrl: isAuthorizedInternal(item.readerUrl) ? item.readerUrl : '',
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    archived: false,
    kind: 'news',
    deliveredVia: 'fcm'
  }, { merge: true });
}

exports.webNewsPush = functions.runWith({ timeoutSeconds: 120, memory: '256MB', maxInstances: 1 })
  .pubsub.schedule('every 15 minutes')
  .onRun(async () => {
    let feed;
    try {
      const res = await fetch(FEED_URL + '?edition=us&category=all');
      if (!res.ok) return null;
      feed = await res.json();
    } catch { return null; }
    if (!feed?.fetchedAt || !Array.isArray(feed.items)) return null;
    const age = Date.now() - new Date(feed.fetchedAt).getTime();
    if (!Number.isFinite(age) || age > MAX_AGE_MS) return null;

    // Bounded: only users who have at least one push token, limited per run.
    const tokenSnap = await db.collectionGroup('pushTokens').limit(MAX_USERS_PER_RUN * 5).get();
    const byUser = new Map();
    for (const doc of tokenSnap.docs) {
      const uid = doc.ref.parent.parent?.id;
      if (!uid) continue;
      if (!byUser.has(uid)) byUser.set(uid, []);
      if (byUser.get(uid).length < 10) byUser.get(uid).push({ id: doc.id, token: doc.data().token });
      if (byUser.size >= MAX_USERS_PER_RUN) break;
    }

    for (const [uid, tokenDocs] of byUser) {
      try {
        const prefsSnap = await db.collection('users').doc(uid).collection('account').doc('notificationPreferences').get();
        const prefs = prefsSnap.exists ? prefsSnap.data() : {};
        if (prefs.browserEnabled !== true && prefs.inAppEnabled !== true) continue;
        if (prefs.breakingNews === false) continue;
        if (inQuietHours(prefs)) continue;

        // Your News: empty or missing topics means do NOT send everything.
        const interestsSnap = await db.collection('fynxAccountSyncUsers').doc(uid)
          .collection('domains').doc('newsInterests').collection('items').doc('default').get();
        const topics = interestsSnap.exists ? (interestsSnap.data()?.topics || []) : [];
        if (!Array.isArray(topics) || topics.length === 0) continue;

        const tokens = tokenDocs.map(t => t.token).filter(Boolean);
        if (!tokens.length) continue;

        for (const item of feed.items.slice(0, MAX_ITEMS_PER_USER)) {
          const itemCat = (item.category || '').toLowerCase();
          if (!topics.some(t => String(t).toLowerCase() === itemCat || String(t).toLowerCase() === 'all')) continue;
          const itemId = item.id || item.url;
          if (!itemId || await alreadySent(uid, itemId)) continue;

          const rawUrl = item.readerUrl || (item.articleId ? `/news/article.html?id=${item.articleId}` : '');
          const articleUrl = isAuthorizedInternal(rawUrl) ? rawUrl : '/notifications.html';

          // Data-only message so the service worker controls display (no duplicate).
          const message = {
            data: {
              title: item.title || 'FYNX Intelligence',
              body: item.source || 'New story',
              articleUrl,
              tag: String(itemId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
            },
            tokens
          };
          try {
            const resp = await admin.messaging().sendEachForMulticast(message);
            const invalid = [];
            resp.responses.forEach((r, i) => {
              if (!r.success && r.error && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(r.error.code)) {
                invalid.push(tokenDocs[i]?.id);
              }
            });
            for (const badId of invalid) {
              if (badId) await db.collection('users').doc(uid).collection('pushTokens').doc(badId).delete().catch(() => {});
            }
            if (resp.successCount > 0) await markSent(uid, itemId, item);
          } catch (err) {
            console.error('[webNewsPush] send failed', uid, err.message);
          }
        }
      } catch (err) {
        console.error('[webNewsPush] user failed', uid, err.message);
      }
    }
    return null;
  });

// Exported for unit tests
exports._test = { inQuietHours, isAuthorizedInternal };
