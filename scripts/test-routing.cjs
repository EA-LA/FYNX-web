const fs = require('fs'), assert = require('node:assert/strict');
(async () => {
  const source = fs.readFileSync('assets/js/route-utils.js', 'utf8');
  const { safeReturnTo } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const origin = 'https://www.fynxfinanceworld.com';
  const bad = [null, 'https://example.com', '//example.com', 'javascript:alert(1)', '/auth/login.html', '/auth/signup.html', '/app-return.html', '/open-app.html', '/waitlist.html',
    origin + '//example.com/path', origin + '/a/..//example.com/path',
    origin + '/a/%2e%2e//example.com/path', '/a/..//example.com/path',
    origin + '///example.com/path', origin + '/\\example.com/path'];
  for (const value of bad) assert.equal(safeReturnTo(value, origin), '/home.html', String(value));
  for (const [value, expected] of [
    ['/journal.html?view=review#notes', '/journal.html?view=review#notes'],
    [origin + '/news/?edition=us#today', '/news/?edition=us#today'],
    ['/news/?next=https://example.com', '/news/?next=https://example.com'],
    ['/news/a/../article.html', '/news/article.html']
  ]) {
    const result = safeReturnTo(value, origin);
    assert.equal(result, expected);
    assert.equal(new URL(result, origin).origin, origin);
  }
  for (const route of ['home','news','calendar','calculator','learn','journal','trader-journal','profile']) {
    assert(fs.readFileSync(route + '.html', 'utf8').includes('data-protected-page="false"'));
  }
  assert(!fs.readFileSync('index.html', 'utf8').trimEnd().endsWith('\x60\x60\x60'));
  console.log('Routing: 19 return-target cases passed; public browsing enabled, footer artifact absent.');
})();
