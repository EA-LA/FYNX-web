/* Shared Profile entry. Quant account records are fetched only inside its workspace. */
(function(){
  'use strict';
  function mount(){
    const list=document.querySelector('.settings-list');if(!list||document.getElementById('quantProfileEntry'))return;
    const link=document.createElement('a');link.id='quantProfileEntry';link.href='/quant-analyst.html#saved-strategies';link.className='settings-item';link.style.cssText='color:inherit;text-decoration:none';
    const text=document.createElement('div');text.className='settings-text';
    const title=document.createElement('div');title.className='settings-label';title.textContent='Quant strategies & portfolios';
    const description=document.createElement('div');description.className='settings-value';description.textContent='Open your saved research workspace and imported strategies.';
    text.append(title,description);link.append(text);list.append(link);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
