const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const init=fs.readFileSync('assets/js/site-theme-init.js','utf8'),adapter=fs.readFileSync('assets/js/journal-theme.js','utf8');
const dom=new JSDOM('<!doctype html><html><head></head><body><button id="themeBtn">Old control</button><button data-journal-theme data-theme-control><span data-theme-label></span></button></body></html>',{url:'https://www.fynxfinanceworld.com/profile.html',runScripts:'outside-only'});
const w=dom.window;w.localStorage.setItem('fynx_theme','light');w.eval(init);w.eval(adapter);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
assert.equal(w.document.documentElement.dataset.theme,'light');assert.equal(w.getComputedStyle(w.document.querySelector('#themeBtn')).display,'none');
w.document.querySelector('[data-theme-control]').click();assert.equal(w.localStorage.getItem('fynx_theme'),'dark');assert.equal(w.document.documentElement.dataset.theme,'dark');assert.equal(w.document.documentElement.style.colorScheme,'dark');assert(w.document.body.classList.contains('dark-mode'));
w.localStorage.setItem('fynx_theme','light');w.dispatchEvent(new w.StorageEvent('storage',{key:'fynx_theme',newValue:'light'}));assert.equal(w.document.documentElement.dataset.theme,'light');
w.document.querySelector('[data-theme-control]').remove();w.document.dispatchEvent(new w.Event('DOMContentLoaded'));assert.equal(w.document.querySelectorAll('[data-theme-control]').length,0);assert.equal(w.document.querySelectorAll('.theme-utility').length,0);
console.log('Theme policy: persisted preference, one-toggle behavior, legacy controls hidden, cross-tab sync, no injected controls passed.');
for(const initial of [null,'dark']){
 const fresh=new JSDOM('<html><head></head><body></body></html>',{url:'https://www.fynxfinanceworld.com/',runScripts:'outside-only'});
 if(initial)fresh.window.localStorage.setItem('fynx_theme',initial);
 fresh.window.eval(init);fresh.window.eval(adapter);
 assert.equal(fresh.window.document.documentElement.dataset.theme,initial||'light');
}
console.log('First visit defaults to white; an explicit saved dark preference is preserved.');
