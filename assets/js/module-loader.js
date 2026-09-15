/* Load tab contents on first use, retaining the frame to preserve user state. */
(() => {
  const panels = [...document.querySelectorAll('.mode-content')];
  function loadActive() {
    for(const panel of panels){
      if(!panel.classList.contains('active'))continue;
      panel.querySelectorAll('iframe[data-src]').forEach(frame=>{
        frame.src=frame.dataset.src;delete frame.dataset.src;
        frame.loading='lazy';
      });
    }
    document.querySelectorAll('[role=tab]').forEach(tab=>{tab.tabIndex=tab.getAttribute('aria-selected')==='true'?0:-1;});
  }
  const observer=new MutationObserver(loadActive);
  panels.forEach(panel=>observer.observe(panel,{attributes:true,attributeFilter:['class']}));
  document.querySelectorAll('[role=tablist]').forEach(list=>{
    list.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const tabs=[...list.querySelectorAll('[role=tab]')];const current=tabs.indexOf(document.activeElement);if(current<0)return;
      event.preventDefault();
      const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      tabs[index].focus();tabs[index].click();
    });
  });
  loadActive();
})();
