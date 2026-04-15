import { app } from "../../../auth/firebase.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore(app);

export const NOTIFICATION_CATEGORY = {
  MARKET_NEWS: "market_news",
  BREAKING_NEWS: "breaking_news",
  ECONOMIC_CALENDAR: "economic_calendar",
  ACCOUNT_SECURITY: "account_security",
  PLATFORM_UPDATES: "platform_updates",
  BILLING_CHALLENGES: "billing_challenges"
};

export const PRIORITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical"
};

export const CHANNELS = {
  IN_APP: "in_app",
  BROWSER: "browser",
  EMAIL: "email",
  PUSH: "push"
};

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  inAppEnabled: true,
  browserEnabled: false,
  emailEnabled: false,
  breakingNews: true,
  highImpactEconomic: true,
  calendarReminders: true,
  accountSecurity: true,
  platformUpdates: true,
  billingChallenges: false,
  soundEnabled: false,
  quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" },
  digestMode: "realtime",
  updatedAt: null,
  createdAt: null
};

const DEDUPE_WINDOWS_MS = {
  default: 30 * 60 * 1000,
  breaking_news: 60 * 60 * 1000,
  economic_calendar: 15 * 60 * 1000,
  account_security: 2 * 60 * 1000,
  platform_updates: 6 * 60 * 60 * 1000
};

function notificationCollection(uid) {
  return collection(db, "users", uid, "notifications");
}

function mapNotification(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    userId: data.userId || "",
    type: data.type || "platform",
    category: data.category || NOTIFICATION_CATEGORY.PLATFORM_UPDATES,
    title: data.title || "Notification",
    message: data.message || data.body || "",
    source: data.source || "FYNX",
    sourceUrl: data.sourceUrl || data.link || "",
    timestamp: data.timestamp?.toDate?.()?.toISOString?.() || data.createdAt?.toDate?.()?.toISOString?.() || data.timestamp || data.createdAt || new Date().toISOString(),
    read: Boolean(data.read),
    readAt: data.readAt?.toDate?.()?.toISOString?.() || data.readAt || null,
    archived: Boolean(data.archived),
    dismissed: Boolean(data.dismissed),
    dismissedAt: data.dismissedAt?.toDate?.()?.toISOString?.() || data.dismissedAt || null,
    priority: data.priority || PRIORITY.MEDIUM,
    metadata: data.metadata || {},
    deliveryChannels: Array.isArray(data.deliveryChannels) ? data.deliveryChannels : [CHANNELS.IN_APP],
    dedupeKey: data.dedupeKey || "",
    expiresAt: data.expiresAt?.toDate?.()?.toISOString?.() || data.expiresAt || null
  };
}

export class NotificationPreferenceManager {
  async get(uid) {
    const snap = await getDoc(doc(db, "users", uid, "account", "notificationPreferences"));
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(snap.exists() ? snap.data() : {}) };
  }

  async save(uid, payload) {
    await setDoc(doc(db, "users", uid, "account", "notificationPreferences"), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
  }
}

export class NotificationRepository {
  listen(uid, callback, max = 100) {
    const q = query(notificationCollection(uid), orderBy("timestamp", "desc"), limit(max));
    return onSnapshot(q, (snap) => callback(snap.docs.map(mapNotification)));
  }

  async create(uid, payload) {
    return addDoc(notificationCollection(uid), {
      userId: uid,
      type: payload.type,
      category: payload.category,
      title: payload.title,
      message: payload.message,
      source: payload.source || "FYNX",
      sourceUrl: payload.sourceUrl || "",
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
      read: false,
      readAt: null,
      archived: false,
      dismissed: false,
      dismissedAt: null,
      priority: payload.priority || PRIORITY.MEDIUM,
      metadata: payload.metadata || {},
      deliveryChannels: payload.deliveryChannels || [CHANNELS.IN_APP],
      dedupeKey: payload.dedupeKey || null,
      expiresAt: payload.expiresAt || null
    });
  }

  async markRead(uid, id, read = true) {
    await updateDoc(doc(db, "users", uid, "notifications", id), { read, readAt: read ? serverTimestamp() : null });
  }

