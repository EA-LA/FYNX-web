'use strict';
// Guard: calculators must never write a user's inputs into the current tab's URL/history.
// "Copy scenario link" builds a link for the clipboard only. The one allowed history write
// on calculator pages is a cleanup that *removes* scenario params after they are applied
// (it must sit right after searchParams.delete(...) calls).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const files = [
  ...fs.readdirSync(path.join(root, 'tools')).filter(f => f.endsWith('.html')).map(f => path.join('tools', f)),
  path.join('assets', 'js', 'scenario-link.js'),
  'calculator.html'
].filter(f => fs.existsSync(path.join(root, f)));

test('calculator pages do not put inputs into the address bar', () => {
  assert.ok(files.length > 10, 'expected to scan the calculator pages');
  const offenders = [];
  for (const file of files) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const re = /history\s*\.\s*(replaceState|pushState)\s*\(|location\s*\.\s*(search|hash)\s*=(?!=)/g;
    let m;
    while ((m = re.exec(src))) {
      const before = src.slice(Math.max(0, m.index - 400), m.index);
      const isCleanup = m[1] === 'replaceState' && /searchParams\.delete\(/.test(before);
      if (!isCleanup) offenders.push(`${file}:${src.slice(0, m.index).split('\n').length} ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], 'Calculator code must not write inputs to the URL/history (copy the link to the clipboard only):\n' + offenders.join('\n'));
});

test('guard catches the original bug pattern', () => {
  const bad = "btn.addEventListener('click', function () { var link = buildLink(); try { window.history.replaceState(null, '', link); } catch (e) {} });";
  const re = /history\s*\.\s*(replaceState|pushState)\s*\(/g;
  const m = re.exec(bad);
  assert.ok(m && !/searchParams\.delete\(/.test(bad.slice(0, m.index)));
});
