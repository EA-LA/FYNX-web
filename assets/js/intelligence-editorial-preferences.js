import {sync, subscribe, save, requireSync} from './account-sync.js?v=20261115-intelligence-1';

const host = document.getElementById('intelligence-preferences');
if (host) {
  const categories = [['world','World events'],['politics','Government & politics'],['markets','Global markets'],['companies','Stocks & companies'],['crypto','Crypto'],['technology','Technology & AI'],['economics','Economics & central banks']];
  const slots = [['morning','Morning brief'],['midday','Midday brief'],['evening','Evening brief']];
  const modes = [['essential','Essential'],['balanced','Balanced'],['all','All News']];
  const node = (tag,text) => {const e = document.createElement(tag); if (text !== undefined) e.textContent = text; return e;};
  const form = node('form'), status = node('p'), submit = node('button','Save intelligence choices');
  status.setAttribute('role','status'); status.className = 'editorial-status'; submit.type = 'submit'; submit.className = 'btn';
  const inputs = new Map(), dirty = new Set(); let owner = null, baseRevision = 0, saving = false;
  const value = (data,path) => path.split('.').reduce((v,k) => v?.[k],data);
  function changed(key) {
    if (!dirty.size) baseRevision = sync.record('notificationPreferences','default')?.revision || 0;
    dirty.add(key); status.textContent = 'Changes are ready to save.';
  }
  const modeLabel = node('label','Delivery mode'), mode = node('select'); mode.name = 'mode'; mode.id = 'editorial-mode'; modeLabel.htmlFor = mode.id;
  for (const [key,title] of modes) {const option=node('option',title); option.value=key; mode.append(option);}
  mode.addEventListener('change',()=>changed('mode')); inputs.set('mode',mode); form.append(modeLabel,mode);
  function group(title,choices,prefix) {
    const fieldset=node('fieldset'); fieldset.append(node('legend',title));
    for(const [key,label] of choices) {
      const row=node('label'), input=node('input'); input.type='checkbox'; input.name=prefix+'.'+key;
      input.addEventListener('change',()=>changed(input.name)); inputs.set(input.name,input); row.append(input,document.createTextNode(label)); fieldset.append(row);
    }
    form.append(fieldset);
  }
  group('Coverage',categories,'categories'); group('Market briefs',slots,'briefs');
  form.append(submit,status); host.append(form);
  function paint(s) {
    if(owner !== s.uid) {owner=s.uid; dirty.clear(); baseRevision=0; saving=false; status.textContent='';}
    const record=s.record('notificationPreferences','default'), data=record?.data?.intelligence || {};
    for(const [key,input] of inputs) {
      input.disabled=!s.uid||!s.ready||saving;
      if(dirty.has(key)) continue;
      const saved=value(data,key);
      if(key==='mode') input.value=modes.some(([m])=>m===saved)?saved:'balanced';
      else input.checked=typeof saved==='boolean'?saved:key==='briefs.morning'||key.startsWith('categories.');
    }
    submit.disabled=!s.uid||!s.ready||saving;
    if(!s.uid) status.textContent='Sign in to change your shared intelligence choices.';
    else if(!s.ready) status.textContent='Loading your account preferences…';
    else if(dirty.size && record?.revision !== baseRevision) status.textContent='Your account changed on another device. Saving will check for a conflict.';
    else if(!dirty.size && !record?.data?.intelligence) status.textContent='These are suggested defaults. Nothing changes until you edit and save a choice.';
  }
  subscribe(paint);
  form.addEventListener('submit',async event=>{
    event.preventDefault(); if(saving||!dirty.size) return;
    const uid=sync.uid, revision=baseRevision, patch={};
    for(const key of dirty) {
      const input=inputs.get(key); if(!input) continue;
      if(key==='mode') {if(!modes.some(([m])=>m===input.value)){status.textContent='Choose a supported delivery mode.';return;} patch.mode=input.value;}
      else {const [group,name]=key.split('.'); (patch[group]??={})[name]=input.checked;}
    }
    saving=true; paint(sync);
    try {
      await requireSync(uid); if(!uid||sync.uid!==uid) throw Error('Your account changed.');
      await save('notificationPreferences','default',{intelligence:patch},{expectedRevision:revision});
      if(sync.uid!==uid) return;
      dirty.clear(); status.textContent=sync.status==='synced'?'Intelligence choices saved to your account.':'Choices saved locally. Account synchronization is pending.';
    } catch(error) {if(sync.uid===uid) status.textContent=error.message||'Your choices could not be saved. Try again.';}
    finally {if(sync.uid===uid){saving=false;paint(sync);}}
  });
}
