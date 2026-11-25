'use strict';
/* Server-side automatic news notification delivery.
 * Scheduled Cloud Function that:
 * - Fetches fresh headlines from the same market-feed endpoint used by the site
 * - Reads user notification preferences and Your News selections
 * - Respects quiet hours
 * - Deduplicates by article id
 * - Sends via FCM to stored tokens
 * - Does not touch any other functions
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const FEED_URL = 'https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketFeed';
const MAX_AGE_MS = 15 * 60 * 1000;

function inQuietHours(prefs) {
  const q = prefs?.quietHours;
  if (!q || !q.enabled) return false;
  const now = new Date();
  const [sh, sm] = (q.start || '22:00').split(':').map(Number);
  const [eh, em] = (q.end || '07:00').split(':').map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start <= end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

function matchesYourNews(item, prefs) {
  const cats = prefs?.yourNews?.categories || prefs?.categories || [];
  if (!Array.isArray(cats) || !cats.length) return true; // no filter = allow
  const cat = (item.category || '').toLowerCase();
  return cats.some(c => String(c).toLowerCase() === cat || String(c).toLowerCase() === 'all');
}

async function alreadySent(uid, itemId) {
  const ref = db.collection('users').doc(uid).collection('notifications').doc(String(itemId).slice(0, 100));
  const snap = await ref.get();
  return snap.exists;
}

async function markSent(uid, itemId, item) {
  const ref = db.collection('users').doc(uid).collection('notifications').doc(String(itemId).slice(0, 100));
  await ref.set({
    title: item.title || 'FYNX Intelligence',
    source: item.source || 'FYNX',
    sourceUrl: item.readerUrl || item.url || '',
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

    const usersSnap = await db.collection('users').get();
    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      try {
        const prefsSnap = await db.collection('users').doc(uid).collection('account').doc('notificationPreferences').get();
        const prefs = prefsSnap.exists ? prefsSnap.data() : {};
        if (prefs.newsEnabled === false || prefs.browserEnabled === false) continue;
        if (inQuietHours(prefs)) continue;

        const tokensSnap = await db.collection('users').doc(uid).collection('pushTokens').get();
        if (tokensSnap.empty) continue;
        const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);

        for (const item of feed.items.slice(0, 10)) {
          if (!matchesYourNews(item, prefs)) continue;
          const itemId = item.id || item.url;
          if (!itemId || await alreadySent(uid, itemId)) continue;

          const articleUrl = item.readerUrl || (item.articleId ? `/news/article.html?id=${item.articleId}` : '/notifications.html');
          const message = {
            notification: { title: item.title || 'FYNX Intelligence', body: item.source || 'New story' },
            data: { articleUrl, tag: String(itemId).slice(0, 64) },
            tokens
          };
          try {
            await admin.messaging().sendEachForMulticast(message);
            await markSent(uid, itemId, item);
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
