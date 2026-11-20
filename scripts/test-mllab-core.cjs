/* ML lab maths: known-answer checks for every model used by the Terminal ML lab pages. */
const M = require('../assets/js/terminal/mllab-core.js');
let fail = 0; const ok = (c, m) => { if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const r = M.rng(42), g = () => M.gauss(r);
// binomial tail
ok(Math.abs(M.binomTail(60, 100, 0.5) - 0.02844) < 2e-4, 'binomial tail P(X>=60 | 100, .5) = ' + M.binomTail(60, 100, 0.5).toFixed(5));
ok(M.binomTail(0, 10, 0.3) === 1 && M.binomTail(11, 10, 0.3) === 0, 'binomial tail edges');
// logistic regression recovers coefficient signs
const X1 = [], y1 = []; for (let i = 0; i < 2000; i++) { const a = g(), b = g(), c = g(); X1.push([a, b, c]); y1.push(r() < 1 / (1 + Math.exp(-(1.5 * a - 1 * b))) ? 1 : 0); }
const lg = M.logisticFit(X1, y1, 0.1);
ok(Math.abs(lg.w[1] - 1.5) < 0.25 && Math.abs(lg.w[2] + 1) < 0.25 && Math.abs(lg.w[3]) < 0.15, 'logistic coefficients ≈ (1.5, −1, 0): ' + Array.from(lg.w).slice(1).map(v => v.toFixed(2)));
// non-linear (XOR) pattern: forest and neural net beat logistic regression
const X2 = [], y2 = []; for (let i = 0; i < 3000; i++) { const a = g(), b = g(); X2.push([a, b, g()]); y2.push((a > 0) !== (b > 0) ? (r() < 0.9 ? 1 : 0) : (r() < 0.1 ? 1 : 0)); }
const tr = X2.slice(0, 2000), ty = y2.slice(0, 2000), te = X2.slice(2000), ey = y2.slice(2000);
const acc = f => te.filter((x, i) => (f(x) > 0.5 ? 1 : 0) === ey[i]).length / te.length;
const aL = acc(M.logisticFit(tr, ty, 1).predict), aF = acc(M.forestFit(tr, ty, {trees: 40, depth: 4, mtry: 2, seed: 2}).predict), aN = acc(M.mlpFit(tr, ty, {hidden: 12, epochs: 40, seed: 3}).predict);
ok(aL < 0.6 && aF > 0.82 && aN > 0.82, `XOR out of sample: logistic ${aL.toFixed(3)}, forest ${aF.toFixed(3)}, neural net ${aN.toFixed(3)}`);
// gradient boosting fits a non-linear function
const X3 = [], y3 = []; for (let i = 0; i < 1500; i++) { const a = g() * 2, b = g(); X3.push([a, b]); y3.push(Math.sin(a) + 0.5 * b * b + 0.1 * g()); }
const gb = M.gbmFit(X3.slice(0, 1000), y3.slice(0, 1000), {rounds: 120, depth: 3, lr: 0.1, minLeaf: 10});
const mse = f => M.mean(X3.slice(1000).map((x, i) => (f(x) - y3[1000 + i]) ** 2)), base = M.mean(y3.slice(1000).map(v => (v - M.mean(y3.slice(0, 1000))) ** 2));
ok(mse(gb.predict) < 0.25 * base, `boosting MSE ${mse(gb.predict).toFixed(3)} vs constant ${base.toFixed(3)}`);
// regression net fits a smooth volatility-smile-like surface
const X6 = [], y6 = []; for (let i = 0; i < 900; i++) { const k = (r() - 0.5) * 0.6, t = 0.05 + r() * 0.5; X6.push([k / Math.sqrt(t), Math.sqrt(t)]); y6.push(0.2 - 0.25 * k + 0.6 * k * k + 0.05 * Math.sqrt(t) + 0.003 * g()); }
const nr = M.mlpRegFit(X6.slice(0, 700), y6.slice(0, 700), {hidden: [16, 16], epochs: 250, lr: 0.01, seed: 3}), rmse = Math.sqrt(M.mean(X6.slice(700).map((x, i) => (nr.predict(x) - y6[700 + i]) ** 2)));
ok(rmse < 0.012, 'regression net out-of-sample RMSE ' + rmse.toFixed(4) + ' on a smile surface (noise 0.003)');
// Gaussian mixture recovers two clusters
const X4 = []; for (let i = 0; i < 600; i++) X4.push(i < 400 ? [g() * 0.5 - 2, g() * 0.5] : [g() * 0.8 + 3, g() * 0.8 + 1]);
const gm = M.gmmFit(X4, 2, {seed: 4}), cs = gm.mu.map(m => Array.from(m)).sort((a, b) => a[0] - b[0]), ws = Array.from(gm.w).sort();
ok(Math.abs(cs[0][0] + 2) < 0.15 && Math.abs(cs[1][0] - 3) < 0.2 && Math.abs(cs[1][1] - 1) < 0.2 && Math.abs(ws[0] - 1 / 3) < 0.03, 'mixture means ≈ (−2,0), (3,1), weights 2/3 and 1/3');
ok(M.gmmFit(X4, 2, {seed: 4}).bic < M.gmmFit(X4, 1, {seed: 4}).bic, 'BIC prefers two clusters over one');
// eigen-decomposition
const e = M.eigSym(Float64Array.from([2, 1, 0, 1, 2, 0, 0, 0, 5]), 3);
ok(Math.abs(e.values[0] - 5) < 1e-10 && Math.abs(e.values[1] - 3) < 1e-10 && Math.abs(e.values[2] - 1) < 1e-10 && Math.abs(Math.abs(e.vectors[1][0]) - Math.SQRT1_2) < 1e-9, 'Jacobi eigenvalues 5, 3, 1');
// PCA: one common factor in 20 assets → exactly one eigenvalue above the Marchenko–Pastur edge
const N = 20, T = 500, f = Array.from({length: T}, g), R = Array.from({length: N}, () => Array.from({length: T}, (_, t) => 0.6 * f[t] + g()));
const pc = M.pca(R); ok(pc.signal === 1 && pc.share[0] > 0.2, `PCA finds 1 factor above the noise edge ${pc.edge.toFixed(2)} (PC1 ${(pc.share[0] * 100).toFixed(0)}%)`);
// Engle–Granger: simulated 5% critical value near MacKinnon's −3.34; cointegrated pair rejected; independent walks not
const nul = M.egNull(750, 2000, 7), q5 = nul[Math.floor(0.05 * nul.length)];
ok(q5 < -3.2 && q5 > -3.5, '5% critical value ' + q5.toFixed(2) + ' (MacKinnon ≈ −3.34)');
const x = [0], y = [], u = [0]; for (let t = 1; t < 750; t++) { x.push(x[t - 1] + g()); u.push(0.9 * u[t - 1] + g()); } for (let t = 0; t < 750; t++) y.push(2 + 0.8 * x[t] + u[t]);
const eg = M.engleGranger(y, x); ok(M.pFromNull(eg.tau, nul) < 0.01 && Math.abs(eg.b - 0.8) < 0.05 && eg.halfLife > 3 && eg.halfLife < 12, `cointegrated: p ${M.pFromNull(eg.tau, nul).toFixed(4)}, beta ${eg.b.toFixed(3)}, half-life ${eg.halfLife.toFixed(1)}`);
let rej = 0; for (let k = 0; k < 200; k++) { const a = [0], b = [0]; for (let t = 1; t < 750; t++) { a.push(a[t - 1] + g()); b.push(b[t - 1] + g()); } if (M.pFromNull(M.engleGranger(a, b).tau, nul) < 0.05) rej++; }
ok(rej >= 3 && rej <= 20, `independent walks rejected ${rej}/200 at 5% (≈10 expected)`);
ok(JSON.stringify(M.bh([0.001, 0.2, 0.012, 0.04, 0.9], 0.1)) === JSON.stringify([true, false, true, true, false]), 'Benjamini–Hochberg');
// isolation forest scores outliers higher
const X5 = Array.from({length: 1000}, () => [g(), g(), g()]); X5.push([6, -6, 5]);
const iso = M.isolationForest(X5, {seed: 1}), s = X5.map(iso.score), rank = s.filter(v => v > s[1000]).length;
ok(rank === 0 && s[1000] > 0.6 && M.mean(s.slice(0, 1000)) < 0.5, `isolation forest: outlier score ${s[1000].toFixed(2)} (rank ${rank + 1}), normal mean ${M.mean(s.slice(0, 1000)).toFixed(2)}`);
// Q-learning: state 0 drifts up, state 1 drifts down → long in 0, short in 1
// Learned on 10 independent datasets (own random streams): the full policy must come out in at least 8.
let qPass = 0, ql = null, st = null, rt = null;
for (let seed = 1; seed <= 10; seed++) {
  const rq = M.rng(100 + seed), gq = () => M.gauss(rq), s1 = [], r1 = []; let cur = 0;
  for (let t = 0; t < 3000; t++) { if (rq() < 0.05) cur = 1 - cur; s1.push(cur); r1.push((cur ? -0.002 : 0.002) + 0.01 * gq()); }
  const q = M.qLearn(s1, r1, 2, {epochs: 60, cost: 0.0002, seed});
  if ([0, 1, 2].every(p => q.act(p) === 2) && [0, 1, 2].every(p => q.act(3 + p) === 0)) { qPass++; if (!ql) { ql = q; st = s1; rt = r1; } }
}
ok(qPass >= 8, `Q-learning: long in the up state and short in the down state whatever the position, in ${qPass} of 10 datasets`);
const pr = M.runPolicy(st, rt, ql.act, 0, 2999, 0.0002); ok(M.sharpe(pr) > 2, 'learned policy Sharpe ' + M.sharpe(pr).toFixed(2));
console.log(fail ? `${fail} ML lab check(s) failed` : 'ML lab maths: classifiers, boosting, mixtures, PCA, cointegration, isolation forest and Q-learning checks passed');
process.exit(fail ? 1 : 0);
