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
