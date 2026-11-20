/* Kronos JS engine vs the official PyTorch implementation (github.com/shiyu-coder/Kronos).
 * tests/kronos/{fixed,learned}: tiny random-weight Kronos tokenizers and models saved with save_pretrained (the same
 * config.json + model.safetensors format as the published NeoQuasar/* weights), with reference outputs produced by
 * the official code: tokens, decoded bars, s1/s2 logits and a deterministic (top_k = 1) forecast. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const K = require('../assets/js/kronos/kronos-engine.js');
const dir = path.join(__dirname, '..', 'tests', 'kronos');
const ab = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const maxAbs = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
let checks = 0;
for (const variant of ['fixed', 'learned']) {
  const ref = JSON.parse(fs.readFileSync(path.join(dir, variant, 'ref.json'), 'utf8'));
  const engine = K.load({tokConfig: JSON.parse(fs.readFileSync(path.join(dir, variant, 'tokenizer/config.json'))), tokWeights: ab(path.join(dir, variant, 'tokenizer/model.safetensors')),
    modelConfig: JSON.parse(fs.readFileSync(path.join(dir, variant, 'model/config.json'))), modelWeights: ab(path.join(dir, variant, 'model/model.safetensors')), maxContext: 512});
  const T = ref.xn.length, x = Float32Array.from(ref.xn.flat());
  const tok = engine.tokenizer.encode(x, T);
  assert.deepStrictEqual(Array.from(tok.s1), ref.s1, `${variant}: s1 tokens differ`); assert.deepStrictEqual(Array.from(tok.s2), ref.s2, `${variant}: s2 tokens differ`); checks += 2;
  const dec = engine.tokenizer.decode(tok.s1, tok.s2, T);
  assert.ok(maxAbs(Array.from(dec), ref.decoded.flat()) < 2e-4, `${variant}: decoded bars differ by ${maxAbs(Array.from(dec), ref.decoded.flat())}`); checks++;
  const stamps = ref.x_stamp.map(r => r.map(v => v | 0));
  const st = engine.model.prompt(tok.s1, tok.s2, stamps, T, T + ref.H);
  const l1 = engine.model.logits1(st); assert.ok(maxAbs(Array.from(l1), ref.logits1_last) < 2e-3, `${variant}: s1 logits differ by ${maxAbs(Array.from(l1), ref.logits1_last)}`); checks++;
  let pick = 0; l1.forEach((v, i) => { if (v > l1[pick]) pick = i; }); assert.strictEqual(pick, ref.pick); checks++;
  const l2 = engine.model.logits2(st, pick); assert.ok(maxAbs(Array.from(l2), ref.logits2_last) < 2e-3, `${variant}: s2 logits differ by ${maxAbs(Array.from(l2), ref.logits2_last)}`); checks++;
  // deterministic end-to-end forecast (top_k = 1) through the public predict() API using raw OHLCV and UTC timestamps
  const raw = ref.raw, bars = {o: raw.map(r => r[0]), h: raw.map(r => r[1]), l: raw.map(r => r[2]), c: raw.map(r => r[3]), v: raw.map(r => r[4])};
  const t0 = Date.UTC(2026, 2, 2, 9, 30) / 1000; bars.t = raw.map((_, i) => t0 + i * 3600);
  const fut = Array.from({length: ref.H}, (_, i) => t0 + (T + i) * 3600);
  const out = K.predict(engine, bars, fut, {samples: 1, topK: 1, topP: 1});
  const err = maxAbs(out.mean.flat(), ref.greedy_preds.flat()), scale = Math.max(...ref.greedy_preds.flat().map(Math.abs));
  assert.ok(err / scale < 1e-4, `${variant}: forecast differs (max abs ${err})`); checks++;
  // sampled forecasts: correct shape, finite, reproducible with a seed
  const s1 = K.predict(engine, bars, fut, {samples: 4, seed: 9}), s2 = K.predict(engine, bars, fut, {samples: 4, seed: 9});
  assert.strictEqual(s1.paths.length, 4); assert.ok(s1.paths.flat(2).every(Number.isFinite)); assert.deepStrictEqual(s1.mean, s2.mean); checks += 3;
}
console.log(`Kronos engine matches the official PyTorch implementation: ${checks} checks across fixed and learned time embeddings.`);
