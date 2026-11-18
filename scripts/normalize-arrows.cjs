'use strict';
/* iOS draws ↗︎ (U+2197) as a blue emoji box unless it is followed by the text-presentation
 * selector U+FE0E. Every build normalises site HTML/JS/CSS so the arrow always renders as text. */
const fs = require('fs'), path = require('path');
const SKIP = /(^|\/)(node_modules|dist|\.git|tests)(\/|$)/;
function run(root = process.cwd()) {
  let files = 0, fixes = 0;
  (function walk(dir) {
    for (const d of fs.readdirSync(dir, {withFileTypes: true})) {
      const p = path.join(dir, d.name), rel = path.relative(root, p);
      if (SKIP.test(rel)) continue;
      if (d.isDirectory()) { walk(p); continue; }
      if (!/\.(html|js|cjs|css)$/.test(d.name)) continue;
      const s = fs.readFileSync(p, 'utf8'); if (!s.includes('↗︎')) continue;
      const t = s.replace(/↗︎(?!︎)/g, '↗︎');
      if (t !== s) { fixes += (t.length - s.length); files++; fs.writeFileSync(p, t); }
    }
  })(root);
  if (fixes) console.log(`Arrow glyphs set to text style: ${fixes} in ${files} files.`);
  return fixes;
}
module.exports = {run};
if (require.main === module) run();
