import { cloudCall, auth } from './cloud-client.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
const container=document.createElement('section');container.className='panel';container.style.cssText='margin:24px 0;padding:24px;border:1px solid var(--border);border-radius:6px';
container.innerHTML=`<h2>Email reminders</h2><p>Get a reminder at your verified account email, even when this page is closed. Delivery is checked every minute and may arrive later depending on your email provider.</p><label style="display:block;margin:16px 0"><input id="cloudReminderConsent" type="checkbox"> Email me a reminder using the event details above</label><div class="button-row"><button type="button" class="btn" id="saveCloudReminder">Schedule email reminder</button><button type="button" class="btn" id="refreshCloudReminders">Refresh status</button></div><p id="cloudReminderStatus" role="status" style="margin:12px 0"></p><div id="cloudReminderList"></div>`;
const localList=document.querySelector('.alerts-wrap');if(localList)localList.before(container);else document.querySelector('main').append(container);
const status=container.querySelector('#cloudReminderStatus'),list=container.querySelector('#cloudReminderList'),save=container.querySelector('#saveCloudReminder');
let loading=false;
async function refresh(){
  if(!auth.currentUser){list.replaceChildren();status.textContent='Sign in and verify your email to schedule background reminders.';return;}
  const uid=auth.currentUser.uid;
  const result=await cloudCall('webReminders',{action:'list'});
  if(auth.currentUser?.uid!==uid)return;
  list.replaceChildren();
  for(const r of result.reminders){const row=document.createElement('div');row.style.cssText='padding:12px 0;border-top:1px solid var(--border)';
    const summary=document.createElement('p');summary.textContent=`${r.name} · ${new Date(r.reminderAt).toLocaleString()} · ${r.status.replaceAll('_',' ')}`;row.append(summary);
    if(r.status==='pending'){const cancel=document.createElement('button');cancel.className='btn';cancel.textContent='Cancel reminder';cancel.onclick=async()=>{cancel.disabled=true;try{await cloudCall('webReminders',{action:'cancel',id:r.id});await refresh();status.textContent='Email reminder cancelled.';}catch(e){status.textContent=e.message;cancel.disabled=false;}};row.append(cancel);}
    list.append(row);
  }
  if(!result.reminders.length)list.textContent='No email reminders scheduled.';
}
save.onclick=async()=>{
  if(loading)return;loading=true;save.disabled=true;
  try{const value=id=>document.getElementById(id).value;
    const eventAt=new Date(`${value('eventDate')}T${value('eventTime')}`).getTime();
    await cloudCall('webReminders',{action:'create',id:crypto.randomUUID(),name:value('eventName'),note:value('eventNote'),eventAt,reminderAt:eventAt-Number(value('reminderOffset'))*60000,emailConsent:container.querySelector('#cloudReminderConsent').checked});
    await refresh();status.textContent='Email reminder scheduled. You can close this page.';
  }catch(e){status.textContent=e.message || 'Reminder could not be scheduled.';}finally{loading=false;save.disabled=!auth.currentUser;}
};
container.querySelector('#refreshCloudReminders').onclick=()=>refresh().catch(e=>status.textContent=e.message);
onAuthStateChanged(auth,user=>{save.disabled=!user;refresh().catch(e=>status.textContent=e.message);});
