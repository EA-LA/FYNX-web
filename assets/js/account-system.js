import { auth, app } from "../../auth/firebase.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  serverTimestamp,
  writeBatch,
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
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  PRIORITY,
  createNotificationEngine
} from "./notifications/engine.js";

const db = getFirestore(app);
const storage = getStorage(app);
const notificationEngine = createNotificationEngine();

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

const DEFAULT_SECURITY_SETTINGS = {
  loginAlerts: true,
  twoFactor: {
    status: "coming_soon",
    enrolledAt: null,
    method: null
  },
  verificationAlertSentAt: null,
  updatedAt: null,
  createdAt: null
};

const MODEL_VERSION = 2;

function userRoot(uid) {
  return doc(db, "users", uid);
}
function userDoc(uid, key) {
  return doc(db, "users", uid, "account", key);
}

async function maybeEmitVerificationCompleted(user) {
  if (!user?.uid || !user.emailVerified) return;
  const security = await getSecuritySettings(user.uid);
  if (security.verificationAlertSentAt) return;
  await notificationEngine.rulesEngine.emitSecurity(user.uid, {
    type: "security.email_verified",
    title: "Email verified",
    message: "Your email verification was completed successfully.",
    dedupeKey: `security:email_verified:${user.uid}`,
    metadata: { email: user.email || null },
    priority: PRIORITY.HIGH
  });
  await saveSecuritySettings(user.uid, { verificationAlertSentAt: serverTimestamp() });
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
  await maybeEmitVerificationCompleted(user);
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
export const getNotificationPreferences = (uid) => notificationEngine.preferenceManager.get(uid);
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
  await notificationEngine.preferenceManager.save(uid, payload);
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

export function listenNotifications(uid, callback, max = 100) {
  return notificationEngine.repository.listen(uid, callback, max);
}

export async function addNotification(uid, payload) {
  return notificationEngine.rulesEngine.emit(uid, payload);
}

export async function markNotificationRead(uid, id, read = true) {
  await notificationEngine.repository.markRead(uid, id, read);
}

export async function markAllNotificationsRead(uid) {
  await notificationEngine.repository.markAllRead(uid);
}

export async function dismissNotification(uid, id) {
  await notificationEngine.repository.dismiss(uid, id);
}

export async function ingestNewsNotifications(uid, items = []) {
  if (!items.length) return { created: 0 };
  const now = Date.now();
  let created = 0;

  for (const item of items.slice(0, 20)) {
    const publishedAt = new Date(item.pubDate || item.createdAt || now).getTime();
    if (!Number.isFinite(publishedAt) || now - publishedAt > 48 * 60 * 60 * 1000) continue;
    const res = await notificationEngine.rulesEngine.emitNews(uid, {
      ...item,
      isBreaking: Boolean(item.breaking || item.isBreaking || item.importance === "high")
    });
    if (res.created) created += 1;
  }

  return { created };
}

export async function ingestEconomicCalendarNotifications(uid, events = []) {
  let created = 0;
  for (const event of events) {
    if ((event.impact || "").toLowerCase() !== "high") continue;
    const phase = event.phase || "upcoming";
    const result = await notificationEngine.rulesEngine.emitCalendar(uid, event, phase);
    if (result.created) created += 1;
  }
  return { created };
}

export async function emitSecurityNotification(uid, alert) {
  return notificationEngine.rulesEngine.emitSecurity(uid, alert);
}

export async function emitPlatformNotification(uid, payload) {
  return notificationEngine.rulesEngine.emitPlatform(uid, payload);
}

export async function updatePasswordWithReauth(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error("No authenticated email user found.");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
  await notificationEngine.rulesEngine.emitSecurity(user.uid, {
    type: "security.password_changed",
    title: "Password changed",
    message: "Your account password was changed successfully.",
    dedupeKey: `security:password_changed:${user.uid}:${new Date().toISOString().slice(0, 13)}`,
    priority: PRIORITY.CRITICAL,
    metadata: { email: user.email }
  });
}

export async function resendVerificationEmail() {
  if (!auth.currentUser) throw new Error("No authenticated user");
  await sendEmailVerification(auth.currentUser);
}

export async function upsertSessionMetadata(user, payload = {}) {
  if (!user?.uid) return;
  const sessionId = `${user.uid}-${navigator.userAgent.slice(0, 24)}-${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  const sessionRef = doc(db, "users", user.uid, "sessions", sessionId);
  const existing = await getDoc(sessionRef);

  await setDoc(
    sessionRef,
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

  if (!existing.exists()) {
    await notificationEngine.rulesEngine.emitSecurity(user.uid, {
      type: "security.new_login",
      title: "New login detected",
      message: `A new session was started on ${navigator.platform || "this device"}.`,
      dedupeKey: `security:new_login:${sessionId}`,
      metadata: {
        sessionId,
        platform: navigator.platform || "unknown",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      },
      priority: PRIORITY.CRITICAL
    });
  }
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
  return notificationEngine.browserAdapter.requestPermission();
}

export function showBrowserNotification(payload) {
  return notificationEngine.browserAdapter.send(payload);
}

export function countUnread(notifications = []) {
  return notificationEngine.unreadCountManager.count(notifications);
}

export { db, auth };
