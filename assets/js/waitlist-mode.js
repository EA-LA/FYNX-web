import { auth, app, authPersistenceReady } from "../../auth/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore(app);
const OWNER_EMAILS = ["owner@fynxfinanceworld.com", "admin@fynxfinanceworld.com"];
const PUBLIC_PATHS = new Set(["/", "/index.html", "/news.html", "/partners.html", "/risk-disclosure.html", "/affiliate-disclosure.html", "/contact.html", "/founder.html", "/trading-psychology.html", "/risk-management.html", "/trading-quizzes.html"]);
const PUBLIC_PREFIXES = ["/learn/", "/resources/"];
const AUTH_PATHS = new Set(["/auth/login.html", "/auth/signup.html"]);

function normalizedPath(){
  let path = window.location.pathname || "/";
  if (path.endsWith("/")) path += "index.html";
  return path;
}
function isPublicPath(path){ return PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((prefix)=>path.startsWith(prefix)); }
function waitlistUrl(){ return `/waitlist.html?source=${encodeURIComponent(window.location.pathname + window.location.search)}&locked=1`; }
export function isOwnerUser(user, claims = {}){
  const email = (user?.email || "").toLowerCase();
  return Boolean(user && (claims.admin === true || claims.owner === true || claims.role === "admin" || claims.role === "owner" || OWNER_EMAILS.includes(email)));
}
export async function getOwnerAccess(user){
  if (!user) return false;
  try {
    const token = await user.getIdTokenResult(true);
    if (isOwnerUser(user, token.claims || {})) return true;
  } catch (_) {}
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const data = snap.data() || {};
      if (data.admin === true || data.owner === true || data.role === "admin" || data.role === "owner") return true;
    }
  } catch (_) {}
  return isOwnerUser(user);
}
export function redirectToWaitlist(){ window.location.replace(waitlistUrl()); }
export async function protectCurrentRoute(){
  await authPersistenceReady;
  const path = normalizedPath();
  if (isPublicPath(path)) return;
  if (AUTH_PATHS.has(path) && new URLSearchParams(location.search).get("owner") === "1") return;
  if (AUTH_PATHS.has(path)) return redirectToWaitlist();
  onAuthStateChanged(auth, async (user)=>{
    if (!(await getOwnerAccess(user))) redirectToWaitlist();
    else document.documentElement.dataset.ownerAccess = "true";
  });
}
export async function joinWaitlist({ email, firstName = "", referralSource = "" }){
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Please enter a valid email address.");
  const safeId = normalizedEmail.replace(/[^a-z0-9._-]/gi, "_");
  const ref = doc(db, "waitlist", safeId);
  const existing = await getDoc(ref);
  if (existing.exists()) return { duplicate: true, position: existing.data()?.positionNumber || null };
  const platform = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "iOS" : /Android/i.test(navigator.userAgent) ? "Android" : "Web";
  await setDoc(ref, {
    email: normalizedEmail,
    firstName: String(firstName || "").trim(),
    signupDate: serverTimestamp(),
    referralSource: referralSource || new URLSearchParams(location.search).get("ref") || document.referrer || "direct",
    currentPage: window.location.pathname + window.location.search,
    sourcePage: new URLSearchParams(location.search).get("source") || window.location.pathname,
    devicePlatform: platform,
    userAgent: navigator.userAgent,
    status: "early_access_waitlist",
    positionNumber: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { duplicate: false, position: null };
}
window.FYNXWaitlist = { joinWaitlist, protectCurrentRoute };
