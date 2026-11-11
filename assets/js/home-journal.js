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
let stop,epoch=0;
render([]);
onAuthStateChanged(auth,user=>{
 const request=++epoch;
 stop?.(); stop=null;
 render([]);
 if(!user){status.textContent='Sign in to load your results.';return;}
 status.textContent='Loading your saved journal…';
 stop=onSnapshot(collection(getFirestore(app),'users',user.uid,'trades'),snapshot=>{if(request!==epoch)return;const complete=render(snapshot.docs.map(d=>d.data()),true);status.textContent=!complete?'Some trades have no recorded realized P/L. Complete those records in Journal to view your results.':snapshot.empty?'Record your first trade in Journal.':'Synced with your saved journal';},()=>{if(request!==epoch)return;render([]);status.textContent='Journal sync unavailable. Please try again.';});
});
