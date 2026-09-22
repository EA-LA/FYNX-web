const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('auth/forgot.html', 'utf8');
const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*;$/gm, '');
(async () => {
  for (const errorCode of [null, 'auth/user-not-found', 'auth/too-many-requests', 'auth/network-request-failed']) {
    const dom = new JSDOM(html);
    let handler, received;
    const form = dom.window.document.getElementById('resetForm');
    form.elements.email.value = 'test@example.com';
    form.addEventListener = (_, callback) => handler = callback;
    vm.runInNewContext(source, { document: dom.window.document, auth: {}, sendPasswordResetEmail: async (_, email) => { received = email; if(errorCode) throw {code:errorCode}; } });
    await handler({preventDefault(){}});
    assert.equal(received, 'test@example.com');
    assert.equal(form.querySelector('button').disabled, false);
    const status = dom.window.document.getElementById('resetStatus').textContent;
    assert.match(status, errorCode === 'auth/too-many-requests' ? /Too many/ : errorCode === 'auth/network-request-failed' ? /couldn’t/ : /If an account exists/);
    dom.window.close();
  }
  console.log('Password reset: mocked success, unknown account, rate limit, and network failure passed. No emails sent.');
})();
