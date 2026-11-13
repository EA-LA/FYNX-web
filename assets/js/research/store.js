import {sync,subscribe,connected,saveMany,accountData,offerImport} from '../account-sync.js?v=20261113-world-ships-2';
import {C,$,escape,toast,download} from './shared.js';
class ResearchStore extends EventTarget {
  state=C.defaultState();key=null;ready=false;readOnly=false;reason='';raw=null;
  async initialize() {
    await connected;
    subscribe(s=>{if(this.uid!==s.uid){this.uid=s.uid;this.switchScope(s.uid);}else if(this.account){this.ready=s.ready;this.read();}});
    addEventListener('storage',event=>{if(!this.account&&event.key===this.key)this.read();});
  }
  async switchScope(uid) {
    const generation=(this.generation||0)+1;this.generation=generation;
    this.ready=false;
    const scope=uid?[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid)))].map(b=>b.toString(16).padStart(2,'0')).join(''):'guest';
    if(this.generation!==generation)return;
    this.key='fynx.research.v1.'+scope;this.account=!!uid;this.ready=!uid||sync.ready;this.read();
    if(uid)offerImport('research-local','Import this browser’s earlier Research Desk',()=>{const raw=localStorage.getItem(this.key);return raw?this.cloudChanges(C.validateState(JSON.parse(raw))):[];});
  }
  cloudChanges(next){
    const existing=accountData('portfolios','manual-default')||{};
    const unknown=(existing.holdings||[]).filter(h=>!C.symbolMap[h.symbol]);
    return [
      {domain:'portfolios',id:'manual-default',data:{kind:'manual',id:'manual-default',name:existing.name||'Research portfolio',currency:'USD',cash:next.cash,holdings:[...unknown,...next.holdings.map(h=>({...h,currency:'USD'}))]}},
      {domain:'newsWatchlists',id:'research-default',data:{name:'Research watchlist',symbols:next.watchlist,influencesNews:true}},
      {domain:'preferences',id:'default',data:{researchDesk:{companies:next.companies,filters:next.filters}}},
      {domain:'notificationPreferences',id:'default',data:{researchAlerts:{rules:next.alerts,history:next.history}}}
    ];
  }
  read() {
    this.readOnly=false;this.reason='';this.raw=null;
    if(this.account){
      const portfolio=accountData('portfolios','manual-default')||{},watch=accountData('newsWatchlists','research-default')||{},prefs=accountData('preferences')?.researchDesk||{},alerts=accountData('notificationPreferences')?.researchAlerts||{};
      const next={...C.defaultState(),cash:portfolio.cash??0,holdings:(portfolio.holdings||[]).filter(h=>C.symbolMap[h.symbol]).map(h=>({id:h.id,symbol:h.symbol,units:h.units,averageCost:h.averageCost??0})),watchlist:(watch.symbols||[]).filter(x=>C.symbolMap[x]),...(prefs.companies?{companies:prefs.companies}:{}),...(prefs.filters?{filters:prefs.filters}:{}),alerts:alerts.rules||[],history:alerts.history||[]};
      next.revision=Math.max(0,...['portfolios','newsWatchlists','preferences','notificationPreferences'].flatMap(d=>sync.records(d).map(r=>r.revision)));
      try{this.state=C.validateState(next);}catch{this.state=C.defaultState();this.readOnly=true;this.reason='This shared record uses fields this tool cannot edit. Open My workspace to review it. Your account data is preserved.';}
      if(!sync.ready){this.readOnly=true;this.reason=sync.error||'Loading your shared account.';}
      this.dispatchEvent(new Event('change'));return;
    }
    try {this.raw=localStorage.getItem(this.key);this.state=this.raw===null?C.defaultState():C.validateState(JSON.parse(this.raw));}
    catch {this.state=C.defaultState();this.readOnly=true;this.reason='Saved workspace data could not be read. Your original data is preserved. Export a recovery copy before resetting this workspace.';}
    this.dispatchEvent(new Event('change'));
  }
  async transact(update,expected=this.key) {
    if(!this.ready||!this.key)throw Error('Your local workspace is still opening. Please try again.');
    if(this.readOnly)throw Error('This workspace is read-only until the saved data is recovered or reset.');
    if(this.account){
      if(this.key!==expected)throw Error('Your account changed.');
      const next=JSON.parse(JSON.stringify(this.state)),before=this.cloudChanges(this.state),result=update(next);next.revision++;C.validateState(next);
      const changes=this.cloudChanges(next).filter((r,i)=>JSON.stringify(r.data)!==JSON.stringify(before[i].data));
      if(changes.length)await saveMany(changes);if(this.key!==expected)throw Error('Your account changed.');this.read();return result;
    }
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
  $('#storage-status').textContent=store.account?`Account workspace · ${sync.status==='synced'?'Shared with your iPhone':sync.error||sync.status}`:'Guest workspace · Saved in this browser only';
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
