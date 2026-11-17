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
  const SANDBOX_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
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
const nativeEval = eval;
const RealFunction = Function;
const realDoc = document;
const realWin = window;
const deny = name => () => { throw new Error('FYNX Builder blocked ' + name + '. Widgets cannot use the network in this release.'); };
const fakeEval = deny('eval');
const fakeFunction = function Function() { throw new Error('FYNX Builder blocked Function. Widgets cannot use the network in this release.'); };
fakeFunction.prototype = null;

const deadLoc = Object.create(null);
Object.defineProperties(deadLoc, {
  href: { enumerable: true, get: () => 'about:srcdoc', set: deny('location.href') },
  assign: { value: deny('location.assign') },
  replace: { value: deny('location.replace') },
  reload: { value: deny('location.reload') },
  toString: { value: () => 'about:srcdoc' },
  ancestorOrigins: { value: [] }
});
Object.freeze(deadLoc);

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
lockWindow(realWin);
['open', 'write', 'writeln'].forEach(function (name) {
  try { Object.defineProperty(Document.prototype, name, {configurable: false, writable: false, value: deny('document.' + name)}); } catch (e2) {}
});
const deadParent = new Proxy(Object.create(null), {
  get(target, key) {
    if (key === 'postMessage') return data => { parent.postMessage(data, '*'); };
    const error = new Error('FYNX Builder blocked a parent read.');
    error.name = 'SecurityError';
    throw error;
  }
});
const deadProto = Object.create(null);
['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'Function', 'open', 'importScripts'].forEach(name => {
  deadProto[name] = deny(name);
});
const deadWin = Object.create(deadProto);
const timers = {
  setTimeout(fn) { if (typeof fn !== 'function') throw new Error('blocked setTimeout'); return realWin.setTimeout(fn, ...[].slice.call(arguments, 1)); },
  setInterval(fn) { if (typeof fn !== 'function') throw new Error('blocked setInterval'); return realWin.setInterval(fn, ...[].slice.call(arguments, 1)); },
  requestAnimationFrame(fn) { if (typeof fn !== 'function') throw new Error('blocked requestAnimationFrame'); return realWin.requestAnimationFrame(fn); },
  clearTimeout: realWin.clearTimeout.bind(realWin),
  clearInterval: realWin.clearInterval.bind(realWin),
  cancelAnimationFrame: realWin.cancelAnimationFrame.bind(realWin),
  queueMicrotask(fn) { if (typeof fn !== 'function') throw new Error('blocked queueMicrotask'); return realWin.queueMicrotask(fn); }
};
Object.assign(deadWin, timers);
deadWin.eval = fakeEval;
deadWin.Function = fakeFunction;
deadWin.navigator = Object.freeze({
  userAgent: 'FYNX',
  sendBeacon: deny('sendBeacon'),
  serviceWorker: Object.freeze({ register: deny('ServiceWorker') }),
  clipboard: Object.freeze({ writeText: deny('clipboard'), readText: deny('clipboard') })
});
deadWin.fetch = deny('fetch');
deadWin.XMLHttpRequest = deny('XMLHttpRequest');
deadWin.WebSocket = deny('WebSocket');
deadWin.EventSource = deny('EventSource');
deadWin.Worker = deny('Worker');
deadWin.SharedWorker = deny('SharedWorker');
deadWin.RTCPeerConnection = deny('RTCPeerConnection');
deadWin.open = deny('open');
deadWin.Range = deny('Range');
deadWin.DOMParser = deny('DOMParser');
deadWin.Image = deny('Image');
deadWin.Audio = deny('Audio');
deadWin.navigation = Object.freeze({ navigate: deny('navigation.navigate') });
deadWin.localStorage = deny('localStorage');
deadWin.sessionStorage = deny('sessionStorage');
deadWin.indexedDB = deny('indexedDB');
deadWin.caches = deny('caches');
deadWin.cookieStore = deny('cookieStore');
deadWin.getComputedStyle = realWin.getComputedStyle.bind(realWin);
deadWin.getSelection = () => null;
deadWin.addEventListener = function () {};
deadWin.removeEventListener = function () {};
deadWin.dispatchEvent = () => false;
Object.defineProperty(deadWin, 'location', { configurable: false, get: () => deadLoc, set: deny('window.location') });
deadWin.window = deadWin;
deadWin.self = deadWin;
deadWin.globalThis = deadWin;
deadWin.top = deadWin;
deadWin.frames = deadWin;
deadWin.length = 0;
deadWin.parent = deadParent;
deadWin.origin = 'null';
deadWin.name = '';

