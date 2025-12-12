// assets/js/root-router.js
import { FynxAuth } from "./auth.js";

(() => {
  const KEY_HAS_SEEN = "hasSeenOnboarding";

  const screenOnboarding = document.getElementById("screenOnboarding");
  const screenLogin = document.getElementById("screenLogin");
  const screenApp = document.getElementById("screenApp");

  const authTransition = document.getElementById("authTransition");
  const authMsg = document.getElementById("authMsg");

  let handledInitialAuth = false;
  let wasLoggedIn = false;

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }

  function showOnly(which) {
    hide(screenOnboarding);
    hide(screenLogin);
    hide(screenApp);
    show(which);
  }

  function hasSeenOnboarding() {
    return localStorage.getItem(KEY_HAS_SEEN) === "true";
  }

  function triggerAuthTransition(direction /* "into" | "out" */) {
    if (!authTransition) return;

    if (authMsg) {
      authMsg.textContent = direction === "into"
        ? "Loading your data…"
        : "Securing your session…";
    }

    authTransition.setAttribute("aria-hidden", "false");

    // hide after ~5 seconds like iOS
    setTimeout(() => {
      authTransition.setAttribute("aria-hidden", "true");
    }, 5000);
  }

  // Decide initial screen immediately (before auth event arrives)
  if (!hasSeenOnboarding()) {
    showOnly(screenOnboarding);
  } else {
    showOnly(screenLogin); // until auth tells us otherwise
  }

  // Firebase auth state drives login/app (via auth.js events)
  FynxAuth.subscribe((evt) => {
    if (!evt) return;

    // Only care about auth state events here
    if (evt.type !== "auth") return;

    const user = evt.user || null;
    const isLoggedIn = !!user;

    // If onboarding not done, always force onboarding
    if (!hasSeenOnboarding()) {
      showOnly(screenOnboarding);
      handledInitialAuth = true;
      wasLoggedIn = isLoggedIn;
      return;
    }

    // First auth state we receive: set screen, no animation
    if (!handledInitialAuth) {
      handledInitialAuth = true;
      wasLoggedIn = isLoggedIn;
      showOnly(isLoggedIn ? screenApp : screenLogin);
      return;
    }

    // Subsequent changes: animate transition
    if (isLoggedIn !== wasLoggedIn) {
      triggerAuthTransition(isLoggedIn ? "into" : "out");
      showOnly(isLoggedIn ? screenApp : screenLogin);
      wasLoggedIn = isLoggedIn;
    }
  });

  // Onboarding completion hook (onboarding.js will call this)
  window.FYNX_SET_SEEN_ONBOARDING = () => {
    localStorage.setItem(KEY_HAS_SEEN, "true");
    showOnly(screenLogin);
  };

  // Logout button in profile
  const btnLogout = document.getElementById("btnLogoutFromProfile");
  btnLogout?.addEventListener("click", async () => {
    try {
      await FynxAuth.signOut();
    } catch (e) {
      console.warn(e?.message || e);
    }
  });
})();
