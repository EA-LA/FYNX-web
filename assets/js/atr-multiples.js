/* [site-qa] run 117: ATR Stop "Same ATR, other multiples" table.
 * For each ATR multiple it gives the stop price, the stop distance in pips,
 * the 2R target and (when a balance is given) the position size the same
 * dollar risk allows and the loss at that rounded-down size.
 * Sizing matches the "Size This Stop" card on tools/atr-stop.html:
 * lots = floor(risk / (distance x USD per price unit x lot units) / step) x step.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FynxAtrMultiples = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MULTIPLES = [1, 1.5, 2, 2.5, 3];
  var SPECS = {
    'XAU/USD': { lotUnits: 100, step: 0.01, coins: false },
    'BTC/USD': { lotUnits: 1, step: 0.0001, coins: true }
  };
  var FX = { lotUnits: 100000, step: 0.01, coins: false };

  function spec(name) { return SPECS[name] || FX; }

  /* Position size for one stop distance. Returns null when the balance or
   * risk is missing or invalid. */
  function sizeFor(o) {
    var bal = Number(o.balance), pct = Number(o.riskPct), entry = Number(o.entry), dist = Number(o.distance);
    if (!(bal > 0) || !(pct > 0) || pct > 100 || !(entry > 0) || !(dist > 0)) return null;
    var s = spec(o.name);
    var perUnit = o.name === 'USD/JPY' ? 1 / entry : 1;
    var risk = bal * pct / 100;
    var lossPerLot = dist * perUnit * s.lotUnits;
    var lots = Math.floor(risk / lossPerLot / s.step + 1e-9) * s.step;
    if (lots < s.step / 2) {
      return { risk: risk, lots: 0, belowMin: true, step: s.step, coins: s.coins, loss: s.step * lossPerLot };
    }
    return { risk: risk, lots: lots, belowMin: false, step: s.step, coins: s.coins, loss: lots * lossPerLot };
  }

  /* One row per multiple. A buy stop at or below 0 is reported as stop: null. */
  function multipleRows(o) {
    var entry = Number(o.entry), atr = Number(o.atr), pip = Number(o.pip);
    if (!(entry > 0) || !(atr > 0) || !(pip > 0)) return [];
    var dir = o.side === 'sell' ? -1 : 1;
    var list = (o.multiples || MULTIPLES).slice();
    var cur = Number(o.current);
    if (cur > 0 && list.indexOf(cur) < 0) list.push(cur);
    list.sort(function (a, b) { return a - b; });
    var hasSize = o.balance !== null && o.balance !== undefined && o.balance !== '';
    return list.map(function (m) {
      var dist = atr * m;
      var stop = entry - dir * dist;
      var target = entry + dir * 2 * dist;
      return {
        multiple: m,
        yours: m === cur,
        distance: dist,
        pips: dist / pip,
        stop: stop > 0 ? stop : null,
        target2R: target > 0 ? target : null,
        size: hasSize && stop > 0 ? sizeFor({ name: o.name, entry: entry, distance: dist, balance: o.balance, riskPct: o.riskPct }) : null
      };
    });
  }

  return { MULTIPLES: MULTIPLES, sizeFor: sizeFor, multipleRows: multipleRows };
}));
