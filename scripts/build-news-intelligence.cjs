const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const fragment=fs.readFileSync(path.join(root,'content/news-intelligence.fragment'),'utf8');
for(const route of ['news.html','news/news.html']){
 const file=path.join(root,route),html=fs.readFileSync(file,'utf8');
 if(!html.includes('<!-- news-intelligence:start -->'))throw new Error('Missing News insertion marker: '+route);
 let next=html.replace(/<!-- news-intelligence:start -->[\s\S]*?<!-- news-intelligence:end -->/,'<!-- news-intelligence:start -->\n'+fragment+'\n<!-- news-intelligence:end -->');
 next=next.replace(/news-intelligence\.js\?v=[^"']*/g,'news-intelligence.js?v=20261030-r1');
 if(route==='news/news.html'&&!next.includes('src="/assets/js/terminal-market-data.js'))next=next.replace('</head>','<script src="/assets/js/terminal-market-data.js?v=20261030-r1" defer></script>\n</head>');
 next=next.replace(/<!-- newsroom-foundation:start -->[\s\S]*?<!-- newsroom-foundation:end -->\s*/g,'');
 const foundation='<!-- newsroom-foundation:start -->\n<script src="/assets/js/newsroom-editions.js?v=20261030-r1" defer></script>\n<script src="/assets/js/newsroom-media.js?v=20261030-r1" defer></script>\n<link rel="stylesheet" href="/assets/css/newsroom.css?v=20261030-r1">\n<!-- newsroom-foundation:end -->\n';
 next=next.replace(/<script[^>]*src=["'][^"']*market-intelligence-data\.js[^>]*>/,tag=>foundation+tag);
 fs.writeFileSync(file,next);
}
console.log('News Intelligence: both existing routes share the complete native workspace.');
