let call;
const $=id=>document.getElementById(id);
const catalog=window.FynxProCatalog;
const riskFields=[['balance','Account balance','10000'],['riskPct','Risk per trade (%)','1'],['entry','Entry price','100'],['stop','Stop price','98'],['target','Target price','104'],['multiplier','Contract multiplier','1'],['rate','Quote → account conversion rate','1']];
const definitions={analytics:[],export:[],risk:riskFields,scenarios:riskFields,review:[['notes','Trade thesis and review','','textarea'],['plan','Entry plan defined',false,'checkbox'],['risk','Risk budget checked',false,'checkbox'],['event','Scheduled events checked',false,'checkbox'],['execution','Execution followed the plan',false,'checkbox'],['review','Outcome and lesson recorded',false,'checkbox']],watchlist:[['symbols','Symbols, separated by commas','AAPL, MSFT, BTCUSD','text'],['notes','Research notes (up to 2,000 characters)','','textarea']],portfolio:[['balance','Account equity','10000'],['shock','Price shock (%)','-5'],['positions','Positions: SYMBOL, signed value in account currency (one per line)','AAPL, 6000\nMSFT, 4000\nSPY, -2000','textarea']],simulation:[['balance','Starting equity','10000'],['riskPct','Risk per trade (%)','1'],['winRate','Assumed win rate (%)','45'],['rewardRisk','Assumed reward/risk','2'],['trades','Trades per path (1–500)','100']]};
let state={tier:null,plans:{}},selected='analytics',busy=false,user=null,authEpoch=0;
let inputRevision=0,hasCurrentResult=false,exportUrl=null,saveAttempt=null;
const checkoutToolKey='fynxProCheckoutTool';
// Keep unsaved inputs in this page only; never carry them across account changes.
const toolDrafts=new Map();
const checkoutOutcome=()=>new URLSearchParams(location.search).get('checkout');
function rememberTool(){try{sessionStorage.setItem(checkoutToolKey,selected);}catch{}}
const requestedTool=()=>{let key=new URLSearchParams(location.search).get('tool');if(['complete','cancelled'].includes(checkoutOutcome())){try{const saved=sessionStorage.getItem(checkoutToolKey);if(Object.hasOwn(catalog,saved))key=saved;}catch{}}return Object.hasOwn(catalog,key)?key:'analytics';};
const returnPath=()=>'/pro.html?tool='+selected+'#workbench';
const signInPath=()=>'/auth/login.html?returnTo='+encodeURIComponent(returnPath());
const title=k=>k.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase()).replace(/PL/g,'P/L');
// Position sizing returns values down to 0.000001; rounding units to 3 decimals can falsely show zero.
const fmt=(v,key)=>typeof v==='number'?v.toLocaleString(undefined,{maximumFractionDigits:key==='units'?6:3}):v===null?'—':String(v);
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function status(s){$('status').textContent=s;}
function clearExportUrl(){if(exportUrl){URL.revokeObjectURL(exportUrl);exportUrl=null;}}
function expireExport(url){
 if(!url||exportUrl!==url)return;
 clearExportUrl();hasCurrentResult=false;
 const area=$('result'),restoreFocus=area.contains(document.activeElement);
 area.replaceChildren(node('p','This temporary CSV download has expired. Run analysis again to generate a fresh export.'));
 if(restoreFocus)$('runTool').focus({preventScroll:true});
}
function freshSaveRequestId(){
 // The backend accepts UUID-shaped idempotency keys. Use browser cryptographic randomness only.
 const bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function invalidateResult(){
 inputRevision++;saveAttempt=null;
 if(!hasCurrentResult)return;
 hasCurrentResult=false;
 clearExportUrl();
 $('result').replaceChildren(node('p','Inputs changed. Run this tool again to update the result.'));
 status('Inputs changed. Run analysis again to update the result.');
}
function entitled(){return state.plans[state.tier]?.products.includes(selected);}
function updateNewsDraftLink(){
 $('newsDraftReturn')?.remove();
 if(!authEpoch)return;
 try{
  const key='fynx.news.researchDraft.v1',draft=JSON.parse(sessionStorage.getItem(key));
  if(!draft||!Number.isFinite(draft.createdAt)||draft.createdAt>Date.now()||Date.now()-draft.createdAt>7200000||!['/news.html','/news/news.html','/market-analysis.html'].includes(draft.returnPath))return;
  if(draft.ownerUid&&draft.ownerUid!==user?.uid){sessionStorage.removeItem(key);return;}
  if(!draft.ownerUid){if(!draft.claimOnSignIn)return;if(user){draft.ownerUid=user.uid;draft.claimOnSignIn=false;sessionStorage.setItem(key,JSON.stringify(draft));}}
  const note=node('p','Your news research draft is kept in this tab for up to two hours. ');note.id='newsDraftReturn';
  const link=node('a','Return to your research note');link.href=draft.returnPath+'?resumeResearch=1';note.append(link);$('accessMessage').after(note);
 }catch{}
}
function updateAccess(){const plan=state.plans[state.tier];$('membershipTitle').textContent=plan?(state.accessProvider==='owner'?(state.membershipLabel||'FYNX Owner — Lifetime Unlimited Access'):state.accessProvider==='apple'?'FYNX Pro · App Store':plan.name+' membership'):state.billingUnavailable?'Membership unavailable':user?'Free account':'Free to explore';$('membershipText').textContent=plan&&state.accessProvider==='owner'?'Complimentary lifetime access to every FYNX product and every future premium feature. No subscription, no payment, no daily limits.':plan&&state.accessProvider==='apple'?'Verified App Store access. Manage renewal through Apple.':plan?`${plan.products.length} advanced tools · ${plan.saved} saved workspaces. ${state.subscription?.cancelAtPeriodEnd?'Cancels at period end.':'Monthly subscription active.'}`:state.billingUnavailable?(state.hasBillingAccount?'We could not verify your membership. Refresh to try again; Manage subscription remains available for payment details and cancellation.':'We could not verify your membership. Refresh to try again.'):'Free dashboard, news, learning and standard tools. Pro remains optional.';$('manageBilling').hidden=!state.hasBillingAccount;$('signIn').textContent=user?'Profile':'Sign in';$('signIn').href=user?'/profile.html':signInPath();$('accessMessage').replaceChildren();if(!user){$('accessMessage').append(node('span','Browsing is free. '));const a=node('a','Sign in to save work or choose a membership.');a.href=signInPath();$('accessMessage').append(a);}else if(state.billingUnavailable){$('accessMessage').textContent='Membership verification is temporarily unavailable. Refresh before using a paid tool.';}else if(!entitled()){$('accessMessage').textContent=`${catalog[selected][1]} or higher unlocks this tool. Choose a monthly membership above.`;}else $('accessMessage').textContent='Included in your membership.';updateNewsDraftLink();}
function selectTool(key,input,{reset=false}={}){if(!Object.hasOwn(catalog,key))return;
 if(reset)toolDrafts.clear();
 else if($('fields')?.querySelector('[name]')){
  const draft={};
  for(const [name,,,type='number'] of definitions[selected]){
   const field=$('tool-'+name);
   if(field)draft[name]=type==='checkbox'?field.checked:field.value;
  }
  toolDrafts.set(selected,draft);
 }
 input??=toolDrafts.get(key);
 saveAttempt=null;clearExportUrl();inputRevision++;hasCurrentResult=false;selected=key;const url=new URL(location.href);url.searchParams.set('tool',key);history.replaceState(null,'',url);$('toolGuide').href=catalog[key][3];for(const b of $('productCards').querySelectorAll('button[data-key]'))b.setAttribute('aria-pressed',String(b.dataset.key===key));$('toolTitle').textContent=catalog[key][0];$('toolTier').textContent=catalog[key][1].toUpperCase();$('toolDescription').textContent=catalog[key][2];$('fields').replaceChildren();for(const [name,label,value,type='number'] of definitions[key]){const wrap=node('div',undefined,type==='textarea'?'wide':'');const l=node('label',label);l.htmlFor='tool-'+name;const e=document.createElement(type==='textarea'?'textarea':'input');e.id='tool-'+name;e.name=name;if(type!=='textarea')e.type=type;if(type==='number'){e.step='any';if(key==='simulation'&&name==='trades'){e.min='1';e.max='500';e.step='1';}}if(type==='checkbox'){wrap.className='check';e.checked=input?.[name]??value;wrap.append(e,l);}else{e.value=input?.[name]??value;e.required=name!=='notes';wrap.append(l,e);}e.addEventListener(type==='checkbox'?'change':'input',invalidateResult);$('fields').append(wrap);}if(!definitions[key].length)$('fields').append(node('p','Uses up to 1,000 of your dated, saved Journal trades. No sample account results are substituted.','wide'));$('saveTool').hidden=key==='export';$('result').replaceChildren(node('p','Run this tool to see your result.'));status('');updateAccess();}
function inputs(){const d={};for(const [name,,,type='number'] of definitions[selected]){const e=$('tool-'+name);d[name]=type==='checkbox'?e.checked:e.value;}if(selected==='watchlist'){if(d.notes.length>2000)throw Error('Research notes must be 2,000 characters or fewer. Shorten your note before running or saving.');d.symbols=d.symbols.split(',').map(x=>x.trim()).filter(Boolean);}if(selected==='portfolio')d.positions=d.positions.split('\n').filter(x=>x.trim()).map(line=>{const parts=line.split(',');if(parts.length!==2)throw Error('Use one SYMBOL, signed value pair per line.');return {symbol:parts[0].trim(),value:parts[1].trim()};});return d;}
// Inspect only the returned paid path; never infer deposits or fetch market data.
function renderPathInspector(area,values){
 if(!['analytics','simulation'].includes(selected)||!Array.isArray(values)||!values.length||!values.every(Number.isFinite))return;
 const simulated=selected==='simulation',details=node('details');details.className='path-inspector';
 details.append(node('summary','Inspect path: trade changes and drawdowns'));
 details.append(node('p',simulated?'One illustrative simulated path, not the distribution across all 500 paths. Amounts are in account currency; not a forecast.':'Recorded Journal trade order. Cumulative realized P/L starts at zero, not account equity. Amounts are in account currency.'));
 const wrap=node('div',undefined,'table-wrap'),table=node('table');
 table.append(node('caption',simulated?'Illustrative equity path details':'Realized P/L path details'));
 const head=node('tr'),thead=node('thead');
 for(const label of ['Step',simulated?'Equity':'Cumulative P/L','Change','Drawdown from peak']){const th=node('th',label);th.scope='col';head.append(th);}
 thead.append(head);table.append(thead);const body=node('tbody');
 let previous=simulated?values[0]:0,peak=previous;
 values.forEach((value,index)=>{
  peak=Math.max(peak,value);const row=node('tr'),label=node('th',simulated&&index===0?'Start':`Trade ${simulated?index:index+1}`);label.scope='row';
  row.append(label,node('td',fmt(value)),node('td',simulated&&index===0?'—':fmt(value-previous)),node('td',fmt(peak-value)));body.append(row);previous=value;
 });
 table.append(body);wrap.append(table);details.append(wrap);area.append(details);
}
// Journal cumulative P/L begins at zero; simulated paths already include starting equity.
function chartValues(product,curve){
 if(!['analytics','simulation'].includes(product)||!Array.isArray(curve)||!curve.length||!curve.every(Number.isFinite))return [];
 return product==='analytics'?[0,...curve]:curve;
}
function render(result){clearExportUrl();hasCurrentResult=true;const area=$('result');area.replaceChildren();if(result.csv!==undefined){const a=node('a',`Download ${result.rows} journal entries (.csv)`,'primary');const url=URL.createObjectURL(new Blob([result.csv],{type:'text/csv;charset=utf-8'}));exportUrl=url;a.href=url;a.download='fynx-journal.csv';a.addEventListener('click',()=>setTimeout(()=>{expireExport(url);},60000),{once:true});area.append(a);return;}
 const metrics=node('div',undefined,'metric-grid');for(const [key,value] of Object.entries(result)){if(['notice','notes','curve'].includes(key)||(value!==null&&typeof value==='object'))continue;const card=node('div',undefined,'metric');card.append(node('small',title(key)),node('strong',fmt(value,key)));metrics.append(card);}if(metrics.children.length)area.append(metrics);
 const values=chartValues(selected,result.curve);
 if(values.length){const min=Math.min(...values),max=Math.max(...values),span=max-min||1;const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 600 170');svg.setAttribute('role','img');svg.setAttribute('aria-label',selected==='simulation'?'One illustrative simulated equity path':'Cumulative realized Journal profit and loss, starting at zero');const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('points',values.map((v,i)=>`${10+i/Math.max(1,values.length-1)*580},${150-(v-min)/span*130}`).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','2');svg.append(line);area.append(svg);area.append(node('p',`${selected==='simulation'?'One illustrative path':'Cumulative P/L from zero'} · range ${fmt(min)} to ${fmt(max)} · account currency`));}
 renderPathInspector(area,result.curve);
 for(const key of ['rows','scenarios'])if(result[key]?.length){
  const wrap=node('div',undefined,'table-wrap'),table=node('table');
  const caption=node('caption',key==='scenarios'?'Scenario comparison results':selected==='portfolio'?'Portfolio stress test results':'Journal analysis results');
  const thead=node('thead'),head=node('tr');
  const cols=Object.keys(result[key][0]).filter(k=>k!=='notice');
  cols.forEach(k=>{const th=node('th',title(k));th.scope='col';head.append(th);});
  thead.append(head);table.append(caption,thead);
  const tbody=node('tbody');
  result[key].forEach(row=>{const tr=node('tr');cols.forEach(k=>tr.append(node('td',fmt(row[k],k))));tbody.append(tr);});
  table.append(tbody);wrap.append(table);area.append(wrap);
 }
 if(result.symbols){const list=node('ul');result.symbols.forEach(symbol=>{const li=node('li'),a=node('a',symbol+' — research news ↗︎');a.href='/tools/symbol-news.html?q='+encodeURIComponent(symbol);li.append(a);list.append(li);});area.append(list);}
 for(const key of ['completed','missing'])if(result[key])area.append(node('p',`${title(key)}: ${result[key].join(', ')||'None'}`));if(result.notes)area.append(node('p',result.notes));if(result.notice)area.append(node('p',result.notice));}
