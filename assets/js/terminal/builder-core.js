/* FYNX Builder core. No DOM, no network, no account access.
 * The browser UI and the node tests both use this file. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxBuilderCore = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';

  const CATEGORIES = Object.freeze([
    ['stocks', 'Stocks and equities'],
    ['forex', 'Forex and currencies'],
    ['crypto', 'Cryptocurrency'],
    ['bonds', 'Bonds and interest rates'],
    ['commodities', 'Commodities'],
    ['options', 'Options and derivatives'],
    ['policy', 'Government and policy'],
    ['news', 'News and current affairs'],
    ['research', 'Economic research'],
    ['macro', 'Central banking and macro'],
    ['visualization', 'Market visualization'],
    ['portfolio', 'Portfolio analytics'],
    ['education', 'Financial education'],
    ['risk', 'Risk management'],
    ['business', 'Business and industry intelligence']
  ]);
  const CATEGORY_IDS = new Set(CATEGORIES.map(([id]) => id));
  const LIMITS = Object.freeze({
    name: 80,
    description: 500,
    code: 48000,
    projects: 40,
    versions: 5,
    widgets: 24,
    quotes: 80
  });
  const SANDBOX_ATTR = 'allow-scripts';
  const SANDBOX_HTML = `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<style>
  html,body{margin:0;background:#06080a;color:#e7ece9;font:12px/1.4 Inter,Arial,sans-serif}
  body{padding:8px}
  h2{margin:0 0 6px;font-size:13px}
  p{margin:0;color:#c5d0ca}
  .fxb-miss{color:#8e9b94}
</style></head><body><div id="root"></div>
<script>
(function () {
  function deny(name) {
    return function () { throw new Error('FYNX Builder blocked ' + name + '. Widgets cannot use the network in this release.'); };
  }
  try { Object.defineProperty(self, 'fetch', {configurable: false, writable: false, value: deny('fetch')}); } catch (e) {}
  try { Object.defineProperty(self, 'XMLHttpRequest', {configurable: false, writable: false, value: deny('XMLHttpRequest')}); } catch (e) {}
  try { Object.defineProperty(self, 'WebSocket', {configurable: false, writable: false, value: deny('WebSocket')}); } catch (e) {}
  try { Object.defineProperty(self, 'EventSource', {configurable: false, writable: false, value: deny('EventSource')}); } catch (e) {}
  var quotes = [];
  var listeners = [];
  function quote(symbol) {
    var key = String(symbol || '');
    for (var i = 0; i < quotes.length; i++) if (quotes[i].symbol === key) return quotes[i];
    return null;
  }
  var sdk = Object.freeze({
    quote: quote,
    quotes: function () { return quotes.slice(); },
    format: function (value, digits) {
      var n = Number(value), d = digits === undefined ? 2 : digits;
      return Number.isFinite(n) ? n.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}) : '—';
    },
    signed: function (value) {
      var n = Number(value);
      if (!Number.isFinite(n)) return '—';
      return (n > 0 ? '+' : n < 0 ? '\\u2212' : '') + Math.abs(n).toFixed(2) + '%';
    },
    onQuotes: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
  });
  function fail(token, error) {
    parent.postMessage({type: 'fynx-error', token: token, message: error && error.message ? String(error.message).slice(0, 500) : 'The widget failed.'}, '*');
  }
  window.addEventListener('message', function (event) {
    if (event.source !== parent || !event.data) return;
    if (event.data.type === 'fynx-quotes' && event.data.token) {
      quotes = Array.isArray(event.data.quotes) ? event.data.quotes : [];
      listeners.slice().forEach(function (fn) { try { fn(); } catch (error) { fail(event.data.token, error); } });
      return;
    }
    if (event.data.type !== 'fynx-run') return;
    var token = event.data.token;
    quotes = Array.isArray(event.data.quotes) ? event.data.quotes : [];
    listeners = [];
    var root = document.getElementById('root');
    root.replaceChildren();
    try {
      var compiled = new Function('root', 'FYNX', '"use strict";\\n' + String(event.data.code || '') + '\\n;return typeof render === "function" ? render : null;');
      var render = compiled(root, sdk);
      if (!render) throw new Error('main.js must define function render(root, FYNX).');
      render(root, sdk);
      parent.postMessage({type: 'fynx-done', token: token}, '*');
    } catch (error) { fail(token, error); }
  });
  parent.postMessage({type: 'fynx-ready'}, '*');
})();
</script></body></html>`;

  const ASSISTANT_PROMPT = [
    'You are writing a widget for FYNX Builder. Return only JavaScript for a file named main.js.',
    'Do not use HTML, imports, fetch, XMLHttpRequest, WebSocket, cookies, localStorage, or API keys.',
    'Define function render(root, FYNX).',
    'root is an empty DOM element. Build the widget with document.createElement and textContent. Do not use innerHTML.',
    'FYNX.quote(symbol) returns {symbol, price, changePercent} or null. Symbols include SPY, QQQ, AAPL, BTC-USD, EURUSD=X, GC=F, DX-Y.NYB and ^TNX.',
    'FYNX.quotes() returns the current terminal snapshot. FYNX.format(number, digits) and FYNX.signed(number) format numbers.',
    'FYNX.onQuotes(callback) runs again when that snapshot updates.',
    'The widget cannot access the network. If a private data provider is required, say so in a comment. Do not invent credentials.',
    'The widget must be a financial, economic, or market tool.',
    'Build a dashboard titled "Global Market Intelligence" that shows SPY, gold (GC=F or GLD), and the dollar index (DX-Y.NYB), and says when a symbol is missing from the snapshot.'
  ].join('\n');

  const TEMPLATE = `function render(root, FYNX) {
  const card = document.createElement('section');
  const title = document.createElement('h2');
  title.textContent = 'Global Market Intelligence';
  const line = document.createElement('p');
  const bits = [];
  const spy = FYNX.quote('SPY');
  const gold = FYNX.quote('GC=F') || FYNX.quote('GLD');
  const dollar = FYNX.quote('DX-Y.NYB');
  bits.push(spy ? 'S&P 500 ' + FYNX.format(spy.price, 2) + ' (' + FYNX.signed(spy.changePercent) + ')' : 'S&P 500 is not in this terminal snapshot');
  if (gold) bits.push('Gold ' + FYNX.format(gold.price, 2) + ' (' + FYNX.signed(gold.changePercent) + ')');
  else bits.push('Gold is not in this terminal snapshot');
  if (dollar) bits.push('Dollar index ' + FYNX.format(dollar.price, 2) + ' (' + FYNX.signed(dollar.changePercent) + ')');
  else bits.push('Dollar index is not in this terminal snapshot');
  line.textContent = bits.join(' · ');
  card.append(title, line);
  root.replaceChildren(card);
}
`;

  function cleanText(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
  }

  function secretFindings(code) {
    const text = String(code || '');
    const found = [];
    const patterns = [
      [/(\b(?:api[_-]?key|secret|password|token|private[_-]?key)\b\s*[:=]\s*['"][^'"]{6,}['"])/i, 'A credential is assigned in the source.'],
      [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/, 'This looks like a provider secret key.'],
      [/\bAKIA[0-9A-Z]{16}\b/, 'This looks like a cloud access key.']
    ];
    for (const [pattern, message] of patterns) if (pattern.test(text)) found.push(message);
    return found;
  }

  function validateProject(input) {
    const errors = [];
    const name = cleanText(input && input.name, LIMITS.name);
    const description = cleanText(input && input.description, LIMITS.description);
    const category = String(input && input.category || '');
    const main = String(input && input.main || '');
    if (!name) errors.push('Name the project.');
    if (name.length > LIMITS.name) errors.push('Name is too long.');
    if (description.length < 12) errors.push('Add a short description of the financial tool (at least 12 characters).');
    if (!CATEGORY_IDS.has(category)) errors.push('Choose a finance category.');
    if (!main.trim()) errors.push('main.js is empty.');
    if (main.length > LIMITS.code) errors.push('main.js is limited to ' + LIMITS.code + ' characters.');
    if (!/\bfunction\s+render\s*\(/.test(main)) errors.push('main.js must define function render(root, FYNX).');
    secretFindings(main).forEach(message => errors.push(message + ' Remove it. API credentials are not stored in project files.'));
    return {
      ok: errors.length === 0,
      errors,
      project: {name, description, category, main, visibility: 'private'}
    };
  }

  function snapshotQuotes(quotes, limit) {
    const cap = limit || LIMITS.quotes;
    const out = [];
    if (!quotes || typeof quotes !== 'object') return out;
    for (const [symbol, row] of Object.entries(quotes)) {
      if (out.length >= cap) break;
      const price = Number(row && row.price);
      if (!symbol || !Number.isFinite(price)) continue;
      const change = Number(row.changePercent);
      out.push({
        symbol: String(symbol).slice(0, 32),
        price,
        changePercent: Number.isFinite(change) ? change : null
      });
    }
    return out;
  }

  function slotFor(projectId) {
    const clean = String(projectId || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
    if (clean.length < 8) throw new Error('Project id is not valid.');
    return 'mine-' + clean;
  }

  function placeWidget(slots, slot, max) {
    const limit = max || 28;
    const next = Array.isArray(slots) ? slots.slice() : [];
    if (next.includes(slot)) return next;
    const empty = next.indexOf(null);
    if (empty >= 0) { next[empty] = slot; return next; }
    if (next.length >= limit) return null;
    next.push(slot);
    return next;
  }

  function stripWidget(slots, slot) {
    return (Array.isArray(slots) ? slots : []).map(item => item === slot ? null : item);
  }

  function withVersion(previous, project) {
    const prior = previous && typeof previous === 'object' ? previous : {};
    const changed = prior.main !== project.main;
    const version = changed ? Math.max(1, Number(prior.version) || 0) + (prior.main ? 1 : 0) : Math.max(1, Number(prior.version) || 1);
    const history = Array.isArray(prior.versions) ? prior.versions.slice() : [];
    if (changed && prior.main) history.push({version: Number(prior.version) || 1, savedAt: Number(prior.updatedAt) || 0, main: String(prior.main)});
    return {
      name: project.name,
      description: project.description,
      category: project.category,
      visibility: 'private',
      version: prior.main ? version : 1,
      main: project.main,
      versions: history.slice(-LIMITS.versions)
    };
  }

  return {
    CATEGORIES, LIMITS, SANDBOX_ATTR, SANDBOX_HTML, ASSISTANT_PROMPT, TEMPLATE,
    cleanText, secretFindings, validateProject, snapshotQuotes, slotFor, placeWidget, stripWidget, withVersion
  };
});
