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
    widgets: 12,
    quotes: 80
  });
  const SANDBOX_ATTR = 'allow-scripts';
  const SANDBOX_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'";
  const SANDBOX_HTML = `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">
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
  function lockWindow(win) {
    if (!win || win.__fynxLocked) return;
    try { Object.defineProperty(win, '__fynxLocked', {value: true}); } catch (e) { return; }
    var names = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'WebTransport', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'open'];
    var proto = null;
    try { proto = Object.getPrototypeOf(win); } catch (e) {}
    for (var i = 0; i < names.length; i++) {
      try { if (proto) Object.defineProperty(proto, names[i], {configurable: false, writable: false, value: deny(names[i])}); } catch (e2) {}
      try { Object.defineProperty(win, names[i], {configurable: false, writable: false, value: deny(names[i])}); } catch (e3) {}
    }
    try { if (win.navigator) Object.defineProperty(win.navigator, 'sendBeacon', {configurable: false, writable: false, value: deny('sendBeacon')}); } catch (e4) {}
    try { if (win.navigator && win.navigator.serviceWorker) win.navigator.serviceWorker.register = deny('ServiceWorker'); } catch (e5) {}
  }
  function lockNode(node) {
    if (!node) return;
    var type = node.nodeType;
    if (type !== 1 && type !== 11) return;
    try {
      if (node.tagName === 'IFRAME' && node.contentWindow) lockWindow(node.contentWindow);
      var frames = node.querySelectorAll ? node.querySelectorAll('iframe') : [];
      for (var i = 0; i < frames.length; i++) if (frames[i].contentWindow) lockWindow(frames[i].contentWindow);
      var metas = node.querySelectorAll ? node.querySelectorAll('meta[http-equiv]') : [];
      for (var j = 0; j < metas.length; j++) if (/^refresh$/i.test(metas[j].getAttribute('http-equiv') || '')) metas[j].remove();
    } catch (e) {}
  }
  function wrapInsert(proto, name) {
    var orig = proto && proto[name];
    if (typeof orig !== 'function') return;
    proto[name] = function () {
      var result = orig.apply(this, arguments);
      for (var i = 0; i < arguments.length; i++) lockNode(arguments[i]);
      lockNode(this);
      return result;
    };
  }
  lockWindow(window);
  wrapInsert(Node.prototype, 'appendChild');
  wrapInsert(Node.prototype, 'insertBefore');
  wrapInsert(Node.prototype, 'replaceChild');
  wrapInsert(Element.prototype, 'append');
  wrapInsert(Element.prototype, 'prepend');
  wrapInsert(Element.prototype, 'replaceChildren');
  wrapInsert(Element.prototype, 'insertAdjacentElement');
  wrapInsert(Element.prototype, 'after');
  wrapInsert(Element.prototype, 'before');
  wrapInsert(Element.prototype, 'replaceWith');
  try {
    var htmlDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (htmlDesc && htmlDesc.set) {
      Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: true, enumerable: htmlDesc.enumerable, get: htmlDesc.get,
        set: function (value) { htmlDesc.set.call(this, value); lockNode(this); }
      });
    }
    var outerDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML');
    if (outerDesc && outerDesc.set) {
      Object.defineProperty(Element.prototype, 'outerHTML', {
        configurable: true, enumerable: outerDesc.enumerable, get: outerDesc.get,
        set: function (value) { outerDesc.set.call(this, value); lockNode(this.parentNode); }
      });
    }
    var insertHTML = Element.prototype.insertAdjacentHTML;
    if (typeof insertHTML === 'function') {
      Element.prototype.insertAdjacentHTML = function () {
        var result = insertHTML.apply(this, arguments);
        lockNode(this);
        return result;
      };
    }
  } catch (e) {}
  try {
    ['open', 'write', 'writeln'].forEach(function (name) {
      try { Object.defineProperty(Document.prototype, name, {configurable: false, writable: false, value: deny('document.' + name)}); } catch (e2) {}
    });
  } catch (e) {}
  try {
    ['assign', 'replace', 'reload'].forEach(function (name) {
      try { Location.prototype[name] = deny('location.' + name); } catch (e2) {}
    });
    var hrefDesc = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    if (hrefDesc && hrefDesc.configurable) {
      Object.defineProperty(Location.prototype, 'href', {configurable: false, enumerable: hrefDesc.enumerable, get: hrefDesc.get, set: deny('location.href')});
    }
  } catch (e) {}
  document.addEventListener('click', function (event) {
    var node = event.target;
    while (node && node !== document) {
      if (node.tagName === 'A' && node.hasAttribute('href')) { event.preventDefault(); event.stopPropagation(); return; }
      node = node.parentNode;
    }
  }, true);
  try {
    var frameProto = window.HTMLIFrameElement && HTMLIFrameElement.prototype;
    ['contentWindow', 'contentDocument'].forEach(function (prop) {
      var desc = frameProto && Object.getOwnPropertyDescriptor(frameProto, prop);
      if (!desc || !desc.get) return;
      Object.defineProperty(frameProto, prop, {
        configurable: false, enumerable: desc.enumerable,
        get: function () {
          var value = desc.get.call(this);
          try { lockWindow(prop === 'contentWindow' ? value : value && value.defaultView); } catch (e2) {}
          return value;
        }
      });
    });
  } catch (e) {}
  function cleanQuotes(input) {
    var out = [];
    var rows = Array.isArray(input) ? input : [];
    for (var i = 0; i < rows.length && out.length < 80; i++) {
      var row = rows[i];
      var price = Number(row && row.price);
      var name = String(row && row.symbol || '');
      if (!name || !isFinite(price)) continue;
      var change = Number(row.changePercent);
      out.push({symbol: name.slice(0, 32), price: price, changePercent: isFinite(change) ? change : null});
    }
    return out;
  }
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
      quotes = cleanQuotes(event.data.quotes);
      listeners.slice().forEach(function (fn) { try { fn(); } catch (error) { fail(event.data.token, error); } });
      return;
    }
    if (event.data.type !== 'fynx-run') return;
    var token = event.data.token;
    if (String(event.data.code || '').length > 48000) { fail(token, new Error('main.js is limited to 48000 characters.')); return; }
    quotes = cleanQuotes(event.data.quotes);
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
    // This is a courtesy check so people do not paste keys into source. It is not the security boundary.
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
    const rows = Array.isArray(quotes)
      ? quotes.map(row => [row && row.symbol, row])
      : Object.entries(quotes && typeof quotes === 'object' ? quotes : {});
    for (const [symbol, row] of rows) {
      if (out.length >= cap) break;
      const price = Number(row && row.price);
      const name = String(symbol || '');
      if (!name || !Number.isFinite(price)) continue;
      const change = Number(row.changePercent);
      out.push({symbol: name.slice(0, 32), price, changePercent: Number.isFinite(change) ? change : null});
    }
    return out;
  }

  function slotFor(projectId) {
    const id = String(projectId || '');
    if (!/^p[a-z0-9]{8,24}$/.test(id)) throw new Error('Project id is not valid.');
    return 'mine-' + id;
  }

  function sanitizeWidgets(widgets) {
    const out = [];
    const seen = new Set();
    for (const widget of Array.isArray(widgets) ? widgets : []) {
      if (!widget || typeof widget !== 'object') continue;
      const projectId = String(widget.projectId || '');
      let slot = '';
      try { slot = slotFor(projectId); } catch { continue; }
      if (widget.slot !== slot || seen.has(projectId)) continue;
      const name = cleanText(widget.name, LIMITS.name);
      const version = Number(widget.version);
      if (!name || !Number.isInteger(version) || version < 1 || version > 9999) continue;
      seen.add(projectId);
      out.push({slot, projectId, name, version, enabled: widget.enabled !== false});
      if (out.length >= LIMITS.widgets) break;
    }
    return out;
  }

  function layoutSlot(slot, panels) {
    if (slot === null) return null;
    if (typeof slot !== 'string') return undefined;
    const known = panels && typeof panels === 'object' ? panels : {};
    if (Object.prototype.hasOwnProperty.call(known, slot) || /^card:[A-Za-z0-9.\-=^&]{1,24}$/.test(slot)) return slot;
    if (/^mine-p[a-z0-9]{8,24}$/.test(slot)) return null;
    return undefined;
  }

  function accountView(uid, projectRows, installWidgets) {
    if (typeof uid !== 'string' || !uid) return {projects: [], installs: []};
    const projects = [];
    for (const row of Array.isArray(projectRows) ? projectRows : []) {
      if (!row || row.authorUid !== uid || typeof row.id !== 'string' || !/^p[a-z0-9]{8,24}$/.test(row.id)) continue;
      const check = validateProject(row);
      if (!check.ok) continue;
      const versions = [];
      for (const version of Array.isArray(row.versions) ? row.versions : []) {
        const main = version && typeof version.main === 'string' ? version.main : '';
        const number = Number(version && version.version);
        if (!main || main.length > LIMITS.code || !Number.isInteger(number) || number < 1 || number > 9999) continue;
        versions.push({version: number, savedAt: Number(version.savedAt) || 0, main});
      }
      projects.push({
        id: row.id,
        ...check.project,
        version: Number(row.version) || 1,
        updatedAt: Number(row.updatedAt) || 0,
        versions: versions.slice(-LIMITS.versions)
      });
    }
    projects.sort((a, b) => b.updatedAt - a.updatedAt);
    const visible = projects.slice(0, LIMITS.projects);
    return {projects: visible, installs: sanitizeWidgets(installWidgets).filter(widget => visible.some(project => project.id === widget.projectId))};
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
    CATEGORIES, LIMITS, SANDBOX_ATTR, SANDBOX_CSP, SANDBOX_HTML, ASSISTANT_PROMPT, TEMPLATE,
    cleanText, secretFindings, validateProject, snapshotQuotes, slotFor, sanitizeWidgets, accountView, layoutSlot, placeWidget, stripWidget, withVersion
  };
});
