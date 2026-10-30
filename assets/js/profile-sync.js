/* Profile reads the same account document and trades as Settings and Journal. */
import { auth, app } from '../../auth/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, doc, collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const db = getFirestore(app);
let subscriptions = [];
let epoch = 0;
function render() { window.renderProfile?.(); }
function status(message) { const el = document.getElementById('profileSyncStatus'); if(el) el.textContent = message; }
onAuthStateChanged(auth, user => {
  const request = ++epoch;
  subscriptions.forEach(stop => stop()); subscriptions = [];
  window.FynxProfileState = { uid: user?.uid || null, email: user?.email || '', profile: null, metrics: null };
  if (!user) { status('Sign in to load your account profile and journal statistics.'); render(); return; }
  const memberSince = user.metadata?.creationTime && Number.isFinite(Date.parse(user.metadata.creationTime)) ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, {month:'short',year:'numeric'}) : '—';
  window.FynxProfileState.profile = {name:user.displayName || 'FYNX User',avatarDataUrl:user.photoURL || '',description:'',memberSince};
  render();
  subscriptions.push(onSnapshot(doc(db,'users',user.uid,'account','profile'), snapshot => {
    if (request !== epoch) return;
    const p = snapshot.data() || {};
    window.FynxProfileState.profile = {name:p.displayName || user.displayName || 'FYNX User',avatarDataUrl:p.photoURL || user.photoURL || '',description:p.bio || '',memberSince};
    render();
  }, () => { if (request === epoch) status('Profile sync unavailable. Check your connection and account access.'); }));
  subscriptions.push(onSnapshot(collection(db,'users',user.uid,'trades'), snapshot => {
    if (request !== epoch) return;
    const trades = snapshot.docs.map(d=>d.data());
    const recorded = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
    const returns = trades.map(t=>t.returnPct ?? t.pnlPct).filter(recorded).map(Number);
    const results = trades.map(t=>t.pl ?? t.pnl), complete = results.every(recorded);
    const wins = results.filter(value=>recorded(value)&&Number(value)>0).length;
    window.FynxProfileState.metrics = {total:trades.length,winRate:complete&&trades.length?wins/trades.length*100:null,avgReturn:returns.length?returns.reduce((a,b)=>a+b,0)/returns.length:null,memberSince};
    status('Statistics from your saved journal. Average return appears when return percentages are recorded.');render();
  }, () => {if(request!==epoch)return;window.FynxProfileState.metrics=null;status('Journal statistics unavailable. Check your connection and account access.');render();}));
});
