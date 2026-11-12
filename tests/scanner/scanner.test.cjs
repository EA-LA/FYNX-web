'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {THEMES, ETF_THEMES, cleanName} = require('../../scripts/refresh-scanner.cjs');
const themesOf = (sym, name, industry = '', country = 'United States') => THEMES.filter(t => t.set.has(sym) || (t.name && t.name.test(name)) || (t.industry && t.industry.test(industry)) || (t.country && t.country.test(country))).map(t => t.id);

test('themes come from industry, registered name or curated members', () => {
  assert.ok(themesOf('BBAI', 'BigBear.ai Inc. Common Stock', 'Computer Software: Prepackaged Software').includes('ai'));
  assert.ok(themesOf('SOUN', 'SoundHound AI, Inc. Class A Common Stock').includes('ai'));
  assert.ok(themesOf('NVDA', 'NVIDIA Corporation Common Stock', 'Semiconductors').includes('semis'));
  assert.ok(themesOf('IONQ', 'IonQ, Inc. Common Stock').includes('quantum'));
  assert.ok(themesOf('XYZ', 'Example Acquisition Corp').includes('spac'));
  assert.ok(themesOf('BABA', 'Alibaba Group Holding Limited', 'Catalog/Specialty Distribution', 'China').includes('china'));
  assert.ok(!themesOf('TGT', 'Target Corporation Common Stock', 'Department/Specialty Retail Stores').includes('ai'), 'no theme from unrelated words');
  assert.ok(!themesOf('MAIN', 'Main Street Capital Corporation', 'Finance').includes('ai'), '"AI" must be a whole word');
});
test('ETF themes and display names', () => {
  const t = name => ETF_THEMES.filter(([, re]) => re.test(name)).map(([id]) => id);
  assert.deepEqual(t('iShares Bitcoin Trust ETF'), ['crypto']);
  assert.ok(t('Direxion Daily Semiconductor Bull 3X Shares').includes('leveraged'));
  assert.equal(cleanName('CoreWeave, Inc. Class A Common Stock'), 'CoreWeave, Inc.');
  assert.equal(cleanName('Alcoa Corporation Common Stock '), 'Alcoa Corporation');
});
