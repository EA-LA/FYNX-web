import {$,toast} from './shared.js';
import {store} from './store.js';
import {initializeFinancials,renderScreen} from './financials.js';
import {refreshHeatmap} from './markets.js';
import {renderAssistant,checkAI} from './assistant.js';
import './strategy.js';
import {renderPortfolio,refreshPortfolio,renderAlerts,checkAlerts} from './personal.js';
const names=['financials','screener','heatmap','assistant','strategy','portfolio','alerts'];let active=null;
function navigate(){
  const fallback=names.includes(document.body.dataset.researchPanel)?document.body.dataset.researchPanel:'financials';
  const name=names.includes(location.hash.slice(1))?location.hash.slice(1):fallback;
  if(location.hash==='#sources'&&active)return;
  for(const panel of document.querySelectorAll('.desk-panel'))panel.hidden=panel.id!=='panel-'+name;
  for(const link of document.querySelectorAll('#desk-nav a')){if(link.dataset.panel===name)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
  const changed=active!==name;active=name;
  if(!changed)return;
  if(name==='screener')renderScreen();
  if(name==='heatmap')refreshHeatmap();
  if(name==='assistant'){renderAssistant();checkAI();}
  if(name==='portfolio'){renderPortfolio();refreshPortfolio();}
  if(name==='alerts'){renderAlerts();checkAlerts(true);}
}
addEventListener('hashchange',navigate);
$('#desk-nav').addEventListener('click',event=>{if(event.target.closest('a'))requestAnimationFrame(()=>{const panel=$('#research-panel');panel.focus({preventScroll:true});if(panel.getBoundingClientRect().top<0)panel.scrollIntoView({block:'start'});});});
store.initialize().catch(()=>toast('Your local workspace could not open. Public research tools remain available.'));
initializeFinancials();renderPortfolio();renderAlerts();renderAssistant();navigate();
