'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {VERSION}=require('./build-release-assets.cjs');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/js/research/personal.js'),'utf8');
const app=fs.readFileSync(path.join(root,'assets/js/research/app.js'),'utf8');
const match=source.match(/export async function refreshPortfolio\(\)\{([\s\S]*?)\n\}/);
assert.ok(match,'Locate the actual production refreshPortfolio controller');
const controller=match[1];
function fixture(quotes) {
  const button={disabled:false,textContent:'Refresh marks ↻'};
  const store={key:'guest',state:{holdings:[{symbol:'AAPL'}]}};
  let renderCount=0;
  const make=new Function('$','store','quotes','renderPortfolio','toast',
    "let portfolioBusy=false,portfolioRefreshError=''; async function refreshPortfolio(){"+controller+"\n};return {refreshPortfolio,getError:()=>portfolioRefreshError};");
  const subject=make(selector=>{assert.equal(selector,'#refresh-portfolio');return button;},
    store,quotes,()=>{renderCount++},()=>{throw Error('An ephemeral toast cannot replace persistent refresh feedback');});
  return {...subject,button,store,renders:()=>renderCount};
}
test('Failed portfolio refresh keeps a persistent visible error while resetting the button',async()=>{
 const f=fixture(async()=>{throw Error('Provider temporarily unavailable');});
 await f.refreshPortfolio();
 assert.match(f.getError(),/Quote refresh failed/);
 assert.match(f.getError(),/Existing portfolio marks may be outdated/);
 assert.match(f.getError(),/Provider temporarily unavailable/);
 assert.equal(f.renders(),1);
 assert.equal(f.button.disabled,false);
 assert.equal(f.button.textContent,'Refresh marks ↻');
 assert.match(source,/portfolioRefreshError\?errorHTML\(portfolioRefreshError\)/,
   'Error must be escaped and shown in the portfolio results, not only in a toast');
});
test('A successful retry clears earlier refresh errors',async()=>{
 let calls=0;
 const f=fixture(async()=>{calls++;if(calls===1)throw Error('Offline');return {quotes:{AAPL:{price:100}}};});
 await f.refreshPortfolio();
 assert.notEqual(f.getError(),'');
 await f.refreshPortfolio();
 assert.equal(f.getError(),'');
 assert.equal(f.renders(),2);
 assert.equal(f.button.disabled,false);
});
test('An old-account request cannot show its failure after switching accounts',async()=>{
 let rejectRequest;
 const f=fixture(()=>new Promise((_,reject)=>{rejectRequest=reject;}));
 const pending=f.refreshPortfolio();
 f.store.key='another-account';
 rejectRequest(Error('Old account network failure'));
 await pending;
 assert.equal(f.getError(),'');
 assert.equal(f.renders(),0);
 assert.equal(f.button.disabled,false);
 assert.match(source,/portfolioRefreshError='';\}renderPortfolio\(\);renderAlerts\(\)/,
   'Switching workspaces must clear old refresh feedback');
});
test('Error never silently becomes a trusted HTML fragment',()=>{
 assert.match(source,/portfolioRefreshError\?errorHTML\(portfolioRefreshError\)/);
 const personalImport=app.match(/from\s*['"]([^'"]*personal\.js[^'"]*)['"]/);
 assert.ok(personalImport,'The app must import the production portfolio renderer');
 assert.equal(new URL(personalImport[1],'https://www.fynxfinanceworld.com/assets/js/research/app.js').searchParams.get('v'),VERSION,
   'The portfolio renderer must use the current release cache version');
});
