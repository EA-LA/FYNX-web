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
  let currentUser = null;

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

  // --- NEW: simple hash routing ---------------------------------------------
  // Supported hashes:
  //  #onboarding  -> onboarding (always)
  //  #login       -> login (if onboarding completed, otherwise onboarding)
  //  #app         -> app (only if logged in, otherwise login/onboarding)
  //  (no hash)    -> default (your existing behavior)

  function getRoute() {
    const raw = (location.hash || "").replace("#", "").trim().toLowerCase();
    if (!raw) return "";
    // allow "login?x=y" later if you ever add params
    return raw.split("?")[0];
  }

  function applyRoute(route) {
    // Always honor onboarding requirement first (hard gate)
    if (!hasSeenOnboarding()) {
      showOnly(screenOnboarding);
      return;
    }

    // If user explicitly wants onboarding even after completion
    if (route === "onboarding") {
      showOnly(screenOnboarding);
      return;
    }

    // Login route
    if (route === "login") {
      showOnly(screenLogin);
      return;
    }

    // App route: only show if logged in
    if (route === "app") {
      showOnly(currentUser ? screenApp : screenLogin);
      return;
    }

    // Unknown/empty route -> default behavior based on auth
    showOnly(currentUser ? screenApp : screenLogin);
  }

  // Apply route on initial load (before auth event arrives)
  // If no hash, keep your original logic
  const initialRoute = getRoute();
  if (initialRoute) {
    // currentUser is null at this moment, but applyRoute handles that safely
    applyRoute(initialRoute);
  } else {
    if (!hasSeenOnboarding()) {
      showOnly(screenOnboarding);
    } else {
      showOnly(screenLogin); // until auth tells us otherwise
    }
  }

  // React to hash changes (e.g., app.html#login)
  window.addEventListener("hashchange", () => {
    applyRoute(getRoute());
  });
  // -------------------------------------------------------------------------

  // Firebase auth state drives login/app (via auth.js events)
  FynxAuth.subscribe((evt) => {
    if (!evt) return;
    if (evt.type !== "auth") return;

    const user = evt.user || null;
    const isLoggedIn = !!user;

    currentUser = user; // NEW: keep the latest user for routing decisions

    // If onboarding not done, always force onboarding
    if (!hasSeenOnboarding()) {
      showOnly(screenOnboarding);
      handledInitialAuth = true;
      wasLoggedIn = isLoggedIn;
      return;
    }

    // If user is explicitly on a route, honor it
    const route = getRoute();
    if (route) {
      // First auth event: still honor route, no animation
      if (!handledInitialAuth) {
        handledInitialAuth = true;
        wasLoggedIn = isLoggedIn;
        applyRoute(route);
        return;
      }

      // Subsequent changes: animate if state changes, then re-apply route
      if (isLoggedIn !== wasLoggedIn) {
        triggerAuthTransition(isLoggedIn ? "into" : "out");
        wasLoggedIn = isLoggedIn;
        applyRoute(route);
      }
      return;
    }

    // No route: preserve your original behavior
    if (!handledInitialAuth) {
      handledInitialAuth = true;
      wasLoggedIn = isLoggedIn;
      showOnly(isLoggedIn ? screenApp : screenLogin);
      return;
    }

    if (isLoggedIn !== wasLoggedIn) {
      triggerAuthTransition(isLoggedIn ? "into" : "out");
      showOnly(isLoggedIn ? screenApp : screenLogin);
      wasLoggedIn = isLoggedIn;
    }
  });

  // Onboarding completion hook (onboarding.js will call this)
  window.FYNX_SET_SEEN_ONBOARDING = () => {
    localStorage.setItem(KEY_HAS_SEEN, "true");

    // If URL asked for app, honor it; otherwise go login like before
    const route = getRoute();
    if (route) applyRoute(route);
    else showOnly(screenLogin);
  };

  // Logout button in profile
  const btnLogout = document.getElementById("btnLogoutFromProfile");
  btnLogout?.addEventListener("click", async () => {
    try {
      await FynxAuth.signOut();
      // If you want, you can force route to login:
      // location.hash = "#login";
    } catch (e) {
      console.warn(e?.message || e);
    }
  });
})();
