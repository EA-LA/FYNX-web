import {auth,app} from '../../auth/firebase.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const status=document.getElementById('homeStatsStatus');
function render(trades,available=false){
 const values=trades.map(t=>t.pl??t.pnl);
 const complete=available&&values.every(value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value)));
 const pnl=complete?values.reduce((sum,value)=>sum+Number(value),0):null;
 document.getElementById('homePnl').textContent=pnl===null?'—':pnl.toLocaleString('en-US',{style:'currency',currency:'USD'});
 document.getElementById('homeTrades').textContent=trades.length;
 document.getElementById('homeWinRate').textContent=complete&&trades.length?(values.filter(value=>Number(value)>0).length/trades.length*100).toFixed(1)+'%':'—';
 return complete;
}
const retry = document.getElementById('homeJournalRetry');
let stop, epoch = 0, userForView = null;

function showRetry(visible, loading = false) {
 if (!retry) return;
 retry.hidden = !visible;
 retry.disabled = loading;
 retry.textContent = loading ? 'Reconnecting…' : 'Retry journal sync';
}

function connect(user, manual = false) {
 // Every new subscription invalidates callbacks from the prior user or attempt.
 const request = ++epoch;
 stop?.();
 stop = null;
 showRetry(manual && !!user, manual && !!user);
 render([]);
 if (!user) {
  status.textContent = 'Sign in to load your results.';
  return;
 }
 status.textContent = manual ? 'Reconnecting to your saved journal…' : 'Loading your saved journal…';
 const failed = () => {
  if (request !== epoch) return;
  stop?.();
  stop = null;
  // Preserve the last verified figures, but label them as potentially stale.
  status.textContent = 'Journal sync unavailable. Displayed figures may be out of date. Retry to reconnect.';
  showRetry(true);
 };
 try {
  stop = onSnapshot(
   collection(getFirestore(app), 'users', user.uid, 'trades'),
   snapshot => {
    if (request !== epoch) return;
    const complete = render(snapshot.docs.map(d => d.data()), true);
    status.textContent = !complete
     ? 'Some trades have no recorded realized P/L. Complete those records in Journal to view your results.'
     : snapshot.empty ? 'Record your first trade in Journal.' : 'Synced with your saved journal';
    showRetry(false);
   },
   failed
  );
 } catch {
  failed();
 }
}

render([]);
showRetry(false);
onAuthStateChanged(auth, user => {
 userForView = user;
 connect(user);
});
retry?.addEventListener('click', () => {
 const user = auth.currentUser;
 if (!user || user.uid !== userForView?.uid) {
  // Do not reconnect the old account while Firebase is changing sessions.
  userForView = user || null;
  connect(userForView);
  return;
 }
 connect(user, true);
});
