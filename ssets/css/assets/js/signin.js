import { FynxAuth } from "./auth.js";

(() => {
  const emailModal = document.getElementById("emailModal");
  if (!emailModal) return;

  const emailInput = document.getElementById("signinEmail");
  const passInput  = document.getElementById("signinPassword");
  const btnSignIn  = document.getElementById("btnSignIn");
  const btnGoBack  = document.getElementById("btnGoBack");
  const btnForgot  = document.getElementById("btnForgot");
  const btnShowSignUp = document.getElementById("btnShowSignUp");

  const btnText = document.getElementById("signinBtnText");
  const spinner = document.getElementById("signinSpinner");

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

  function showAuthAlert(msg){
    if (authAlertMsg) authAlertMsg.textContent = msg;
    openModal(authAlert);
  }

  function setBusy(isBusy){
    if (!btnSignIn) return;
    btnSignIn.disabled = isBusy;
    if (spinner) spinner.hidden = !isBusy;
    if (btnText) btnText.textContent = isBusy ? "" : "Sign In";
  }

  // Subscribe to busy state from auth layer
  FynxAuth.subscribe((evt) => {
    if (evt?.type === "busy") setBusy(!!evt.busy);
    if (evt?.type === "message" && evt.message) showAuthAlert(evt.message);
  });

  btnGoBack?.addEventListener("click", () => closeModal(emailModal));

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

  btnSendReset?.addEventListener("click", async () => {
    try {
      await FynxAuth.sendPasswordReset(forgotEmail.value || emailInput.value || "");
      closeModal(forgotModal);
      // message will show via subscribe()
    } catch (e) {
      showAuthAlert(e?.message || "Couldn’t send reset link.");
    }
  });

  // Sign up
  btnShowSignUp?.addEventListener("click", () => {
    signupEmail.value = emailInput.value || "";
    signupPassword.value = "";
    openModal(signupModal);
  });

  btnCreateAccount?.addEventListener("click", async () => {
    try {
      await FynxAuth.signUp(signupEmail.value, signupPassword.value);
      closeModal(signupModal);
      // message will show via subscribe()
    } catch (e) {
      showAuthAlert(e?.message || "Sign up failed.");
    }
  });

  // Sign in
  btnSignIn?.addEventListener("click", async () => {
    try {
      await FynxAuth.signIn(emailInput.value, passInput.value);
      closeModal(emailModal); // router will swap to app
    } catch (e) {
      showAuthAlert(e?.message || "Sign in failed.");
    }
  });

  // Enter key support (email -> password -> sign in)
  emailInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") passInput?.focus();
  });
  passInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnSignIn?.click();
  });
})();
