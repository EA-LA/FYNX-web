/* FYNX contract spec tick value and stop risk example (site-qa run 124).
 * Simple linear futures contract:
 *   tick value      = tick size x multiplier ($ per 1.00 point)
 *   stop in points  = ticks to stop x tick size
 *   risk per contract = ticks x tick value + round-trip fees per contract
 *   risk for N      = N x risk per contract
 * Optional: a smaller version of the contract (same tick size, its own
 * multiplier) and a risk budget (equity x risk %) that sizes the most whole
 * contracts whose stop loss plus fees fit inside it.
 * All inputs are the reader's own hypothetical numbers; nothing is an
 * exchange specification or a quote.
 * Pure functions are exported for tests; the widget is wired on the
 * "Contract Specs Every Trader Must Know" lesson.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxContractTickRisk = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const STOPS = [4, 8, 12, 20, 40, 80];
  const EPS = 1e-9;
  // Trim binary noise (0.1 x 3 = 0.30000000000000004) before display and flooring.
  const clean = (v) => Math.round(v * 1e8) / 1e8;

  function validate(input) {
    const { tickSize, multiplier, contracts, stopTicks, fees, smallMultiplier, equity, riskPct } = input;
    if (!Number.isFinite(tickSize) || tickSize <= 0 || tickSize > 1e6) return 'Enter the tick size (smallest price step, in points) above 0.';
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 1e7) return 'Enter the contract multiplier ($ per 1.00 point) above 0.';
    if (!Number.isInteger(contracts) || contracts < 1 || contracts > 10000) return 'Enter a whole number of contracts from 1 to 10,000.';
    if (!Number.isInteger(stopTicks) || stopTicks < 1 || stopTicks > 1000000) return 'Enter the stop as a whole number of ticks from 1 to 1,000,000.';
    if (!Number.isFinite(fees) || fees < 0 || fees > 1e6) return 'Enter round-trip fees per contract of $0 or more (leave blank for none).';
    if (smallMultiplier != null && (!Number.isFinite(smallMultiplier) || smallMultiplier <= 0)) return 'Enter the smaller version’s multiplier above 0, or leave it blank.';
    if (smallMultiplier != null && smallMultiplier >= multiplier) return 'The smaller version’s multiplier should be below the main contract’s multiplier.';
    const hasEq = equity != null, hasRisk = riskPct != null;
    if (hasEq !== hasRisk) return 'Enter both account equity and risk %, or leave both blank.';
    if (hasEq && (!Number.isFinite(equity) || equity <= 0 || equity > 1e12)) return 'Enter your account equity above $0.';
    if (hasRisk && (!Number.isFinite(riskPct) || riskPct <= 0 || riskPct > 100)) return 'Enter a risk % above 0 and up to 100.';
    return '';
  }

  function contractRisk(tickSize, multiplier, ticks, fees) {
    const tickValue = clean(tickSize * multiplier);
    const lossPerContract = clean(ticks * tickValue);
    return { tickValue, lossPerContract, perContract: clean(lossPerContract + fees) };
  }

  function fit(budget, perContract) {
    if (budget == null) return null;
    return Math.floor(budget / perContract + EPS);
  }

  function row(input, ticks, budget, yours) {
    const full = contractRisk(input.tickSize, input.multiplier, ticks, input.fees);
    const small = input.smallMultiplier != null ? contractRisk(input.tickSize, input.smallMultiplier, ticks, input.fees) : null;
    return {
      ticks,
      yours,
      points: clean(ticks * input.tickSize),
      perContract: full.perContract,
      total: clean(full.perContract * input.contracts),
      smallTotal: small ? clean(small.perContract * input.contracts) : null,
      fits: fit(budget, full.perContract),
    };
  }

  function analyse(input) {
    const error = validate(input);
    if (error) return { error };
    const n = input.contracts;
    const full = contractRisk(input.tickSize, input.multiplier, input.stopTicks, input.fees);
    const budget = input.equity != null ? clean((input.equity * input.riskPct) / 100) : null;
    const res = {
      tickValue: full.tickValue,
      ticksPerPoint: 1 / input.tickSize,
      stopPoints: clean(input.stopTicks * input.tickSize),
      lossPerContract: full.lossPerContract,
      perContract: full.perContract,
      feesTotal: clean(input.fees * n),
      priceRisk: clean(full.lossPerContract * n),
      totalRisk: clean(full.perContract * n),
      budget,
      maxContracts: fit(budget, full.perContract),
      small: null,
    };
    if (input.smallMultiplier != null) {
      const s = contractRisk(input.tickSize, input.smallMultiplier, input.stopTicks, input.fees);
      res.small = {
        tickValue: s.tickValue,
        perContract: s.perContract,
        totalRisk: clean(s.perContract * n),
        ratio: input.multiplier / input.smallMultiplier,
        maxContracts: fit(budget, s.perContract),
        // Smaller contracts that carry the same price risk as N full ones.
        equivalent: clean((full.lossPerContract * n) / s.lossPerContract),
      };
    }
    if (budget != null) res.budgetUsed = clean(res.maxContracts * full.perContract);
    const set = new Map();
    for (const t of STOPS) set.set(t, row(input, t, budget, false));
    set.set(input.stopTicks, row(input, input.stopTicks, budget, true));
    res.rows = [...set.values()].sort((a, b) => a.ticks - b.ticks);
    return res;
  }

  // Blank means "not entered" (null) for optional fields; anything else must be a plain positive number.
  function parseNumber(text) {
    const cleaned = String(text == null ? '' : text).replace(/[,$%x×\s]/gi, '');
    if (cleaned === '' || !/^\d*\.?\d+$/.test(cleaned)) return NaN;
    return Number(cleaned);
  }
  function parseOptional(text) {
    return String(text == null ? '' : text).trim() === '' ? null : parseNumber(text);
  }

  function money(v) {
    const a = Math.abs(v);
    const whole = a >= 100000;
    const s = a.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
    return (v < -0.004 ? '−$' : '$') + s;
  }
  const num = (v) => (+v.toFixed(8)).toLocaleString('en-US', { maximumFractionDigits: 8 });
  const count = (v) => v.toLocaleString('en-US');
  const plural = (n, word) => `${count(n)} ${word}${n === 1 ? '' : 's'}`;

  function mount(doc) {
    const box = doc.getElementById('cstBox');
    if (!box) return;
    const f = (id) => doc.getElementById(id);
    const status = f('cstStatus'), out = f('cstResult'), body = f('cstBody'), note = f('cstNote');
    const fitHead = f('cstFitHead'), smallHead = f('cstSmallHead');
    function read() {
      return {
        tickSize: parseNumber(f('cstTick').value),
        multiplier: parseNumber(f('cstMult').value),
        contracts: parseNumber(f('cstQty').value),
        stopTicks: parseNumber(f('cstStop').value),
        fees: parseOptional(f('cstFees').value) ?? 0,
        smallMultiplier: parseOptional(f('cstSmall').value),
        equity: parseOptional(f('cstEquity').value),
        riskPct: parseOptional(f('cstRisk').value),
      };
    }
    function render() {
      const input = read();
      const res = analyse(input);
      body.textContent = '';
      if (res.error) {
        status.textContent = res.error;
        status.hidden = false;
        out.hidden = true;
        return;
      }
      status.hidden = true;
      out.hidden = false;
      const n = input.contracts;
      f('cstTickValue').textContent = money(res.tickValue);
      f('cstTickSub').textContent = `${money(input.multiplier)} per point · ${num(res.ticksPerPoint)} ticks per point`;
      f('cstRiskTotal').textContent = money(res.totalRisk);
      f('cstRiskSub').textContent = `${plural(input.stopTicks, 'tick')} = ${num(res.stopPoints)} points · ${money(res.perContract)} per contract` + (input.fees > 0 ? ' incl. fees' : '');
      if (res.budget == null) {
        f('cstFit').textContent = '—';
        f('cstFitSub').textContent = 'Add equity and risk % to size it';
      } else {
        f('cstFit').textContent = plural(res.maxContracts, 'contract');
        f('cstFitSub').textContent = `Budget ${money(res.budget)} · uses ${money(res.budgetUsed)}`;
      }
      smallHead.textContent = res.small ? `Smaller × ${count(n)}` : 'Smaller version';
      f('cstFullHead').textContent = `Yours × ${count(n)}`;
      fitHead.hidden = res.budget == null;
      for (const r of res.rows) {
        const tr = doc.createElement('tr');
        if (r.yours) tr.className = 'lesson-yours';
        const cells = [count(r.ticks) + (r.yours ? ' (yours)' : ''), num(r.points), money(r.total), r.smallTotal == null ? '—' : money(r.smallTotal)];
        if (r.fits != null) cells.push(count(r.fits));
        cells.forEach((text, i) => {
          const td = doc.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.scope = 'row';
          td.textContent = text;
          tr.appendChild(td);
        });
        body.appendChild(tr);
      }
      const parts = [];
      parts.push(`A ${num(input.tickSize)}-point tick on a contract worth ${money(input.multiplier)} per point is worth ${money(res.tickValue)}.`);
      parts.push(`Your ${count(input.stopTicks)}-tick stop is ${num(res.stopPoints)} points, so each contract risks ${money(res.lossPerContract)} of price movement and ${plural(n, 'contract')} ${n === 1 ? 'risks' : 'risk'} ${money(res.priceRisk)}` + (input.fees > 0 ? `, or ${money(res.totalRisk)} with ${money(res.feesTotal)} of fees.` : ' before fees and slippage.'));
      if (res.small) {
        parts.push(`The smaller version at ${money(input.smallMultiplier)} per point has a ${money(res.small.tickValue)} tick, so the same stop on ${plural(n, 'contract')} risks ${money(res.small.totalRisk)}` + (input.fees > 0 ? ' with fees' : '') + `; matching the full contracts’ price risk would take about ${num(+res.small.equivalent.toFixed(2))} of them.`);
      }
      if (res.budget != null) {
        const r = `${num(input.riskPct)}% of ${money(input.equity)} is ${money(res.budget)}`;
        if (res.maxContracts >= 1) parts.push(`${r}: that fits ${plural(res.maxContracts, 'full contract')} at this stop` + (res.small ? ` or ${plural(res.small.maxContracts, 'smaller contract')}.` : '.'));
        else parts.push(`${r}, less than the ${money(res.perContract)} one full contract risks at this stop` + (res.small && res.small.maxContracts >= 1 ? `; ${plural(res.small.maxContracts, 'smaller contract')} would fit.` : ', so a smaller contract or a tighter stop would be needed.'));
        if (res.maxContracts < n) parts.push(`Your ${plural(n, 'contract')} would risk ${money(res.totalRisk)}, more than the budget.`);
      }
      parts.push('Gaps, fast markets and price limits can fill a stop beyond its price, so the real loss can be larger.');
      note.textContent = parts.join(' ');
    }
    box.addEventListener('input', render);
    box.addEventListener('change', render);
    box.addEventListener('submit', (e) => { e.preventDefault(); render(); });
    box.querySelectorAll('[data-cst-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [tick, mult, qty, stop, fees, small, eq, risk] = btn.getAttribute('data-cst-preset').split(',');
        f('cstTick').value = tick; f('cstMult').value = mult; f('cstQty').value = qty; f('cstStop').value = stop;
        f('cstFees').value = fees; f('cstSmall').value = small; f('cstEquity').value = eq; f('cstRisk').value = risk;
        render();
      });
    });
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document));
    else mount(document);
  }

  return { STOPS, validate, contractRisk, analyse, parseNumber, parseOptional, money };
});
