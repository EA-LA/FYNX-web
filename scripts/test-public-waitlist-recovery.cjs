const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/public-waitlist.js'),'utf8');
function setup(fetch,AbortController){
 let submit,expire,cleared=0,focused=false;
 const form={reportValidity:()=>true,elements:{fullName:{value:'Test Person'},email:{value:'test@example.invalid'},consent:{checked:true}},dataset:{},addEventListener:(type,fn)=>{submit=fn;}};
 const button={disabled:false},message={},formView={hidden:false,style:{}},successView={hidden:true,style:{},setAttribute(){},focus(){focused=true;}};
 vm.runInNewContext(source,{document:{getElementById:id=>({waitlistForm:form,submitBtn:button,message,formView,successView}[id])},fetch,AbortController,setTimeout:fn=>{expire=fn;return 1;},clearTimeout:()=>{cleared++;}});
 return {submit:()=>submit({preventDefault(){}}),expire:()=>expire(),button,message,formView,successView,cleared:()=>cleared,focused:()=>focused};
}
test('successful older browser submission keeps the same payload and focuses confirmation',async()=>{
 const ui=setup(async(url,options)=>{assert.equal(options.signal,undefined);assert.deepEqual(JSON.parse(options.body),{name:'Test Person',email:'test@example.invalid',source:'money-management',consent:true});return {ok:true,json:async()=>({accepted:true})};});
 await ui.submit();assert.equal(ui.successView.hidden,false);assert.equal(ui.focused(),true);assert.equal(ui.button.disabled,false);assert.equal(ui.cleared(),1);
});
test('stalled request releases the form and late success cannot change the UI',async()=>{
 let finish,calls=0;const ui=setup(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
 const pending=ui.submit();await ui.submit();assert.equal(calls,1);ui.expire();await pending;
 assert.equal(ui.button.disabled,false);assert.match(ui.message.textContent,/may have been received/);assert.equal(ui.cleared(),1);
 finish({ok:true,json:async()=>({accepted:true})});await new Promise(resolve=>setImmediate(resolve));assert.equal(ui.successView.hidden,true);assert.equal(ui.formView.hidden,false);
});
test('stalled JSON body times out and aborts when supported',async()=>{
 let aborted=false;const ui=setup(async()=>({ok:true,json:()=>new Promise(()=>{})}),class{signal={};abort(){aborted=true;}});
 const pending=ui.submit();await Promise.resolve();ui.expire();await pending;assert.equal(aborted,true);assert.equal(ui.button.disabled,false);assert.equal(ui.successView.hidden,true);
});
test('null JSON and failed fetch remain recoverable',async()=>{
 for(const fetch of [async()=>({ok:true,json:async()=>null}),async()=>{throw new Error('Offline');}]){const ui=setup(fetch);await ui.submit();assert.equal(ui.button.disabled,false);assert.equal(ui.successView.hidden,true);assert.match(ui.message.className,/error/);assert.equal(ui.cleared(),1);}
});
