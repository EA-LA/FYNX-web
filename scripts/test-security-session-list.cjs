'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'security.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'assets/js/security-session-list.js'), 'utf8');
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

// Small DOM contract stub: records exactly which nodes the renderer creates.
class Node {
  constructor(type, ownerDocument, text = '') {
    this.type = type;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.value = text;
    this.className = '';
  }
  set textContent(text) {
    this.children = [];
    this.value = String(text);
  }
  get textContent() {
    return this.value + this.children.map(child => child.textContent).join('');
  }
  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }
  appendChild(node) {
    if (node.type === 'fragment') {
      this.children.push(...node.children);
    } else {
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.value = '';
    this.children = [];
    this.append(...nodes);
  }
}
function createContainer() {
  const created = [];
  const doc = {
    createElement(type) {
      created.push(type);
      return new Node(type, doc);
    },
    createTextNode(value) {
      created.push('#text');
      return new Node('#text', doc, value);
    },
    createDocumentFragment() {
      return new Node('fragment', doc);
    },
  };
  return { container: new Node('root', doc), created };
}

test('Security page imports the protected renderer; raw session metadata never reaches innerHTML', () => {
  assert.match(html, /import\s*\{\s*renderSessionMetadata\s*\}\s*from\s*['"]\.\/assets\/js\/security-session-list\.js['"]/);
  assert.match(html, /renderSessionMetadata\(sessionList,\s*sessions\)/);
  assert.doesNotMatch(html, /sessionList\.innerHTML\s*=/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.match(html, /Could not load active sessions\. Reload to try again\./);
});

test('Untrusted session text is rendered literally, never as an element', async () => {
  const { renderSessionMetadata } = await modulePromise;
  const { container, created } = createContainer();
  const payload = '<img src=x onerror=alert(1)>';
  renderSessionMetadata(container, [{ platform: payload, timezone: '<svg/onload=alert(2)>', status: '<script>bad()</script>' }]);
  assert.deepEqual(created, ['div', 'strong', '#text']);
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].children[0].textContent, payload);
  assert.equal(container.textContent, `${payload} • <svg/onload=alert(2)> • <script>bad()</script>`);
  assert.equal(container.children[0].className, 'security-session-row');
});

test('Rerender replaces old entries and supports multiple sessions', async () => {
  const { renderSessionMetadata } = await modulePromise;
  const { container } = createContainer();
  renderSessionMetadata(container, [{platform:'Mac', timezone:'America/Los_Angeles',status:'active'}, {platform:'iPhone',timezone:'UTC',status:'revoked'}]);
  assert.equal(container.children.length, 2);
  assert.match(container.textContent, /Mac • America\/Los_Angeles • active/);
  assert.match(container.textContent, /iPhone • UTC • revoked/);
  renderSessionMetadata(container, [{ platform:'iPad',timezone:'UTC',status:'active' }]);
  assert.equal(container.children.length, 1);
  assert.doesNotMatch(container.textContent, /Mac|iPhone/);
});

test('Missing, non-string and empty session fields display neutral fallbacks', async () => {
  const { renderSessionMetadata } = await modulePromise;
  const { container } = createContainer();
  renderSessionMetadata(container, [{platform:' ', timezone:null, status:123}, {}]);
  assert.equal(container.textContent, 'Device • UTC • activeDevice • UTC • active');
  renderSessionMetadata(container, []);
  assert.equal(container.textContent, 'No session metadata yet');
  assert.equal(container.children.length, 0);
  renderSessionMetadata(container, null);
  assert.equal(container.textContent, 'No session metadata yet');
  renderSessionMetadata(null, [{platform:'safe'}]);
});
