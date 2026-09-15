import { auth } from '../../auth/firebase.js';
import { multiFactor, TotpMultiFactorGenerator, getMultiFactorResolver, EmailAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, GoogleAuthProvider, OAuthProvider, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
function dialog(title,description,fields,submitLabel,action){
  return new Promise((resolve,reject)=>{
    const modal=document.createElement('dialog');modal.style.cssText='width:min(440px,calc(100vw - 32px));margin:auto;padding:28px;border:1px solid #777;border-radius:8px;background:var(--panel,#111);color:var(--text,#eee)';
    const heading=document.createElement('h2');heading.textContent=title;
    const paragraph=document.createElement('p');paragraph.textContent=description;paragraph.style.cssText='margin:16px 0;line-height:1.6;overflow-wrap:anywhere';
    const form=document.createElement('form'),inputs={};
    fields.forEach(field=>{const label=document.createElement('label');label.textContent=field.label;label.style.display='block';const input=document.createElement('input');input.type=field.type||'text';input.required=true;input.autocomplete=field.type==='password'?'current-password':'one-time-code';if(field.code){input.pattern='[0-9]{6}';input.maxLength=6;input.inputMode='numeric';}input.style.cssText='display:block;width:100%;padding:12px;margin:8px 0 16px';label.append(input);form.append(label);inputs[field.name]=input;});
    const status=document.createElement('p');status.setAttribute('role','status');
    const submit=document.createElement('button');submit.textContent=submitLabel;submit.type='submit';submit.className='btn';
    const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.type='button';cancel.className='btn';cancel.style.marginLeft='12px';
    const close=()=>{modal.close();modal.remove();};
    const abort=()=>{close();reject(new Error('Authentication cancelled.'));};
    cancel.onclick=abort;modal.addEventListener('cancel',e=>{e.preventDefault();abort();});
    form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;status.textContent='Verifying…';try{const values=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value]));const result=await action(values);close();resolve(result);}catch(error){status.textContent=error.code==='auth/invalid-verification-code'?'That code is invalid or expired. Try the current code.':error.message;submit.disabled=false;}};
    form.append(status,submit,cancel);modal.append(heading,paragraph,form);document.body.append(modal);modal.showModal();
  });
}
export async function withMfa(operation){
  try{return await operation();}catch(error){
    if(error.code!=='auth/multi-factor-auth-required')throw error;
    const resolver=getMultiFactorResolver(auth,error);
    const factor=resolver.hints.find(h=>h.factorId===TotpMultiFactorGenerator.FACTOR_ID);
    if(!factor)throw new Error('This account uses a different second factor. Use its supported sign-in client.');
    return dialog('Two-factor verification','Enter the current six-digit code from your authenticator app.',[{name:'code',label:'Authenticator code',code:true}],'Verify',v=>resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(factor.uid,v.code)));
  }
}
async function reauthenticate(){
  const user=auth.currentUser;if(!user)throw new Error('Sign in first.');
  if(user.providerData.some(p=>p.providerId==='password')){
    return dialog('Confirm your identity','Enter your current password to change account security.',[{name:'password',label:'Current password',type:'password'}],'Continue',v=>withMfa(()=>reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,v.password))));
  }
  const provider=user.providerData.some(p=>p.providerId==='google.com')?new GoogleAuthProvider():new OAuthProvider('apple.com');
  return withMfa(()=>reauthenticateWithPopup(user,provider));
}
// Enable only after the owner activates Identity Platform and TOTP in Firebase.
const enrollmentActivated=false;
const section=document.getElementById('mfaSettings');
if(section){
  const status=section.querySelector('[role=status]'),button=section.querySelector('button');
  function render(){const factors=auth.currentUser?multiFactor(auth.currentUser).enrolledFactors:[];const enrolled=factors.some(f=>f.factorId==='totp');button.textContent=enrolled?'Remove authenticator':'Set up authenticator';button.disabled=!auth.currentUser || (!enrolled && !enrollmentActivated);status.textContent=enrolled?'Authenticator protection is enabled.':enrollmentActivated?'Authenticator protection is not enabled.':'Two-factor activation is pending the project’s Identity Platform upgrade.';}
  onAuthStateChanged(auth,render);
  button.onclick=async()=>{
    if(!enrollmentActivated && !multiFactor(auth.currentUser).enrolledFactors.some(f=>f.factorId==='totp'))return;
    button.disabled=true;
    try{
      await reauthenticate();const user=auth.currentUser;await user.reload();
      const factor=multiFactor(user).enrolledFactors.find(f=>f.factorId==='totp');
      if(factor){await dialog('Remove authenticator','Removing this factor reduces your sign-in protection. You can add it again later.',[],'Remove',()=>multiFactor(user).unenroll(factor));render();return;}
      if(!user.emailVerified)throw new Error('Verify your email address before setting up two-factor authentication.');
      const secret=await TotpMultiFactorGenerator.generateSecret(await multiFactor(user).getSession());
      await dialog('Set up your authenticator',`Add a time-based account named FYNX in your authenticator app with this setup key: ${secret.secretKey}. Then enter its six-digit code. Keep your authenticator backed up; you will need it to sign in.`,[{name:'code',label:'Authenticator code',code:true}],'Enable protection',v=>multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret,v.code),'FYNX authenticator'));
      render();
    }catch(e){status.textContent=['auth/operation-not-allowed','auth/unsupported-first-factor'].includes(e.code)?'Authenticator setup requires the Identity Platform upgrade to be activated for this project.':e.message;}
    finally{button.disabled=!auth.currentUser;}
  };
}
