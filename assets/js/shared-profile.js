(function(){
'use strict';
const id=new URL(location.href).searchParams.get('id')||'',title=document.getElementById('profile-title'),status=document.getElementById('profile-status'),retry=document.getElementById('retry'),open=document.getElementById('open-profile');
if(!/^FYNX-[A-F0-9]{8}$/.test(id)){status.textContent=id?'This profile link is invalid. Ask the member for a new shared link.':'Use the full profile link shared by a FYNX member.';return;}
async function load(){
 retry.hidden=true;open.hidden=true;document.getElementById('profile-notice').hidden=true;title.textContent='Shared FYNX profile';status.textContent='Checking profile availability…';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch('https://us-central1-fynx-c7a28.cloudfunctions.net/webSharedProfile?id='+encodeURIComponent(id),{signal:controller.signal,cache:'no-store'});
  const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'Profile temporarily unavailable.'),{status:response.status});
  if(result.id!==id||typeof result.username!=='string')throw Error('Profile temporarily unavailable.');
  title.textContent=result.username;const label=document.getElementById('profile-id');label.textContent=id;label.hidden=false;
  status.textContent='This member has chosen to share their FYNX identity.';const notice=document.getElementById('profile-notice');notice.textContent=result.notice;notice.hidden=false;
  open.href='fynx://profile/'+encodeURIComponent(id);open.hidden=false;
 }catch(error){status.textContent=error.name==='AbortError'?'The connection timed out. Please try again.':error.message||'Unable to check this profile. Please try again.';retry.hidden=error.status===404;}
 finally{clearTimeout(timer);}
}
retry.addEventListener('click',load);load();
})();
