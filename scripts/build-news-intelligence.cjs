const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const fragment=fs.readFileSync(path.join(root,'content/news-intelligence.fragment'),'utf8');
for(const route of ['news.html','news/news.html']){
 const file=path.join(root,route),html=fs.readFileSync(file,'utf8');
 if(!html.includes('<!-- news-intelligence:start -->'))throw new Error('Missing News insertion marker: '+route);
 let next=html.replace(/<!-- news-intelligence:start -->[\s\S]*?<!-- news-intelligence:end -->/,'<!-- news-intelligence:start -->\n'+fragment+'\n<!-- news-intelligence:end -->');
 next=next.replace(/news-intelligence\.js\?v=[^"']*/g,'news-intelligence.js?v=20261029-r2');
 if(route==='news/news.html'&&!next.includes('src="/assets/js/terminal-market-data.js'))next=next.replace('</head>','<script src="/assets/js/terminal-market-data.js?v=20261029-r2" defer></script>\n</head>');
 fs.writeFileSync(file,next);
}
console.log('News Intelligence: both existing routes share the complete native workspace.');
