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

    authMsg.textContent = direction === "into" ? "Loading your data…" : "Securing your session…";
    authTransition.setAttribute("aria-hidden", "false");

    // hide after ~5 seconds like your iOS
    setTimeout(() => {
      authTransition.setAttribute("aria-hidden", "true");
    }, 5000);
  }

  // Decide initial screen immediately (before auth callback)
  if (!hasSeenOnboarding()) {
    showOnly(screenOnboarding);
  } else {
    showOnly(screenLogin); // until auth tells us otherwise
  }

  // Firebase auth state drives login/app
  FynxAuth.onState((user) => {
    const isLoggedIn = !!user;

    if (!hasSeenOnboarding()) {
      showOnly(screenOnboarding);
      handledInitialAuth = true;
      wasLoggedIn = isLoggedIn;
      return;
    }

    // First time state arrives = just set screen, no animation
    if (!handledInitialAuth) {
      handledInitialAuth = true;
      wasLoggedIn = isLoggedIn;
      showOnly(isLoggedIn ? screenApp : screenLogin);
      return;
    }

    // Change detected => animate transition
    if (isLoggedIn !== wasLoggedIn) {
      triggerAuthTransition(isLoggedIn ? "into" : "out");
      showOnly(isLoggedIn ? screenApp : screenLogin);
      wasLoggedIn = isLoggedIn;
    }
  });

  // Onboarding completion event (onboarding.js will call this)
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
      // optional: show modal alert if you want
      console.warn(e?.message || e);
    }
  });
})();
