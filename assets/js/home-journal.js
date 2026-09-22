import {auth,app} from '../../auth/firebase.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const status=document.getElementById('homeStatsStatus');
function render(trades){
 const pnl=trades.reduce((sum,t)=>sum+(Number(t.pl??t.pnl)||0),0);
 document.getElementById('homePnl').textContent=pnl.toLocaleString('en-US',{style:'currency',currency:'USD'});
 document.getElementById('homeTrades').textContent=trades.length;
 document.getElementById('homeWinRate').textContent=trades.length?(trades.filter(t=>Number(t.pl??t.pnl)>0).length/trades.length*100).toFixed(1)+'%':'—';
}
let stop;
onAuthStateChanged(auth,user=>{
 stop?.();
 if(localStorage.getItem('mode')==='demo'){render([{pl:120},{pl:-45},{pl:90}]);status.textContent='Sample results · demo mode';return;}
 if(!user){status.textContent='Sign in to load your results.';return;}
 stop=onSnapshot(collection(getFirestore(app),'users',user.uid,'trades'),snapshot=>{render(snapshot.docs.map(d=>d.data()));status.textContent=snapshot.empty?'Record your first trade in Journal.':'Synced with your saved journal';},()=>{status.textContent='Journal sync unavailable. Please try again.';});
});
