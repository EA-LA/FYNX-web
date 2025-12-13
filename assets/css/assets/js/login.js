// assets/js/login.js
import { FynxAuth } from "./auth.js";

(() => {
  const subtitleFull = "Trade Beyond Limits";
  const typedEl = document.getElementById("typedText");

  const btnOther = document.getElementById("btnOtherOptions");
  const emailWrap = document.getElementById("emailWrap");

  const btnGoogle = document.getElementById("btnLoginGoogle");
  const btnApple  = document.getElementById("btnLoginApple");
  const btnEmail  = document.getElementById("btnLoginEmail");

  // Existing transition overlay from index/app.html
  const authTransition = document.getElementById("authTransition");
  const authMsg = document.getElementById("authMsg");

  // -------------------------------
  // Helpers
  // -------------------------------
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setBtnLoading(btn, loading, label) {
    if (!btn) return;
    btn.disabled = !!loading;
    btn.setAttribute("aria-busy", loading ? "true" : "false");
    btn.style.opacity = loading ? "0.85" : "";
    btn.style.pointerEvents = loading ? "none" : "";

    const labelEl = btn.querySelector(".btnLabel");
    const iconEl = btn.querySelector(".btnIcon");

    if (labelEl && label) labelEl.textContent = label;

    // Add a tiny inline spinner without changing HTML structure
    if (loading) {
      btn.dataset._prevLabel = labelEl ? labelEl.textContent : "";
      if (!btn.querySelector(".fynxSpinner")) {
        const sp = document.createElement("span");
        sp.className = "fynxSpinner";
        sp.style.width = "14px";
        sp.style.height = "14px";
        sp.style.borderRadius = "999px";
        sp.style.border = "2px solid rgba(255,255,255,.35)";
        sp.style.borderTopColor = "rgba(255,255,255,.95)";
        sp.style.display = "inline-block";
        sp.style.marginLeft = "10px";
        sp.style.animation = "fynxSpin .8s linear infinite";
        btn.appendChild(sp);

        // inject keyframes once
        if (!document.getElementById("fynxSpinStyle")) {
          const style = document.createElement("style");
          style.id = "fynxSpinStyle";
          style.textContent = `
            @keyframes fynxSpin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
          `;
          document.head.appendChild(style);
        }
      }
      if (iconEl) iconEl.style.opacity = "0.65";
    } else {
      const sp = btn.querySelector(".fynxSpinner");
      if (sp) sp.remove();
      if (iconEl) iconEl.style.opacity = "";
    }
  }

  function triggerTransition(message) {
    if (!authTransition) return;
    if (authMsg && message) authMsg.textContent = message;
    authTransition.setAttribute("aria-hidden", "false");
    // If auth resolves fast, router will swap screens; we still auto-hide.
    setTimeout(() => authTransition.setAttribute("aria-hidden", "true"), 5000);
  }

  function getNextRoute() {
    // Supports: app.html#login?next=app  (future-proof)
    const raw = (location.hash || "").replace("#", "");
    const query = raw.split("?")[1] || "";
    const params = new URLSearchParams(query);
    return (params.get("next") || "").toLowerCase();
  }

  function softShake(el) {
    if (!el) return;
    el.style.animation = "none";
    void el.offsetHeight;
    el.style.animation = "fynxShake .28s ease-in-out";
    if (!document.getElementById("fynxShakeStyle")) {
      const style = document.createElement("style");
      style.id = "fynxShakeStyle";
      style.textContent = `
        @keyframes fynxShake {
          0%{transform:translateX(0)}
          25%{transform:translateX(-6px)}
          50%{transform:translateX(6px)}
          75%{transform:translateX(-4px)}
          100%{transform:translateX(0)}
        }
      `;
      document.head.appendChild(style);
    }
  }

  function showAppleNotReady() {
    // Prefer your existing authAlert modal if it exists (from signin.html block)
    const authAlert = document.getElementById("authAlert");
    const authAlertMsg = document.getElementById("authAlertMsg");
    if (authAlert && authAlertMsg) {
      authAlertMsg.textContent =
        "Apple Sign-In on web is not enabled yet. Please use Google or Email. Apple works fully inside the iOS app.";
      authAlert.setAttribute("aria-hidden", "false");
      authAlert.hidden = false;
      return;
    }

    // Fallback
    alert(
      "Apple Sign-In on web is not enabled yet.\n\n" +
      "Please use Email or Google. Apple works fully in the iOS app."
    );
  }

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
      if (ch === " " && i !== 0) await sleep(80);
    }
  }

  // -------------------------------
  // Other options → Email
  // -------------------------------
  btnOther?.addEventListener("click", () => {
    const hidden = emailWrap?.hidden ?? true;
    if (emailWrap) emailWrap.hidden = !hidden;

    if (emailWrap && !emailWrap.hidden) {
      emailWrap.style.animation = "none";
      void emailWrap.offsetHeight;
      emailWrap.style.animation = "";
    }
  });

  // -------------------------------
  // Google Sign-In (popup)
  // -------------------------------
  btnGoogle?.addEventListener("click", async () => {
    setBtnLoading(btnGoogle, true, "Connecting…");
    setBtnLoading(btnApple, true, ""); // lock both to avoid double-clicks
    setBtnLoading(btnEmail, true, "");

    triggerTransition("Securing connection…");

    try {
      await FynxAuth.signInWithGooglePopup();

      // Optional: if you ever use #login?next=app, force hash after sign-in
      const next = getNextRoute();
      if (next === "app") {
        location.hash = "#app";
      }
      // router handles the rest
    } catch (e) {
      console.warn("[Google sign-in]", e?.message || e);
      softShake(btnGoogle);
      // auth.js will show message via subscribe()
    } finally {
      setBtnLoading(btnGoogle, false, "Continue with Google");
      setBtnLoading(btnApple, false, "Continue with Apple");
      setBtnLoading(btnEmail, false, "Continue with Email");
    }
  });

  // -------------------------------
  // Email Sign-In (opens your existing modal via signin.js)
  // -------------------------------
  // Note: your signin.js likely wires btnLoginEmail -> open modal.
  // Here we just add polish: transition + micro feedback.
  btnEmail?.addEventListener("click", () => {
    triggerTransition("Preparing email sign-in…");
    // let signin.js handle modal opening
    setTimeout(() => {
      // hide quickly so it feels snappy (modal is the next UI)
      if (authTransition) authTransition.setAttribute("aria-hidden", "true");
    }, 550);
  });

  // -------------------------------
  // Apple Sign-In (WEB placeholder)
  // -------------------------------
  btnApple?.addEventListener("click", () => {
    softShake(btnApple);
    showAppleNotReady();
  });

  // Start typing effect
  typeSubtitle();
})();
