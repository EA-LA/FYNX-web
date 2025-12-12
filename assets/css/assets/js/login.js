// assets/js/login.js
import { FynxAuth } from "./auth.js";

(() => {
  const subtitleFull = "Trade Beyond Limits";
  const typedEl = document.getElementById("typedText");

  const btnOther = document.getElementById("btnOtherOptions");
  const emailWrap = document.getElementById("emailWrap");

  const btnGoogle = document.getElementById("btnLoginGoogle");
  const btnApple  = document.getElementById("btnLoginApple");

  // -------------------------------
  // Typing animation (matches iOS)
  // -------------------------------
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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -------------------------------
  // Other options → Email
  // -------------------------------
  btnOther?.addEventListener("click", () => {
    const hidden = emailWrap?.hidden ?? true;
    if (emailWrap) emailWrap.hidden = !hidden;

    if (emailWrap && !emailWrap.hidden) {
      // retrigger animation
      emailWrap.style.animation = "none";
      void emailWrap.offsetHeight;
      emailWrap.style.animation = "";
    }
  });

  // -------------------------------
  // Google Sign-In (popup)
  // -------------------------------
  btnGoogle?.addEventListener("click", async () => {
    try {
      await FynxAuth.signInWithGooglePopup();
      // router will switch to app automatically
    } catch (e) {
      console.warn("[Google sign-in]", e?.message || e);
      // message is shown via auth.js → subscribe()
    }
  });

  // -------------------------------
  // Apple Sign-In (WEB)
  // -------------------------------
  btnApple?.addEventListener("click", () => {
    // Apple Sign-In on web requires redirect + Apple Services ID
    // We intentionally block it for now to avoid broken UX
    alert(
      "Apple Sign-In on web is not enabled yet.\n\n" +
      "Please use Email or Google. Apple works fully in the iOS app."
    );
  });

  // Start typing effect
  typeSubtitle();
})();

