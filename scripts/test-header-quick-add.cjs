'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/terminal-header.js'), 'utf8');

async function setup() {
  const dom = new JSDOM('<!doctype html><body data-fynx-terminal><div class="dashboard-container"><div class="nav-logo"><h1>FYNX</h1></div><div class="top-bar"><div class="top-bar-left"></div><div class="top-bar-right"></div></div><button id="quickAddBtn" type="button">Quick Add</button><section id="view-entry"></section></div></body>', {url:'https://www.fynxfinanceworld.com/journal.html',runScripts:'outside-only'});
  const w = dom.window, d = w.document;
  await new Promise(resolve => w.addEventListener('load', resolve, {once:true}));
  const timers = new Map(); let next = 0, clicks = 0, ready = false;
  w.setInterval = () => 1;
  w.setTimeout = callback => { timers.set(++next, callback); return next; };
  w.clearTimeout = id => timers.delete(id);
  d.getElementById('quickAddBtn').addEventListener('click', () => {
    clicks++;
    if (ready) d.getElementById('view-entry').classList.add('active');
  });
  w.eval(source);
  await Promise.resolve();
  const link = d.querySelector('.terminal-quick-add');
  assert.ok(link);
  function click(options = {}) {
    const event = new w.MouseEvent('click', {bubbles:true,cancelable:true,button:0,...options});
    // Record whether the production handler prevented navigation, then prevent
    // JSDOM from attempting an actual navigation.
    let prevented;
    link.addEventListener('click', e => { prevented = e.defaultPrevented; e.preventDefault(); }, {once:true});
    link.dispatchEvent(event);
    return prevented;
  }
  function advance() {
    const first = timers.entries().next().value;
    if (!first) return false;
    timers.delete(first[0]); first[1](); return true;
  }
  return {w,d,link,click,advance,timers,clicks:()=>clicks,ready:()=>{ready=true;},close:()=>dom.window.close()};
}

test('a new Quick Add click receives a fresh retry budget after an exhausted attempt', async () => {
  const f = await setup();
  try {
    assert.equal(f.click(), true);
    while (f.advance()) {}
    assert.equal(f.clicks(), 40);
    assert.equal(f.timers.size, 0);
    assert.equal(f.click(), true);
    assert.equal(f.timers.size, 1);
    f.ready();
    assert.equal(f.advance(), true);
    assert.equal(f.clicks(), 42);
    assert.ok(f.d.getElementById('view-entry').classList.contains('active'));
    assert.equal(f.timers.size, 0);
  } finally { f.close(); }
});

test('modified, non-primary and already-cancelled link gestures do not activate Journal', async () => {
  const f = await setup();
  try {
    for (const gesture of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1}]) assert.equal(f.click(gesture), false);
    assert.equal(f.clicks(), 0);
    assert.equal(f.timers.size, 0);
    const event = new f.w.MouseEvent('click', {bubbles:true,cancelable:true});
    event.preventDefault(); f.link.dispatchEvent(event);
    assert.equal(f.clicks(), 0);
    assert.equal(f.click(), true);
    assert.equal(f.clicks(), 1);
  } finally { f.close(); }
});

test('leaving the Quick Add fragment cancels a pending retry', async () => {
  const f = await setup();
  try {
    f.w.history.replaceState(null,'','#quick-add');
    f.w.dispatchEvent(new f.w.Event('hashchange'));
    assert.equal(f.clicks(), 1);
    assert.equal(f.timers.size, 1);
    f.w.history.replaceState(null,'','#other');
    f.w.dispatchEvent(new f.w.Event('hashchange'));
    assert.equal(f.timers.size, 0);
    assert.equal(f.advance(), false);
    assert.equal(f.clicks(), 1);
  } finally { f.close(); }
});
