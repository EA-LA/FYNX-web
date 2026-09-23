const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
(async () => {
  for (const name of ['journal.html', 'trader-journal.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
    const start = html.indexOf('    async function saveTradeLive(){');
    const end = html.indexOf('    document.getElementById("saveTradeBtn")', start);
    assert(start >= 0 && end > start, `${name}: journal save function exists`);
    const fields = {fSymbol:'EURUSD',fDate:'2026-09-15',fEntry:'1.1',fSL:'1.09',fTP:'1.12',fNotes:'Regression check',fRealizedPL:'-50',fSession:'London'};
    let saved;
    const context = vm.createContext({
      document:{getElementById:id=>({value:fields[id]})},
      crypto:{randomUUID:()=> 'test-id'},
      Timestamp:{fromDate:value=>value},serverTimestamp:()=> 'server-time',
      tradesCol:()=>({}),doc:()=>({}),setDoc:async(ref,value)=>{saved=value;},
      clearForm:()=>{},setActiveView:()=>{}
    });
    vm.runInContext(html.slice(start,end),context);
    await context.saveTradeLive();
    assert.equal(saved.pl,-50,`${name}: a losing result must remain a loss regardless of target prices`);
    assert.equal(saved.pnlSource,'user-reported');
    assert.equal(saved.session,'London');
    fields.fRealizedPL='';saved=undefined;
    await assert.rejects(context.saveTradeLive(),/actual realized P\/L/);
    assert.equal(saved,undefined,'Invalid trades must not reach storage');
    fields.fRealizedPL='0';await context.saveTradeLive();assert.equal(saved.pl,0,'Breakeven is valid');
    console.log(`${name}: realized P/L, session, and validation checks passed`);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
