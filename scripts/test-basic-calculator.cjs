const assert=require('node:assert/strict'),{evaluate,evaluateExact}=require('../assets/js/basic-calculator.js');
for(const [expression,result] of [['2+3*4',14],['(2+3)*4',20],['200×5%',10],['200×(1+5%)',210],['200+5%',210],['200-5%',190],['200÷5%',4000],['5%',.05],['50+10%+10%',60.5],['100-100%',0],['200+(5%)',200.05],['-5+2',-3],['2*-3',-6],['.1+.2',.3],['1e-7*100',.00001],['-(2+3)%',-.05],['0/-1',0]])assert.equal(evaluate(expression),result,expression);
for(const expression of ['1/0','0/0','1+','(1+2','2(3)','alert(1)','1e309','1e308*10','2**3','2;3','', '1'.repeat(201)])assert.throws(()=>evaluate(expression),expression);
// Exact decimal arithmetic: large integers and decimals keep every digit.
for(const [expression,text] of [['99999999999999999+1','100000000000000000'],['123456789012345678×1000','123456789012345678000'],['12345678901234567890123×2','24691357802469135780246'],['.1+.2','0.3'],['0.000000000000000001*3','0.000000000000000003'],['1/3','0.33333333333333'],['2/3','0.66666666666667'],['1/7*7','1'],['1e308','1e+308']])assert.equal(evaluateExact(expression),text,expression);
console.log('Basic calculator: precedence, percent convention (a ± b% of a), exact large numbers, decimals, signs, parentheses and invalid input passed.');

// The examples served on the public route must match the standalone keypad's actual output.
{
  const fs = require('node:fs');
  const path = require('node:path');
  const { JSDOM } = require('jsdom');
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'tools/basic-calculator.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://www.fynxfinanceworld.com/tools/basic-calculator.html', runScripts: 'outside-only' });
  try {
    const { window } = dom;
    window.eval(fs.readFileSync(path.join(root, 'assets/js/basic-calculator.js'), 'utf8'));
    const page = window.document;
    const keypad = page.querySelector('[data-basic-calculator]');
    const display = keypad.querySelector('[data-calc-display]');
    const examples = page.querySelector('.tool-example p').textContent;
    const examplesShown = [...examples.matchAll(/(\d+\s*[+−×]\s*(?:\(\d+\s*\+\s*\d+%\)|\(\d+%\)|\d+%))\s*(?:=|adds 0\.05 and gives)\s*([0-9.]+)/g)];
    assert.ok(examplesShown.length >= 2, 'the public worked example shows concrete percentage calculations');
    keypad.focus();
    const key = input => window.document.activeElement.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: input, bubbles: true, cancelable: true })
    );
    for (const [, expression, shownResult] of examplesShown) {
      key('Escape');
      for (const char of expression.replace(/\s/g, '').replace('−', '-').replace('×', '*')) key(char);
      key('Enter');
      assert.equal(display.textContent, shownResult.replace(/\.$/, ''), `Public worked example: ${expression}`);
    }
    assert.match(examples, /200 \+ 5% = 210/);
    assert.match(examples, /200 \+ \(5%\) = 200\.05/);
    const mainCopy = page.querySelector('.tool-profile-hero > div').textContent;
    assert.match(mainCopy, /increase or decrease the running total/);
    const limitCopy = page.querySelector('.tool-explainer details').textContent;
    assert.match(limitCopy, /Repeating decimals are rounded to 14 significant digits/);
    assert.match(limitCopy, /Very long results may use rounded scientific notation/);
  } finally {
    dom.window.close();
  }
}
