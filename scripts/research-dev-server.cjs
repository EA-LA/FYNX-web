'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createResearchService}=require('../backend/research-data.cjs');
const root=path.resolve(__dirname,'..'),service=createResearchService();
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/api/market-feed') {
    try { const {handler}=require('../backend/market-feed.js')._test;
      const response={set:(key,value)=>{res.setHeader(key,value);return response;},status:code=>{res.statusCode=code;return response;},json:data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));},send:value=>res.end(value)};
      await handler({method:req.method,query:Object.fromEntries(url.searchParams)},response);
    } catch {res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Feed is unavailable'}));}
    return;
  }
  if(url.pathname==='/api/research') {
    try{const data=await service.query(Object.fromEntries(url.searchParams));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));}
    catch(error){res.writeHead(error.status||503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
}).listen(Number(process.env.RESEARCH_PORT||4173),'127.0.0.1',()=>console.log('Research desk: http://127.0.0.1:'+(process.env.RESEARCH_PORT||4173)+'/tools/research-desk.html'));
