#!/usr/bin/env node
// [site-qa] run 80: market glossary terms have stable anchors and Trading Glossary results open on them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const markets = ['stocks', 'funds', 'futures', 'options', 'forex', 'crypto', 'indices', 'bonds', 'economy'];
const pages = {};

(async () => {
  for (const m of markets) {
    const file = path.join(root, 'learn', `${m}-glossary.html`);
    const html = fs.readFileSync(file, 'utf8');
    pages[`/learn/${m}-glossary.html`] = html;
    // Static markup (what search fetches): every term has a unique id derived from its name.
    const doc = new JSDOM(html).window.document;
    const terms = [...doc.querySelectorAll('.glossary article.term')];
    assert.ok(terms.length >= 5, `${m}: static terms present`);
    const ids = terms.map(t => t.id);
    terms.forEach(t => assert.equal(t.id, 'term-' + slug(t.querySelector('strong').textContent), `${m}: id matches term`));
    assert.equal(new Set(ids).size, ids.length, `${m}: ids are unique`);
    // Rendered page (inline script re-renders the list): ids survive and the #hash target exists.
    const first = ids[0];
    const dom = new JSDOM(html, { url: `https://www.fynxfinanceworld.com/learn/${m}-glossary.html#${first}`, runScripts: 'dangerously', pretendToBeVisual: true });
    await new Promise(r => dom.window.addEventListener('load', r));
    const rendered = [...dom.window.document.querySelectorAll('.glossary article.term')];
    assert.ok(rendered.length >= terms.length, `${m}: rendered terms`);
    rendered.forEach(t => assert.equal(t.id, 'term-' + slug(t.querySelector('strong').textContent), `${m}: rendered id matches term`));
    assert.ok(dom.window.document.getElementById(first), `${m}: #${first} exists after render`);
    dom.window.close();
  }

  // Trading Glossary market results link to the term anchor.
  const html = fs.readFileSync(path.join(root, 'trading-glossary.html'), 'utf8');
  const code = fs.readFileSync(path.join(root, 'assets/js/glossary-search.js'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://www.fynxfinanceworld.com/trading-glossary.html', runScripts: 'outside-only' });
  dom.window.fetch = href => Promise.resolve({ ok: true, text: async () => pages[href] || '' });
  dom.window.matchMedia = () => ({ matches: false });
  dom.window.eval(code);
  const doc = dom.window.document;
  const input = doc.getElementById('glossarySearch');
  input.value = 'theta';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0));
  const link = [...doc.querySelectorAll('[data-glossary-more] a')].find(a => a.textContent === 'Theta');
  assert.ok(link, 'Theta result shown');
  assert.equal(link.getAttribute('href'), '/learn/options-glossary.html#term-theta');
  dom.window.close();
  console.log('Glossary term anchors: 9 market pages have unique term ids (static + rendered); search results open on the term.');
})().catch(e => { console.error(e); process.exit(1); });
