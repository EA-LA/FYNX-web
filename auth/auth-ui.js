import { auth, authPersistenceReady } from "./firebase.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

await authPersistenceReady;

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signupWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}
