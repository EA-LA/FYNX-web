import { auth } from "../../auth/firebase.js";
import { bootstrapSession } from "./session-manager.js";

const protectedPage = document.body?.dataset?.protectedPage !== "false";

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
  }).catch((error) => {
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
