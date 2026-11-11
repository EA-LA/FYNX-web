const fs = require('node:fs');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync('auth/auth-form.js', 'utf8').replaceAll('import(', 'loadTestModule(');
(async () => {
  for (const errorCode of [null, 'auth/user-not-found', 'auth/too-many-requests', 'auth/network-request-failed']) {
    const dom = new JSDOM(fs.readFileSync('auth/forgot.html','utf8'), {url:'https://example.com/auth/forgot.html',runScripts:'outside-only'});
    const w=dom.window;
    let received, settings;
    w.loadTestModule=async url=>url.includes('firebase-auth')?{sendPasswordResetEmail:async(_,email,options)=>{received=email;settings=options;if(errorCode)throw {code:errorCode};}}:url.includes('firebase.js')?{auth:{},authPersistenceReady:Promise.resolve()}:{};
    w.eval(source);
    const form=w.document.getElementById('resetForm');
    form.elements.email.value='test@example.com';
    form.dispatchEvent(new w.Event('submit',{cancelable:true}));
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(received,'test@example.com');assert.equal(settings.url,'https://www.fynxfinanceworld.com/auth/login.html');
    assert.equal(form.querySelector('button').disabled,false);
    assert.match(w.document.getElementById('authStatus').textContent,errorCode==='auth/too-many-requests'?/Too many/:errorCode==='auth/network-request-failed'?/couldn’t/:/If an account exists/);
    w.close();
  }
  console.log('Password-reset success, unknown account, rate limit and network failure passed; no emails sent.');
})().catch(error=>{console.error(error);process.exitCode=1;});
