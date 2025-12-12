// assets/js/auth.js
import { auth, googleProvider, appleProvider } from "./firebase-init.js";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
  signInWithPopup,
  fetchSignInMethodsForEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

function mapAuthError(err) {
  const code = err?.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "This email address looks invalid.";
    case "auth/user-not-found":
      return "No account found for this email.";
    case "auth/wrong-password":
      return "Incorrect password. Please try again.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    case "auth/email-already-in-use":
      return "That email is already in use. Try signing in.";
    case "auth/network-request-failed":
      return "Network error. Check your internet connection.";
    case "auth/popup-closed-by-user":
      return "Sign-in popup closed.";
    case "auth/cancelled-popup-request":
      return "Popup request cancelled.";
    case "auth/popup-blocked":
      return "Popup blocked by browser. Allow popups and try again.";
    case "auth/account-exists-with-different-credential":
      return "Account exists with a different sign-in method. Try Google/Apple, or reset password.";
    default:
      return err?.message || "Auth failed. Please try again.";
  }
}

export const FynxAuth = (() => {
  let busy = false;
  const listeners = new Set();

  function emit(evt) {
    listeners.forEach((cb) => {
      try { cb(evt); } catch (_) {}
    });
  }

  function setBusy(v) {
    busy = !!v;
    emit({ type: "busy", busy });
  }

  function message(text) {
    emit({ type: "message", message: text });
  }

  function ensureEmail(email) {
    const e = (email || "").trim();
    if (!e.includes("@") || !e.includes(".")) throw new Error("Please enter a valid email address.");
    return e;
  }

  function ensurePassword(pw) {
    const p = (pw || "").trim();
    if (p.length < 6) throw new Error("Password must be at least 6 characters.");
    return p;
  }

  // Keep router in sync
  onAuthStateChanged(auth, (user) => {
    emit({ type: "auth", user: user || null });
  });

  return {
    subscribe(cb) {
      listeners.add(cb);
      // immediately publish current busy state
      cb({ type: "busy", busy });
      return () => listeners.delete(cb);
    },

    async signIn(email, password) {
      setBusy(true);
      try {
        const e = ensureEmail(email);
        const p = (password || "").trim();
        if (!p) throw new Error("Please enter your password.");

        const cred = await signInWithEmailAndPassword(auth, e, p);

        // Block if not verified (matches your iOS behavior)
        if (cred?.user && !cred.user.emailVerified) {
          await fbSignOut(auth);
          message("Please verify your email, then try signing in.");
          throw new Error("Email not verified.");
        }

        message(""); // clear
        return cred.user;
      } catch (err) {
        const msg = mapAuthError(err);
        if (msg) message(msg);
        throw new Error(msg);
      } finally {
        setBusy(false);
      }
    },

    async signUp(email, password) {
      setBusy(true);
      try {
        const e = ensureEmail(email);
        const p = ensurePassword(password);

        const cred = await createUserWithEmailAndPassword(auth, e, p);

        // Send verification then sign out (matches your iOS behavior)
        await sendEmailVerification(cred.user);
        await fbSignOut(auth);

        message(`Verification email sent to ${e}. Open Mail, verify, then Sign In.`);
        return true;
      } catch (err) {
        const msg = mapAuthError(err);
        if (msg) message(msg);
        throw new Error(msg);
      } finally {
        setBusy(false);
      }
    },

    async sendPasswordReset(email) {
      setBusy(true);
      try {
        const e = ensureEmail(email);

        // Optional: check if account exists to give nicer message
        // (still safe even if you skip this)
        try {
          const methods = await fetchSignInMethodsForEmail(auth, e);
          if (!methods || methods.length === 0) {
            const m = "No account found for this email.";
            message(m);
            throw new Error(m);
          }
        } catch (_) {
          // ignore and just attempt reset
        }

        await sendPasswordResetEmail(auth, e);
        message("Reset link sent. Check your inbox.");
        return true;
      } catch (err) {
        const msg = mapAuthError(err);
        if (msg) message(msg);
        throw new Error(msg);
      } finally {
        setBusy(false);
      }
    },

    async signOut() {
      setBusy(true);
      try {
        await fbSignOut(auth);
        message("");
        return true;
      } catch (err) {
        const msg = mapAuthError(err);
        if (msg) message(msg);
        throw new Error(msg);
      } finally {
        setBusy(false);
      }
    },

    // Google web popup
    async signInWithGooglePopup() {
      setBusy(true);
      try {
        const cred = await signInWithPopup(auth, googleProvider);
        message("");
        return cred.user;
      } catch (err) {
        const msg = mapAuthError(err);
        if (msg) message(msg);
        throw new Error(msg);
      } finally {
        setBusy(false);
      }
    },

    // Apple on Web usually requires a custom flow (redirect or provider + OAuth setup)
    // If you later do Apple sign-in on web, we’ll implement signInWithRedirect or popup properly.
    appleProvider
  };
})();
