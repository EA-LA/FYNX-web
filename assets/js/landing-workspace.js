(() => {
 const terminal=document.querySelector('.fw-terminal');if(!terminal)return;
 const tabs=[...terminal.querySelectorAll('[data-fw-tab]')],panels=[...terminal.querySelectorAll('.fw-panel')],control=document.getElementById('fw-motion'),motion=matchMedia('(prefers-reduced-motion: reduce)');
 let index=0,paused=motion.matches,visible=false,timer;
 function sync(){clearInterval(timer);terminal.classList.toggle('fw-paused',paused||!visible||document.hidden);control.setAttribute('aria-pressed',String(paused));control.textContent=paused?'Play motion ▷':'Pause motion Ⅱ';if(!paused&&visible&&!document.hidden)timer=setInterval(()=>show((index+1)%tabs.length),7000);}
 function show(next){index=next;tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;panels[i].hidden=i!==index;});const bar=terminal.querySelector('.fw-progress>span');bar.style.animation='none';void bar.offsetWidth;bar.style.animation='';}
 tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>{show(i);paused=true;sync();});tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;show(next);paused=true;sync();tabs[next].focus();});});
 control.addEventListener('click',()=>{paused=!paused;show(index);sync();});
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:.25}).observe(terminal);
 terminal.addEventListener('focusin',event=>{if(event.target!==control){paused=true;sync();}});
 document.addEventListener('visibilitychange',sync);motion.addEventListener('change',()=>{paused=motion.matches;sync();});sync();
})();
