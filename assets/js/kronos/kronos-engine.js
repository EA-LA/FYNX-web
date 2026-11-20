/* Kronos inference engine in plain JavaScript (no dependencies).
 *
 * Kronos (Shi et al., 2025, MIT licence, github.com/shiyu-coder/Kronos) is a decoder-only foundation model for
 * financial candlesticks. A tokenizer turns each normalised OHLCV bar into two binary sub-tokens (BSQ), and an
 * autoregressive Transformer predicts the next sub-tokens, which the tokenizer decodes back into bars.
 *
 * This file re-implements the published inference path (KronosTokenizer.encode/decode, Kronos.decode_s1/decode_s2 and
 * auto_regressive_inference) so the official weights published on Hugging Face (NeoQuasar/*) run in the browser.
 * It reads the same config.json + model.safetensors files. Verified against the official PyTorch code with random
 * weights (scripts/test-kronos-engine.cjs). Differences from the reference: the self-attention keys/values are cached
 * between steps (mathematically identical while the window does not slide; callers keep lookback + horizon within
 * max_context) and the shared context is computed once and copied for every sample.
 */
(function (root) {
  'use strict';

  /* ---------------------------------------- weights ---------------------------------------- */
  function f16(h) { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff; if (e === 0) return s * Math.pow(2, -14) * (m / 1024); if (e === 31) return m ? NaN : s * Infinity; return s * Math.pow(2, e - 15) * (1 + m / 1024); }
  function parseSafetensors(buf) {
    const dv = new DataView(buf), n = Number(dv.getBigUint64(0, true));
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, n))), base = 8 + n, out = new Map();
    for (const [name, info] of Object.entries(header)) {
      if (name === '__metadata__') continue;
      const [a, b] = info.data_offsets, bytes = buf.slice(base + a, base + b);
      let data;
      if (info.dtype === 'F32') data = new Float32Array(bytes);
      else if (info.dtype === 'F16') { const u = new Uint16Array(bytes); data = new Float32Array(u.length); for (let i = 0; i < u.length; i++) data[i] = f16(u[i]); }
      else if (info.dtype === 'BF16') { const u = new Uint16Array(bytes), w = new Uint32Array(u.length); for (let i = 0; i < u.length; i++) w[i] = u[i] << 16; data = new Float32Array(w.buffer); }
      else continue; // integer buffers (BSQ basis) are not needed
      out.set(name, {shape: info.shape, data});
    }
    return out;
  }
  function getter(W) { return name => { const t = W.get(name); if (!t) throw new Error('Kronos weights are missing ' + name); return t.data; }; }

  /* ---------------------------------------- maths ----------------------------------------- */
  // y[T,out] = x[T,in] · Wᵀ + b   (W is [out,in] row-major, as stored by PyTorch)
  // Four output rows at a time so each input value is loaded once per four multiply-adds.
  function linear(x, T, inDim, W, b, outDim) {
    const y = new Float32Array(T * outDim), o4 = outDim - (outDim % 4);
    for (let t = 0; t < T; t++) {
      const xo = t * inDim, yo = t * outDim;
      for (let o = 0; o < o4; o += 4) {
        const w0 = o * inDim, w1 = w0 + inDim, w2 = w1 + inDim, w3 = w2 + inDim;
        let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
        for (let i = 0; i < inDim; i++) { const v = x[xo + i]; s0 += W[w0 + i] * v; s1 += W[w1 + i] * v; s2 += W[w2 + i] * v; s3 += W[w3 + i] * v; }
        if (b) { s0 += b[o]; s1 += b[o + 1]; s2 += b[o + 2]; s3 += b[o + 3]; }
        y[yo + o] = s0; y[yo + o + 1] = s1; y[yo + o + 2] = s2; y[yo + o + 3] = s3;
      }
      for (let o = o4; o < outDim; o++) { let s = 0; const wo = o * inDim; for (let i = 0; i < inDim; i++) s += W[wo + i] * x[xo + i]; y[yo + o] = b ? s + b[o] : s; }
    }
    return y;
  }
  function rmsnorm(x, T, d, w, eps = 1e-5) {
    const y = new Float32Array(T * d);
    for (let t = 0; t < T; t++) { let s = 0; const o = t * d; for (let i = 0; i < d; i++) s += x[o + i] * x[o + i]; const r = 1 / Math.sqrt(s / d + eps); for (let i = 0; i < d; i++) y[o + i] = Math.fround(x[o + i] * r) * w[i]; }
    return y;
  }
  const silu = v => v / (1 + Math.exp(-v));
  function ropeTables(hd, maxPos) {
    const half = hd / 2, cos = new Float32Array(maxPos * half), sin = new Float32Array(maxPos * half);
    for (let j = 0; j < half; j++) { const inv = Math.fround(1 / Math.pow(10000, (2 * j) / hd)); for (let p = 0; p < maxPos; p++) { const f = Math.fround(p * inv); cos[p * half + j] = Math.cos(f); sin[p * half + j] = Math.sin(f); } }
    return {cos, sin, half};
  }
  // rotate one head vector in place at position p (rotate_half convention: [x1,x2] -> [x1 cos - x2 sin, x2 cos + x1 sin])
  function rope(v, off, R, p) { const {cos, sin, half} = R, b = p * half; for (let j = 0; j < half; j++) { const a = v[off + j], c = v[off + j + half], cs = cos[b + j], sn = sin[b + j]; v[off + j] = a * cs - c * sn; v[off + j + half] = c * cs + a * sn; } }

  /* ------------------------------------ transformer block ----------------------------------- */
  function blockWeights(g, p) {
    return {n1: g(p + 'norm1.weight'), n2: g(p + 'norm2.weight'), q: g(p + 'self_attn.q_proj.weight'), qb: g(p + 'self_attn.q_proj.bias'), k: g(p + 'self_attn.k_proj.weight'), kb: g(p + 'self_attn.k_proj.bias'),
      v: g(p + 'self_attn.v_proj.weight'), vb: g(p + 'self_attn.v_proj.bias'), o: g(p + 'self_attn.out_proj.weight'), ob: g(p + 'self_attn.out_proj.bias'), w1: g(p + 'ffn.w1.weight'), w2: g(p + 'ffn.w2.weight'), w3: g(p + 'ffn.w3.weight')};
  }
  // Full causal pass over T tokens (used by the tokenizer and for the shared prompt). Returns new x and the rotated K and V.
  function blockFull(x, T, d, nh, ff, B, R) {
    const hd = d / nh, h = rmsnorm(x, T, d, B.n1);
    const q = linear(h, T, d, B.q, B.qb, d), k = linear(h, T, d, B.k, B.kb, d), v = linear(h, T, d, B.v, B.vb, d);
    for (let t = 0; t < T; t++) for (let hh = 0; hh < nh; hh++) { rope(q, t * d + hh * hd, R, t); rope(k, t * d + hh * hd, R, t); }
    const att = new Float32Array(T * d), sc = new Float64Array(T), scale = 1 / Math.sqrt(hd);
    for (let hh = 0; hh < nh; hh++) {
      for (let t = 0; t < T; t++) {
        const qo = t * d + hh * hd; let mx = -Infinity;
        for (let j = 0; j <= t; j++) { const ko = j * d + hh * hd; let s = 0; for (let i = 0; i < hd; i++) s += q[qo + i] * k[ko + i]; s *= scale; sc[j] = s; if (s > mx) mx = s; }
        let z = 0; for (let j = 0; j <= t; j++) { sc[j] = Math.exp(sc[j] - mx); z += sc[j]; }
        for (let j = 0; j <= t; j++) { const p = sc[j] / z, vo = j * d + hh * hd; for (let i = 0; i < hd; i++) att[qo + i] += p * v[vo + i]; }
      }
    }
    const ao = linear(att, T, d, B.o, B.ob, d), x1 = new Float32Array(T * d);
    for (let i = 0; i < T * d; i++) x1[i] = x[i] + ao[i];
    const h2 = rmsnorm(x1, T, d, B.n2), a = linear(h2, T, d, B.w1, null, ff), b3 = linear(h2, T, d, B.w3, null, ff);
    for (let i = 0; i < a.length; i++) a[i] = silu(a[i]) * b3[i];
    const f = linear(a, T, ff, B.w2, null, d);
    for (let i = 0; i < T * d; i++) x1[i] += f[i];
    return {x: x1, k, v};
  }
  // One new token at position p with a key/value cache (cache arrays hold p rows already).
  function blockStep(x, d, nh, ff, B, R, p, cache) {
    const hd = d / nh, h = rmsnorm(x, 1, d, B.n1);
    const q = linear(h, 1, d, B.q, B.qb, d), k = linear(h, 1, d, B.k, B.kb, d), v = linear(h, 1, d, B.v, B.vb, d);
    for (let hh = 0; hh < nh; hh++) { rope(q, hh * hd, R, p); rope(k, hh * hd, R, p); }
    cache.k.set(k, p * d); cache.v.set(v, p * d);
    const att = new Float32Array(d), sc = new Float64Array(p + 1), scale = 1 / Math.sqrt(hd);
    for (let hh = 0; hh < nh; hh++) {
      let mx = -Infinity;
      for (let j = 0; j <= p; j++) { const ko = j * d + hh * hd; let s = 0; for (let i = 0; i < hd; i++) s += q[hh * hd + i] * cache.k[ko + i]; s *= scale; sc[j] = s; if (s > mx) mx = s; }
      let z = 0; for (let j = 0; j <= p; j++) { sc[j] = Math.exp(sc[j] - mx); z += sc[j]; }
      for (let j = 0; j <= p; j++) { const pr = sc[j] / z, vo = j * d + hh * hd; for (let i = 0; i < hd; i++) att[hh * hd + i] += pr * cache.v[vo + i]; }
    }
    const ao = linear(att, 1, d, B.o, B.ob, d), x1 = new Float32Array(d);
    for (let i = 0; i < d; i++) x1[i] = x[i] + ao[i];
    const h2 = rmsnorm(x1, 1, d, B.n2), a = linear(h2, 1, d, B.w1, null, ff), b3 = linear(h2, 1, d, B.w3, null, ff);
    for (let i = 0; i < ff; i++) a[i] = silu(a[i]) * b3[i];
    const f = linear(a, 1, ff, B.w2, null, d);
    for (let i = 0; i < d; i++) x1[i] += f[i];
    return x1;
  }

  /* ------------------------------------------ tokenizer ------------------------------------------ */
  function Tokenizer(cfg, W) {
    const g = getter(W), d = cfg.d_model, nh = cfg.n_heads, ff = cfg.ff_dim, s1 = cfg.s1_bits, s2 = cfg.s2_bits, cb = s1 + s2, din = cfg.d_in;
    if (s1 !== s2) throw new Error('This engine expects equal s1 and s2 bits (as in all published Kronos tokenizers).');
    const enc = Array.from({length: cfg.n_enc_layers - 1}, (_, i) => blockWeights(g, `encoder.${i}.`)), dec = Array.from({length: cfg.n_dec_layers - 1}, (_, i) => blockWeights(g, `decoder.${i}.`));
    const P = {embW: g('embed.weight'), embB: g('embed.bias'), qW: g('quant_embed.weight'), qB: g('quant_embed.bias'), pW: g('post_quant_embed.weight'), pB: g('post_quant_embed.bias'), hW: g('head.weight'), hB: g('head.bias')};
    let R = ropeTables(d / nh, 64);
    const ensure = T => { if (R.cos.length / R.half < T) R = ropeTables(d / nh, Math.max(T, 2 * R.cos.length / R.half)); };
    this.s1 = s1; this.s2 = s2;
    this.encode = (x, T) => { // x: Float32Array [T, d_in] normalised -> {s1:Int32Array, s2:Int32Array}
      ensure(T); let z = linear(x, T, din, P.embW, P.embB, d);
      for (const B of enc) z = blockFull(z, T, d, nh, ff, B, R).x;
      const q = linear(z, T, d, P.qW, P.qB, cb), a = new Int32Array(T), b = new Int32Array(T);
      for (let t = 0; t < T; t++) { let ia = 0, ib = 0; for (let i = 0; i < s1; i++) { if (q[t * cb + i] > 0) ia += 1 << i; if (q[t * cb + s1 + i] > 0) ib += 1 << i; } a[t] = ia; b[t] = ib; }
      return {s1: a, s2: b};
    };
    const unpack = (ta, tb, T) => { const bits = new Float32Array(T * cb), sc = 1 / Math.sqrt(cb);
      for (let t = 0; t < T; t++) for (let i = 0; i < s1; i++) { bits[t * cb + i] = ((ta[t] >> i) & 1 ? 1 : -1) * sc; bits[t * cb + s1 + i] = ((tb[t] >> i) & 1 ? 1 : -1) * sc; }
      return linear(bits, T, cb, P.pW, P.pB, d); };
    this.decode = (ta, tb, T) => { // -> Float32Array [T, d_in]
      ensure(T); let z = unpack(ta, tb, T);
      for (const B of dec) z = blockFull(z, T, d, nh, ff, B, R).x;
      return linear(z, T, d, P.hW, P.hB, din);
    };
    // The decoder is causal, so the history part can be run once and shared by every sampled continuation.
    this.decodePrefix = (ta, tb, T, cap) => {
      ensure(cap); let z = unpack(ta, tb, T); const caches = [];
      for (const B of dec) { const r = blockFull(z, T, d, nh, ff, B, R), k = new Float32Array(cap * d), v = new Float32Array(cap * d); k.set(r.k); v.set(r.v); caches.push({k, v}); z = r.x; }
      return {caches, len: T};
    };
    this.decodeTail = (pre, ta, tb, H) => { // -> Float32Array [H, d_in] for H new tokens after the prefix
      const caches = pre.caches.map(c => ({k: c.k.slice(), v: c.v.slice()})), out = new Float32Array(H * din), z0 = unpack(ta, tb, H);
      for (let i = 0; i < H; i++) { let z = z0.subarray(i * d, (i + 1) * d); dec.forEach((B, j) => { z = blockStep(z, d, nh, ff, B, R, pre.len + i, caches[j]); }); out.set(linear(z, 1, d, P.hW, P.hB, din), i * din); }
      return out;
    };
  }

  /* -------------------------------------------- model -------------------------------------------- */
  function Model(cfg, W) {
    const g = getter(W), d = cfg.d_model, nh = cfg.n_heads, ff = cfg.ff_dim, L = cfg.n_layers, v1 = 2 ** cfg.s1_bits, v2 = 2 ** cfg.s2_bits;
    const blocks = Array.from({length: L}, (_, i) => blockWeights(g, `transformer.${i}.`));
    const te = name => W.has(`time_emb.${name}.emb.weight`) ? g(`time_emb.${name}.emb.weight`) : g(`time_emb.${name}.weight`);
    const P = {e1: g('embedding.emb_s1.weight'), e2: g('embedding.emb_s2.weight'), fW: g('embedding.fusion_proj.weight'), fB: g('embedding.fusion_proj.bias'), norm: g('norm.weight'),
      h1W: g('head.proj_s1.weight'), h1B: g('head.proj_s1.bias'), h2W: g('head.proj_s2.weight'), h2B: g('head.proj_s2.bias'),
      cq: g('dep_layer.cross_attn.q_proj.weight'), cqb: g('dep_layer.cross_attn.q_proj.bias'), ck: g('dep_layer.cross_attn.k_proj.weight'), ckb: g('dep_layer.cross_attn.k_proj.bias'),
      cv: g('dep_layer.cross_attn.v_proj.weight'), cvb: g('dep_layer.cross_attn.v_proj.bias'), co: g('dep_layer.cross_attn.out_proj.weight'), cob: g('dep_layer.cross_attn.out_proj.bias'), cn: g('dep_layer.norm.weight'),
      tmin: te('minute_embed'), thour: te('hour_embed'), twd: te('weekday_embed'), tday: te('day_embed'), tmon: te('month_embed')};
    const sq = Math.sqrt(d), DEP_HEADS = 4; // DependencyAwareLayer uses its default of 4 heads in every published model
    let R = ropeTables(d / nh, 64);
    this.d = d; this.v1 = v1; this.v2 = v2;
    this.ensure = T => { if (R.cos.length / R.half < T) R = ropeTables(d / nh, Math.max(T, 2 * R.cos.length / R.half)); };
    // token + time embedding for T positions
    this.embed = (a, b, stamps, T) => {
      const cat = new Float32Array(T * 2 * d);
      for (let t = 0; t < T; t++) { const o = t * 2 * d; for (let i = 0; i < d; i++) { cat[o + i] = P.e1[a[t] * d + i] * sq; cat[o + d + i] = P.e2[b[t] * d + i] * sq; } }
      const x = linear(cat, T, 2 * d, P.fW, P.fB, d);
      for (let t = 0; t < T; t++) { const s = stamps[t], o = t * d; for (let i = 0; i < d; i++) x[o + i] += P.tmin[s[0] * d + i] + P.thour[s[1] * d + i] + P.twd[s[2] * d + i] + P.tday[s[3] * d + i] + P.tmon[s[4] * d + i]; }
      return x;
    };
    // prompt: full causal pass; returns caches, normed context and cross-attention keys/values
    this.prompt = (a, b, stamps, T, cap) => {
      this.ensure(cap); let x = this.embed(a, b, stamps, T); const caches = [];
      for (const B of blocks) { const r = blockFull(x, T, d, nh, ff, B, R), k = new Float32Array(cap * d), v = new Float32Array(cap * d); k.set(r.k); v.set(r.v); caches.push({k, v}); x = r.x; }
      const ctx = rmsnorm(x, T, d, P.norm), ck = new Float32Array(cap * d), cv = new Float32Array(cap * d);
      ck.set(linear(ctx, T, d, P.ck, P.ckb, d)); cv.set(linear(ctx, T, d, P.cv, P.cvb, d));
      return {caches, last: ctx.slice((T - 1) * d, T * d), ck, cv, len: T};
    };
    this.clone = s => ({caches: s.caches.map(c => ({k: c.k.slice(), v: c.v.slice()})), last: s.last.slice(), ck: s.ck.slice(), cv: s.cv.slice(), len: s.len});
    this.logits1 = s => linear(s.last, 1, d, P.h1W, P.h1B, v1);
    // decode_s2 for the last position: cross-attention from emb_s1[pick] (rotary is the identity for a single query) to all context positions
    this.logits2 = (s, pick) => {
      const q = linear(P.e1.subarray(pick * d, (pick + 1) * d), 1, d, P.cq, P.cqb, d), hd = d / DEP_HEADS, scale = 1 / Math.sqrt(hd), T = s.len, att = new Float32Array(d), sc = new Float64Array(T);
      for (let hh = 0; hh < DEP_HEADS; hh++) {
        let mx = -Infinity;
        for (let j = 0; j < T; j++) { let z = 0; const o = j * d + hh * hd; for (let i = 0; i < hd; i++) z += q[hh * hd + i] * s.ck[o + i]; z *= scale; sc[j] = z; if (z > mx) mx = z; }
        let Z = 0; for (let j = 0; j < T; j++) { sc[j] = Math.exp(sc[j] - mx); Z += sc[j]; }
        for (let j = 0; j < T; j++) { const p = sc[j] / Z, o = j * d + hh * hd; for (let i = 0; i < hd; i++) att[hh * hd + i] += p * s.cv[o + i]; }
      }
      const ao = linear(att, 1, d, P.co, P.cob, d), x2 = new Float32Array(d);
      for (let i = 0; i < d; i++) x2[i] = s.last[i] + ao[i];
      return linear(rmsnorm(x2, 1, d, P.cn), 1, d, P.h2W, P.h2B, v2);
    };
    // append one token (a,b) with its time stamp at position s.len
    this.step = (s, a, b, stamp) => {
      const p = s.len; let x = this.embed([a], [b], [stamp], 1);
      blocks.forEach((B, i) => { x = blockStep(x, d, nh, ff, B, R, p, s.caches[i]); });
      const c = rmsnorm(x, 1, d, P.norm);
      s.ck.set(linear(c, 1, d, P.ck, P.ckb, d), p * d); s.cv.set(linear(c, 1, d, P.cv, P.cvb, d), p * d);
      s.last = c; s.len = p + 1;
    };
  }

  /* ------------------------------------------ sampling ------------------------------------------ */
  function rng(seed) { let s = (seed >>> 0) || 0x9e3779b9; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function sample(logits, T, topK, topP, rand) {
    const n = logits.length, l = new Float64Array(n); for (let i = 0; i < n; i++) l[i] = logits[i] / T;
    const keep = new Uint8Array(n).fill(1);
    if (topK > 0) { const k = Math.min(topK, n), thr = Array.from(l).sort((a, b) => b - a)[k - 1]; for (let i = 0; i < n; i++) if (l[i] < thr) keep[i] = 0; }
    else if (topP < 1) {
      const idx = Array.from({length: n}, (_, i) => i).sort((a, b) => l[b] - l[a]), mx = l[idx[0]]; let z = 0; for (const i of idx) z += Math.exp(l[i] - mx);
      let cum = 0; for (let r = 0; r < n; r++) { const i = idx[r]; if (r > 0 && cum > topP) keep[i] = 0; cum += Math.exp(l[i] - mx) / z; }
    }
    let mx = -Infinity; for (let i = 0; i < n; i++) if (keep[i] && l[i] > mx) mx = l[i];
    let z = 0; const p = new Float64Array(n); for (let i = 0; i < n; i++) if (keep[i]) { p[i] = Math.exp(l[i] - mx); z += p[i]; }
    let u = rand() * z; for (let i = 0; i < n; i++) { if (!keep[i]) continue; u -= p[i]; if (u <= 0) return i; }
    for (let i = n - 1; i >= 0; i--) if (keep[i]) return i; return 0;
  }

  /* ------------------------------------------ predictor ------------------------------------------ */
  // bars: {o,h,l,c,v, t (unix seconds, UTC)}; futureT: unix seconds of the bars to predict (length = horizon).
  // Returns per-sample OHLCV paths (de-normalised) and the sample mean (the KronosPredictor output).
  function predict(engine, bars, futureT, opt = {}) {
    const {tokenizer, model, maxContext} = engine, H = futureT.length, clip = 5;
    const N0 = bars.c.length, T = Math.min(N0, Math.max(16, (opt.lookback || maxContext) | 0), maxContext - H);
    if (T < 16) throw new Error('Not enough history for this horizon.');
    const off = N0 - T, cols = 6, x = new Float32Array(T * cols), mean = new Float64Array(cols), sd = new Float64Array(cols);
    const row = i => { const o = bars.o[i], h = bars.h[i], l = bars.l[i], c = bars.c[i], v = bars.v ? (bars.v[i] || 0) : 0; return [o, h, l, c, v, v * (o + h + l + c) / 4]; };
    const raw = Array.from({length: T}, (_, t) => row(off + t));
    for (let j = 0; j < cols; j++) { let s = 0; for (let t = 0; t < T; t++) s += raw[t][j]; mean[j] = s / T; let q = 0; for (let t = 0; t < T; t++) q += (raw[t][j] - mean[j]) ** 2; sd[j] = Math.sqrt(q / T); }
    for (let t = 0; t < T; t++) for (let j = 0; j < cols; j++) x[t * cols + j] = Math.max(-clip, Math.min(clip, (raw[t][j] - mean[j]) / (sd[j] + 1e-5)));
    // Calendar features [minute, hour, weekday (Mon = 0), day, month]. Pass bars.stamps / 5-number future entries to use
    // exchange-local time; plain numbers are read as unix seconds in UTC.
    const stamp = ts => { if (Array.isArray(ts)) return ts; const dt = new Date(ts * 1000); return [dt.getUTCMinutes(), dt.getUTCHours(), (dt.getUTCDay() + 6) % 7, dt.getUTCDate(), dt.getUTCMonth() + 1]; };
    const xs = Array.from({length: T}, (_, t) => stamp(bars.stamps ? bars.stamps[off + t] : bars.t[off + t])), ys = futureT.map(stamp);
    const progress = opt.onProgress || (() => {});
    progress('tokenize', 0);
    const tok = tokenizer.encode(x, T);
    progress('context', 0);
    const base = model.prompt(tok.s1, tok.s2, xs, T, T + H), pre = tokenizer.decodePrefix(tok.s1, tok.s2, T, T + H);
    const S = Math.max(1, opt.samples || 1), temp = opt.temperature || 1, topK = opt.topK || 0, topP = opt.topP ?? 0.9, rand = rng(opt.seed ?? 1234);
    const paths = [], meanPath = Array.from({length: H}, () => new Float64Array(cols));
    for (let s = 0; s < S; s++) {
      const st = S > 1 ? model.clone(base) : base, ga = new Int32Array(H), gb = new Int32Array(H);
      for (let i = 0; i < H; i++) {
        const a = sample(model.logits1(st), temp, topK, topP, rand), b = sample(model.logits2(st, a), temp, topK, topP, rand);
        ga[i] = a; gb[i] = b;
        if (i < H - 1) model.step(st, a, b, ys[i]);
        progress('sample', (s * H + i + 1) / (S * H));
      }
      const z = tokenizer.decodeTail(pre, ga, gb, H), path = [];
      for (let i = 0; i < H; i++) { const r = []; for (let j = 0; j < cols; j++) { const v = z[i * cols + j]; r.push(v * (sd[j] + 1e-5) + mean[j]); meanPath[i][j] += v / S; } path.push(r); }
      paths.push(path);
    }
    const meanOut = meanPath.map(r => Array.from(r, (v, j) => v * (sd[j] + 1e-5) + mean[j]));
    return {paths, mean: meanOut, lookback: T, tokens: tok};
  }

  function load(files) { // files: {tokConfig, tokWeights (ArrayBuffer), modelConfig, modelWeights, maxContext}
    const tw = parseSafetensors(files.tokWeights), mw = parseSafetensors(files.modelWeights), count = W => [...W.values()].reduce((s, t) => s + t.data.length, 0);
    return {tokenizer: new Tokenizer(files.tokConfig, tw), model: new Model(files.modelConfig, mw), maxContext: files.maxContext || 512, params: {tokenizer: count(tw), model: count(mw)}};
  }

  const api = {load, predict, parseSafetensors, Tokenizer, Model, sample, rng};
  if (typeof module === 'object' && module.exports) module.exports = api; else root.KronosEngine = api;
})(typeof self !== 'undefined' ? self : this);
