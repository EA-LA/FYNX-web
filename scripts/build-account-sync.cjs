'use strict';
const fs=require('node:fs'),path=require('node:path');
const {publicSiteFiles}=require('./public-site-files.cjs');
function build(root=path.resolve(__dirname,'..')){let count=0;for(const file of publicSiteFiles(root,{extensions:['.html']})){const p=path.join(root,file),source=fs.readFileSync(p,'utf8');if(!source.includes('</body>')||/app-return\.html$|auth\//.test(file))continue;const tag='<script type="module" src="/assets/js/account-sync.js?v=20261113-shared-account"></script>';if(source.includes('src="/assets/js/account-sync.js'))continue;fs.writeFileSync(p,source.replace('</body>',tag+'\n</body>'));count++;}return count;}
module.exports={build};if(require.main===module)console.log('Shared account entry added to '+build()+' routes.');
