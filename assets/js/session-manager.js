import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const INACTIVITY_TIMEOUT_MS = 14 * MS_IN_DAY;
const VERSION = "v1";
const KEY_PREFIX = `fynx:${VERSION}:`;

const KEYS = {
  lastActiveAt: `${KEY_PREFIX}lastActiveAt`,
  sessionEvent: `${KEY_PREFIX}session:event`,
  lastRoute: `${KEY_PREFIX}session:lastRoute`,
  offlineAt: `${KEY_PREFIX}session:offlineAt`,
  routeScroll: `${KEY_PREFIX}route:scroll`,
  pageState: `${KEY_PREFIX}state:page`,
  bootReady: `${KEY_PREFIX}session:ready`
};

const SAFE_GLOBAL_KEYS = ["fynx_theme", "mode"];

let activityThrottleUntil = 0;
let currentAuth = null;
let hasBoundListeners = false;
let bootResolved = false;

function now() {
  return Date.now();
}

function safeJsonParse(raw, fallback = null) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // no-op
  }
}

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // no-op
  }
}

function buildStateKey(pageKey) {
  return `${KEYS.pageState}:${pageKey}`;
}

function getCurrentPageKey() {
  const path = window.location.pathname || "/";
  return path.replace(/[^a-z0-9/_-]+/gi, "_").toLowerCase();
}

function getReturnToTarget(defaultTarget = "home.html") {
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo");
  if (!returnTo) return defaultTarget;
  try {
    const parsed = new URL(returnTo, window.location.origin);
    if (parsed.origin !== window.location.origin) return defaultTarget;
    const target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const lower = parsed.pathname.toLowerCase();
    if (lower.endsWith("/auth/login.html") || lower === "/auth/login.html") {
      return defaultTarget;
    }
    return target;
  } catch (error) {
    return defaultTarget;
  }
}

function samePath(target) {
  try {
    const parsed = new URL(target, window.location.origin);
    return parsed.pathname === window.location.pathname && parsed.search === window.location.search;
  } catch (error) {
    return false;
  }
}

function dispatchSessionEvent(detail) {
  window.dispatchEvent(new CustomEvent("fynx:session", { detail }));
}

function dispatchNetworkEvent(isOnline) {
  window.dispatchEvent(new CustomEvent("fynx:network", { detail: { isOnline } }));
}

function recordLastRoute() {
  safeSetItem(KEYS.lastRoute, window.location.pathname + window.location.search + window.location.hash);
}

function restoreScrollPosition() {
  const pageKey = getCurrentPageKey();
  const raw = safeGetItem(`${KEYS.routeScroll}:${pageKey}`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return;
  window.requestAnimationFrame(() => window.scrollTo({ top: value, behavior: "auto" }));
}

function saveScrollPosition() {
  const pageKey = getCurrentPageKey();
  safeSetItem(`${KEYS.routeScroll}:${pageKey}`, String(Math.max(window.scrollY || 0, 0)));
}

function trackActivity(source = "event") {
  const ts = now();
  if (ts < activityThrottleUntil) return;
  activityThrottleUntil = ts + 15000;
  safeSetItem(KEYS.lastActiveAt, String(ts));
  safeSetItem(KEYS.sessionEvent, JSON.stringify({ type: "activity", at: ts, source }));
  dispatchSessionEvent({ type: "activity", at: ts, source });
}

function readLastActiveAt() {
  return Number(safeGetItem(KEYS.lastActiveAt) || 0);
}

function isExpired() {
  const last = readLastActiveAt();
  if (!last) return false;
  return now() - last > INACTIVITY_TIMEOUT_MS;
}

function clearUserScopedState() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      const isVersionedState = key.startsWith(KEYS.pageState) || key.startsWith(`${KEYS.routeScroll}:`) || key.startsWith(KEY_PREFIX);
      const isSafeGlobal = SAFE_GLOBAL_KEYS.includes(key);
      if (isVersionedState && !isSafeGlobal) {
        keysToRemove.push(key);
      }

      const legacyUserKey = /^fynx_(trades|metrics|profile|auth_email|journal|draft|filters|calc|tab|selected)/i.test(key);
      if (legacyUserKey && !isSafeGlobal) keysToRemove.push(key);
    }

    for (const key of new Set(keysToRemove)) {
      safeRemoveItem(key);
    }
  } catch (error) {
    // no-op
  }
}

function savePageDraftState() {
  const pageKey = getCurrentPageKey();
  const payload = { values: {}, updatedAt: now() };

  const fields = document.querySelectorAll("textarea, input, select");
  fields.forEach((field) => {
    const key = field.id || field.name;
    if (!key) return;
    const tag = field.tagName.toLowerCase();
    const type = (field.type || "").toLowerCase();
    const isSensitive = type === "password" || field.autocomplete === "one-time-code";
    if (isSensitive) return;
    if (type === "checkbox" || type === "radio") {
      payload.values[key] = Boolean(field.checked);
      return;
    }
    if (tag === "select" || ["text", "search", "number", "email", "tel", "url", "date", "datetime-local", "time", "textarea", ""].includes(type)) {
      payload.values[key] = field.value;
    }
  });

  safeSetItem(buildStateKey(pageKey), JSON.stringify(payload));
}

