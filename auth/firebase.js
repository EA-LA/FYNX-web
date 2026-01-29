// /auth/firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";


const firebaseConfig = {
  apiKey: "AIzaSyDGSYIB_YIpbWyUMJ1d-v00-xADnvaWckk",
  authDomain: "fynx-c7a28.firebaseapp.com",
  projectId: "fynx-c7a28",
  appId: "1:1011050657868:web:2c5ad5a1b275e669b05ce9"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