  async markAllRead(uid) {
    const snap = await getDocs(query(notificationCollection(uid), where("read", "==", false), where("archived", "==", false)));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { read: true, readAt: serverTimestamp() }));
    await batch.commit();
  }

  async dismiss(uid, id) {
    await updateDoc(doc(db, "users", uid, "notifications", id), { archived: true, dismissed: true, dismissedAt: serverTimestamp() });
  }

  async hasRecentByDedupeKey(uid, dedupeKey, windowMs, category = null) {
    if (!dedupeKey) return false;
    const cutoffMs = Date.now() - windowMs;
    const snap = await getDocs(query(notificationCollection(uid), where("dedupeKey", "==", dedupeKey), orderBy("timestamp", "desc"), limit(10)));
    return snap.docs.some((item) => {
      const data = item.data() || {};
      const ts = data.timestamp?.toDate?.()?.getTime?.() || new Date(data.timestamp || 0).getTime();
      if (!Number.isFinite(ts) || ts < cutoffMs) return false;
      if (!category) return true;
      return data.category === category;
    });
  }

  async countRecent(uid, windowMs = 60 * 1000) {
    const cutoff = new Date(Date.now() - windowMs);
    const snap = await getDocs(query(notificationCollection(uid), where("timestamp", ">=", cutoff), orderBy("timestamp", "desc")));
    return snap.size;
  }
}

export class BrowserNotificationAdapter {
  async requestPermission() {
    if (!("Notification" in window)) return { supported: false, permission: "denied" };
    const permission = await Notification.requestPermission();
    return { supported: true, permission };
  }

  canSend() {
    return "Notification" in window && Notification.permission === "granted";
  }

  send(payload) {
    if (!this.canSend()) return false;
    const notif = new Notification(payload.title || "FYNX", {
      body: payload.message || "",
      tag: payload.dedupeKey || `fynx-${Date.now()}`,
      data: { sourceUrl: payload.sourceUrl || "notifications.html" }
    });
    notif.onclick = () => {
      const link = payload.sourceUrl || "notifications.html";
      window.open(link, "_blank", "noopener");
    };
    return true;
  }
}

export class NotificationDeliveryManager {
  constructor(browserAdapter) {
    this.browserAdapter = browserAdapter;
  }

  async deliver(notification, preferences) {
    const attempted = { inApp: true, browser: false, email: false, push: false };

    if (preferences.browserEnabled && this.browserAdapter.canSend() && notification.deliveryChannels.includes(CHANNELS.BROWSER)) {
      attempted.browser = this.browserAdapter.send(notification);
    }

    // scaffolding for future adapters
    attempted.email = Boolean(preferences.emailEnabled && notification.deliveryChannels.includes(CHANNELS.EMAIL));
    attempted.push = Boolean(notification.deliveryChannels.includes(CHANNELS.PUSH));

    return attempted;
  }
}

export class UnreadCountManager {
  count(notifications = []) {
    return notifications.reduce((acc, item) => acc + (!item.read && !item.archived ? 1 : 0), 0);
  }
}

export class NotificationRulesEngine {
  constructor(repository, preferenceManager, deliveryManager) {
    this.repository = repository;
    this.preferenceManager = preferenceManager;
    this.deliveryManager = deliveryManager;
  }

  async shouldCreate(uid, payload) {
    const prefs = await this.preferenceManager.get(uid);
    if (!prefs.inAppEnabled && payload.priority !== PRIORITY.CRITICAL) return { ok: false, prefs };

    const recentBurst = await this.repository.countRecent(uid, 60 * 1000);
    if (recentBurst > 12 && ![PRIORITY.HIGH, PRIORITY.CRITICAL].includes(payload.priority)) return { ok: false, prefs };

    const windowMs = DEDUPE_WINDOWS_MS[payload.category] || DEDUPE_WINDOWS_MS.default;
    const isDuplicate = await this.repository.hasRecentByDedupeKey(uid, payload.dedupeKey, windowMs, payload.category);
    if (isDuplicate) return { ok: false, prefs };

    return { ok: true, prefs };
  }

  async emit(uid, payload) {
    const check = await this.shouldCreate(uid, payload);
    if (!check.ok) return { created: false, reason: "suppressed" };
    const ref = await this.repository.create(uid, payload);
    await this.deliveryManager.deliver(payload, check.prefs);
    return { created: true, id: ref.id };
  }