async function perform(fn){if(busy)return;const epoch=authEpoch,buttonStates=new Map([...document.querySelectorAll('button')].map(b=>[b,b.disabled]));busy=true;for(const b of buttonStates.keys())b.disabled=true;status('Working…');try{await fn();}catch(e){if(epoch===authEpoch)status(e.message||'Unable to complete the request. Please retry.');}finally{busy=false;for(const [b,wasDisabled] of buttonStates)if(b.isConnected)b.disabled=wasDisabled;}}
async function refresh(){
 if(!user){state={tier:null,plans:{}};updateAccess();return;}
 const epoch=authEpoch;
 let next,requestFailed=false;
 try{next=(await call({action:'status'})).data;}
 catch(e){
  if(epoch!==authEpoch)throw e;
  // A failed verification must not leave the previous membership displayed as active.
  // Retain only the known billing recovery route and plan definitions, never paid access.
  requestFailed=true;
  next={tier:null,plans:state.plans,hasBillingAccount:state.hasBillingAccount===true,billingUnavailable:true};
 }
 const stillEntitled=next.plans?.[next.tier]?.products?.includes(selected);
 if(!stillEntitled&&hasCurrentResult){
  clearExportUrl();hasCurrentResult=false;
  // A transport failure does not change submitted inputs or an uncertain save's retry key.
  if(!requestFailed)inputRevision++;
  $('result').replaceChildren(node('p',requestFailed?'Membership verification is temporarily unavailable. Refresh membership and run this tool again.':'Membership access changed. Refresh your membership or choose an eligible plan to run this tool.'));
 }
 state=next;updateAccess();
}
function filterSaved(){const query=$('savedSearch').value.trim().toLocaleLowerCase();const entries=$('savedItems').querySelectorAll('article');let matches=0;for(const entry of entries){entry.hidden=!entry.dataset.search.includes(query);if(!entry.hidden)matches++;}$('savedSearchCount').textContent=query?`${matches} of ${entries.length} saved workspaces match.`:`${entries.length} saved workspaces shown.`;}
function clearSavedView(message){
 $('savedSearchControls').hidden=true;$('savedSearchCount').textContent='';$('savedItems').replaceChildren(node('p',message));
}
async function loadSaved(){if(!user||!state.tier){clearSavedView(state.billingUnavailable?'Saved workspaces are temporarily unavailable. Refresh membership to try again.':'Sign in and activate a membership to save your work.');return;}
 const epoch=authEpoch;
 let d;
 try{d=(await call({action:'list'})).data;}
 catch(e){
  if(epoch!==authEpoch)throw e;
  // Do not leave older saved results or quota information visible after a failed refresh.
  // This includes a tier change followed by a failed list request.
  const message='Saved workspaces could not be refreshed. Use Refresh membership and saved workspaces to try again.';
  clearSavedView(message);
  throw Error(message);
 }
 if(epoch!==authEpoch)throw Error('Account changed. Please retry.');
 $('savedSearchControls').hidden=false;$('savedItems').replaceChildren(node('p',`${d.items.length} / ${d.limit} saved`));for(const item of d.items){const el=node('article');el.dataset.search=(String(item.name||'')+' '+(catalog[item.product]?.[0]||item.product||'')).toLocaleLowerCase();el.append(node('strong',item.name),node('p',catalog[item.product]?.[0]||item.product));const open=node('button','Open'),remove=node('button','Delete');const supported=Object.hasOwn(catalog,item.product)&&Object.hasOwn(definitions,item.product);const allowed=supported&&item.locked!==true&&state.plans[state.tier]?.products?.includes(item.product);if(!allowed){open.disabled=true;if(!supported){open.title='This saved tool is no longer available';el.append(node('p','This saved tool is no longer available. Its record remains saved and can still be deleted.'));}else{open.title='Requires '+catalog[item.product][1]+' membership';el.append(node('p',catalog[item.product][1]+' membership required to open this saved analysis. Your record remains saved and can still be deleted.'));}}open.onclick=()=>{if(!supported){status('This saved tool is no longer available. Your saved record was not changed.');return;}if(item.locked===true||!state.plans[state.tier]?.products?.includes(item.product)){status('Upgrade to '+catalog[item.product][1]+' to open this saved analysis. Your record remains saved.');return;}const i={...item.input};if(Array.isArray(i.symbols))i.symbols=i.symbols.join(', ');if(Array.isArray(i.positions))i.positions=i.positions.map(p=>p.symbol+', '+p.value).join('\n');selectTool(item.product,i);$('workspaceName').value=item.name;render(item.result);const heading=$('toolTitle');heading.tabIndex=-1;heading.focus({preventScroll:true});$('workbench').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};const confirmDelete=node('button','Confirm delete'),cancelDelete=node('button','Cancel');confirmDelete.type='button';cancelDelete.type='button';confirmDelete.hidden=true;cancelDelete.hidden=true;
 remove.onclick=()=>{remove.disabled=true;confirmDelete.hidden=false;cancelDelete.hidden=false;confirmDelete.focus();status('Confirm deletion of "'+(item.name||'Untitled workspace')+'". This cannot be undone.');};
 cancelDelete.onclick=()=>{remove.disabled=false;confirmDelete.hidden=true;cancelDelete.hidden=true;status('Deletion cancelled.');remove.focus();};
 confirmDelete.onclick=()=>perform(async()=>{
   const epoch=authEpoch;await call({action:'delete',id:item.id});
   let message='Workspace deleted.';
   try{await loadSaved();}catch(e){if(epoch!==authEpoch)throw e;message+=' '+e.message;}
   if(epoch!==authEpoch)return;
   const heading=$('savedItems').closest('.saved').querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});status(message);
  });
 el.append(open,remove,confirmDelete,cancelDelete);$('savedItems').append(el);}filterSaved();}
