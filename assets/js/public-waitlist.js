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
 let timer,controller;
 try{
  controller=typeof AbortController==='function'?new AbortController():null;
  const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,source:form.dataset.source||'money-management',consent:form.elements.consent.checked})};
  if(controller)options.signal=controller.signal;
  // Bound both the request and response body, even on browsers without AbortController.
  const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{const error=new Error('Request timed out');error.name='AbortError';reject(error);if(controller)controller.abort();},15000);});
  const request=(async()=>{
   const response=await fetch('https://us-central1-fynx-c7a28.cloudfunctions.net/webWaitlist',options);
   const result=await response.json();
   if(!response.ok||!result||result.accepted!==true)throw Error((result&&result.error)||'We could not save your request. Please try again.');
  })();
  await Promise.race([request,deadline]);
  document.getElementById('formView').hidden=true;document.getElementById('formView').style.display='none';
  const done=document.getElementById('successView');done.hidden=false;done.style.display='block';done.setAttribute('tabindex','-1');done.focus();
 }catch(error){status(error&&error.name==='AbortError'?'The request took too long. Your request may have been received. Please try again if needed.':(error&&error.message)||'Connection unavailable. Please try again.',true);}
 finally{clearTimeout(timer);button.disabled=false;button.textContent='Join the waitlist';}
});
})();