  async emitNews(uid, story = {}) {
    const isBreaking = Boolean(story.isBreaking || story.priority === "high");
    const prefs = await this.preferenceManager.get(uid);
    if (isBreaking && !prefs.breakingNews) return { created: false, reason: "breaking-disabled" };
    if (!isBreaking && !prefs.breakingNews) return { created: false, reason: "news-disabled" };

    const dedupeKey = story.dedupeKey || `${story.source || "news"}:${story.link || story.title || "story"}`;
    return this.emit(uid, {
      type: isBreaking ? "news.breaking" : "news.market",
      category: isBreaking ? NOTIFICATION_CATEGORY.BREAKING_NEWS : NOTIFICATION_CATEGORY.MARKET_NEWS,
      title: story.title || "Market update",
      message: story.description || "New market story detected.",
      source: story.source || "Market feed",
      sourceUrl: story.link || "news.html",
      priority: isBreaking ? PRIORITY.HIGH : PRIORITY.MEDIUM,
      metadata: { publishedAt: story.pubDate || null },
      deliveryChannels: [CHANNELS.IN_APP, CHANNELS.BROWSER],
      dedupeKey
    });
  }

  async emitCalendar(uid, event = {}, phase = "upcoming") {
    const prefs = await this.preferenceManager.get(uid);
    if (!(prefs.highImpactEconomic && prefs.calendarReminders)) return { created: false, reason: "calendar-disabled" };
    const dedupeKey = event.dedupeKey || `calendar:${event.id || event.title}:${phase}`;
    return this.emit(uid, {
      type: `calendar.${phase}`,
      category: NOTIFICATION_CATEGORY.ECONOMIC_CALENDAR,
      title: event.title || "High-impact event",
      message: event.message || `Economic event is ${phase}.`,
      source: event.source || "Economic calendar",
      sourceUrl: event.sourceUrl || "calendar.html",
      priority: event.impact === "high" ? PRIORITY.HIGH : PRIORITY.MEDIUM,
      metadata: { eventId: event.id || null, impact: event.impact || "high", phase },
      deliveryChannels: [CHANNELS.IN_APP, CHANNELS.BROWSER],
      dedupeKey
    });
  }

  async emitSecurity(uid, alert = {}) {
    const prefs = await this.preferenceManager.get(uid);
    if (!prefs.accountSecurity && alert.priority !== PRIORITY.CRITICAL) return { created: false, reason: "security-disabled" };
    const dedupeKey = alert.dedupeKey || `security:${alert.type}:${alert.eventId || Date.now()}`;
    return this.emit(uid, {
      type: alert.type || "security.event",
      category: NOTIFICATION_CATEGORY.ACCOUNT_SECURITY,
      title: alert.title || "Security alert",
      message: alert.message || "Security activity detected on your account.",
      source: alert.source || "Account security",
      sourceUrl: alert.sourceUrl || "security.html",
      priority: alert.priority || PRIORITY.CRITICAL,
      metadata: alert.metadata || {},
      deliveryChannels: [CHANNELS.IN_APP, CHANNELS.BROWSER, CHANNELS.EMAIL],
      dedupeKey
    });
  }

  async emitPlatform(uid, update = {}) {
    const prefs = await this.preferenceManager.get(uid);
    if (!prefs.platformUpdates) return { created: false, reason: "platform-disabled" };
    const dedupeKey = update.dedupeKey || `platform:${update.id || update.title || Date.now()}`;
    return this.emit(uid, {
      type: update.type || "platform.update",
      category: NOTIFICATION_CATEGORY.PLATFORM_UPDATES,
      title: update.title || "Platform update",
      message: update.message || "New product update available.",
      source: update.source || "FYNX",
      sourceUrl: update.sourceUrl || "notifications.html",
      priority: update.priority || PRIORITY.MEDIUM,
      metadata: update.metadata || {},
      deliveryChannels: [CHANNELS.IN_APP, CHANNELS.BROWSER],
      dedupeKey
    });
  }
}

export function createNotificationEngine() {
  const repository = new NotificationRepository();
  const preferenceManager = new NotificationPreferenceManager();
  const browserAdapter = new BrowserNotificationAdapter();
  const deliveryManager = new NotificationDeliveryManager(browserAdapter);
  const unreadCountManager = new UnreadCountManager();
  const rulesEngine = new NotificationRulesEngine(repository, preferenceManager, deliveryManager);

  return { repository, preferenceManager, browserAdapter, deliveryManager, unreadCountManager, rulesEngine };
}