for(const b of $('productCards').querySelectorAll('button[data-key]')){b.onclick=()=>{selectTool(b.dataset.key);$('workbench').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};}
$('savedSearch').addEventListener('input',filterSaved);
window.addEventListener('popstate',()=>selectTool(requestedTool()));
window.addEventListener('pagehide',()=>expireExport(exportUrl));
$('toolForm').onsubmit=e=>{e.preventDefault();perform(async()=>{if(!user)throw Error('Sign in to use an advanced tool. You can continue browsing for free.');if(!entitled())throw Error('Choose the required plan above to unlock this tool.');const product=selected,revision=inputRevision,input=inputs();const d=(await call({action:'run',product,input})).data;if(revision!==inputRevision||product!==selected){status('Inputs or selected tool changed while the analysis ran. Run again.');return;}render(d.result);status('Analysis complete.');});};
$('saveTool').onclick=()=>perform(async()=>{if(!entitled())throw Error('Sign in and choose the required plan first.');if(!$('toolForm').reportValidity())throw Error('Complete the required inputs.');
 const product=selected,revision=inputRevision,input=inputs(),name=$('workspaceName').value,accountUid=user.uid,epoch=authEpoch;
 const key=JSON.stringify({accountUid,product,revision,name:name.trim(),input});
 if(!saveAttempt||saveAttempt.key!==key)saveAttempt={key,requestId:freshSaveRequestId()};
 // Reuse the same requestId after a lost response, preventing duplicate saved records/quota use.
 const d=(await call({action:'save',accountUid,product,name,input,requestId:saveAttempt.requestId})).data;
 const changed=revision!==inputRevision||product!==selected;
 if(!changed)render(d.result);
 // The write is acknowledged; a failed list refresh is not a failed save.
 saveAttempt=null;
 let message=changed?'Workspace saved with the submitted inputs. Run the current inputs again.':'Workspace saved to your account.';
 try{await loadSaved();}catch(e){if(epoch!==authEpoch)throw e;message+=' '+e.message;}
 if(epoch===authEpoch)status(message);
});
function navigateStripe(url){const u=new URL(url);if(u.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(u.hostname))throw Error('Invalid checkout destination.');location.href=u.href;}
document.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>perform(async()=>{if(!user){location.href=signInPath();return;}rememberTool();const d=(await call({action:'checkout',tier:b.dataset.plan,tool:selected})).data;navigateStripe(d.url);}));
$('manageBilling').onclick=()=>perform(async()=>{navigateStripe((await call({action:'portal',tool:selected})).data.url);});$('loadSaved').textContent='Refresh membership and saved workspaces';$('loadSaved').onclick=()=>perform(async()=>{await refresh();await loadSaved();showMembershipStatus('Membership and saved workspaces refreshed.');});
function showMembershipStatus(fallback){
 if(state.billingUnavailable){status(state.hasBillingAccount?'Membership verification is temporarily unavailable. You can still open Manage subscription. Refresh to try again.':'Membership verification is temporarily unavailable. Refresh to try again.');return;}
 if(checkoutOutcome()==='complete'){
  // The return URL is not a receipt, and status verifies access, not this checkout session.
  if(!user){status('Sign in with the account used at checkout to verify your membership.');return;}
  const plan=state.plans[state.tier];
  if(!plan){status('Payment has not been confirmed yet. Refresh membership to check again, or contact support if you were charged.');return;}
  const access=entitled()?'This tool is included.':catalog[selected][1]+' or higher is required for this tool.';
  const membership=state.accessProvider==='owner'?'FYNX Owner access':state.accessProvider==='apple'?'App Store membership':plan.name+' membership';
  status(membership+' verified. '+access+' This does not confirm a new checkout payment. Check your payment receipt or contact support if needed.');
  return;
 }
 if(checkoutOutcome()==='cancelled'){status('You returned from checkout without completing it. Choose a plan when you are ready, or use Manage subscription to review an existing membership.');return;}
 status(fallback);
}
selectTool(requestedTool());
try {
 const [config, authSDK, functionsSDK]=await Promise.all([
  import('../../auth/firebase.js'),
  import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
  import('https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js')
 ]);
 const request=functionsSDK.httpsCallable(functionsSDK.getFunctions(config.app,'us-central1'),'consumerLiveWorkspace');
 call=async data=>{const epoch=authEpoch,result=await request(data);if(epoch!==authEpoch)throw Error('Account changed. Please retry.');return result;};
 await config.authPersistenceReady;authSDK.onAuthStateChanged(config.auth,async u=>{
  const epoch=++authEpoch;user=u;state={tier:null,plans:{}};
  saveAttempt=null;$('workspaceName').value='';$('savedSearch').value='';$('savedSearchControls').hidden=true;$('savedSearchCount').textContent='';$('savedItems').replaceChildren();selectTool(selected,undefined,{reset:true});
  try{
   await refresh();await loadSaved();
   if(checkoutOutcome()==='complete'){
    for(let attempt=0;user&&!state.tier&&!state.billingUnavailable&&attempt<3;attempt++){
     status('Checking your membership…');await new Promise(resolve=>setTimeout(resolve,2000));if(epoch!==authEpoch)return;await refresh();
    }
    if(state.tier)await loadSaved();
   }
   if(epoch===authEpoch)showMembershipStatus('');
  }catch(e){if(epoch===authEpoch){updateAccess();status(e.message||'Could not load your plan.');}}
 });
} catch { status('Account services are unavailable. You can read every public tool guide, or retry on a connection that allows sign-in.'); }
