(function exposeFynxCorrelationStats(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FynxCorrelationStats = api;
})(typeof window === "undefined" ? null : window, function createFynxCorrelationStats() {
  "use strict";

  // Lanczos approximation of ln(Gamma(x)), x > 0.
  const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function logGamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
    x -= 1;
    let a = 0.99999999999980993;
    const t = x + 7.5;
    for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i + 1);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  // Continued fraction for the regularized incomplete beta function (Lentz's method).
  function betaContinuedFraction(x, a, b) {
    const TINY = 1e-300;
    let c = 1;
    let d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
  }

  function regularizedBeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return front * betaContinuedFraction(x, a, b) / a;
    return 1 - front * betaContinuedFraction(1 - x, b, a) / b;
  }

  // Two-sided p-value of Student's t with df degrees of freedom.
  function tTwoSidedP(t, df) {
    if (!Number.isFinite(t)) return 0;
    return regularizedBeta(df / (df + t * t), df / 2, 0.5);
  }

  // Smallest |r| that passes a two-sided test at `alpha` with n pairs (bisection on the p-value).
  function criticalR(n, alpha) {
    const df = n - 2;
    if (df < 1) return null;
    let lo = 0, hi = 1;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const t = mid * Math.sqrt(df / (1 - mid * mid));
      if (tTwoSidedP(t, df) > alpha) lo = mid; else hi = mid;
    }
    return hi;
  }

  function describe(x, y) {
    const n = Array.isArray(x) ? x.length : 0;
    if (n < 3 || !Array.isArray(y) || y.length !== n || !x.every(Number.isFinite) || !y.every(Number.isFinite)) return null;
    const meanX = x.reduce((s, v) => s + v, 0) / n;
    const meanY = y.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX, dy = y[i] - meanY;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    if (!(sxx > 0) || !(syy > 0)) return null;
    let r = sxy / Math.sqrt(sxx * syy);
    r = Math.max(-1, Math.min(1, r));
    const df = n - 2;
    const perfect = Math.abs(r) > 1 - 1e-12;
    const t = perfect ? (r > 0 ? Infinity : -Infinity) : r * Math.sqrt(df / (1 - r * r));
    const p = tTwoSidedP(t, df);
    let ci = null;
    if (n >= 4 && !perfect) {
      const z = Math.atanh(r);
      const half = 1.959963984540054 / Math.sqrt(n - 3);
      ci = [Math.tanh(z - half), Math.tanh(z + half)];
    }
    return {
      n, df, r, r2: r * r,
      betaBonA: sxy / sxx, // average move in B for a 1-unit move in A
      betaAonB: sxy / syy, // average move in A for a 1-unit move in B
      t, p, ci, perfect,
      significant: p < 0.05,
      criticalR: criticalR(n, 0.05),
    };
  }

  return { describe, tTwoSidedP, criticalR, regularizedBeta };
});
