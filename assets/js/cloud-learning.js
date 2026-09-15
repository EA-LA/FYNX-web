import { cloudCall, auth } from './cloud-client.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
const topic = new URLSearchParams(location.search).get('topic') || 'general';
const safeTopic = /^[a-z]{1,20}$/.test(topic) ? topic : 'general';
let generation=0;
const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='margin:16px 0;color:var(--text-muted);font-size:14px';
const host=document.querySelector('.lesson-cards') || document.querySelector('#resultsSection') || document.querySelector('main');
if(host){if(host.matches('.lesson-cards'))host.before(status);else host.prepend(status);}
const history=document.createElement('div');if(host){if(host.matches('.lesson-cards'))host.after(history);else host.append(history);}
const buttons=[];
document.querySelectorAll('.lesson-card').forEach((card,index)=>{
  const button=document.createElement('button');button.className='btn';button.type='button';button.textContent='Mark outline reviewed';button.dataset.lesson=`outline-${index+1}`;button.style.marginTop='14px';
  card.querySelector('.lesson-body')?.append(button);buttons.push(button);
  button.onclick=async()=>{
    button.disabled=true;
    try {const completed=button.getAttribute('aria-pressed')!=='true';await cloudCall('webLearning',{action:'lesson',topic:safeTopic,lesson:button.dataset.lesson,completed});button.setAttribute('aria-pressed',String(completed));button.textContent=completed?'Reviewed ✓':'Mark outline reviewed';status.textContent='Progress saved to your account.';}
    catch(e){status.textContent=e.message || 'Progress could not be saved.';}finally{button.disabled=!auth.currentUser;}
  };
});
onAuthStateChanged(auth,async user=>{
  const version=++generation;history.replaceChildren();
  buttons.forEach(b=>{b.disabled=!user;b.setAttribute('aria-pressed','false');b.textContent='Mark outline reviewed';});
  if(!user){status.textContent='Sign in to save learning progress across devices.';return;}
  status.textContent='Loading your learning progress…';
  try{const data=await cloudCall('webLearning',{action:'read',topic:safeTopic});if(version!==generation)return;
    buttons.forEach(b=>{const completed=data.lessons?.[b.dataset.lesson]?.completed===true;b.setAttribute('aria-pressed',String(completed));b.textContent=completed?'Reviewed ✓':'Mark outline reviewed';});
    if(data.attempts?.length){const title=document.createElement('h3');title.textContent='Recent quiz history';history.append(title);for(const attempt of data.attempts){const row=document.createElement('p');row.textContent=`${new Date(attempt.completedAt).toLocaleDateString()} · ${attempt.correct}/${attempt.total}`;history.append(row);}}
    status.textContent=data.lastQuiz?`Cloud sync ready. Last quiz: ${data.lastQuiz.correct}/${data.lastQuiz.total}.`:`Cloud sync ready. ${buttons.filter(b=>b.getAttribute('aria-pressed')==='true').length} of ${buttons.length} outlines reviewed.`;
  }catch(e){if(version===generation)status.textContent='Cloud sync unavailable: '+e.message;}
});
window.addEventListener('fynx:quiz-completed',async e=>{
  if(!auth.currentUser){status.textContent='Sign in before taking a quiz to save its result.';return;}
  status.textContent='Saving quiz result…';
  try{await cloudCall('webLearning',{action:'quiz',topic:safeTopic,attempt:e.detail.attempt,correct:e.detail.correct,total:e.detail.total});status.textContent='Quiz result saved to your account.';}
  catch(error){status.textContent='Quiz result was not saved: '+error.message;}
});
