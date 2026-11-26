const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = readFileSync(path.join(__dirname, '../assets/js/pattern-examples.js'), 'utf8');
const html = readFileSync(path.join(__dirname, '../markets/patterns.html'), 'utf8');
const titles = Array.from(html.matchAll(/<button type="button" class="pattern"><h3>([^<]+)<\/h3>/g), m => m[1]);
function fixture({ reduced = false, noMedia = false, legacy = false, noScroll = false, missing = false } = {}) {
  const calls = [];
  const buttons = titles.map(title => ({
    attrs: {}, querySelector() { return {textContent:title}; },
    setAttribute(k,v) { this.attrs[k]=v; },
    addEventListener(name, fn) { this.activate=fn; }
  }));
  const out = {
    children: [], markup: '',
    set textContent(value) { assert.equal(value,''); this.children=[]; this.markup=''; },
    append(node) { this.children.push(node); },
    insertAdjacentHTML(position, markup) { assert.equal(position,'beforeend'); this.markup=markup; },
    focus(options) { if (legacy && options) throw Error('Unsupported focus options'); calls.push(['focus', options]); }
  };
  if (!noScroll) out.scrollIntoView = function(options) {
    if (legacy && typeof options === 'object') throw Error('Unsupported scroll options');
    calls.push(['scroll',options]);
  };
  const window = noMedia ? {} : {matchMedia: () => ({matches:reduced})};
  const document = {
    querySelectorAll: () => buttons,
    getElementById: () => missing ? null : out,
    createElement: tagName => ({tagName,textContent:''})
  };
  vm.runInNewContext(source,{window,document,matchMedia:window.matchMedia});
  return {buttons,out,calls};
}
test('all nine real pattern controls render exactly one illustration and selected state', () => {
  const {buttons,out,calls}=fixture();
  assert.equal(buttons.length,9);
  assert.equal(calls.length,0);
  buttons.forEach((button,index) => {
    button.activate();
    assert.equal(out.children.length,2);
    assert.equal(out.children[0].textContent,titles[index]);
    assert.match(out.markup,/<svg /);
    assert.match(out.children[1].textContent,/Educational illustration/);
    assert.equal(buttons.filter(b=>b.attrs['aria-pressed']==='true').length,1);
    assert.equal(button.attrs['aria-pressed'],'true');
  });
});
test('reduced motion uses standard auto scrolling and focus precedes scrolling', () => {
  const {buttons,calls}=fixture({reduced:true});
  buttons[1].activate();
  assert.equal(calls[0][0],'focus');
  assert.equal(calls[1][1].behavior,'auto');
});
test('normal motion keeps smooth scrolling', () => {
  const {buttons,calls}=fixture();
  buttons[2].activate();
  assert.equal(calls[1][1].behavior,'smooth');
});
test('legacy focus and scroll signatures retain navigation without replaceChildren', () => {
  const {buttons,calls,out}=fixture({legacy:true,noMedia:true});
  buttons[3].activate();
  assert.equal(out.children[0].textContent,titles[3]);
  assert.equal(calls[0][0],'focus');
  assert.equal(calls[0][1],undefined);
  assert.equal(calls[1][1],true);
});
test('missing matchMedia defaults to no animation; absent scroll method does not lose focus', () => {
  const a=fixture({noMedia:true}); a.buttons[0].activate();
  assert.equal(a.calls[1][1].behavior,'auto');
  const b=fixture({noScroll:true}); b.buttons[0].activate();
  assert.equal(b.calls.length,1);
  assert.equal(b.calls[0][0],'focus');
});
test('missing illustration surface does not throw', () => {
  assert.doesNotThrow(()=>fixture({missing:true}));
});
