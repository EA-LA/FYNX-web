const assert=require('node:assert/strict'),{evaluate}=require('../assets/js/basic-calculator.js');
for(const [expression,result] of [['2+3*4',14],['(2+3)*4',20],['200×5%',10],['200×(1+5%)',210],['200+5%',200.05],['-5+2',-3],['2*-3',-6],['.1+.2',.3],['1e-7*100',.00001],['-(2+3)%',-.05],['0/-1',0]])assert.equal(evaluate(expression),result,expression);
for(const expression of ['1/0','0/0','1+','(1+2','2(3)','alert(1)','1e309','1e308*10','2**3','2;3','', '1'.repeat(201)])assert.throws(()=>evaluate(expression),expression);
console.log('Basic calculator: precedence, percentages, decimals, signs, parentheses and invalid input passed.');
