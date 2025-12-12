import { auth } from "./firebase-init.js";

import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// Simple central “VM-like” auth object for your UI scripts
export const FynxAuth = (() => {
  let busy = false;

  // UI callbacks (router/signin can subscribe)
  const listeners = new Set();

  function emit(payload) {
    listeners.forEach((fn) => {
      try { fn(payload); } catch {}
    });
  }

  function setBusy(v) {
    busy = v;
    emit({ type: "busy", busy });
  }

  function mapError(err) {
    const code = err?.code || "";
    switch (code) {
      case "auth/email-already-in-use":
        return "That email is already in use. Try signing in.";
      case "auth/invalid-email":
        return "This email address looks invalid.";
      case "auth/weak-password":
        return "Password is too weak. Use at least 6 characters.";
      case "auth/wrong-password":
        return "Incorrect password. Please try again.";
      case "auth/user-not-found":
        return "No account found for this email.";
      case "auth/network-request-failed":
        return "Network error. Check your internet connection.";
      case "auth/popup-closed-by-user":
        return "Sign-in popup was closed.";
      case "auth/cancelled-popup-request":
        return "Popup request cancelled. Try again.";
      default:
        return err?.message || "Auth failed. Please try again.";
    }
  }

  function isValidEmail(s) {
    return typeof s === "string" && s.includes("@") && s.includes(".");
  }

  // ===== Email/Password =====

  async function signUp(email, password) {
    const e = (email || "").trim();
    const p = (password || "").trim();

    if (!isValidEmail(e)) throw new Error("Please enter a valid email address.");
    if (p.length < 6) throw new Error("Password must be at least 6 characters.");

    setBusy(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, e, p);
      await sendEmailVerification(result.user);
      // force sign out (same as your iOS logic)
      await fbSignOut(auth);
      emit({
        type: "message",
        message: `Verification email sent to ${e}. Open Mail, verify, then Sign In.`,
      });
    } catch (err) {
      throw new Error(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  async function signIn(email, password) {
    const e = (email || "").trim();
    const p = (password || "").trim();

    if (!isValidEmail(e)) throw new Error("Please enter a valid email address.");
    if (!p) throw new Error("Please enter your password.");

    setBusy(true);
    try {
      const result = await signInWithEmailAndPassword(auth, e, p);

      // enforce verified
      await result.user.reload();
      if (!result.user.emailVerified) {
        await fbSignOut(auth);
        throw new Error("Please verify your email, then try signing in.");
      }

      // success: router will see auth state change
      return result.user;
    } catch (err) {
      throw new Error(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await fbSignOut(auth);
      emit({ type: "message", message: null });
    } catch (err) {
      throw new Error(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordReset(email) {
    const e = (email || "").trim();
    if (!isValidEmail(e)) throw new Error("Please enter a valid email address.");

    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, e);
      emit({ type: "message", message: "Reset link sent. Check your inbox." });
    } catch (err) {
      throw new Error(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification(email, password) {
    const e = (email || "").trim();
    const p = (password || "").trim();
    if (!isValidEmail(e) || !p) throw new Error("Enter your email and password above, then tap Resend.");

    setBusy(true);
    try {
      const res = await signInWithEmailAndPassword(auth, e, p);
      await sendEmailVerification(res.user);
      await fbSignOut(auth);
      emit({ type: "message", message: "Verification email re-sent. Check your inbox." });
    } catch (err) {
      throw new Error(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  // ===== Google =====
  async function signInWithGoogle() {
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (err) {
      throw new Error(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  // ===== Apple (Firebase OAuthProvider apple.com) =====
  // NOTE: Apple sign-in on web requires Apple provider enabled in Firebase AND correct domains/redirects configured.
  async function signInWithApple() {
    setBusy(true);
    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
      await signInWithPopup(auth, provider);
    } catch (err) {
      throw new Error(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  // ===== Auth state listener =====
  function onState(cb) {
    const unsubscribe = onAuthStateChanged(auth, (user) => cb(user));
    return unsubscribe;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function isBusy() { return busy; }

  return {
    onState,
    subscribe,
    isBusy,
    signUp,
    signIn,
    signOut,
    sendPasswordReset,
    resendVerification,
    signInWithGoogle,
    signInWithApple,
  };
})();
