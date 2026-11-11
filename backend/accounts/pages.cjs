'use strict';
// Private HTML is rendered from owner-scoped persisted state, never provider calls.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');
const providerRoutes=new Set(['mt5','mt4','ctrader','dxtrade','tradelocker','matchtrader','oanda','ibkr','binance','bybit','ea','file']);
const fixedRoutes=new Set(['/profile/accounts','/profile/accounts/connect','/profile/security','/profile/accounts/privacy','/profile/accounts/admin']);
let renderer;function views(){return renderer||(renderer=import(pathToFileURL(path.join(root,'assets/js/accounts/render.mjs')).href));}
function createAccountsPages(api){return async(req,res)=>{
 const url=new URL(req.url,'http://accounts.local'),pathname=url.pathname.replace(/\/$/,'');
 if(!/^\/profile\/(?:accounts(?:\/.*)?|security)$/.test(pathname))return false;
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return true;}
 const accountId=/^\/profile\/accounts\/[a-f0-9-]{36}$/.test(pathname)?pathname.split('/').at(-1):null;
 if(!accountId&&!fixedRoutes.has(pathname)&&!(/^\/profile\/accounts\/connect\/[^/]+$/.test(pathname)&&providerRoutes.has(pathname.split('/').at(-1)))){api.securityHeaders(req,res);res.writeHead(404);res.end('Account page not found.');return true;}
 const template=accountId?'/profile/accounts':pathname,file=path.join(root,template,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404);res.end('Account page not found.');return true;}
 api.securityHeaders(req,res);const v=await views();let body;
 try{
  const page=pathname==='/profile/security'?'security':pathname.includes('/connect')?'connect':'dashboard',data=await api.loadPage(req,{page,accountId});
  if(pathname==='/profile/accounts/connect')body=v.choose(data.bootstrap,url.searchParams.get('firm')||'');
  else if(pathname.includes('/connect/')){const provider=data.bootstrap.providers.find(p=>p.id===pathname.split('/').at(-1));body=provider?v.connect({...provider,helpUrl:provider.helpUrl||provider.helpURL},data.bootstrap,url.searchParams.get('firm')||''):v.errorView('This platform is unavailable.');}
  else if(pathname.endsWith('/privacy'))body=v.privacy();
  else if(pathname.endsWith('/admin'))body='<section class="ac-panel"><h1>Rules administration</h1><p>Checking your administrator permission…</p></section>';
  else body=page==='security'?v.security(data.bootstrap):v.dashboard(data.bootstrap);
 }catch(error){body=error.status===401?v.signIn():v.errorView(error.code==='AUTH_NOT_CONFIGURED'?'Account sign-in is not configured on this service.':'Your account data is temporarily unavailable.');}
 const html=fs.readFileSync(file,'utf8').replace(/<div id="accounts-content">[\s\S]*?<\/div>\s*<footer class="ac-footer">/,`<div id="accounts-content">${body}</div><footer class="ac-footer">`);
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});if(req.method==='HEAD')res.end();else res.end(html);return true;
};}
module.exports={createAccountsPages};