function restorePageDraftState() {
  const pageKey = getCurrentPageKey();
  const saved = safeJsonParse(safeGetItem(buildStateKey(pageKey)), null);
  if (!saved || !saved.values) return;

  Object.entries(saved.values).forEach(([key, value]) => {
    const field = document.getElementById(key) || document.querySelector(`[name="${CSS.escape(key)}"]`);
    if (!field) return;

    const type = (field.type || "").toLowerCase();
    if (type === "password") return;
    if (type === "checkbox" || type === "radio") {
      field.checked = Boolean(value);
      return;
    }
    field.value = value ?? "";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function bindPageStateTracking() {
  const handler = () => {
    savePageDraftState();
    saveScrollPosition();
    recordLastRoute();
  };

  ["input", "change"].forEach((evt) => {
    document.addEventListener(evt, (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (!event.target.closest("input, textarea, select")) return;
      trackActivity(evt);
      handler();
    }, { passive: true });
  });

  window.addEventListener("beforeunload", handler);
  window.addEventListener("pagehide", handler);
  window.addEventListener("scroll", () => {
    trackActivity("scroll");
    saveScrollPosition();
  }, { passive: true });

  restorePageDraftState();
  restoreScrollPosition();
}

function bindPresenceListeners() {
  if (hasBoundListeners) return;
  hasBoundListeners = true;

  const activityEvents = ["click", "mousedown", "keydown", "touchstart", "pointerdown", "wheel"];
  for (const eventName of activityEvents) {
    window.addEventListener(eventName, () => trackActivity(eventName), { passive: true });
  }

  window.addEventListener("focus", () => {
    trackActivity("focus");
    validateSessionTimeout("focus");
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      trackActivity("visible");
      validateSessionTimeout("visibility");
    }
  });

  window.addEventListener("online", () => {
    safeRemoveItem(KEYS.offlineAt);
    dispatchNetworkEvent(true);
    validateSessionTimeout("online");
  });

  window.addEventListener("offline", () => {
    safeSetItem(KEYS.offlineAt, String(now()));
    dispatchNetworkEvent(false);
  });

  window.addEventListener("storage", (event) => {
    if (!event.key) return;

    if (event.key === "fynx_theme") {
      const isLight = event.newValue === "light";
      document.body.classList.toggle("light-mode", isLight);
      document.body.classList.toggle("dark-mode", !isLight);
      document.documentElement.dataset.theme = isLight ? "light" : "dark";
    }

    if (event.key === KEYS.sessionEvent && event.newValue) {
      const payload = safeJsonParse(event.newValue, null);
      if (!payload?.type) return;

      if (payload.type === "logout") {
        dispatchSessionEvent(payload);
        window.location.href = payload.redirectTo || "auth/login.html";
      }

      if (payload.type === "login") {
        dispatchSessionEvent(payload);
      }
    }
  });
}

async function broadcastAndSignOut(reason = "manual", redirectTo = "auth/login.html") {
  if (!currentAuth) return;

  safeSetItem(KEYS.sessionEvent, JSON.stringify({
    type: "logout",
    at: now(),
    reason,
    redirectTo
  }));

  clearUserScopedState();
  await signOut(currentAuth);
}

async function validateSessionTimeout(source = "manual") {
  const auth = currentAuth;
  if (!auth?.currentUser) return { expired: false };

  if (isExpired()) {
    await broadcastAndSignOut("inactive_14d", "auth/login.html?reason=inactive");
    return { expired: true };
  }

  trackActivity(source);
  return { expired: false };
}

export async function bootstrapSession({ auth, protectedPage = false, loginPage = false, loginRedirect = "home.html" } = {}) {
  currentAuth = auth;
  bindPresenceListeners();
  bindPageStateTracking();

  setPersistence(auth, browserLocalPersistence).catch(() => {
    // no-op
  });

  const isDemo = localStorage.getItem("mode") === "demo";
  const redirectTo = `auth/login.html?returnTo=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`;

  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();

      if (user && !readLastActiveAt()) {
        trackActivity("resume");
      }

      if (user) {
        const timeoutStatus = await validateSessionTimeout("auth-state");
        if (timeoutStatus.expired) {
          resolve({ user: null, expired: true });
          return;
        }

        safeSetItem(KEYS.sessionEvent, JSON.stringify({
          type: "login",
          at: now(),
          uid: user.uid
        }));

        const lastRoute = safeGetItem(KEYS.lastRoute);
        if (loginPage) {
          const fallback = lastRoute || loginRedirect;
          const target = getReturnToTarget(fallback);
          if (!samePath(target)) {
            window.location.replace(target);
            resolve({ user, redirected: true });
            return;
          }
        }
      }

      if (!user && protectedPage && !isDemo) {
        window.location.replace(redirectTo);
        resolve({ user: null, redirected: true });
        return;
      }

      dispatchSessionEvent({ type: "ready", user: user ? { uid: user.uid, email: user.email || "" } : null, protectedPage, loginPage });

      if (!bootResolved) {
        bootResolved = true;
        safeSetItem(KEYS.bootReady, String(now()));
      }

      resolve({ user, redirected: false });
    });
  });
}

export const sessionState = {
  keys: KEYS,
  timeoutMs: INACTIVITY_TIMEOUT_MS,
  trackActivity,
  validateSessionTimeout,
  logout: broadcastAndSignOut,
  clearUserScopedState,
  getLastRoute: () => safeGetItem(KEYS.lastRoute),
  setLastRoute: recordLastRoute,
  savePageState: savePageDraftState,
  restorePageState: restorePageDraftState,
  getPageState(pageKey) {
    return safeJsonParse(safeGetItem(buildStateKey(pageKey || getCurrentPageKey())), null);
  },
  setPageState(pageKey, value) {
    safeSetItem(buildStateKey(pageKey || getCurrentPageKey()), JSON.stringify(value || {}));
  }
};

if (typeof window !== "undefined") {
  window.FynxSession = sessionState;
}