const BLOCK_TAGS = new Set(['iframe', 'frame', 'object', 'embed', 'meta', 'base', 'link', 'form', 'portal', 'fencedframe', 'script', 'img', 'audio', 'video', 'source', 'track', 'object']);
function tagNameOf(tag) { return String(tag || '').toLowerCase().replace(/^.*:/, '').trim(); }
const facade = {
  nodeType: 9,
  createElement(tag) {
    const name = tagNameOf(tag);
    if (BLOCK_TAGS.has(name)) throw new Error('blocked tag ' + name);
    return realDoc.createElement(tag);
  },
  createElementNS(ns, tag) {
    const name = tagNameOf(tag);
    if (BLOCK_TAGS.has(name) || name === 'a' || name === 'image' || name === 'use' || name === 'script' || name === 'foreignobject') throw new Error('blocked tag ' + name);
    return realDoc.createElementNS(ns, tag);
  },
  createTextNode: text => realDoc.createTextNode(text),
  createDocumentFragment: () => realDoc.createDocumentFragment(),
  getElementById: id => realDoc.getElementById(id),
  querySelector: sel => realDoc.querySelector(sel),
  querySelectorAll: sel => realDoc.querySelectorAll(sel),
  importNode: (node, deep) => realDoc.importNode(node, deep),
  addEventListener(type, fn, options) {
    if (typeof fn !== 'function') return;
    realDoc.addEventListener(type, function (event) { return fn.call(facade, wrapEvent(event)); }, options);
  },
  removeEventListener() {},
  createRange: deny('createRange'),
  createTreeWalker: deny('createTreeWalker'),
  createNodeIterator: deny('createNodeIterator'),
  write: deny('document.write'),
  writeln: deny('document.writeln'),
  open: deny('document.open'),
  close: deny('document.close'),
  execCommand: deny('execCommand'),
  get body() { return realDoc.body; },
  get head() { return realDoc.head; },
  get documentElement() { return realDoc.documentElement; },
  get defaultView() { return deadWin; },
  get location() { return deadLoc; },
  set location(_) { deny('document.location')(); },
  get cookie() { return ''; },
  set cookie(_) { deny('cookie')(); },
  get URL() { return 'about:srcdoc'; },
  get baseURI() { return 'about:srcdoc'; }
};
deadWin.document = facade;

