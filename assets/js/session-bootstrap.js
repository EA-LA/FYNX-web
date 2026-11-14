import { auth } from "../../auth/firebase.js";
import { bootstrapSession } from "./session-manager.js?v=20261114-heatmaps-2";

// Public browsing is the default. The dashboard and personal account screens require a session.
// Keep in sync with PRIVATE_PAGES in auth-gate.js (checked by scripts/test-auth-gate.cjs).
const privatePages = new Set(["home.html", "dashboard.html", "profile.html", "account-settings.html", "security.html", "notifications.html", "preferences.html"]);
const protectedPage = privatePages.has((location.pathname.split("/").pop() || "").toLowerCase());

function removeLegacyRestoreUi() {
  const selectors = [
    "#sessionRestoreScreen",
    "#session-restore-screen",
    "#authRestoreScreen",
    "#auth-restore-screen",
    ".session-restore-screen",
    ".auth-restore-screen",
    ".session-restore-overlay",
    ".auth-restore-overlay",
    ".session-bootstrap-loader",
    ".session-loader-overlay",
    ".auth-loader-overlay"
  ];

  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => node.remove());
  });

  document.body?.classList.remove("session-restoring", "auth-restoring", "session-loading", "auth-loading");
}

function runSessionBootstrap() {
  bootstrapSession({
    auth,
    protectedPage,
    loginPage: false,
    loginRedirect: "home.html"
  }).then((result) => {
    // Reveal a members-only page only for a confirmed, unexpired session; otherwise go to sign in.
    if (!protectedPage) return;
    if (result?.user && !result.redirected) window.FynxAuthGate?.release();
    else if (!result?.redirected) location.replace(window.FynxAuthGate?.loginUrl() || "/auth/login.html");
  }).catch((error) => {
    window.FynxMonitor?.report('auth', 'session-bootstrap', error);
    console.error("Session bootstrap failed", error);
  });
}

function initSilently() {
  removeLegacyRestoreUi();
  window.setTimeout(runSessionBootstrap, 0);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSilently, { once: true });
} else {
  initSilently();
}
