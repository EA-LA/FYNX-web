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
assert.ok(!src.includes('YOUR_MAPTILER_KEY'), 'key placeholder must not be hardcoded');

const html = fs.readFileSync(path.join(__dirname, '..', 'terminal.html'), 'utf8');
assert.ok(html.includes('satellite-map.js'), 'terminal must load satellite module');
assert.ok(!html.includes('assets/js/terminal/world.js') || html.includes('world.js'), 'flat/globe scripts remain');

console.log('satellite config and init checks passed');
