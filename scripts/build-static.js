const fs = require('fs');
const path = require('path');

const root = process.cwd();
const required = ['index.html', 'styles.css', 'script.js', 'assets/theme.css', 'assets/theme.js'];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error(`Missing required static assets: ${missing.join(', ')}`);
  process.exit(1);
}

const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
if (!css.includes('FYNX Premium Fintech UI Polish')) {
  console.error('Premium UI stylesheet block was not found.');
  process.exit(1);
}

console.log('Static build check passed: FYNX public assets are ready for deployment.');

// Every route must load the shared design and use an explicit layout family.
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'scripts/design-inventory.json'), 'utf8'));
for (const { page, layout } of inventory) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  for (const asset of ['funded-system.css', 'site-design.css', 'journal-theme.js', 'site-theme-init.js']) {
    if (html.split(asset).length !== 2) throw new Error(`${page}: expected one ${asset} reference`);
  }
  if (!html.includes(`data-fynx-layout="${layout}"`)) throw new Error(`${page}: missing design layout`);
}
console.log(`Shared design verified on all ${inventory.length} HTML pages.`);
