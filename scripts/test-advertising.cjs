const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fynx-ads-test-'));
try{
 for(const dir of ['scripts','config','news'])fs.mkdirSync(path.join(tmp,dir),{recursive:true});
 fs.copyFileSync(path.join(root,'scripts/build-advertising.cjs'),path.join(tmp,'scripts/build-advertising.cjs'));
 const config=JSON.parse(fs.readFileSync(path.join(root,'config/advertising.json')));
 for(const page of config.pages)fs.writeFileSync(path.join(tmp,page),'<html><body><footer>Company</footer></body></html>');
 function run(){fs.writeFileSync(path.join(tmp,'config/advertising.json'),JSON.stringify(config));return execFileSync(process.execPath,[path.join(tmp,'scripts/build-advertising.cjs')],{stdio:'pipe'});}
 run();assert(!fs.existsSync(path.join(tmp,'ads.txt')));
 config.enabled=true;assert.throws(run);
 Object.assign(config,{publisherId:'ca-pub-1234567890123456',slotId:'1234567890',siteApproved:true,privacyAndConsentReady:true});
 run();run();const html=fs.readFileSync(path.join(tmp,'index.html'),'utf8');assert.equal(html.split('FYNX AD START').length,2);assert(html.includes('Advertisement'));assert(fs.existsSync(path.join(tmp,'ads.txt')));
 config.pages.push('journal.html');assert.throws(run);config.pages.pop();
 config.enabled=false;run();assert(!fs.readFileSync(path.join(tmp,'index.html'),'utf8').includes('adsbygoogle'));assert(!fs.existsSync(path.join(tmp,'ads.txt')));
 console.log('PASS ads disabled, missing IDs rejected, protected routes excluded, idempotent generation and removal');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
