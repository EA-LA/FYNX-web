(function(){
'use strict';
const form=document.getElementById('waitlistForm');if(!form)return;
const button=document.getElementById('submitBtn'),message=document.getElementById('message');
function status(text,error){message.textContent=text;message.className='message '+(error?'error':'success');}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(button.disabled||!form.reportValidity())return;
 const name=form.elements.fullName.value.trim(),email=form.elements.email.value.trim();
 if(name.length<2){status('Please enter your full name.',true);return;}
 button.disabled=true;button.textContent='Joining…';status('',false);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('https://us-central1-fynx-c7a28.cloudfunctions.net/webWaitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,source:form.dataset.source||'money-management',consent:form.elements.consent.checked}),signal:controller.signal});
  const result=await response.json();if(!response.ok||result.accepted!==true)throw Error(result.error||'We could not save your request. Please try again.');
  document.getElementById('formView').hidden=true;document.getElementById('formView').style.display='none';
  const done=document.getElementById('successView');done.hidden=false;done.style.display='block';done.setAttribute('tabindex','-1');done.focus();
 }catch(error){status(error.name==='AbortError'?'The request took too long. Please try again.':error.message||'Connection unavailable. Please try again.',true);}
 finally{clearTimeout(timer);button.disabled=false;button.textContent='Join the waitlist';}
});
})();
