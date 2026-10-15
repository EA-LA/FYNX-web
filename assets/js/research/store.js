import {C,$,escape,toast,download} from './shared.js';
class ResearchStore extends EventTarget {
  state=C.defaultState();key=null;ready=false;readOnly=false;reason='';raw=null;
  async initialize() {
    const module=import('/auth/firebase.js');
    try {
      const {auth}=await Promise.race([module,new Promise((_,reject)=>setTimeout(()=>reject(Error('Account connection unavailable')),7000))]);
      const {onAuthStateChanged}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
      onAuthStateChanged(auth,user=>{this.switchScope(user?.uid||null).catch(()=>this.switchScope(null));},()=>this.switchScope(null));
    }catch {await this.switchScope(null);}
    addEventListener('storage',event=>{if(event.key===this.key)this.read();});
  }
  async switchScope(uid) {
    const generation=(this.generation||0)+1;this.generation=generation;
    this.ready=false;
    const scope=uid?[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid)))].map(b=>b.toString(16).padStart(2,'0')).join(''):'guest';
    if(this.generation!==generation)return;
    this.key='fynx.research.v1.'+scope;this.account=!!uid;this.ready=true;this.read();
  }
  read() {
    this.readOnly=false;this.reason='';this.raw=null;
    try {this.raw=localStorage.getItem(this.key);this.state=this.raw===null?C.defaultState():C.validateState(JSON.parse(this.raw));}
    catch {this.state=C.defaultState();this.readOnly=true;this.reason='Saved workspace data could not be read. Your original data is preserved. Export a recovery copy before resetting this workspace.';}
    this.dispatchEvent(new Event('change'));
  }
  async transact(update,expected=this.key) {
    if(!this.ready||!this.key)throw Error('Your local workspace is still opening. Please try again.');
    if(this.readOnly)throw Error('This workspace is read-only until the saved data is recovered or reset.');
    const run=()=>{
      if(this.key!==expected)throw Error('The account changed. Please try again in the current workspace.');
      let next;
      try {const raw=localStorage.getItem(expected);next=raw===null?C.defaultState():C.validateState(JSON.parse(raw));}
      catch{this.read();throw Error('Saved data changed or could not be read. Nothing was overwritten.');}
      const result=update(next);
      next.revision++;C.validateState(next);
      try{localStorage.setItem(expected,JSON.stringify(next));}catch{throw Error('Browser storage is full or blocked. This change was not saved. Export a backup and free space.');}
      this.state=next;this.dispatchEvent(new Event('change'));return result;
    };
    return navigator.locks? navigator.locks.request(expected,run):run();
  }
}
export const store=new ResearchStore();
store.addEventListener('change',()=>{
  $('#storage-status').textContent=`${store.account?'Account':'Guest'} workspace · Saved in this browser only`;
  const warning=$('#storage-warning');warning.hidden=!store.readOnly;
  warning.innerHTML=store.readOnly?`${escape(store.reason)} <div class="actions"><button class="secondary" id="recover-workspace">Export recovery copy</button><button class="secondary" id="reset-workspace">Reset saved workspace</button></div>`:'';
});
$('#storage-warning').addEventListener('click',async event=>{
  if(event.target.id==='recover-workspace')download('fynx-research-recovery.txt',store.raw??'No readable stored data.','text/plain');
  if(event.target.id==='reset-workspace'&&confirm('Reset this local research workspace? Export a recovery copy first. This removes only this workspace’s saved positions, lists and alerts.')){
    try{localStorage.removeItem(store.key);store.read();toast('A new local workspace is ready.');}catch{toast('Browser storage is blocked.');}
  }
});
$('#export-workspace').addEventListener('click',()=>{
  if(!store.ready){toast('Your workspace is still opening.');return;}
  download(`fynx-research-${new Date().toISOString().slice(0,10)}.json`,store.readOnly?(store.raw||''):JSON.stringify(store.state,null,2));
});
$('#import-workspace-button').addEventListener('click',()=>$('#import-workspace').click());
$('#import-workspace').addEventListener('change',async event=>{
  const file=event.target.files[0],scope=store.key;event.target.value='';if(!file)return;
  try {
    if(file.size>1000000)throw Error('Workspace backups must be smaller than 1 MB.');
    const state=C.validateState(JSON.parse(await file.text()));
    if(!confirm(`Replace this local workspace with ${state.holdings.length} positions, ${state.companies.length} companies and ${state.alerts.length} alerts? Existing data will be replaced.`))return;
    await store.transact(next=>{for(const key of Object.keys(C.defaultState()))next[key]=state[key];},scope);toast('Workspace imported. Quotes will refresh when you open each tool.');
  }catch(error){toast(error.message);}
});
