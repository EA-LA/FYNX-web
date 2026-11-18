/* Terminal journal feed: the signed-in user's own trades, same source as Home. Read-only. */
import {auth, app} from '../../../auth/firebase.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore, collection, onSnapshot} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const publish = detail => { window.FynxTerminalJournal = detail; window.dispatchEvent(new CustomEvent('fx-journal', {detail})); };
let stop = null, epoch = 0;
publish({status: 'loading'});
onAuthStateChanged(auth, user => {
  const request = ++epoch;
  stop?.(); stop = null;
  if (!user) { publish({status: 'signed-out'}); return; }
  publish({status: 'loading'});
  stop = onSnapshot(collection(getFirestore(app), 'users', user.uid, 'trades'), snapshot => {
    if (request !== epoch) return;
    const trades = snapshot.docs.map(d => {
      const t = d.data(), pl = Number(t.pl ?? t.pnl);
      return {symbol: String(t.symbol || t.pair || t.instrument || '').slice(0, 16), pl: Number.isFinite(pl) ? pl : null, date: String(t.date || t.exitDate || t.entryDate || '').slice(0, 10), session: String(t.session || '').slice(0, 20), side: String(t.direction || t.side || '').slice(0, 8)};
    });
    publish({status: 'ready', trades});
  }, () => { if (request === epoch) publish({status: 'error'}); });
});
