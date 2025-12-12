import { FynxAuth } from "./auth.js";

(() => {
  const subtitleFull = "Trade Beyond Limits";
  const typedEl = document.getElementById("typedText");

  const btnOther = document.getElementById("btnOtherOptions");
  const emailWrap = document.getElementById("emailWrap");

  const btnGoogle = document.getElementById("btnLoginGoogle");
  const btnApple = document.getElementById("btnLoginApple");

  async function typeSubtitle() {
    if (!typedEl) return;
    if (typedEl.textContent && typedEl.textContent.length > 0) return;

    let typed = "";
    for (let i = 0; i < subtitleFull.length; i++) {
      const ch = subtitleFull[i];
      await sleep(45);
      typed += ch;
      typedEl.textContent = typed;
      if (ch === " " && i !== 0) await sleep(80);
    }
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  btnOther?.addEventListener("click", () => {
    const currentlyHidden = emailWrap.hidden;
    emailWrap.hidden = !currentlyHidden;

    if (!emailWrap.hidden) {
      emailWrap.style.animation = "none";
      void emailWrap.offsetHeight;
      emailWrap.style.animation = "";
    }
  });

  btnGoogle?.addEventListener("click", async () => {
    try {
      await FynxAuth.signInWithGoogle();
    } catch (e) {
      // sign-in UI will show alert inside SignIn modal; here we just log
      console.warn(e?.message || e);
    }
  });

  btnApple?.addEventListener("click", async () => {
    try {
      await FynxAuth.signInWithApple();
    } catch (e) {
      console.warn(e?.message || e);
    }
  });

  typeSubtitle();
})();
