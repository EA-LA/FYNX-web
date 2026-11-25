'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const source = read('assets/js/broker-lot-check.js');
const fields = ['broker-risk', 'broker-stop', 'broker-pip-value', 'broker-step', 'broker-minimum'];

function open(t) {
  const dom = new JSDOM(read('tools/position-size.html'), { runScripts:'outside-only' });
  t.after(() => dom.window.close());
  const doc = dom.window.document;
  const field = id => doc.getElementById(id);
  const set = (id, value) => {
    field(id).value = value;
    field(id).dispatchEvent(new dom.window.Event('input', { bubbles:true }));
  };
  assert.equal(field('broker-lot-run').disabled, true);
  dom.window.eval(read('assets/vendor/decimal.js'));
  dom.window.eval(source);
  assert.equal(field('broker-lot-run').disabled, false);
  return {doc, field, set,
    check(values) {
      values.forEach((value, i) => set(fields[i], value));
      field('broker-lot-run').click();
      return field('broker-lot-result').textContent;
    }
  };
}

test('calculator directory and existing form link to the separate new broker check', t => {
  const dir = new JSDOM(read('calculator.html'));
  t.after(() => dir.window.close());
  assert.ok(dir.window.document.querySelector('article a[href="/tools/position-size.html"]'));
  const p = open(t);
  assert.ok(p.doc.querySelector('a[href="#broker-lot-check"]'));
  const scripts = Array.from(p.doc.scripts, s => s.getAttribute('src') || '');
  assert.ok(scripts.indexOf('/assets/vendor/decimal.js') < scripts.indexOf('/assets/js/broker-lot-check.js?v=20261125'));
  assert.equal(p.field('broker-lot-result').getAttribute('role'), 'status');
  for (const name of fields) assert.equal(p.field(name).name, '');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|clipboard/);
});

test('largest size is a multiple of custom step and leaves the unused budget', t => {
  const p = open(t);
  assert.equal(p.check(['73','20','10','0.05','0.12']),
    'Maximum modeled size: 0.35 lots. Loss at the stop: $70.00. Unused risk budget: $3.00.');
  assert.equal(p.field('balance').value,'1000');
  assert.equal(p.field('lotsOut').textContent,'—');
});

test('minimum off the step grid rounds up, and no positive size can be reported as fitting', t => {
  const p = open(t);
  assert.equal(p.check(['29.99','20','10','0.05','0.12']),
    'No positive lot size fits this model. The smallest grid size is 0.15 lots and would risk $30.00, above your $29.99 budget.');
  assert.match(p.check(['9.99','20','10','0.05','']), /smallest grid size is 0.05 lots and would risk \$10.00/);
  assert.match(p.check(['30','20','10','0.05','0.12']), /Maximum modeled size: 0.15 lots.*unused risk budget: \$0.00/i);
});

test('exact grid fits and a sub-cent budget difference does not round up', t => {
  const p = open(t);
  assert.match(p.check(['0.3','1','3','0.01','']), /size: 0.1 lots.*\$0.30.*\$0.00/);
  assert.match(p.check(['0.29999999','1','3','0.01','']), /size: 0.09 lots.*\$0.27.*\$0.02999999/);
});

test('invalid fields and subsequent edits replace stale results', t => {
  const p = open(t);
  assert.match(p.check(['73','20','10','0.05','']), /0.35 lots/);
  p.set('broker-step','0.1');
  assert.match(p.field('broker-lot-result').textContent, /^Inputs changed/);
  for (const step of ['0','-1','1e-3','0x1','0.000000001','1000000001','']) {
    assert.match(p.check(['73','20','10',step,'']), /^Enter positive/);
  }
});