function wrapEvent(event) {
  return new Proxy(event, {
    get(target, prop) {
      if (prop === 'view') return deadWin;
      if (prop === 'currentTarget' || prop === 'target' || prop === 'srcElement') {
        const value = target[prop];
        if (!value || value === realWin || value === realDoc || value.nodeType === 9) return prop === 'currentTarget' ? facade : (value && value.nodeType === 1 ? value : facade);
        return value;
      }
      if (prop === 'composedPath') return () => safePath(target);
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
let origComposedPath = null;
function safePath(event) {
  const path = origComposedPath ? origComposedPath.call(event) : [];
  return path.filter(node => node && node !== realWin && node !== realDoc && node.nodeType !== 9);
}
function dangerousNode(node) {
  if (!node) return false;
  if (node.nodeType === 11) return [...node.childNodes].some(dangerousNode);
  if (node.nodeType !== 1) return false;
  const tag = String(node.tagName || '').toLowerCase();
  if (BLOCK_TAGS.has(tag)) return true;
  return !!(node.querySelector && node.querySelector('iframe,frame,object,embed,meta,base,link,form,script,img,audio,video,source,portal,fencedframe'));
}
function guardInsert(proto, name) {
  const orig = proto && proto[name];
  if (typeof orig !== 'function') return;
  proto[name] = function () {
    for (let i = 0; i < arguments.length; i++) if (dangerousNode(arguments[i])) throw new Error('blocked insert');
    return orig.apply(this, arguments);
  };
}
['appendChild', 'insertBefore', 'replaceChild'].forEach(name => guardInsert(Node.prototype, name));
['append', 'prepend', 'replaceChildren', 'after', 'before', 'replaceWith', 'insertAdjacentElement'].forEach(name => guardInsert(Element.prototype, name));
function unsafeMarkup(value) {
  const text = String(value);
  return /<\\s*\\/?\\s*(?:iframe|frame|object|embed|meta|base|link|form|script|img|audio|video|source|portal|fencedframe|svg|math|a|area|input|button)\\b/i.test(text)
    || /\\b(?:src|href|action|formaction|srcdoc|xlink:href)\\s*=/i.test(text)
    || /url\\s*\\(/i.test(text)
    || /javascript:/i.test(text);
}
function guardHTML(proto, name) {
  const desc = Object.getOwnPropertyDescriptor(proto, name);
  if (!desc || !desc.set || !desc.configurable) return 'skip ' + name;
  Object.defineProperty(proto, name, {
    configurable: false, enumerable: desc.enumerable, get: desc.get,
    set(value) {
      if (unsafeMarkup(value)) throw new Error('blocked markup');
      return desc.set.call(this, value);
    }
  });
  return 'ok ' + name;
}
const lockNotes = [];
try { lockNotes.push(guardHTML(Element.prototype, 'innerHTML')); } catch (e) { lockNotes.push('innerHTML ' + e.message); }
try { lockNotes.push(guardHTML(Element.prototype, 'outerHTML')); } catch (e) { lockNotes.push('outerHTML ' + e.message); }
const insertHTML = Element.prototype.insertAdjacentHTML;
if (typeof insertHTML === 'function') {
  Element.prototype.insertAdjacentHTML = function (position, html) {
    if (unsafeMarkup(html)) throw new Error('blocked markup');
    return insertHTML.call(this, position, html);
  };
}
function lockAccessor(obj, key, getter, setter) {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (!desc || desc.configurable === false) return key + ':locked-or-missing';
  Object.defineProperty(obj, key, {
    configurable: false, enumerable: desc.enumerable,
    get: getter || desc.get,
    set: setter || deny(key)
  });
  return key + ':ok';
}
try {
  const parentDesc = Object.getOwnPropertyDescriptor(Node.prototype, 'parentNode');
  lockNotes.push('parentNode cfg=' + (parentDesc && parentDesc.configurable));
  if (parentDesc && parentDesc.configurable && parentDesc.get) {
    Object.defineProperty(Node.prototype, 'parentNode', {
      configurable: false,
      get() {
        const parent = parentDesc.get.call(this);
        if (!parent || parent.nodeType === 9) return null;
        return parent;
      }
    });
  }
} catch (e) { lockNotes.push('parentNode ' + e.message); }
try {
  Node.prototype.getRootNode = function () {
    let node = this;
    let parent = node.parentNode;
    while (parent) { node = parent; parent = node.parentNode; }
    return node && node.nodeType === 9 ? facade : node;
  };
  lockNotes.push('getRootNode ok');
} catch (e) { lockNotes.push('getRootNode ' + e.message); }
try {
  const owner = Object.getOwnPropertyDescriptor(Node.prototype, 'ownerDocument');
  lockNotes.push('owner cfg=' + (owner && owner.configurable));
  if (owner && owner.configurable) {
    Object.defineProperty(Node.prototype, 'ownerDocument', { configurable: false, get: () => facade });
  }
} catch (e) { lockNotes.push('owner ' + e.message); }
try {
  lockNotes.push('defaultView ' + lockAccessor(Document.prototype, 'defaultView', () => deadWin, deny('defaultView')));
} catch (e) { lockNotes.push('defaultView ' + e.message); }
try {
  if (window.ShadowRoot) lockNotes.push('host ' + lockAccessor(ShadowRoot.prototype, 'host', () => null, deny('host')));
} catch (e) { lockNotes.push('host ' + e.message); }
try {
  lockNotes.push('view ' + lockAccessor(UIEvent.prototype, 'view', () => deadWin, deny('view')));
} catch (e) { lockNotes.push('view ' + e.message); }
try {
  origComposedPath = Event.prototype.composedPath;
  Event.prototype.composedPath = function () { return safePath(this); };
  lockNotes.push('path ' + typeof origComposedPath);
} catch (e) { lockNotes.push('path ' + e.message); }
function denyProp(ctor, key) {
  if (!ctor || !ctor.prototype) return;
  const desc = Object.getOwnPropertyDescriptor(ctor.prototype, key);
  if (!desc || desc.configurable === false) { lockNotes.push(ctor.name + '.' + key + ' skip'); return; }
  Object.defineProperty(ctor.prototype, key, {
    configurable: false,
    get: () => '',
    set: deny(ctor.name + '.' + key)
  });
}
[HTMLIFrameElement, window.HTMLFrameElement, HTMLObjectElement, HTMLEmbedElement].forEach(ctor => {
  if (!ctor) return;
  denyProp(ctor, 'src');
  denyProp(ctor, 'data');
  denyProp(ctor, 'srcdoc');
});
try {
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { configurable: false, get: () => deadWin });
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', { configurable: false, get: () => facade });
} catch (e) { lockNotes.push('cw ' + e.message); }
denyProp(HTMLAnchorElement, 'href');
denyProp(HTMLAreaElement, 'href');
if (window.HTMLBaseElement) denyProp(HTMLBaseElement, 'href');
if (window.HTMLLinkElement) denyProp(HTMLLinkElement, 'href');
denyProp(HTMLFormElement, 'action');
try { Object.defineProperty(HTMLFormElement.prototype, 'submit', { configurable: false, value: deny('form.submit') }); } catch (e) {}
try { Object.defineProperty(HTMLFormElement.prototype, 'requestSubmit', { configurable: false, value: deny('form.requestSubmit') }); } catch (e) {}
denyProp(HTMLMetaElement, 'httpEquiv');
denyProp(HTMLMetaElement, 'content');
['src', 'srcset'].forEach(key => {
  [HTMLImageElement, HTMLScriptElement, HTMLMediaElement, window.HTMLSourceElement].forEach(ctor => denyProp(ctor, key));
});
const origSet = Element.prototype.setAttribute;
Element.prototype.setAttribute = function (name, value) {
  const attr = String(name || '').toLowerCase();
  const tag = String(this.tagName || '').toLowerCase();
  if (['src', 'href', 'action', 'formaction', 'srcdoc', 'data'].includes(attr)) throw new Error('blocked attribute');
  if (tag === 'meta' || tag === 'base' || tag === 'iframe') throw new Error('blocked attribute');
  return origSet.call(this, name, value);
};
const origSetNS = Element.prototype.setAttributeNS;
Element.prototype.setAttributeNS = function (ns, name) {
  if (/href|src|action/i.test(String(name || ''))) throw new Error('blocked attribute');
  return origSetNS.apply(this, arguments);
};
function lockCtor(sample) {
  const proto = Object.getPrototypeOf(sample);
  Object.defineProperty(proto, 'constructor', { configurable: false, get() { return fakeFunction; } });
}
try {
  lockCtor(function () {});
  lockCtor(async function () {});
  lockCtor(function* () {});
  lockCtor(async function* () {});
  lockNotes.push('ctors ok');
} catch (e) { lockNotes.push('ctors ' + e.message); }
realDoc.addEventListener('click', event => {
  let node = event.target;
  while (node && node !== realDoc) {
    if (node.tagName === 'A' || node.tagName === 'AREA' || node.tagName === 'FORM') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    node = node.parentNode;
  }
}, true);

const SAFE = ['Object','Array','String','Number','Boolean','BigInt','Symbol','Math','JSON','Date','RegExp','Map','Set','WeakMap','WeakSet','Promise','Intl','ArrayBuffer','DataView','Uint8Array','Int8Array','Uint16Array','Int16Array','Uint32Array','Int32Array','Float32Array','Float64Array','Uint8ClampedArray','BigInt64Array','BigUint64Array','TextEncoder','TextDecoder','URL','URLSearchParams','AbortController','AbortSignal','Event','CustomEvent','EventTarget','MouseEvent','KeyboardEvent','PointerEvent','FocusEvent','InputEvent','WheelEvent','Error','TypeError','RangeError','ReferenceError','SyntaxError','URIError','AggregateError','isFinite','isNaN','parseInt','parseFloat','decodeURI','decodeURIComponent','encodeURI','encodeURIComponent','NaN','Infinity','undefined','structuredClone','crypto','console','MutationObserver','ResizeObserver','IntersectionObserver','Node','Element','HTMLElement','DocumentFragment','Text','Comment','CharacterData','NodeFilter','DOMException','queueMicrotask','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','setInterval','clearInterval','getComputedStyle','Proxy','Reflect','WeakRef','FinalizationRegistry','ArrayBuffer','SharedArrayBuffer','Atomics','escape','unescape','btoa','atob'];
const bag = Object.create(null);
SAFE.forEach(name => { if (name in realWin) bag[name] = realWin[name]; });
bag.document = facade;
bag.window = deadWin;
bag.self = deadWin;
bag.globalThis = deadWin;
bag.top = deadWin;
bag.parent = deadWin.parent;
bag.frames = deadWin;
bag.location = deadLoc;
bag.navigator = deadWin.navigator;
bag.fetch = deny('fetch');
bag.XMLHttpRequest = deny('XMLHttpRequest');
bag.WebSocket = deny('WebSocket');
bag.EventSource = deny('EventSource');
bag.Worker = deny('Worker');
bag.SharedWorker = deny('SharedWorker');
bag.Function = fakeFunction;
bag.eval = fakeEval;
bag.open = deny('open');
bag.Image = deny('Image');
bag.Audio = deny('Audio');
bag.Range = deny('Range');
bag.DOMParser = deny('DOMParser');
bag.localStorage = deny('localStorage');
bag.sessionStorage = deny('sessionStorage');
bag.indexedDB = deny('indexedDB');
bag.navigation = deadWin.navigation;
bag.importScripts = deny('importScripts');
bag.setTimeout = deadWin.setTimeout;
bag.setInterval = deadWin.setInterval;
bag.requestAnimationFrame = deadWin.requestAnimationFrame;
bag.queueMicrotask = deadWin.queueMicrotask;
bag.clearTimeout = deadWin.clearTimeout;
bag.clearInterval = deadWin.clearInterval;
bag.cancelAnimationFrame = deadWin.cancelAnimationFrame;
bag.getComputedStyle = deadWin.getComputedStyle;
bag.alert = () => {};
bag.confirm = () => false;
bag.prompt = () => null;
bag.postMessage = () => {};
const INTERNAL = ['nativeEval','RealFunction','realDoc','realWin','deny','fakeEval','fakeFunction','deadLoc','deadProto','deadWin','deadParent','timers','BLOCK_TAGS','tagNameOf','facade','wrapEvent','safePath','dangerousNode','guardInsert','unsafeMarkup','guardHTML','lockAccessor','lockNotes','origSet','origSetNS','lockCtor','SAFE','bag','evalTickets','scopeProxy','runUser','claim','hidden','code','arguments','parentDesc','owner','insertHTML','origPath','origComposedPath','lockWindow','cleanQuotes','listeners','fail','sdk','widgetRender','quoteOf','INTERNAL'];
const claim = new Set(INTERNAL);
(function collect(obj, depth) {
  if (!obj || depth > 6 || obj === Object.prototype) return;
  Object.getOwnPropertyNames(obj).forEach(name => claim.add(name));
  collect(Object.getPrototypeOf(obj), depth + 1);
})(realWin, 0);
let evalTickets = 0;
const scopeProxy = new Proxy(bag, {
  has(target, key) {
    if (key === 'eval' && evalTickets > 0) { evalTickets -= 1; return false; }
    return typeof key === 'string' && claim.has(key);
  },
  get(target, key) {
    if (key === Symbol.unscopables) return undefined;
    if (key === 'eval') return fakeEval;
    if (Object.prototype.hasOwnProperty.call(target, key)) return target[key];
    return undefined;
  },
  set(target, key, value) {
    if (key === 'location' || key === 'document' || key === 'window' || key === 'eval' || key === 'Function') throw new Error('blocked assignment');
    if (typeof key === 'string' && claim.has(key) && !Object.prototype.hasOwnProperty.call(target, key)) throw new Error('blocked assignment');
    target[key] = value;
    return true;
  },
  getPrototypeOf() { return null; }
});
function runUser(code) {
  evalTickets = 1;
  deadWin.__fynxRender = null;
  try {
    const source = '"use strict";\\n' + String(code) + '\\n;globalThis.__fynxRender = typeof render === "function" ? render : null;';
    with (scopeProxy) { eval(source); }
  } finally {
    evalTickets = 0;
    try { realWin.eval = fakeEval; } catch (e) {}
    try { realWin.Function = fakeFunction; } catch (e2) {}
  }
  const widgetRender = deadWin.__fynxRender;
  deadWin.__fynxRender = null;
  return widgetRender;
}
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
function quoteOf(symbol) {
  var key = String(symbol || '');
  for (var i = 0; i < quotes.length; i++) if (quotes[i].symbol === key) return quotes[i];
  return null;
}
var sdk = Object.freeze({
  quote: quoteOf,
  quotes: function () { return quotes.slice(); },
  format: function (value, digits) {
    var n = Number(value), d = digits === undefined ? 2 : digits;
    return Number.isFinite(n) ? n.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}) : '\\u2014';
  },
  signed: function (value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '\\u2014';
    return (n > 0 ? '+' : n < 0 ? '\\u2212' : '') + Math.abs(n).toFixed(2) + '%';
  },
  onQuotes: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
});
function fail(token, error) {
  parent.postMessage({type: 'fynx-error', token: token, message: error && error.message ? String(error.message).slice(0, 500) : 'The widget failed.'}, '*');
}
realWin.addEventListener('message', function (event) {
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
  var root = realDoc.getElementById('root');
  root.replaceChildren();
  try {
    var render = runUser(event.data.code);
    if (!render) throw new Error('main.js must define function render(root, FYNX).');
    render(root, sdk);
    parent.postMessage({type: 'fynx-done', token: token}, '*');
  } catch (error) { fail(token, error); }
});
parent.postMessage({type: 'fynx-ready'}, '*');
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
