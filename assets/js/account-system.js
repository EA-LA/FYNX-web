import { auth, app } from "../../auth/firebase.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  writeBatch,
  deleteDoc,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import {
  updateProfile,
  updatePassword,
  sendEmailVerification,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const db = getFirestore(app);
const storage = getStorage(app);

try {
  await enableIndexedDbPersistence(db);
} catch (error) {
  // ignore multi-tab or unsupported persistence errors
}

const DEFAULT_PROFILE = {
  displayName: "",
  username: "",
  photoURL: "",
  bio: "",
  country: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  preferredCurrency: "USD",
  experienceLevel: "beginner",
  preferredMarkets: ["forex"],
  riskProfile: "moderate",
  supportEmail: "support@fynxfinanceworld.com",
  appStoreUrl: "https://apps.apple.com/us/app/fynx-finance-world/id6752357210",
  legal: {
    termsUrl: "https://fynxfinanceworld.com/terms",
    privacyUrl: "https://fynxfinanceworld.com/privacy",
    riskDisclosureUrl: "https://fynxfinanceworld.com/risk-disclosure",
    contactUrl: "https://fynxfinanceworld.com/contact"
  },
  updatedAt: null,
  createdAt: null
};

const DEFAULT_PREFERENCES = {
  themeMode: "system",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  currency: "USD",
  dateTimeFormat: "MMM d, yyyy HH:mm",
  defaultRiskPercent: 1,
  defaultLotSize: 0.1,
  defaultRR: 2,
  preferredMarketFocus: "forex",
  emailAlerts: true,
  inAppAlerts: true,
  soundAlerts: false,
  performanceMode: false,
  updatedAt: null,
  createdAt: null
};

const DEFAULT_NOTIFICATION_PREFERENCES = {
  breakingNews: true,
  highImpactEconomic: true,
  calendarReminders: true,
  platformUpdates: true,
  accountSecurity: true,
  billingChallenges: false,
  browserEnabled: false,
  updatedAt: null,
  createdAt: null
};

const DEFAULT_SECURITY_SETTINGS = {
  loginAlerts: true,
  twoFactor: {
    status: "coming_soon",
    enrolledAt: null,
    method: null
  },
  updatedAt: null,
  createdAt: null
};

const MODEL_VERSION = 1;

function userRoot(uid) {
  return doc(db, "users", uid);
}
function userDoc(uid, key) {
  return doc(db, "users", uid, "account", key);
}

async function ensureUserSeed(user) {
  if (!user?.uid) throw new Error("Missing user");
  const rootRef = userRoot(user.uid);
  await setDoc(
    rootRef,
    {
      uid: user.uid,
      email: user.email || "",
      modelVersion: MODEL_VERSION,
      lastSeenAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  const seeds = [
    ["profile", {
      ...DEFAULT_PROFILE,
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }],
    ["preferences", { ...DEFAULT_PREFERENCES, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }],
    ["notificationPreferences", { ...DEFAULT_NOTIFICATION_PREFERENCES, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }],
    ["security", { ...DEFAULT_SECURITY_SETTINGS, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }]
  ];

  await Promise.all(
    seeds.map(async ([key, value]) => {
      const ref = userDoc(user.uid, key);
      const existing = await getDoc(ref);
      if (!existing.exists()) {
        await setDoc(ref, value, { merge: true });
      }
    })
  );

  await upsertSessionMetadata(user, { status: "active" });
}

export async function bootstrapAccount(user) {
  await ensureUserSeed(user);
  return {
    profile: await getUserProfile(user.uid),
    preferences: await getUserPreferences(user.uid),
    notificationPreferences: await getNotificationPreferences(user.uid),
    security: await getSecuritySettings(user.uid)
  };
}

async function getMergedDoc(uid, key, defaults) {
  const snap = await getDoc(userDoc(uid, key));
  if (!snap.exists()) return { ...defaults };
  return { ...defaults, ...snap.data() };
}

export const getUserProfile = (uid) => getMergedDoc(uid, "profile", DEFAULT_PROFILE);
export const getUserPreferences = (uid) => getMergedDoc(uid, "preferences", DEFAULT_PREFERENCES);
export const getNotificationPreferences = (uid) => getMergedDoc(uid, "notificationPreferences", DEFAULT_NOTIFICATION_PREFERENCES);
export const getSecuritySettings = (uid) => getMergedDoc(uid, "security", DEFAULT_SECURITY_SETTINGS);

export async function saveUserProfile(uid, payload) {
  await setDoc(
    userDoc(uid, "profile"),
    {
      ...payload,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function saveUserPreferences(uid, payload) {
  await setDoc(userDoc(uid, "preferences"), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveNotificationPreferences(uid, payload) {
  await setDoc(userDoc(uid, "notificationPreferences"), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveSecuritySettings(uid, payload) {
  await setDoc(userDoc(uid, "security"), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
}

export async function uploadProfilePhoto(uid, file) {
  if (!file) return "";
  const fileRef = ref(storage, `users/${uid}/profile/${Date.now()}-${file.name}`);
  await uploadBytes(fileRef, file, { contentType: file.type || "image/jpeg" });
  return getDownloadURL(fileRef);
}

export async function updateAuthProfile(payload) {
  if (!auth.currentUser) throw new Error("No authenticated user");
  await updateProfile(auth.currentUser, payload);
}

function mapNotification(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    title: data.title || "Notification",
    source: data.source || "FYNX",
    type: data.type || "platform_updates",
    body: data.body || "",
    link: data.link || "",
    read: Boolean(data.read),
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || new Date().toISOString(),
    dedupeKey: data.dedupeKey || ""
  };
}

export function listenNotifications(uid, callback, max = 30) {
  const ref = collection(db, "users", uid, "notifications");
  const q = query(ref, orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(mapNotification));
  });
}

export async function addNotification(uid, payload) {
  const ref = collection(db, "users", uid, "notifications");
  await addDoc(ref, {
    title: payload.title,
    source: payload.source || "FYNX",
    type: payload.type || "platform_updates",
    body: payload.body || "",
    link: payload.link || "",
    read: false,
    dedupeKey: payload.dedupeKey || null,
    createdAt: serverTimestamp()
  });
}

export async function markNotificationRead(uid, id, read = true) {
  await updateDoc(doc(db, "users", uid, "notifications", id), { read, readAt: read ? serverTimestamp() : null });
}

export async function markAllNotificationsRead(uid) {
  const ref = collection(db, "users", uid, "notifications");
  const q = query(ref, where("read", "==", false));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    batch.update(d.ref, { read: true, readAt: serverTimestamp() });
  });
  await batch.commit();
}

export async function removeNotification(uid, id) {
  await deleteDoc(doc(db, "users", uid, "notifications", id));
}

export async function ingestNewsNotifications(uid, items = []) {
  if (!items.length) return { created: 0 };
  const ref = collection(db, "users", uid, "notifications");

  const existing = await getDocs(query(ref, where("type", "==", "breaking_market_news"), orderBy("createdAt", "desc"), limit(80)));
  const existingKeys = new Set(existing.docs.map((snap) => snap.data().dedupeKey).filter(Boolean));

  const now = Date.now();
  let created = 0;
  for (const item of items.slice(0, 5)) {
    const publishedAt = new Date(item.pubDate || item.createdAt || now).getTime();
    if (!Number.isFinite(publishedAt) || now - publishedAt > 24 * 60 * 60 * 1000) continue;
    const dedupeKey = item.dedupeKey || item.link || item.title;
    if (!dedupeKey || existingKeys.has(dedupeKey)) continue;

    await addDoc(ref, {
      title: item.title || "Market headline",
      source: item.source || item.label || "Market feed",
      type: "breaking_market_news",
      body: item.description || "Fresh market story detected in your feed.",
      link: item.link || "news.html",
      read: false,
      dedupeKey,
      createdAt: serverTimestamp()
    });
    existingKeys.add(dedupeKey);
    created += 1;
  }

  return { created };
}

export async function updatePasswordWithReauth(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error("No authenticated email user found.");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function resendVerificationEmail() {
  if (!auth.currentUser) throw new Error("No authenticated user");
  await sendEmailVerification(auth.currentUser);
}

export async function upsertSessionMetadata(user, payload = {}) {
  if (!user?.uid) return;
  const sessionId = `${user.uid}-${navigator.userAgent.slice(0, 24)}-${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  await setDoc(
    doc(db, "users", user.uid, "sessions", sessionId),
    {
      sessionId,
      userAgent: navigator.userAgent,
      platform: navigator.platform || "unknown",
      language: navigator.language || "en-US",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      status: payload.status || "active",
      lastActiveAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function getSessionMetadata(uid) {
  const snap = await getDocs(query(collection(db, "users", uid, "sessions"), orderBy("updatedAt", "desc"), limit(20)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function revokeAllSessions(uid, keepSessionId = null) {
  const snap = await getDocs(collection(db, "users", uid, "sessions"));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    if (keepSessionId && d.id === keepSessionId) {
      batch.update(d.ref, { status: "active", updatedAt: serverTimestamp(), lastActiveAt: serverTimestamp() });
    } else {
      batch.update(d.ref, { status: "revoked", revokedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
  });
  await batch.commit();
}

export async function logoutCurrentSession(redirectTo = "auth/login.html") {
  if (window.FynxSession?.logout) {
    await window.FynxSession.logout("manual", redirectTo);
    return;
  }
  await signOut(auth);
}

export function requestBrowserNotificationPermission() {
  if (!("Notification" in window)) {
    return Promise.resolve({ supported: false, permission: "denied" });
  }

  return Notification.requestPermission().then((permission) => ({ supported: true, permission }));
}

export function showBrowserNotification(payload) {
  if (!("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  const notif = new Notification(payload.title || "FYNX", {
    body: payload.body || "",
    tag: payload.tag || `fynx-${Date.now()}`,
    data: { link: payload.link || "notifications.html" }
  });

  notif.onclick = () => {
    if (payload.link) {
      window.open(payload.link, "_blank", "noopener");
    }
  };
  return true;
}

export function countUnread(notifications = []) {
  return notifications.reduce((acc, item) => acc + (item.read ? 0 : 1), 0);
}

export { db, auth };
