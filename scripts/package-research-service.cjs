'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.deploy-work','research'),source=path.join(out,'functions');
fs.mkdirSync(source,{recursive:true});
for(const dir of ['quant','edge','research-runtime'])fs.cpSync(path.join(root,'backend',dir),path.join(source,'backend',dir),{recursive:true,filter:f=>fs.statSync(f).isDirectory()||f.endsWith('.cjs')});
// Keep an independently usable dated baseline inside the function on cold starts
// if both public mirrors are unavailable. Copy only the known public files.
const datasets=['edge.json','factors.json',...require('../backend/quant/common.cjs').symbols().map(m=>'bars/'+m.id+'-D1.json')];
for(const file of datasets){const dst=path.join(source,'observations',file);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,'assets/data/research',file),dst);}
for(const file of ['package.json','package-lock.json'])fs.copyFileSync(path.join(root,'backend/research-runtime',file),path.join(source,file));
fs.writeFileSync(path.join(out,'firebase.json'),JSON.stringify({functions:[{source:'functions',codebase:'trading-research',runtime:'nodejs22',ignore:['node_modules','.git','*.log']}]},null,2));
console.log('Research service packaged in .deploy-work/research; only server modules and public market observations included.');
