'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'tools', 'market-holidays.html'), 'utf8');
assert.match(html, /if \(state\.view === "heatmap"\) renderHeatmap\(items\);/, 'the heatmap must receive the same filtered items as the list');
assert.match(html, /Heatmap counts events matching your Region, Market Type and High Impact filters/, 'the explanation must reflect filtered data');

const match = html.match(/(function renderHeatmap\(items\) \{[\s\S]*?\n    \})\n\n    \/\* ------------------------------ View switching/);
assert.ok(match, 'find the actual production heatmap function');

function element(tag) {
  return { tag, children: [], textContent: '', appendChild(child) { this.children.push(child); } };
}

function render(items) {
  const tbody = element('tbody');
  const year = element('span');
  vm.runInNewContext(match[1] + '\nrenderHeatmap(items);', {
    items,
    state: { year: 2026 },
    heatYear: year,
    heatBody: tbody,
    monthNames: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    document: { createElement: element }
  });
  return { tbody, year };
}

const all = [
  { date: new Date(2026, 0, 2), regions: ['Americas'], impact: 'high' },
  { date: new Date(2026, 0, 9), regions: ['Americas'], impact: 'low' },
  { date: new Date(2026, 2, 3), regions: ['Europe'], impact: 'high' },
  { date: new Date(2025, 0, 4), regions: ['Asia'], impact: 'high' }
];
const full = render(all.filter(item => item.date.getFullYear() === 2026));
assert.equal(full.tbody.children.length, 3, 'three region rows');
assert.equal(full.year.textContent, '2026');
assert.equal(full.tbody.children[0].children[0].scope, 'row', 'region labels are table row headers');
assert.equal(full.tbody.children[0].children[1].children[0].textContent, '2', 'January Americas shows two events');
assert.equal(full.tbody.children[1].children[3].children[0].textContent, '1', 'March Europe shows one event');
assert.equal(full.tbody.children[2].children[1].children[0].textContent, '0', 'empty cells show zero explicitly');
assert.match(full.tbody.children[0].children[1].children[0].title, /Americas, January: 2 events/);

const highImpact = render(all.filter(item => item.date.getFullYear() === 2026 && item.impact === 'high'));
assert.equal(highImpact.tbody.children[0].children[1].children[0].textContent, '1', 'filtered input changes the heatmap count');
assert.equal(highImpact.tbody.children[1].children[3].children[0].textContent, '1', 'other regions remain accurate');
console.log('Market Holidays heatmap regression checks passed');
