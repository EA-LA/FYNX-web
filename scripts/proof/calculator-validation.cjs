const assert=require('node:assert/strict'),{browserResult}=require('./calculator-parity.cjs');
(async()=>{for(const f of [
 {file:'risk-reward',marker:'function calculate()',invoke:'calculate()',fields:{entry:'100',sl:'90',tp:'80'},output:'error',mode:'error_text'},
 {file:'risk-reward',marker:'function calculate()',invoke:'calculate()',fields:{entry:'100',sl:'100',tp:'120'},output:'error',mode:'error_text'},
 {file:'atr-stop',marker:'function updateCalc()',invoke:"currentSide='buy';currentMultiple=2;updateCalc()",fields:{entry:'1',atrValue:'2',period:'14'},output:'errorBox',mode:'visible_error'},
 {file:'breakeven',marker:'function calc()',invoke:'calc()',fields:{entry:'1.1',lot:'1',spread:'-1',commission:'7'},output:'be',mode:'alert'}
 ])assert.equal(await browserResult(f),true,f.file);console.log('PASS: wrong-side/equal stops, nonpositive ATR stops and negative break-even costs rejected by the actual page scripts.');})().catch(e=>{console.error(e);process.exitCode=1;});
