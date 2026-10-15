const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const pages = require('../content/research-pages.cjs');
const source = fs.readFileSync(path.join(root, 'tools/research-desk.html'), 'utf8')
  .replace(/<!-- (discovery-[\w-]+|search-identity):start -->[\s\S]*?<!-- \1:end -->\s*/g, '');
for (const [panel, slug, title, description, instructions] of pages) {
  const dom = new JSDOM(source), doc = dom.window.document;
  doc.title = `${title} | FYNX`;
  doc.querySelector('meta[name="description"]').content = description;
  doc.body.dataset.researchPanel = panel;
  doc.querySelector('h1').textContent = title;
  doc.querySelector('.desk-lead').textContent = description;
  for (const section of doc.querySelectorAll('.desk-panel')) section.hidden = section.id !== `panel-${panel}`;
  for (const link of doc.querySelectorAll('#desk-nav a')) {
    link.href = `/tools/${pages.find(p => p[0] === link.dataset.panel)[1]}.html`;
    if (link.dataset.panel === panel) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const guide = doc.createElement('section');
  guide.className = 'desk-sources tool-explainer';
  const heading = doc.createElement('h2'); heading.textContent = 'How to use this tool';
  const paragraph = doc.createElement('p'); paragraph.textContent = instructions;
  guide.append(heading, paragraph);
  doc.getElementById('sources').before(guide);
  fs.writeFileSync(path.join(root, `tools/${slug}.html`), dom.serialize());
  dom.window.close();
}
// The original desk remains a stable entry point, with crawlable links to every tool.
let hub = fs.readFileSync(path.join(root, 'tools/research-desk.html'), 'utf8');
for (const [panel, slug] of pages) hub = hub.replace(new RegExp(`href="(?:#${panel}|/tools/${slug}\\.html)" data-panel="${panel}"`), `href="/tools/${slug}.html" data-panel="${panel}"`);
fs.writeFileSync(path.join(root, 'tools/research-desk.html'), hub);
console.log(`Built ${pages.length} individual research tool routes.`);
