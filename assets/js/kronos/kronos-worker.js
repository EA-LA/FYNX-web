/* Web Worker that runs the Kronos foundation model off the page's main thread.
 * Downloads the official weights from Hugging Face once (NeoQuasar/*, MIT licence), keeps them in the browser's
 * Cache Storage, and answers forecast requests with the engine in kronos-engine.js.
 * Messages in:  {type:'load', model}            -> {type:'ready', model, info} | {type:'error'}
 *               {type:'predict', id, model, bars, future, opt} -> {type:'result', id, out} | {type:'error', id}
 * Messages out also include {type:'progress', id?, stage, done, total}. */
/* global importScripts, KronosEngine */
'use strict';
importScripts('/assets/js/kronos/kronos-engine.js?v=20261121-kronos-1');

const HF = 'https://huggingface.co/';
const MODELS = {
  mini: {model: 'NeoQuasar/Kronos-mini', tokenizer: 'NeoQuasar/Kronos-Tokenizer-2k', maxContext: 2048},
  small: {model: 'NeoQuasar/Kronos-small', tokenizer: 'NeoQuasar/Kronos-Tokenizer-base', maxContext: 512}
};
const CACHE = 'fynx-kronos-v1';
const engines = new Map();

const post = m => self.postMessage(m);
async function cached(url) {
  try { const c = await caches.open(CACHE), hit = await c.match(url); if (hit) return {res: hit, cache: null}; return {res: null, cache: c}; } catch (_) { return {res: null, cache: null}; }
}
// Fetch a file with download progress; store it in Cache Storage for next time.
async function fetchFile(url, onBytes) {
  const {res: hit, cache} = await cached(url);
  if (hit) { const b = await hit.arrayBuffer(); onBytes(b.byteLength, b.byteLength); return b; }
  const res = await fetch(url, {mode: 'cors', credentials: 'omit'});
  if (!res.ok) throw new Error(`Hugging Face answered ${res.status} for ${url.replace(HF, '')}`);
  const total = +res.headers.get('content-length') || 0;
  let buf;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader(), parts = []; let got = 0;
    for (;;) { const {done, value} = await reader.read(); if (done) break; parts.push(value); got += value.byteLength; onBytes(got, total); }
    const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.byteLength; } buf = out.buffer;
  } else { buf = await res.arrayBuffer(); onBytes(buf.byteLength, buf.byteLength); }
  if (cache) { try { await cache.put(url, new Response(buf.slice(0), {headers: {'content-type': 'application/octet-stream'}})); } catch (_) { /* storage full or private mode: still works this session */ } }
  return buf;
}
// Config values become array sizes, so they are checked before anything is allocated.
function checkConfig(c, kind) {
  const int = (k, lo, hi) => { const v = c[k]; if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`Unexpected ${kind} config value ${k}=${v}`); };
  int('d_model', 8, 4096); int('n_heads', 1, 64); int('ff_dim', 8, 16384); int('s1_bits', 1, 16); int('s2_bits', 1, 16);
  if (c.d_model % c.n_heads) throw new Error(`${kind}: d_model is not divisible by n_heads`);
  if (kind === 'tokenizer') { int('d_in', 1, 64); int('n_enc_layers', 1, 64); int('n_dec_layers', 1, 64); } else int('n_layers', 1, 128);
  return c;
}
async function load(name) {
  if (engines.has(name)) return engines.get(name);
  const spec = MODELS[name]; if (!spec) throw new Error('Unknown Kronos model.');
  const p = (async () => {
    const urls = {tc: `${HF}${spec.tokenizer}/resolve/main/config.json`, tw: `${HF}${spec.tokenizer}/resolve/main/model.safetensors`, mc: `${HF}${spec.model}/resolve/main/config.json`, mw: `${HF}${spec.model}/resolve/main/model.safetensors`};
    const got = {tw: 0, mw: 0}, tot = {tw: 0, mw: 0};
    const tick = k => (g, t) => { got[k] = g; tot[k] = t || tot[k]; post({type: 'progress', stage: 'download', done: got.tw + got.mw, total: (tot.tw + tot.mw) || 0}); };
    const [tc, mc] = await Promise.all([fetchFile(urls.tc, () => {}), fetchFile(urls.mc, () => {})]);
    const tokConfig = checkConfig(JSON.parse(new TextDecoder().decode(tc)), 'tokenizer'), modelConfig = checkConfig(JSON.parse(new TextDecoder().decode(mc)), 'model');
    const [tw, mw] = await Promise.all([fetchFile(urls.tw, tick('tw')), fetchFile(urls.mw, tick('mw'))]);
    post({type: 'progress', stage: 'build', done: 0, total: 0});
    const engine = KronosEngine.load({tokConfig, tokWeights: tw, modelConfig, modelWeights: mw, maxContext: spec.maxContext});
    engine.info = {model: spec.model, tokenizer: spec.tokenizer, maxContext: spec.maxContext, bytes: tw.byteLength + mw.byteLength,
      params: engine.params.model, tokParams: engine.params.tokenizer, d_model: modelConfig.d_model, n_layers: modelConfig.n_layers, vocab: 2 ** modelConfig.s1_bits};
    return engine;
  })();
  engines.set(name, p);
  try { return await p; } catch (e) { engines.delete(name); throw e; }
}

self.onmessage = async ev => {
  const m = ev.data || {};
  try {
    if (m.type === 'load') { const e = await load(m.model); post({type: 'ready', model: m.model, info: e.info}); return; }
    if (m.type === 'predict') {
      const e = await load(m.model); let last = 0;
      const out = KronosEngine.predict(e, m.bars, m.future, {...m.opt, onProgress: (stage, f) => { const now = Date.now(); if (now - last > 120 || f === 1) { last = now; post({type: 'progress', id: m.id, stage, done: f || 0, total: 1}); } }});
      post({type: 'result', id: m.id, out: {paths: out.paths, mean: out.mean, lookback: out.lookback}, info: e.info});
    }
  } catch (err) {
    post({type: 'error', id: m.id, message: (err && err.message) || String(err)});
  }
};
