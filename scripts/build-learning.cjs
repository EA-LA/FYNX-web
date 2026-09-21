// Render each existing learning view into HTML so its content is available without JavaScript.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const base = 'https://www.fynxfinanceworld.com';
const topics = ['forex','stocks','crypto','funds','futures','indices','bonds','economy','options'];
const sections = ['howto','quizzes','glossary'];
let template = fs.readFileSync(path.join(root, 'learn/topic.html'), 'utf8');
const urls = [];
for (const topic of topics) for (const section of sections) {
  const filename = `${topic}-${section}.html`;
  const url = `${base}/learn/${filename}`;
  const dom = new JSDOM(template, {url: `${base}/learn/topic.html?topic=${topic}&section=${section}`, runScripts: 'outside-only'});
  const {document} = dom.window;
  document.body.dataset.learningTopic = topic;
  document.body.dataset.learningSection = section;
  for (const script of document.querySelectorAll('script:not([src])')) {
    if (!script.type || script.type === 'text/javascript') dom.window.eval(script.textContent);
  }
  document.title = `${document.getElementById('pageTitle').textContent} | FYNX Finance World`;
  const description = document.getElementById('pageDesc').textContent;
  document.querySelector('meta[name="description"]').content = description;
  document.querySelector('link[rel="canonical"]').href = url;
  for (const [key, value] of [['og:title',document.title],['og:description',description],['og:url',url]]) document.querySelector(`meta[property="${key}"]`).content=value;
  fs.writeFileSync(path.join(root,'learn',filename),dom.serialize().replace(/^[ \t]+$/gm, ""));
  urls.push(url);dom.window.close();
}
let sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
sitemap=sitemap.replace(/\s*<url><loc>https:\/\/www\.fynxfinanceworld\.com\/learn\/[^<]+-(howto|quizzes|glossary)\.html<\/loc><\/url>/g,'');
sitemap=sitemap.replace('</urlset>',urls.map(url=>`  <url><loc>${url}</loc></url>`).join('\n')+'\n</urlset>');
fs.writeFileSync(path.join(root,'sitemap.xml'),sitemap);
console.log(`Rendered ${urls.length} topic pages.`);
