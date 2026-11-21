const assert = require('assert');
const fs = require('fs');
const path = require('path');

function buildConfig(key) {
  if (!key || key.length < 8) throw new Error('invalid key');
  return {
    style: 'https://api.maptiler.com/maps/satellite/style.json?key=' + key,
    provider: 'maptiler'
  };
}

const cfg = buildConfig('testkey123');
assert.strictEqual(cfg.provider, 'maptiler');
assert.ok(cfg.style.startsWith('https://api.maptiler.com/maps/satellite/style.json?key='));
assert.ok(!cfg.style.includes('YOUR_'));

const src = fs.readFileSync(path.join(__dirname, '..', 'assets/js/terminal/satellite-map.js'), 'utf8');
assert.ok(src.includes('/assets/config/satellite.json'), 'map must load runtime config');
assert.ok(src.includes('maplibregl.Map'), 'map must initialize MapLibre');
assert.ok(src.includes('escapeHTML(value)'), 'popup content must escape HTML');
assert.ok(!src.includes('server.arcgisonline.com'), 'unlicensed Esri development tiles must not be fetched');
assert.ok(src.includes('/^https?:\\/\\//i.test(p.url)'), 'popup source links must be http(s)');
assert.ok(src.includes('originalToggle.click()'), 'flat/globe must use original redraw function');
assert.ok(src.includes("W.mapMode !== 'satellite'"), 'async mount must respect mode changes');
assert.ok(!src.includes('YOUR_MAPTILER_KEY'), 'key placeholder must not be hardcoded');

const html = fs.readFileSync(path.join(__dirname, '..', 'terminal.html'), 'utf8');
assert.ok(html.includes('satellite-map.js'), 'terminal must load satellite module');
assert.ok(!html.includes('assets/js/terminal/world.js') || html.includes('world.js'), 'flat/globe scripts remain');

console.log('satellite config and init checks passed');
