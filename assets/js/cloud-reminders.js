import { cloudCall, auth } from './cloud-client.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
const container=document.createElement('section');container.className='panel';container.style.cssText='margin:24px 0;padding:24px;border:1px solid var(--border);border-radius:6px';
container.innerHTML=`<h2>Email reminders</h2><p>Get a reminder at your verified account email, even when this page is closed. Delivery is checked every minute and may arrive later depending on your email provider.</p><label style="display:block;margin:16px 0"><input id="cloudReminderConsent" type="checkbox"> Email me a reminder using the event details above</label><div class="button-row"><button type="button" class="btn" id="saveCloudReminder">Schedule email reminder</button><button type="button" class="btn" id="refreshCloudReminders">Refresh status</button></div><p id="cloudReminderStatus" role="status" style="margin:12px 0"></p><div id="cloudReminderList"></div>`;
const localList=document.querySelector('.alerts-wrap');if(localList)localList.before(container);else document.querySelector('main').append(container);
const status=container.querySelector('#cloudReminderStatus'),list=container.querySelector('#cloudReminderList'),save=container.querySelector('#saveCloudReminder');
let loading=false,refreshVersion=0;
async function refresh(){
  const version=++refreshVersion;
  if(!auth.currentUser){list.replaceChildren();status.textContent='Sign in and verify your email to schedule background reminders.';return false;}
  const uid=auth.currentUser.uid;
  try{
    const result=await cloudCall('webReminders',{action:'list'},{expectedUid:uid});
    // Ignore earlier refresh responses even if the same user is still signed in.
    if(version!==refreshVersion||auth.currentUser?.uid!==uid)return false;
    list.replaceChildren();
  for(const r of result.reminders){const row=document.createElement('div');row.style.cssText='padding:12px 0;border-top:1px solid var(--border)';
    const summary=document.createElement('p');summary.textContent=`${r.name} · ${new Date(r.reminderAt).toLocaleString()} · ${r.status==='sent'?'accepted by email provider (inbox delivery unconfirmed)':r.status.replaceAll('_',' ')}`;row.append(summary);
    if(r.status==='pending'){
      const cancel=document.createElement('button');cancel.className='btn';cancel.textContent='Cancel reminder';
      cancel.onclick=async()=>{
        if(cancel.disabled)return;
        cancel.disabled=true;
        const uid=auth.currentUser?.uid;
        try{
          await cloudCall('webReminders',{action:'cancel',id:r.id},{expectedUid:uid});
          if(auth.currentUser?.uid!==uid)return;
          try{
            await refresh();
            if(auth.currentUser?.uid===uid)status.textContent='Email reminder cancelled.';
          }catch{
            // The cancel call succeeded; a later list error must not imply it failed.
            if(auth.currentUser?.uid===uid)status.textContent='Email reminder cancelled, but the list could not refresh. Use Refresh status to check.';
          }
        }catch(e){
          if(auth.currentUser?.uid===uid){status.textContent=e.message || 'Reminder could not be cancelled.';cancel.disabled=false;}
        }
      };
      row.append(cancel);
    }
    list.append(row);
  }
    if(!result.reminders.length)list.textContent='No email reminders scheduled.';
    return true;
  }catch(error){
    // A superseded request must not show a stale failure after a newer success.
    if(version!==refreshVersion||auth.currentUser?.uid!==uid)return false;
    throw error;
  }
}
save.onclick=async()=>{
  if(loading)return;loading=true;save.disabled=true;
  const uid=auth.currentUser?.uid;
  try{const value=id=>document.getElementById(id).value;
    const eventAt=new Date(`${value('eventDate')}T${value('eventTime')}`).getTime();
    await cloudCall('webReminders',{action:'create',id:crypto.randomUUID(),name:value('eventName'),note:value('eventNote'),eventAt,reminderAt:eventAt-Number(value('reminderOffset'))*60000,emailConsent:container.querySelector('#cloudReminderConsent').checked});
    if(auth.currentUser?.uid!==uid)return;
    try{
      await refresh();
      if(auth.currentUser?.uid===uid)status.textContent='Email reminder scheduled. You can close this page.';
    }catch{
      // The create call succeeded. A list-refresh error must not imply it failed.
      if(auth.currentUser?.uid===uid)status.textContent='Email reminder scheduled, but the list could not refresh. Use Refresh status to check.';
    }
  }catch(e){
    if(auth.currentUser?.uid===uid)status.textContent=e.message || 'Reminder could not be scheduled.';
  }finally{loading=false;save.disabled=!auth.currentUser;}
};
container.querySelector('#refreshCloudReminders').onclick=()=>refresh().catch(e=>status.textContent=e.message);
onAuthStateChanged(auth,user=>{save.disabled=!user;refresh().catch(e=>status.textContent=e.message);});
