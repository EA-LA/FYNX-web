(() => {
  // This file converts OnboardingLoginView behavior.
  // RootRouter shows/hides #screenLogin, so we only initialize once.

  const subtitleFull = "Trade Beyond Limits";
  const typedEl = document.getElementById("typedText");

  const btnOther = document.getElementById("btnOtherOptions");
  const emailWrap = document.getElementById("emailWrap");
  const btnEmail = document.getElementById("btnLoginEmail");

  const emailModal = document.getElementById("emailModal");
  const btnEmailClose = document.getElementById("btnEmailClose");
  const btnEmailDemoSignIn = document.getElementById("btnEmailDemoSignIn");

  const btnGoogle = document.getElementById("btnLoginGoogle");
  const btnApple = document.getElementById("btnLoginApple");

  // RootRouter demo auth key (matches root-router.js)
  const KEY_AUTH_USER = "auth.user";

  // Typing (45ms per char, pause after spaces)
  async function typeSubtitle() {
    if (!typedEl) return;
    if (typedEl.textContent && typedEl.textContent.length > 0) return;

    let typed = "";
    for (let i = 0; i < subtitleFull.length; i++) {
      const ch = subtitleFull[i];
      await sleep(45);
      typed += ch;
      typedEl.textContent = typed;

      if (ch === " " && i !== 0) {
        await sleep(80);
      }
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Other options toggle
  btnOther?.addEventListener("click", () => {
    const currentlyHidden = emailWrap.hidden;
    emailWrap.hidden = !currentlyHidden; // toggle
    if (!emailWrap.hidden) {
      // restart animation
      emailWrap.style.animation = "none";
      void emailWrap.offsetHeight;
      emailWrap.style.animation = "";
    }
  });

  // Email sheet open
  btnEmail?.addEventListener("click", () => {
    openEmailModal();
  });

  function openEmailModal() {
    if (!emailModal) return;
    emailModal.setAttribute("aria-hidden", "false");
  }

  function closeEmailModal() {
    if (!emailModal) return;
    emailModal.setAttribute("aria-hidden", "true");
  }

  btnEmailClose?.addEventListener("click", closeEmailModal);
  emailModal?.addEventListener("click", (e) => {
    const t = e.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute("data-close-email") === "true") closeEmailModal();
  });

  // Demo email sign-in: sets auth.user then closes modal
  btnEmailDemoSignIn?.addEventListener("click", () => {
    const user = { provider: "email", uid: "demo_email_uid", ts: Date.now() };
    localStorage.setItem(KEY_AUTH_USER, JSON.stringify(user));
    closeEmailModal();

    // notify router
    window.dispatchEvent(new StorageEvent("storage", { key: KEY_AUTH_USER }));
  });

  // Google/Apple already wired by root-router.js in your flow, but we also support here
  btnGoogle?.addEventListener("click", () => {
    localStorage.setItem(KEY_AUTH_USER, JSON.stringify({ provider: "google", uid: "demo_google_uid", ts: Date.now() }));
    window.dispatchEvent(new StorageEvent("storage", { key: KEY_AUTH_USER }));
  });

  btnApple?.addEventListener("click", () => {
    localStorage.setItem(KEY_AUTH_USER, JSON.stringify({ provider: "apple", uid: "demo_apple_uid", ts: Date.now() }));
    window.dispatchEvent(new StorageEvent("storage", { key: KEY_AUTH_USER }));
  });

  // Kick typing once
  typeSubtitle();
})();
