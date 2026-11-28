'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const read = p => fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const code = read('assets/js/glossary-study.js');

function open(t, before) {
  const dom = new JSDOM(read('trading-glossary.html'),{runScripts:'outside-only'});
  t.after(() => dom.window.close());
  const doc=dom.window.document;
  const id=name=>doc.getElementById('glossary-study'+(name?'-'+name:''));
  const cards=[...doc.querySelectorAll('.glossary-grid > .term-card')];
  assert.equal(id().hidden,true);
  assert.equal(id('link').hidden,true);
  before?.(cards);
  dom.window.eval(code);
  const change=value=>{
    id('topic').value=value;
    id('topic').dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  };
  return {doc,id,cards,change};
}

test('public Explore links to the glossary and initial card uses just its core definitions',t=>{
  const explore=new JSDOM(read('explore.html'));
  t.after(()=>explore.window.close());
  assert.ok(explore.window.document.querySelector('a[href="/trading-glossary.html"]'));
  const p=open(t);
  assert.equal(p.id().hidden,false);
  assert.equal(p.id('link').hidden,false);
  assert.equal(p.id('term').textContent,p.cards[0].querySelector('h3').textContent);
  assert.match(p.id('position').textContent,new RegExp('Term 1 of '+p.cards.length+'$'));
  assert.equal(p.id('definition').hidden,true);
  assert.equal(p.id('definition').textContent,'');
  assert.equal(p.id('reveal').getAttribute('aria-expanded'),'false');
  assert.doesNotMatch(code,/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|history\./);
});

test('reveal and hide do not change the original definition or focus; Next clears it',t=>{
  const p=open(t);
  const reveal=p.id('reveal');
  const definition=p.id('definition');
  const original=p.cards[0].querySelector('p').textContent.trim();
  reveal.focus();
  reveal.click();
  assert.equal(p.doc.activeElement,reveal);
  assert.equal(definition.hidden,false);
  assert.equal(definition.textContent,original);
  assert.equal(reveal.getAttribute('aria-expanded'),'true');
  reveal.click();
  assert.equal(definition.hidden,true);
  reveal.click();
  p.id('next').click();
  assert.equal(definition.hidden,true);
  assert.equal(definition.textContent,'');
  assert.equal(reveal.getAttribute('aria-expanded'),'false');
  assert.equal(p.id('term').textContent,p.cards[1].querySelector('h3').textContent);
  assert.equal(p.cards[0].querySelector('p').textContent.trim(),original);
});

test('topic selection resets the card and does not depend on glossary search visibility',t=>{
  const p=open(t,cards=>{
    for(const card of cards) card.hidden=true;
  });
  const risk=p.cards.filter(card=>card.querySelector('.badge').textContent.trim()==='Risk');
  assert.ok(risk.length>1);
  p.id('reveal').click();
  p.change('Risk');
  assert.equal(p.id('definition').hidden,true);
  assert.equal(p.id('term').textContent,risk[0].querySelector('h3').textContent);
  assert.equal(p.id('position').textContent,'Risk · Term 1 of '+risk.length);
  p.id('back').click();
  assert.equal(p.id('term').textContent,risk.at(-1).querySelector('h3').textContent);
  assert.equal(p.id('next').textContent,'Start deck over');
  p.id('next').click();
  assert.equal(p.id('term').textContent,risk[0].querySelector('h3').textContent);
  assert.equal(p.cards.filter(card=>card.hidden).length,p.cards.length);
  p.change('');
  assert.equal(p.id('term').textContent,p.cards[0].querySelector('h3').textContent);
});

test('a term with multiple topics appears in each subject deck without duplicating the card',t=>{
  const p=open(t);
  const shared=p.cards.find(card=>card.querySelector('h3')?.textContent.trim()==='Market Cap');
  assert.equal(shared.querySelector('.badge').textContent.trim(),'Stocks/Crypto');
  const definition=shared.querySelector('p').textContent.trim();
  const labels=[...p.id('topic').options].map(option=>option.value);
  for(const label of ['Crypto','Stocks','Stocks/Crypto']){
    assert.equal(labels.filter(option=>option===label).length,1);
    const expected=p.cards.filter(card=>{
      const tag=card.querySelector('.badge').textContent.trim();
      return tag===label || tag.split('/').map(part=>part.trim()).includes(label);
    }).map(card=>card.querySelector('h3').textContent.trim());
    p.change(label);
    const visited=[];
    for(let i=0;i<expected.length;i++){
      const current=p.id('term').textContent;
      visited.push(current);
      if(current==='Market Cap'){
        assert.equal(p.id('definition').hidden,true);
        p.id('reveal').click();
        assert.equal(p.id('definition').textContent,definition);
      }
      if(i+1<expected.length) p.id('next').click();
    }
    assert.deepEqual(visited,expected);
    assert.equal(visited.filter(term=>term==='Market Cap').length,1);
    assert.equal(p.id('next').disabled,expected.length===1);
  }
});
