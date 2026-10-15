const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const base = 'https://www.fynxfinanceworld.com';
const person = {'@type':'Person','@id':'https://ea-la.github.io/#person',name:'Elham Amini',url:'https://ea-la.github.io/',jobTitle:'Founder of FYNX',sameAs:['https://www.linkedin.com/in/elham-amini-745560302/','https://www.instagram.com/___elham_amini___/'],worksFor:{'@id':base+'/#organization'}};
const organization = {'@type':'Organization','@id':base+'/#organization',name:'FYNX',alternateName:'FYNX Finance World',url:base+'/',founder:{'@id':person['@id']},sameAs:['https://www.fynxfunded.com/','https://site.fynxfinanceworld.com/','https://blog.fynxfinanceworld.com/','https://roadmap.fynxfinanceworld.com/']};
const urls = [...fs.readFileSync(path.join(root,'sitemap.xml'),'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
for (const url of urls) {
  const route = new URL(url).pathname;
  const file = path.join(root, route==='/'?'index.html':route==='/api/'?'api/index.html':route.slice(1));
  let html = fs.readFileSync(file,'utf8').replace(/<!-- search-identity:start -->[\s\S]*?<!-- search-identity:end -->\s*/g,'');
  // Replace the earlier standalone company entities with the connected graph below.
  if (['/about.html','/founder.html'].includes(route)) html = html.replace(/<script type="application\/ld\+json">([^<]+)<\/script>/g,(all,data)=>['AboutPage','ProfilePage'].includes(JSON.parse(data)['@type'])?'':all);
  const dom = new JSDOM(html), doc = dom.window.document;
  const title = doc.title, description = doc.querySelector('meta[name=description]').content;
  const webpage = {'@type':route==='/founder.html'?'ProfilePage':route==='/about.html'?'AboutPage':route==='/contact.html'?'ContactPage':'WebPage','@id':url+'#webpage',url,name:title,description,inLanguage:'en',isPartOf:{'@id':base+'/#website'},publisher:{'@id':organization['@id']}};
  const graph = [organization,person,{'@type':'WebSite','@id':base+'/#website',url:base+'/',name:'FYNX Finance World',publisher:{'@id':organization['@id']}},webpage];
  if (route==='/founder.html') webpage.mainEntity={'@id':person['@id']};
  if (route==='/about.html') webpage.about={'@id':organization['@id']};
  if (route.startsWith('/tools/')) {
    const app = {'@type':'WebApplication','@id':url+'#tool',url,name:title.replace(/ \| FYNX.*$/,''),description,applicationCategory:'FinanceApplication',operatingSystem:'Web browser',publisher:{'@id':organization['@id']}};
    graph.push(app); webpage.mainEntity={'@id':app['@id']};
  }
  if (route.startsWith('/api/')) webpage.about={ '@type':'SoftwareApplication',name:'FYNX API',url:base+'/api/',applicationCategory:'DeveloperApplication',operatingSystem:'HTTP API',publisher:{'@id':organization['@id']} };
  html=html.replace('</head>',`<!-- search-identity:start --><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c')}</script><!-- search-identity:end -->\n</head>`);
  fs.writeFileSync(file,html); dom.window.close();
}
console.log(`Connected page, tool, FYNX and founder identities on ${urls.length} public pages.`);
