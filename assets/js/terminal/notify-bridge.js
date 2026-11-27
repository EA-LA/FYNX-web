// Bridge between the Terminal (classic scripts) and FYNX's account notification system.
// Everything goes through the existing modules: account-system.js (notification engine: Firestore
// users/{uid}/notifications, preferences, de-duplication, burst limit, browser delivery) and account-sync.js
// (the account's private records: watchlists, notification preferences, Research Desk alert rules).
import {
  auth, bootstrapAccount, listenNotifications, markNotificationRead, markAllNotificationsRead, addNotification,
  getNotificationPreferences, saveNotificationPreferences, requestBrowserNotificationPermission
} from '../account-system.js?v=20261127-terminal-alerts-1';
import {sync, subscribe, save, accountData, connected} from '../account-sync.js?v=20261115-intelligence-1';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const ID = 'terminal-default';
const userCbs = new Set(), itemCbs = new Set(), accountCbs = new Set();
let user = null, off = null, prefs = null;

function accountState() {
  const records = sync.uid && user && sync.uid === user.uid ? sync.records('newsWatchlists') || [] : [];
  const followed = window.FynxAlertsCore.followedFrom(records);
  const rules = ((accountData('notificationPreferences')?.researchAlerts?.rules) || []).filter(r => r && r.enabled);
  return {followed, rules, prefs};
}
const emitAccount = () => { const s = accountState(); for (const cb of accountCbs) cb(s); };

onAuthStateChanged(auth, async u => {
  if (off) { off(); off = null; }
  user = u && !u.isAnonymous ? {uid: u.uid} : null; prefs = null;
  for (const cb of userCbs) cb(user);
  for (const cb of itemCbs) cb([]);
  if (!user) return emitAccount();
  try { await bootstrapAccount(u); } catch { return; }
  if (auth.currentUser?.uid !== user.uid) return;
  off = listenNotifications(user.uid, items => { if (auth.currentUser?.uid === user.uid) for (const cb of itemCbs) cb(items); }, 40, () => {});
  try { await connected; prefs = await getNotificationPreferences(user.uid); } catch { prefs = null; }
  emitAccount();
});
subscribe(() => emitAccount());

window.FynxNotifyBridge = {
  onUser(cb) { userCbs.add(cb); cb(user); },
  onNotifications(cb) { itemCbs.add(cb); },
  onAccount(cb) { accountCbs.add(cb); cb(accountState()); },
  markRead: id => markNotificationRead(auth.currentUser.uid, id, true),
  markAllRead: ids => markAllNotificationsRead(auth.currentUser.uid, ids),
  emit: payload => addNotification(auth.currentUser.uid, payload),
  async savePrefs(patch) { const uid = auth.currentUser?.uid; if (!uid) throw Error('Sign in first.'); const next = {...(await getNotificationPreferences(uid)), ...patch}; await saveNotificationPreferences(uid, next); prefs = next; emitAccount(); },
  requestDesktop: () => requestBrowserNotificationPermission(),
  terminalList: () => (accountData('newsWatchlists', ID)?.symbols || []).map(s => String(s).toUpperCase()),
  async saveTerminalList(symbols) { await save('newsWatchlists', ID, {name: 'Terminal watchlist', symbols, influencesNews: true}); emitAccount(); }
};
window.dispatchEvent(new Event('fynx:notify-bridge'));
