/* "How it works" panels must survive the build: generated pages get them from scripts/lib/tool-intro.cjs, and the
 * homepage card artwork stylesheet is part of the index.html asset block. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8'), T = require('./lib/tool-intro.cjs');
for (const [kind, hero] of [['edge', '<p class="edge-muted edge-intro">x</p>'], ['quant', '<p class="lead">x</p>']]) {
  const out = T.apply(kind, `<html><head></head><body>${hero}</body></html>`);
  assert.ok(out.indexOf('fx-tool-intro') > out.indexOf(hero), kind + ' panel follows the hero text');
  assert.ok(out.includes('/assets/css/tool-intro.css'), kind + ' stylesheet added');
  assert.equal(T.apply(kind, out), out, kind + ' is applied once');
  assert.throws(() => T.apply(kind, '<html><head></head><body></body></html>'), /anchor missing/);
}
assert.match(R('scripts/build-quant.cjs'), /tool-intro\.cjs'\)\.apply\('quant'/);
assert.match(R('scripts/build-edge.cjs'), /tool-intro\.cjs'\)\.apply\('edge'/);
assert.match(R('scripts/build-terminal-design.cjs'), /landing-media\.css/);
for (const p of ['quant-analyst.html', 'macro-desk.html', 'edge-radar/index.html', 'edge-radar/eurusd/index.html']) {
  const s = R(p); assert.ok(s.includes('class="fx-tool-intro"') && s.includes('tool-intro.css'), p);
  assert.match(s, /What it is not<\/h3><p>[^<]*(not|No)/, p + ' says plainly what the tool does not do');
}
console.log('Tool intro panels: generator wiring, single application, anchors and committed pages passed');
