import './account-sync-core.js?v=20261114-consistency-1';
import './account-sync-mapping.js?v=20261114-consistency-1';
import {app,auth,authPersistenceReady} from '../../auth/firebase.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js';
const callable=httpsCallable(getFunctions(app,'us-central1'),'fynxAccountSync',{timeout:30000});
const listeners=new Set();
export const sync=new globalThis.FynxAccountSyncCore.Store({storage:localStorage,call:async payload=>{await auth.authStateReady();if(auth.currentUser?.uid!==payload.expectedUid)throw Error('Your account changed.');const result=await callable(payload);if(auth.currentUser?.uid!==payload.expectedUid)throw Error('Your account changed.');return result.data;},changed:()=>{for(const fn of listeners)try{fn(sync);}catch(error){console.error('Account view could not refresh',error);}window.dispatchEvent(new CustomEvent('fynx:account-sync',{detail:{uid:sync.uid,status:sync.status}}));}});
export const subscribe=fn=>{listeners.add(fn);fn(sync);return()=>listeners.delete(fn);};
export async function requireSync(uid=auth.currentUser?.uid){await connected;if(!uid||auth.currentUser?.uid!==uid||sync.uid!==uid)throw Error('Sign in to your FYNX account.');if(!sync.ready)await sync.refresh();if(!sync.ready)throw Error(sync.error||'Account sync is unavailable.');return sync;}
export async function save(domain,id,data,options={}){const uid=auth.currentUser?.uid;await requireSync(uid);return sync.save(domain,id,data,options);}
export async function saveMany(changes){await requireSync();return sync.saveMany(changes);}
export const remove=(domain,id)=>save(domain,id,null,{deleted:true});
export const accountData=(domain,id='default')=>sync.record(domain,id)?.data||null;
export async function stableID(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export const storyID=value=>stableID(globalThis.FynxAccountSyncMapping.canonicalStoryURL(value));
export const imports=new Map();
export function offerImport(id,label,read){imports.set(id,{label,read});window.dispatchEvent(new Event('fynx:account-imports'));}
export async function membership(){await requireSync();return (await callable({action:'membership',expectedUid:sync.uid})).data;}
let identity=0;
export const connected=(async()=>{await authPersistenceReady;await auth.authStateReady();let desired;async function changed(user){const version=++identity,uid=user&&!user.isAnonymous?user.uid:null;desired=uid;if(sync.uid!==uid)sync.switchUser(null,null);const scope=uid?'fynx.account.sync.v1.'+await stableID(uid):null;if(version!==identity)return;await sync.switchUser(uid,scope);}const initial=changed(auth.currentUser);onAuthStateChanged(auth,user=>{if((user&&!user.isAnonymous?user.uid:null)!==desired)changed(user);});await initial;})();
window.FynxAccountSync={sync,subscribe,save,saveMany,remove,requireSync,accountData,stableID,storyID,offerImport,imports,membership,connected};
window.addEventListener('online',()=>sync.refresh());window.addEventListener('focus',()=>sync.refresh());document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync.refresh();});setInterval(()=>{if(!document.hidden&&sync.uid&&!sync.pending.length)sync.refresh();},20000);
function badge(){if(!document.body||document.getElementById('account-sync-badge')||location.pathname==='/workspace.html')return;const a=document.createElement('a');a.id='account-sync-badge';a.href='/workspace.html';a.hidden=true;a.setAttribute('role','status');a.style.cssText='position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:900;max-width:calc(100vw - 32px);padding:10px 16px;background:#111614;color:#f4f6f3;border:1px solid #2c3530;border-radius:10px;font:600 14px/1.3 system-ui,-apple-system,sans-serif;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.25)';document.body.append(a);subscribe(s=>{/* Only show something the person can act on; a healthy sync stays silent. */const text=!s.uid?'':s.status==='conflict'?'Saved work changed on another device · Review':s.status==='recovery'||(s.error&&s.status!=='synced'&&s.status!=='loading')?'Saved work could not sync · Open My workspace':'';a.textContent=text;a.hidden=!text;});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',badge,{once:true});else badge();
