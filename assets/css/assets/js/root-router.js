(() => {
  // Mirrors your SwiftUI storage keys
  const KEY_HAS_SEEN = "hasSeenOnboarding";   // Bool
  const KEY_AUTH_USER = "auth.user";          // JSON string or null

  // Elements
  const screenOnboarding = document.getElementById("screenOnboarding");
  const screenLogin = document.getElementById("screenLogin");
  const screenApp = document.getElementById("screenApp");

  const btnOnboardingContinue = document.getElementById("btnOnboardingContinue");
  const btnLoginGoogle = document.getElementById("btnLoginGoogle");
  const btnLoginApple = document.getElementById("btnLoginApple");
  const btnLoginLogout = document.getElementById("btnLoginLogout");
  const btnLogoutFromProfile = document.getElementById("btnLogoutFromProfile");

  // Auth transition overlay
  const authTransition = document.getElementById("authTransition");
  const authMsg = document.getElementById("authMsg");

  // Deep link modal (web equivalent of .sheet)
  const deepLinkModal = document.getElementById("deepLinkModal");
  const deepLinkTitle = document.getElementById("deepLinkTitle");
  const deepLinkBody = document.getElementById("deepLinkBody");

  // Internal state to match your Swift logic
  let handledInitialAuthState = false;
  let wasLoggedIn = false;

  function getBool(key, fallback = false) {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "true";
  }

  function setBool(key, value) {
    localStorage.setItem(key, value ? "true" : "false");
  }

  function getAuthUser() {
    const raw = localStorage.getItem(KEY_AUTH_USER);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function setAuthUser(userObjOrNull) {
    if (!userObjOrNull) localStorage.removeItem(KEY_AUTH_USER);
    else localStorage.setItem(KEY_AUTH_USER, JSON.stringify(userObjOrNull));
  }

  function showOnly(which) {
    // which: "onboarding" | "login" | "app"
    screenOnboarding.hidden = which !== "onboarding";
    screenLogin.hidden = which !== "login";
    screenApp.hidden = which !== "app";
  }

  // Equivalent of your triggerAuthTransition() (5 seconds)
  function triggerAuthTransition(direction) {
    // direction: "intoApp" | "outOfApp"
    if (!authTransition) return;

    authMsg.textContent = direction === "intoApp"
      ? "Loading your FYNX session…"
      : "Signing you out…";

    // reset bar animation
    const barFill = authTransition.querySelector(".authBarFill");
    if (barFill) {
      barFill.style.animation = "none";
      // force reflow
      void barFill.offsetHeight;
      barFill.style.animation = "";
    }

    authTransition.setAttribute("aria-hidden", "false");

    window.setTimeout(() => {
      authTransition.setAttribute("aria-hidden", "true");
    }, 5000);
  }

  // “Auth observer” equivalent: watches storage changes + local changes
  function handleAuthChange() {
    const user = getAuthUser();
    const isLoggedIn = !!user;
    const hasSeen = getBool(KEY_HAS_SEEN, false);

    // Router rules: onboarding → login → app
    if (!hasSeen) {
      showOnly("onboarding");
    } else if (!isLoggedIn) {
      showOnly("login");
    } else {
      showOnly("app");
    }

    // Match your "don’t animate on first state"
    if (!handledInitialAuthState) {
      handledInitialAuthState = true;
      wasLoggedIn = isLoggedIn;
      return;
    }

    if (isLoggedIn !== wasLoggedIn) {
      if (isLoggedIn) triggerAuthTransition("intoApp");
      else triggerAuthTransition("outOfApp");
      wasLoggedIn = isLoggedIn;
    }

    // Deep link check when app is visible
    if (hasSeen && isLoggedIn) {
      handleDeepLinkFromURL();
    }
  }

  // Deep link (web version): supports
  //  - ?dl=profile&userId=XYZ
  //  - ?dl=room&roomId=ABC
  //  - ?dl=home
  function handleDeepLinkFromURL() {
    const url = new URL(window.location.href);
    const dl = url.searchParams.get("dl");
    if (!dl) return;

    let title = "Deep Link";
    let body = "";

    if (dl === "profile") {
      const userId = url.searchParams.get("userId") || "(missing userId)";
      title = "Public Profile";
      body = `Profile: ${escapeHtml(userId)}`;
    } else if (dl === "room") {
      const roomId = url.searchParams.get("roomId") || "(missing roomId)";
      title = "Alpha Room";
      body = `Room: ${escapeHtml(roomId)}`;
    } else if (dl === "home") {
      title = "FYNX";
      body = "Home";
    } else {
      title = "Deep Link";
      body = `Unknown route: ${escapeHtml(dl)}`;
    }

    openDeepLinkModal(title, body);

    // Clear params like your clearPendingRoute()
    url.searchParams.delete("dl");
    url.searchParams.delete("userId");
    url.searchParams.delete("roomId");
    window.history.replaceState({}, "", url.toString());
  }

  function openDeepLinkModal(title, text) {
    if (!deepLinkModal) return;
    deepLinkTitle.textContent = title;
    deepLinkBody.innerHTML = `<p class="muted">${text}</p>`;
    deepLinkModal.setAttribute("aria-hidden", "false");
  }

  function closeDeepLinkModal() {
    if (!deepLinkModal) return;
    deepLinkModal.setAttribute("aria-hidden", "true");
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Wire UI actions
  btnOnboardingContinue?.addEventListener("click", () => {
    setBool(KEY_HAS_SEEN, true);
    handleAuthChange();
  });

  // Demo sign-in (placeholder for Firebase Web Auth)
  btnLoginGoogle?.addEventListener("click", () => {
    setAuthUser({ provider: "google", uid: "demo_google_uid", ts: Date.now() });
    handleAuthChange();
  });

  btnLoginApple?.addEventListener("click", () => {
    setAuthUser({ provider: "apple", uid: "demo_apple_uid", ts: Date.now() });
    handleAuthChange();
  });

  function logout() {
    setAuthUser(null);
    handleAuthChange();
  }

  btnLogoutFromProfile?.addEventListener("click", logout);
  btnLoginLogout?.addEventListener("click", logout);

  // Close deep link modal
  deepLinkModal?.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-close-deeplink") === "true") {
      closeDeepLinkModal();
    }
    // also allow backdrop/button close
    if (t && t.hasAttribute && t.hasAttribute("data-close-deeplink")) {
      closeDeepLinkModal();
    }
  });

  // Also close if you click any element with data-close-deeplink
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute("data-close-deeplink") === "true") closeDeepLinkModal();
  });

  // Listen to storage changes (multi-tab)
  window.addEventListener("storage", (e) => {
    if (e.key === KEY_HAS_SEEN || e.key === KEY_AUTH_USER) {
      handleAuthChange();
    }
  });

  // Initial render (equivalent of onAppear + initial auth state handling)
  handleAuthChange();
})();
