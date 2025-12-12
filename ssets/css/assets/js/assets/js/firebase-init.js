// assets/js/firebase-init.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 🔐 Firebase config (YOUR PROJECT)
const firebaseConfig = {
  apiKey: "AIzaSyDGSYIB_YIpbWyUMJ1d-v00-xADnvaWckk",
  authDomain: "fynx-c7a28.firebaseapp.com",
  databaseURL: "https://fynx-c7a28-default-rtdb.firebaseio.com",
  projectId: "fynx-c7a28",
  storageBucket: "fynx-c7a28.firebasestorage.app",
  messagingSenderId: "1011050657868",
  appId: "1:1011050657868:web:2c5ad5a1b275e669b05ce9",
  measurementId: "G-SDW6273VYJ"
};

// 🚀 Init Firebase
export const app = initializeApp(firebaseConfig);

// 🔑 Auth
export const auth = getAuth(app);

// Providers
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider("apple.com");

// Debug (remove later)
console.log("🔥 Firebase Web connected:", firebaseConfig.projectId);
