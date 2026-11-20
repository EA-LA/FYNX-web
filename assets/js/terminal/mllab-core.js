/* FYNX ML lab: the maths, with no DOM access, so it runs in the Terminal and in node tests.
 * Classifiers (logistic regression, random forest, a one-hidden-layer neural net), gradient-boosted regression trees,
 * a Gaussian mixture fitted by EM, symmetric eigen-decomposition (Jacobi) for PCA, the Engle–Granger cointegration
 * test with simulated p-values, an isolation forest and tabular Q-learning. Every model here is evaluated
 * walk-forward or out of sample by the pages that use it. */
(function (root) {
  'use strict';
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  // mulberry32: small, fast, seeded
  const rng = seed => { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const gauss = r => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const mean = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : NaN; };
  const sd = a => { const m = mean(a); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2; return a.length > 1 ? Math.sqrt(s / (a.length - 1)) : NaN; };
  const ncdf = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x >= 0 ? 1 - p : p; };
  // P(X >= k) for X ~ Binomial(n, p): exact log-space sum
  function binomTail(k, n, p) {
    if (k <= 0) return 1; if (k > n) return 0;
    const lg = x => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const q of c) s += q / ++y; return -t + Math.log(2.5066282746310005 * s / x); };
    const lc = (a, b) => lg(a + 1) - lg(b + 1) - lg(a - b + 1); let s = 0;
    for (let j = k; j <= n; j++) s += Math.exp(lc(n, j) + j * Math.log(p) + (n - j) * Math.log(1 - p));
    return Math.min(1, s);
  }
  function standardizer(X) {
    const p = X[0].length, mu = new Float64Array(p), s = new Float64Array(p);
    for (const r of X) for (let j = 0; j < p; j++) mu[j] += r[j] / X.length;
    for (const r of X) for (let j = 0; j < p; j++) s[j] += (r[j] - mu[j]) ** 2 / X.length;
    for (let j = 0; j < p; j++) s[j] = Math.sqrt(s[j]) || 1;
    return r => r.map((v, j) => (v - mu[j]) / s[j]);
  }
  // Solve A x = b (A n×n, row-major Float64Array) by Gaussian elimination with partial pivoting.
  function solve(A, b, n) {
    const M = Float64Array.from(A), x = Float64Array.from(b);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r * n + c]) > Math.abs(M[p * n + c])) p = r;
      if (Math.abs(M[p * n + c]) < 1e-14) return null;
      if (p !== c) { for (let k = 0; k < n; k++) { const t = M[c * n + k]; M[c * n + k] = M[p * n + k]; M[p * n + k] = t; } const t = x[c]; x[c] = x[p]; x[p] = t; }
      for (let r = c + 1; r < n; r++) { const f = M[r * n + c] / M[c * n + c]; if (!f) continue; for (let k = c; k < n; k++) M[r * n + k] -= f * M[c * n + k]; x[r] -= f * x[c]; }
    }
    for (let r = n - 1; r >= 0; r--) { let s = x[r]; for (let k = r + 1; k < n; k++) s -= M[r * n + k] * x[k]; x[r] = s / M[r * n + r]; }
    return x;
  }

  /* --------------------------------------------- classifiers --------------------------------------------- */
  // L2-regularised logistic regression by Newton's method (features should be standardised).
  function logisticFit(X, y, lambda = 1) {
    const n = X.length, p = X[0].length + 1, w = new Float64Array(p);
    for (let it = 0; it < 25; it++) {
      const g = new Float64Array(p), H = new Float64Array(p * p);
      for (let i = 0; i < n; i++) {
        let z = w[0]; for (let j = 1; j < p; j++) z += w[j] * X[i][j - 1];
        const pr = 1 / (1 + Math.exp(-z)), e = pr - y[i], s = pr * (1 - pr);
        for (let a = 0; a < p; a++) { const xa = a ? X[i][a - 1] : 1; g[a] += e * xa; for (let b = 0; b <= a; b++) H[a * p + b] += s * xa * (b ? X[i][b - 1] : 1); }
      }
      for (let a = 0; a < p; a++) { for (let b = 0; b < a; b++) H[b * p + a] = H[a * p + b]; if (a) { g[a] += lambda * w[a]; H[a * p + a] += lambda; } else H[0] += 1e-8; }
      const d = solve(H, g, p); if (!d) break; let mx = 0;
      for (let a = 0; a < p; a++) { w[a] -= d[a]; mx = Math.max(mx, Math.abs(d[a])); }
      if (mx < 1e-8) break;
    }
    return {w, predict: r => { let z = w[0]; for (let j = 1; j < p; j++) z += w[j] * r[j - 1]; return 1 / (1 + Math.exp(-z)); }};
  }
  // Candidate split thresholds: q quantiles of each feature.
  function thresholds(X, idx, q) { const p = X[0].length, out = []; for (let f = 0; f < p; f++) { const v = idx.map(i => X[i][f]).sort((a, b) => a - b), t = new Set(); for (let k = 1; k < q; k++) t.add(v[Math.floor(k * v.length / q)]); out.push([...t]); } return out; }
  // Regression/classification tree on y (squared error = Gini for 0/1 labels). Nodes: [feature, threshold, left, right] or [value].
  function growTree(X, y, idx, {depth, minLeaf, mtry, thr, rand}) {
    const nodes = [];
    const build = (ids, d) => {
      let sum = 0; for (const i of ids) sum += y[i];
      const me = nodes.length; nodes.push([sum / ids.length]);
      if (d >= depth || ids.length < 2 * minLeaf) return me;
      const p = X[0].length, feats = [];
      if (mtry >= p) for (let f = 0; f < p; f++) feats.push(f); else { const pool = Array.from({length: p}, (_, f) => f); for (let k = 0; k < mtry; k++) { const j = k + Math.floor(rand() * (p - k)); [pool[k], pool[j]] = [pool[j], pool[k]]; feats.push(pool[k]); } }
      let best = null, bestGain = 1e-12; const n = ids.length, base = sum * sum / n;
      for (const f of feats) for (const t of thr[f]) {
        let nl = 0, sl = 0; for (const i of ids) if (X[i][f] <= t) { nl++; sl += y[i]; }
        const nr = n - nl; if (nl < minLeaf || nr < minLeaf) continue;
        const gain = sl * sl / nl + (sum - sl) * (sum - sl) / nr - base;
        if (gain > bestGain) { bestGain = gain; best = [f, t]; }
      }
      if (!best) return me;
      const L = [], R = []; for (const i of ids) (X[i][best[0]] <= best[1] ? L : R).push(i);
      nodes[me] = [best[0], best[1], 0, 0]; nodes[me][2] = build(L, d + 1); nodes[me][3] = build(R, d + 1);
      return me;
    };
    build(idx, 0);
    return nodes;
  }
  const treePredict = (nodes, r) => { let k = 0; for (;;) { const nd = nodes[k]; if (nd.length === 1) return nd[0]; k = r[nd[0]] <= nd[1] ? nd[2] : nd[3]; } };
  function forestFit(X, y, {trees = 40, depth = 4, minLeaf = 25, mtry, q = 12, seed = 1} = {}) {
    const n = X.length, p = X[0].length, rand = rng(seed), all = Array.from({length: n}, (_, i) => i), thr = thresholds(X, all, q), T = [], imp = new Float64Array(p);
    for (let k = 0; k < trees; k++) {
      const boot = Array.from({length: n}, () => Math.floor(rand() * n));
      const t = growTree(X, y, boot, {depth, minLeaf, mtry: mtry || Math.max(1, Math.round(Math.sqrt(p))), thr, rand}); T.push(t);
      for (const nd of t) if (nd.length === 4) imp[nd[0]]++;
    }
    return {trees: T, importance: Array.from(imp, v => v / Math.max(1, imp.reduce((a, b) => a + b, 0))), predict: r => { let s = 0; for (const t of T) s += treePredict(t, r); return s / T.length; }};
  }
  // One hidden layer (tanh), sigmoid output, binary cross-entropy, Adam, mini-batches.
  function mlpFit(X, y, {hidden = 12, epochs = 30, lr = 0.01, l2 = 1e-3, batch = 64, seed = 1} = {}) {
    const n = X.length, p = X[0].length, h = hidden, rand = rng(seed);
    const W1 = Float64Array.from({length: h * p}, () => gauss(rand) * Math.sqrt(1 / p)), b1 = new Float64Array(h), W2 = Float64Array.from({length: h}, () => gauss(rand) * Math.sqrt(1 / h)); let b2 = 0;
    const P = [W1, b1, W2], m = P.map(a => new Float64Array(a.length)), v = P.map(a => new Float64Array(a.length)); let mb2 = 0, vb2 = 0, step = 0;
    const act = new Float64Array(h), order = Array.from({length: n}, (_, i) => i);
    for (let ep = 0; ep < epochs; ep++) {
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      for (let s0 = 0; s0 < n; s0 += batch) {
        const G = P.map(a => new Float64Array(a.length)); let gb2 = 0; const B = Math.min(batch, n - s0);
        for (let k = s0; k < s0 + B; k++) {
          const r = X[order[k]]; let z = b2;
          for (let a = 0; a < h; a++) { let s = b1[a]; for (let j = 0; j < p; j++) s += W1[a * p + j] * r[j]; act[a] = Math.tanh(s); z += W2[a] * act[a]; }
          const e = 1 / (1 + Math.exp(-z)) - y[order[k]]; gb2 += e;
          for (let a = 0; a < h; a++) { G[2][a] += e * act[a]; const d = e * W2[a] * (1 - act[a] * act[a]); G[1][a] += d; for (let j = 0; j < p; j++) G[0][a * p + j] += d * r[j]; }
        }
        step++; const c1 = 1 - 0.9 ** step, c2 = 1 - 0.999 ** step;
        P.forEach((W, q) => { for (let i = 0; i < W.length; i++) { const g = G[q][i] / B + (q !== 1 ? l2 * W[i] : 0); m[q][i] = 0.9 * m[q][i] + 0.1 * g; v[q][i] = 0.999 * v[q][i] + 0.001 * g * g; W[i] -= lr * (m[q][i] / c1) / (Math.sqrt(v[q][i] / c2) + 1e-8); } });
        const g = gb2 / B; mb2 = 0.9 * mb2 + 0.1 * g; vb2 = 0.999 * vb2 + 0.001 * g * g; b2 -= lr * (mb2 / c1) / (Math.sqrt(vb2 / c2) + 1e-8);
      }
    }
    return {predict: r => { let z = b2; for (let a = 0; a < h; a++) { let s = b1[a]; for (let j = 0; j < p; j++) s += W1[a * p + j] * r[j]; z += W2[a] * Math.tanh(s); } return 1 / (1 + Math.exp(-z)); }};
  }
  // Gradient-boosted regression trees (squared error).
  function gbmFit(X, y, {rounds = 80, depth = 3, lr = 0.08, minLeaf = 30, q = 12, seed = 1} = {}) {
    const n = X.length, all = Array.from({length: n}, (_, i) => i), thr = thresholds(X, all, q), rand = rng(seed), f0 = mean(y), F = new Float64Array(n).fill(f0), T = [];
    for (let k = 0; k < rounds; k++) {
      const res = Array.from({length: n}, (_, i) => y[i] - F[i]);
      const t = growTree(X, res, all, {depth, minLeaf, mtry: X[0].length, thr, rand}); T.push(t);
      for (let i = 0; i < n; i++) F[i] += lr * treePredict(t, X[i]);
    }
    return {predict: r => { let s = f0; for (const t of T) s += lr * treePredict(t, r); return s; }};
  }

  /* ------------------------------------------ Gaussian mixture ------------------------------------------ */
  // Full-covariance Gaussian mixture on d-dimensional rows, EM with k-means++ starts. Returns parameters, posteriors and BIC.
  function gmmFit(X, K, {iters = 200, seed = 1} = {}) {
    const n = X.length, d = X[0].length, rand = rng(seed);
    const cent = [X[Math.floor(rand() * n)]];
    while (cent.length < K) { const dist = X.map(r => Math.min(...cent.map(c => r.reduce((s, v, j) => s + (v - c[j]) ** 2, 0)))), tot = dist.reduce((a, b) => a + b, 0); let u = rand() * tot, k = 0; while (k < n - 1 && (u -= dist[k]) > 0) k++; cent.push(X[k]); }
    let mu = cent.map(c => Float64Array.from(c)), w = new Float64Array(K).fill(1 / K);
    const cov0 = (() => { const m = new Float64Array(d); X.forEach(r => r.forEach((v, j) => m[j] += v / n)); const C = new Float64Array(d * d); X.forEach(r => { for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) C[a * d + b] += (r[a] - m[a]) * (r[b] - m[b]) / n; }); return C; })();
    let S = Array.from({length: K}, () => Float64Array.from(cov0));
    const R = Array.from({length: n}, () => new Float64Array(K)); let ll = -Infinity;
    const chol = A => { const L = new Float64Array(d * d); for (let i = 0; i < d; i++) for (let j = 0; j <= i; j++) { let s = A[i * d + j]; for (let k = 0; k < j; k++) s -= L[i * d + k] * L[j * d + k]; if (i === j) { if (s <= 0) return null; L[i * d + i] = Math.sqrt(s); } else L[i * d + j] = s / L[j * d + j]; } return L; };
    const logpdf = (r, m, L) => { const z = new Float64Array(d); let q = 0, ld = 0; for (let i = 0; i < d; i++) { let s = r[i] - m[i]; for (let k = 0; k < i; k++) s -= L[i * d + k] * z[k]; z[i] = s / L[i * d + i]; q += z[i] * z[i]; ld += Math.log(L[i * d + i]); } return -0.5 * q - ld - 0.5 * d * Math.log(2 * Math.PI); };
    for (let it = 0; it < iters; it++) {
      const Ls = S.map(C => chol(C) || chol(C.map((v, i) => v + (i % (d + 1) === 0 ? 1e-6 : 0))));
      let tot = 0;
      for (let i = 0; i < n; i++) { const lp = mu.map((m, k) => Math.log(w[k] + 1e-300) + logpdf(X[i], m, Ls[k])), mx = Math.max(...lp); let z = 0; for (let k = 0; k < K; k++) { R[i][k] = Math.exp(lp[k] - mx); z += R[i][k]; } for (let k = 0; k < K; k++) R[i][k] /= z; tot += mx + Math.log(z); }
      for (let k = 0; k < K; k++) {
        let nk = 0; const m = new Float64Array(d); for (let i = 0; i < n; i++) { nk += R[i][k]; for (let j = 0; j < d; j++) m[j] += R[i][k] * X[i][j]; }
        for (let j = 0; j < d; j++) m[j] /= nk || 1;
        const C = new Float64Array(d * d); for (let i = 0; i < n; i++) for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) C[a * d + b] += R[i][k] * (X[i][a] - m[a]) * (X[i][b] - m[b]);
        for (let a = 0; a < d * d; a++) C[a] = C[a] / (nk || 1) + (a % (d + 1) === 0 ? 1e-6 : 0);
        mu[k] = m; S[k] = C; w[k] = nk / n;
      }
      if (Math.abs(tot - ll) < 1e-7 * Math.abs(tot)) { ll = tot; break; } ll = tot;
    }
    const params = K * (d + d * (d + 1) / 2) + K - 1;
    return {K, mu, S, w, post: R, ll, bic: -2 * ll + params * Math.log(n), predict: r => { const Ls = S.map(chol), lp = mu.map((m, k) => Math.log(w[k] + 1e-300) + logpdf(r, m, Ls[k])), mx = Math.max(...lp), e = lp.map(v => Math.exp(v - mx)), z = e.reduce((a, b) => a + b, 0); return e.map(v => v / z); }};
  }

  /* ---------------------------------------------- PCA ---------------------------------------------- */
  // Cyclic Jacobi for a symmetric matrix: all eigenvalues (descending) and eigenvectors (columns of V, returned as rows).
  function eigSym(A, n) {
    const M = Float64Array.from(A), V = new Float64Array(n * n); for (let i = 0; i < n; i++) V[i * n + i] = 1;
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += M[i * n + j] ** 2;
      if (off < 1e-20) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        const apq = M[p * n + q]; if (Math.abs(apq) < 1e-300) continue;
        const th = (M[q * n + q] - M[p * n + p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const kp = M[k * n + p], kq = M[k * n + q]; M[k * n + p] = c * kp - s * kq; M[k * n + q] = s * kp + c * kq; }
        for (let k = 0; k < n; k++) { const pk = M[p * n + k], qk = M[q * n + k]; M[p * n + k] = c * pk - s * qk; M[q * n + k] = s * pk + c * qk; }
        for (let k = 0; k < n; k++) { const kp = V[k * n + p], kq = V[k * n + q]; V[k * n + p] = c * kp - s * kq; V[k * n + q] = s * kp + c * kq; }
      }
    }
    const ord = Array.from({length: n}, (_, i) => i).sort((a, b) => M[b * n + b] - M[a * n + a]);
    return {values: ord.map(i => M[i * n + i]), vectors: ord.map(i => { const v = Array.from({length: n}, (_, k) => V[k * n + i]), s = v.reduce((a, b) => a + b, 0) < 0 ? -1 : 1; return v.map(x => x * s); })};
  }
  // Correlation-matrix PCA of aligned return series (rows = assets). Marchenko–Pastur edge for pure noise.
  function pca(rets) {
    const N = rets.length, T = rets[0].length, Z = rets.map(r => { const m = mean(r), s = sd(r) || 1; return Array.from(r, v => (v - m) / s); });
    const C = new Float64Array(N * N); for (let i = 0; i < N; i++) for (let j = i; j < N; j++) { let s = 0; for (let t = 0; t < T; t++) s += Z[i][t] * Z[j][t]; C[i * N + j] = C[j * N + i] = s / (T - 1); }
    const e = eigSym(C, N), tot = e.values.reduce((a, b) => a + b, 0), q = N / T, edge = (1 + Math.sqrt(q)) ** 2;
    const factor = k => { const v = e.vectors[k], out = new Float64Array(T); for (let t = 0; t < T; t++) { let s = 0; for (let i = 0; i < N; i++) s += v[i] * Z[i][t]; out[t] = s / Math.sqrt(N); } return out; };
    return {values: e.values, vectors: e.vectors, share: e.values.map(v => v / tot), edge, signal: e.values.filter(v => v > edge).length, N, T, factor};
  }

  /* ------------------------------------------- cointegration ------------------------------------------- */
  // Engle–Granger: y = a + b x + e, then ADF(1 lag, no constant) on e. Returns tau, beta, residuals and half-life.
  function engleGranger(y, x) {
    const n = y.length, mx = mean(x), my = mean(y); let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
    const b = sxx ? sxy / sxx : 0, a = my - b * mx, e = new Float64Array(n); for (let i = 0; i < n; i++) e[i] = y[i] - a - b * x[i];
    const r = adf(e);
    return {a, b, e, tau: r.tau, rho: r.rho, halfLife: r.rho < 0 && r.rho > -1 ? -Math.log(2) / Math.log(1 + r.rho) : Infinity, sd: sd(e)};
  }
  // Δe_t = ρ e_{t-1} + φ Δe_{t-1} + u ; t-statistic of ρ.
  function adf(e) {
    const n = e.length; let s11 = 0, s12 = 0, s22 = 0, s1y = 0, s2y = 0, m = 0;
    for (let t = 2; t < n; t++) { const y = e[t] - e[t - 1], x1 = e[t - 1], x2 = e[t - 1] - e[t - 2]; s11 += x1 * x1; s12 += x1 * x2; s22 += x2 * x2; s1y += x1 * y; s2y += x2 * y; m++; }
    const det = s11 * s22 - s12 * s12; if (!(det > 0)) return {tau: 0, rho: 0};
    const rho = (s22 * s1y - s12 * s2y) / det, phi = (s11 * s2y - s12 * s1y) / det; let sse = 0;
    for (let t = 2; t < n; t++) { const u = (e[t] - e[t - 1]) - rho * e[t - 1] - phi * (e[t - 1] - e[t - 2]); sse += u * u; }
    const s2 = sse / Math.max(1, m - 2), se = Math.sqrt(s2 * s22 / det);
    return {tau: rho / (se || 1e-12), rho};
  }
  // Null distribution of the Engle–Granger statistic for two independent random walks of length n (simulated).
  function egNull(n, sims = 1000, seed = 11) {
    const rand = rng(seed), out = new Float64Array(sims), x = new Float64Array(n), y = new Float64Array(n);
    for (let s = 0; s < sims; s++) { x[0] = y[0] = 0; for (let t = 1; t < n; t++) { x[t] = x[t - 1] + gauss(rand); y[t] = y[t - 1] + gauss(rand); } out[s] = engleGranger(y, x).tau; }
    return out.sort();
  }
  const pFromNull = (tau, nul) => { let lo = 0, hi = nul.length; while (lo < hi) { const m = (lo + hi) >> 1; if (nul[m] <= tau) lo = m + 1; else hi = m; } return (lo + 1) / (nul.length + 1); };
  // Benjamini–Hochberg: which p-values pass at false-discovery rate q.
  function bh(ps, q) { const ord = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), m = ps.length; let k = 0; ord.forEach(([p], r) => { if (p <= q * (r + 1) / m) k = r + 1; }); const pass = new Array(m).fill(false); for (let r = 0; r < k; r++) pass[ord[r][1]] = true; return pass; }

  /* ------------------------------------------ isolation forest ------------------------------------------ */
  const cN = n => n > 2 ? 2 * (Math.log(n - 1) + 0.5772156649) - 2 * (n - 1) / n : n === 2 ? 1 : 0;
  function isolationForest(X, {trees = 100, sample = 256, seed = 3} = {}) {
    const n = X.length, p = X[0].length, rand = rng(seed), psi = Math.min(sample, n), maxD = Math.ceil(Math.log2(psi)), forest = [];
    for (let k = 0; k < trees; k++) {
      const ids = []; for (let i = 0; i < psi; i++) ids.push(Math.floor(rand() * n));
      const nodes = [];
      const build = (s, d) => {
        const me = nodes.length; nodes.push([s.length]);
        if (d >= maxD || s.length <= 1) return me;
        const f = Math.floor(rand() * p); let lo = Infinity, hi = -Infinity; for (const i of s) { lo = Math.min(lo, X[i][f]); hi = Math.max(hi, X[i][f]); }
        if (!(hi > lo)) return me;
        const t = lo + rand() * (hi - lo), L = [], R = []; for (const i of s) (X[i][f] < t ? L : R).push(i);
        nodes[me] = [f, t, 0, 0]; nodes[me][2] = build(L, d + 1); nodes[me][3] = build(R, d + 1); return me;
      };
      build(ids, 0); forest.push(nodes);
    }
    const path = (nodes, r) => { let k = 0, d = 0; for (;;) { const nd = nodes[k]; if (nd.length === 1) return d + cN(nd[0]); k = r[nd[0]] < nd[1] ? nd[2] : nd[3]; d++; } };
    const c = cN(psi);
    return {score: r => { let s = 0; for (const t of forest) s += path(t, r); return Math.pow(2, -(s / forest.length) / c); }};
  }

  /* --------------------------------------------- Q-learning --------------------------------------------- */
  // Tabular Q-learning over market states × previous position. Actions: 0 short, 1 cash, 2 long.
  // states[t] in [0, S), rets[t] = return from t to t+1. Reward = position × return − cost × |position change|.
  function qLearn(states, rets, S, {from = 0, to = states.length - 1, epochs = 150, alpha = 0.05, gamma = 0.9, cost = 0.0005, seed = 5} = {}) {
    const rand = rng(seed), Q = Array.from({length: S * 3}, () => new Float64Array(3)), pos = [-1, 0, 1];
    for (let ep = 0; ep < epochs; ep++) {
      const eps = Math.max(0.02, 0.4 * (1 - ep / (epochs * 0.8))); let prev = 1;
      for (let t = from; t < to; t++) {
        const s = states[t] * 3 + prev, q = Q[s];
        const a = rand() < eps ? Math.floor(rand() * 3) : (q[0] > q[1] ? (q[0] > q[2] ? 0 : 2) : (q[1] > q[2] ? 1 : 2));
        const r = 100 * (pos[a] * rets[t] - cost * Math.abs(pos[a] - pos[prev]));
        const s2 = states[t + 1] * 3 + a, nq = Q[s2], best = Math.max(nq[0], nq[1], nq[2]);
        q[a] += alpha * (r + gamma * best - q[a]); prev = a;
      }
    }
    const act = s => { const q = Q[s]; return q[0] > q[1] ? (q[0] > q[2] ? 0 : 2) : (q[1] > q[2] ? 1 : 2); };
    return {Q, act};
  }
  // Run a policy (function of state index incl. previous position) and return daily strategy returns.
  function runPolicy(states, rets, act, from, to, cost = 0.0005) {
    const pos = [-1, 0, 1], out = []; let prev = 1;
    for (let t = from; t < to; t++) { const a = act(states[t] * 3 + prev); out.push(pos[a] * rets[t] - cost * Math.abs(pos[a] - pos[prev])); prev = a; }
    return out;
  }
  const sharpe = (r, ann = 252) => { const s = sd(r); return s > 0 ? mean(r) / s * Math.sqrt(ann) : 0; };

  const api = {rng, gauss, mean, sd, ncdf, binomTail, standardizer, solve, logisticFit, forestFit, mlpFit, gbmFit, growTree, treePredict, gmmFit, eigSym, pca, engleGranger, adf, egNull, pFromNull, bh, isolationForest, qLearn, runPolicy, sharpe, finite};
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FynxMLCore = api;
})(typeof self !== 'undefined' ? self : this);
