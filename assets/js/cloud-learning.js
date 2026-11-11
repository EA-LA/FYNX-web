import { cloudCall, auth } from './cloud-client.js?v=20260928-learning';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
const topics = new Set(['general','forex','stocks','crypto','funds','futures','indices','bonds','economy','options']);
const topic = new URLSearchParams(location.search).get('topic') || document.body.dataset.learningTopic || 'general';
let currentTopic = topics.has(topic) ? topic : 'general';
let generation = 0, ready = false, owner = null, quizOwner = null, retryAction = null;
const panel = document.createElement('section');
panel.setAttribute('aria-label','Your learning progress');
panel.style.cssText='margin:24px 0;padding:20px;border:1px solid var(--border,#ddd);border-radius:12px';
const title = document.createElement('h2'); title.textContent='Your learning progress';
const status = document.createElement('p'); status.setAttribute('role','status'); status.id='learningSyncStatus';
const retry = document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='Retry sync';retry.hidden=true;
const history = document.createElement('div');history.id='learningHistory';
const signIn = document.createElement('a');signIn.className='btn';signIn.textContent='Sign in to sync';signIn.href='/auth/login.html?returnTo='+encodeURIComponent(location.pathname+location.search);
panel.append(title,status,retry,signIn,history);
const host=document.querySelector('.lesson-cards') || document.querySelector('#resultsSection') || document.querySelector('main');
if(host){if(host.matches('.lesson-cards')||host.id==='resultsSection')host.before(panel);else host.prepend(panel);}
const buttons=[];
function active(version,uid){return version===generation && uid===owner && auth.currentUser?.uid===uid;}
function failed(message,action){status.textContent=message;retryAction=action;retry.hidden=false;}
function render(data){
 buttons.forEach(button=>{const completed=data.lessons?.[button.dataset.lesson]?.completed===true;button.setAttribute('aria-pressed',String(completed));button.textContent=completed?'Completed ✓ — mark incomplete':'Mark lesson complete';});
 history.replaceChildren();
 const heading=document.createElement('h3');heading.textContent='Assessment history · '+(currentTopic==='general'?'All markets':currentTopic);history.append(heading);
 if(!data.attempts?.length){const empty=document.createElement('p');empty.textContent='No saved assessments for this subject yet.';history.append(empty);}
 for(const attempt of data.attempts||[]){const row=document.createElement('p');row.textContent=`${new Date(attempt.completedAt).toLocaleString()} · ${attempt.correct}/${attempt.total} (${Math.round(attempt.correct/attempt.total*100)}%)`;history.append(row);}
 status.textContent=`Synced to your account.${buttons.length?' '+buttons.filter(b=>b.getAttribute('aria-pressed')==='true').length+' of '+buttons.length+' lessons completed.':''} Assessment history shows your latest 20 attempts for this subject.`;
}
async function read(){
 const version=generation,uid=owner;if(!uid)return;
 ready=false;buttons.forEach(b=>b.disabled=true);retry.hidden=true;status.textContent='Loading your learning progress…';
 try{const data=await cloudCall('webLearning',{action:'read',topic:currentTopic},{expectedUid:uid});if(!active(version,uid))return;render(data);ready=true;retryAction=null;}
 catch(error){if(active(version,uid))failed('Could not load progress. Check your connection and retry.',read);}
 finally{if(active(version,uid))buttons.forEach(b=>b.disabled=!ready);}
}
async function save(payload){
 const version=generation,uid=owner;if(!uid||auth.currentUser?.uid!==uid)return;
 retry.hidden=true;ready=false;buttons.forEach(b=>b.disabled=true);status.textContent='Saving to your account…';
 try{
   await cloudCall('webLearning',payload,{expectedUid:uid});
   if(!active(version,uid))return;
   currentTopic=payload.topic;await read();
 }catch(error){if(active(version,uid))failed('Progress was not confirmed saved. Retry to sync it to your account.',()=>save(payload));}
 finally{if(active(version,uid))buttons.forEach(b=>b.disabled=!ready);}
}
retry.onclick=async()=>{const action=retryAction;retry.disabled=true;try{await action?.();}finally{retry.disabled=false;}};
document.querySelectorAll('.lesson-card').forEach((card,index)=>{
 const button=document.createElement('button');button.className='btn';button.type='button';button.dataset.lesson=`outline-${index+1}`;button.textContent='Mark lesson complete';button.style.marginTop='14px';button.disabled=true;
 card.querySelector('.lesson-body')?.append(button);buttons.push(button);
 button.onclick=()=>save({action:'lesson',topic:currentTopic,lesson:button.dataset.lesson,completed:button.getAttribute('aria-pressed')!=='true'});
});
onAuthStateChanged(auth,user=>{
 generation++;owner=user?.uid||null;ready=false;retryAction=null;retry.hidden=true;history.replaceChildren();signIn.hidden=!!user;
 buttons.forEach(b=>{b.disabled=true;b.setAttribute('aria-pressed','false');b.textContent='Mark lesson complete';});
 if(!user){status.textContent='Sign in to save completed lessons and assessment history across devices.';return;}
 read();
});
window.addEventListener('fynx:quiz-started',event=>{quizOwner={uid:owner,attempt:event.detail.attempt};});
window.addEventListener('fynx:quiz-completed',event=>{
 if(!owner||quizOwner?.uid!==owner||quizOwner?.attempt!==event.detail.attempt){status.textContent='Sign in before starting an assessment to save it to your account.';return;}
 const {attempt,correct,total,topic}=event.detail;
 save({action:'quiz',topic:topics.has(topic)?topic:'general',attempt,correct,total});
});
// Pull fresh cloud data when returning to a tab/device; do not overwrite a failed save awaiting retry.
window.addEventListener('focus',()=>{if(owner&&!retryAction&&ready)read();});
