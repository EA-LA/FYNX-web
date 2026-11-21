(function(){
'use strict';
const id=new URL(location.href).searchParams.get('id')||'',title=document.getElementById('profile-title'),status=document.getElementById('profile-status'),retry=document.getElementById('retry'),open=document.getElementById('open-profile'),label=document.getElementById('profile-id'),notice=document.getElementById('profile-notice');
if(!/^FYNX-[A-F0-9]{8}$/.test(id)){status.textContent=id?'This profile link is invalid. Ask the member for a new shared link.':'Use the full profile link shared by a FYNX member.';return;}
async function load(){
 retry.hidden=true;open.hidden=true;label.hidden=true;notice.hidden=true;notice.textContent='';title.textContent='Shared FYNX profile';status.textContent='Checking profile availability…';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch('https://us-central1-fynx-c7a28.cloudfunctions.net/webSharedProfile?id='+encodeURIComponent(id),{signal:controller.signal,cache:'no-store'});
  let result=null;
  try{result=await response.json();}catch{ /* A proxy or offline response may not contain JSON. */ }
  if(!response.ok){
   const message=response.status===404?'This profile is private or has not been published.':response.status===400?'The shared profile link is invalid.':response.status===429?'Too many requests. Please try again shortly.':'Profile temporarily unavailable. Please try again.';
   throw Object.assign(Error(message),{status:response.status});
  }
  if(!result||result.id!==id||typeof result.username!=='string'||!result.username.trim())throw Error('Profile temporarily unavailable.');
  title.textContent=result.username;label.textContent=id;label.hidden=false;
  status.textContent='This member has chosen to share their FYNX identity.';notice.textContent=typeof result.notice==='string'?result.notice:'';notice.hidden=!notice.textContent;
  open.href='fynx://profile/'+encodeURIComponent(id);open.hidden=false;
 }catch(error){
  status.textContent=error.name==='AbortError'?'The connection timed out. Please try again.':([400,404,429].includes(error.status)?error.message:'Unable to check this profile. Please try again.');
  retry.hidden=error.status===404||error.status===400;
 }
 finally{clearTimeout(timer);}
}
retry.addEventListener('click',load);load();
})();
