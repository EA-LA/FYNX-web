// Regression: critical JS files must not be empty or truncated.
const fs = require('fs');
const path = require('path');
const critical = [
  'assets/js/terminal-header.js',
  'fynx-nav.js',
  'assets/js/account-system.js',
  'assets/js/account-ui.js',
  'assets/js/auto-news-ingest.js'
];
let failed = false;
for (const rel of critical) {
  const p = path.join(__dirname, '..', rel);
  if (!fs.existsSync(p)) {
    console.error('MISSING:', rel);
    failed = true;
    continue;
  }
  const stat = fs.statSync(p);
  const content = fs.readFileSync(p, 'utf8');
  if (stat.size < 200 || content.trim().length < 200 || !content.includes('function')) {
    console.error('EMPTY OR TRUNCATED:', rel, 'size=' + stat.size);
    failed = true;
  } else {
    console.log('OK:', rel, 'size=' + stat.size);
  }
}
if (failed) process.exit(1);
console.log('All critical JS files non-empty.');
