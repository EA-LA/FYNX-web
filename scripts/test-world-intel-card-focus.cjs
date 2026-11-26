'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const code = fs.readFileSync(path.join(__dirname, '../assets/js/terminal/world-intel.js'), 'utf8');

async function mount(t, width) {
  const {window:w} = new JSDOM('<button id="outside">Outside the card</button><main id="tp-globe"></main>', {
    url: 'https://www.fynxfinanceworld.com/terminal.html?desk=world', runScripts: 'outside-only'
  });
  t.after(() => w.close());
  const doc = w.document, world = {scale:1, rot:[0,0], flat:false, feats:[], layers:{lights:true}}, memory = new Map();
  w.FynxGeo = {};
  const el = (tag, cls = '', label) => {
    const node = doc.createElement(tag); node.className = cls;
    if (label != null) node.textContent = String(label); return node;
  };
  const btn = (label, cls, action, accessible) => {
    const node = el('button', cls, label);
    if (accessible) node.setAttribute('aria-label', accessible);
    node.addEventListener('click', action); return node;
  };
  const svg = (tag, attrs = {}) => {
    const node = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k,v] of Object.entries(attrs)) node.setAttribute(k,v);
    return node;
  };
  w.eval(code);
  w.FynxTerminalPlugins[0]({
    S:{world}, el, btn, svg, finite:Number.isFinite, ago:()=>'now',
    quoteFor:()=>null, store:{get:k=>memory.get(k)??null,set:(k,v)=>memory.set(k,v)},
    WDATA:'/synthetic/', getJSON:async url => url.includes('hazards.json') ? {
      generatedAt:new Date().toISOString(), quakes:[{id:'fixture',mag:6.2,place:'Synthetic natural event',
        depth:10,time:new Date().toISOString(),lon:25,lat:15}], alerts:[]
    } : {layers:{}}, report(){}
  });
  const stage = doc.getElementById('tp-globe');
  Object.defineProperty(stage,'clientWidth',{value:width});
  const sv = svg('svg'), [gIntel,gZones,gPipes] = ['g','g','g'].map(x=>svg(x)), legend = el('div');
  sv.append(gIntel,gZones,gPipes);
  await world.intel.load();
  const pane = world.intel.panel({redraw(){}});
  stage.append(pane,sv,legend);
  world.intel.mount({stage,sv,gIntel,gZones,gPipes,legend,redraw(){}});
  pane.querySelector('.fx-ilp-tabs button:last-child').click();
  const close = ()=>stage.querySelector('.fx-icard [aria-label=Close]');
  return {w,doc,world,pane,outside:doc.getElementById('outside'),row:()=>pane.querySelector('[data-intel-event]'),
    card:()=>stage.querySelector('.fx-icard'), close, toggle:pane.querySelector('.fx-ilp-head button')};
}

test('opening an event focuses the dialog; Escape closes it before Terminal receives the key', async t => {
  const x = await mount(t, 1000);
  const row = x.row(); row.focus(); row.click();
  assert.equal(x.card().hidden,false);
  assert.match(x.card().getAttribute('aria-label'), /Synthetic natural event/);
  assert.equal(x.doc.activeElement, x.close());
  // A passive feed redraw replaces rows; the dialog keeps focus and then
  // restores to the replacement button when the original no longer exists.
  x.world.intelRedraw();
  assert.equal(row.isConnected,false);
  assert.equal(x.doc.activeElement,x.close());
  let escaped = false;
  x.doc.addEventListener('keydown',e=>{if(e.key==='Escape')escaped=true;});
  const event = new x.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});
  x.close().dispatchEvent(event);
  assert.equal(escaped,false);
  assert.equal(event.defaultPrevented,true);
  assert.equal(x.card().hidden,true);
  assert.equal(x.doc.activeElement,x.row());
});

test('when the narrow layout folds the event list, Close returns to its visible toggle', async t => {
  const x = await mount(t, 390);
  x.row().click();
  assert.equal(x.toggle.getAttribute('aria-expanded'),'false');
  assert.equal(x.doc.activeElement,x.close());
  x.close().click();
  assert.equal(x.doc.activeElement,x.toggle);
  assert.equal(x.card().hidden,true);
});

test('a passive redraw does not steal focus from another control', async t => {
  const x = await mount(t, 1000);
  x.row().click();
  x.outside.focus();
  x.world.intelRedraw();
  assert.equal(x.doc.activeElement,x.outside);
});
