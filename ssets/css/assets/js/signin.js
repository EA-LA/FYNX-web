(() => {
  const KEY_AUTH_USER = "auth.user";

  // Email modal
  const emailModal = document.getElementById("emailModal");
  if (!emailModal) return;

  // Sign-in UI
  const emailInput = document.getElementById("signinEmail");
  const passInput  = document.getElementById("signinPassword");
  const btnSignIn  = document.getElementById("btnSignIn");
  const btnGoBack  = document.getElementById("btnGoBack");
  const btnForgot  = document.getElementById("btnForgot");
  const btnShowSignUp = document.getElementById("btnShowSignUp");

  const btnText = document.getElementById("signinBtnText");
  const spinner = document.getElementById("signinSpinner");

  // Modals
  const forgotModal = document.getElementById("forgotModal");
  const signupModal = document.getElementById("signupModal");
  const authAlert   = document.getElementById("authAlert");
  const authAlertMsg = document.getElementById("authAlertMsg");

  const forgotEmail = document.getElementById("forgotEmail");
  const btnSendReset = document.getElementById("btnSendReset");

  const signupEmail = document.getElementById("signupEmail");
  const signupPassword = document.getElementById("signupPassword");
  const btnCreateAccount = document.getElementById("btnCreateAccount");

  function openModal(el){ el?.setAttribute("aria-hidden","false"); }
  function closeModal(el){ el?.setAttribute("aria-hidden","true"); }

  // Close email modal = Go back
  btnGoBack?.addEventListener("click", () => closeModal(emailModal));

  // Backdrop / close handlers
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t || !t.getAttribute) return;

    if (t.getAttribute("data-close-email") === "true") closeModal(emailModal);
    if (t.getAttribute("data-close-forgot") === "true") closeModal(forgotModal);
    if (t.getAttribute("data-close-signup") === "true") closeModal(signupModal);
    if (t.getAttribute("data-close-authalert") === "true") closeModal(authAlert);
  });

  // Forgot password
  btnForgot?.addEventListener("click", () => {
    forgotEmail.value = emailInput.value || "";
    openModal(forgotModal);
  });

  btnSendReset?.addEventListener("click", () => {
    // Demo behavior (replace with Firebase Web sendPasswordResetEmail later)
    closeModal(forgotModal);
    showAuthAlert("If an account exists, a reset link has been sent (Demo).");
  });

  // Sign up
  btnShowSignUp?.addEventListener("click", () => {
    signupEmail.value = emailInput.value || "";
    signupPassword.value = "";
    openModal(signupModal);
  });

  btnCreateAccount?.addEventListener("click", async () => {
    // Demo account creation
    const e = (signupEmail.value || "").trim();
    const p = (signupPassword.value || "").trim();

    if (!isValidEmail(e)) return showAuthAlert("Please enter a valid email.");
    if (p.length < 6) return showAuthAlert("Password must be at least 6 characters.");

    closeModal(signupModal);
    showAuthAlert("Account created (Demo). You can now sign in.");
  });

  // Sign in (demo)
  btnSignIn?.addEventListener("click", async () => {
    const e = (emailInput.value || "").trim();
    const p = (passInput.value || "").trim();

    // match your Swift validation expectations
    if (!isValidEmail(e)) return showAuthAlert("Please enter a valid email.");
    if (p.length < 6) return showAuthAlert("Password must be at least 6 characters.");

    setBusy(true);

    // simulate network
    await sleep(650);

    // success => set auth user
    localStorage.setItem(KEY_AUTH_USER, JSON.stringify({
      provider: "email",
      uid: "demo_email_uid",
      email: e,
      ts: Date.now()
    }));

    setBusy(false);
    closeModal(emailModal);

    // notify router
    window.dispatchEvent(new StorageEvent("storage", { key: KEY_AUTH_USER }));
  });

  // Enter key support (email -> password -> sign in)
  emailInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") passInput?.focus();
  });
  passInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnSignIn?.click();
  });

  function setBusy(isBusy){
    if (!btnSignIn) return;
    btnSignIn.disabled = isBusy;
    if (spinner) spinner.hidden = !isBusy;
    if (btnText) btnText.textContent = isBusy ? "" : "Sign In";
  }

  function showAuthAlert(msg){
    if (authAlertMsg) authAlertMsg.textContent = msg;
    openModal(authAlert);
  }

  function isValidEmail(str){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  }

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
})();
