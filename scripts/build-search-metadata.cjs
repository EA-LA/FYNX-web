const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pages = require('./search-page-names.json');
const escape = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
for (const [file, page] of Object.entries(pages)) {
  const target = path.join(root, file);
  const source = fs.readFileSync(target, 'utf8');
  const boundary = source.indexOf('</head>');
  let head = source.slice(0, boundary);
  head = head.replace(/<title>.*?<\/title>/s, `<title>${escape(page.title)}</title>`);
  for (const [key, value] of [['description', page.description], ['og:title', page.title], ['og:description', page.description]]) {
    head = head.replace(new RegExp(`(<meta (?:name|property)="${key}" content=")[^"]*("[^>]*>)`), (_, before, after) => before + escape(value) + after);
  }
  fs.writeFileSync(target, head + source.slice(boundary));
}
console.log(`Applied specific search names to ${Object.keys(pages).length} resource pages.`);
