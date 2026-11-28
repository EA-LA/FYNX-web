/* FYNX futures margin stress example (site-qa run 123).
 * Linear futures position: notional = price x multiplier x contracts.
 * An adverse move of m% changes P&L by notional x m% (the position loses).
 * Equity falling below the maintenance requirement triggers a margin call,
 * which (on most venues) must restore the account to the initial requirement.
 * All inputs are the reader's own hypothetical numbers; nothing is a quote or
 * a broker's real margin schedule.
 * Pure functions are exported for tests; the widget is wired on the
 * "Futures Margin and Leverage 101" lesson.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxFuturesMargin = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MOVES = [1, 2, 3, 5, 10, 20];
  const EPS = 1e-9;

  function validate({ price, multiplier, contracts, side, initial, maintenance, equity, movePct }) {
    if (!Number.isFinite(price) || price <= 0 || price > 1e9) return 'Enter a contract price above 0.';
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 1e7) return 'Enter the contract multiplier ($ per 1.00 point) above 0.';
    if (!Number.isInteger(contracts) || contracts < 1 || contracts > 10000) return 'Enter a whole number of contracts from 1 to 10,000.';
    if (side !== 'long' && side !== 'short') return 'Choose long or short.';
    if (!Number.isFinite(initial) || initial <= 0) return 'Enter the initial margin per contract above $0.';
    if (!Number.isFinite(maintenance) || maintenance <= 0) return 'Enter the maintenance margin per contract above $0.';
    if (maintenance > initial) return 'Maintenance margin is normally at or below initial margin. Check the two numbers.';
    if (!Number.isFinite(equity) || equity <= 0 || equity > 1e12) return 'Enter your account equity above $0.';
    if (!Number.isFinite(movePct) || movePct < 0 || movePct > 100) return 'Enter an adverse move from 0% to 100%.';
    return '';
  }

  // Adverse price after a move of `pct` percent: down for a long, up for a short.
  function adversePrice(price, side, pct) {
    return side === 'short' ? price * (1 + pct / 100) : price * (1 - pct / 100);
  }

  function scenario(input, totals, pct, yours) {
    const loss = (totals.notional * pct) / 100;
    const after = input.equity - loss;
    let status = 'ok';
    if (after <= EPS) status = 'gone';
    else if (after < totals.maintenance - EPS) status = 'call';
    return {
      pct,
      yours,
      price: adversePrice(input.price, input.side, pct),
      loss,
      after,
      pctOfEquity: (loss / input.equity) * 100,
      status,
      topUp: status === 'ok' ? 0 : Math.max(0, totals.initial - after),
    };
  }

  function analyse(input) {
    const error = validate(input);
    if (error) return { error };
    const n = input.contracts;
    const notional = input.price * input.multiplier * n;
    const totals = { notional, initial: input.initial * n, maintenance: input.maintenance * n };
    const pointValue = input.multiplier * n;
    // Move (in % and points) that takes equity down to the maintenance level, then to zero.
    const buffer = input.equity - totals.maintenance;
    const callPct = buffer > 0 ? (buffer / notional) * 100 : 0;
    const gonePct = (input.equity / notional) * 100;
    const mine = scenario(input, totals, input.movePct, true);
    const set = new Map();
    for (const m of MOVES) set.set(m, scenario(input, totals, m, false));
    set.set(input.movePct, mine);
    const rows = [...set.values()].sort((a, b) => a.pct - b.pct);
    return {
      notional,
      initialTotal: totals.initial,
      maintenanceTotal: totals.maintenance,
      pointValue,
      notionalToMargin: notional / totals.initial,
      leverageOnEquity: notional / input.equity,
      marginPctOfNotional: (totals.initial / notional) * 100,
      underfunded: input.equity < totals.initial - EPS,
      alreadyCalled: buffer <= EPS,
      callPct,
      callPoints: buffer > 0 ? buffer / pointValue : 0,
      callPrice: adversePrice(input.price, input.side, callPct),
      gonePct,
      gonePoints: input.equity / pointValue,
      gonePrice: adversePrice(input.price, input.side, gonePct),
      mine,
      rows,
    };
  }

  function parseNumber(text) {
    const cleaned = String(text == null ? '' : text).replace(/[,$%x×\s]/gi, '');
    if (cleaned === '' || !/^\d*\.?\d+$/.test(cleaned)) return NaN;
    return Number(cleaned);
  }

  function money(v) {
    const a = Math.abs(v);
    const s = a.toLocaleString('en-US', { minimumFractionDigits: a >= 100000 ? 0 : 2, maximumFractionDigits: a >= 100000 ? 0 : 2 });
    return (v < -0.004 ? '−$' : '$') + s;
  }
  const pct = (v) => (Math.abs(v) < 0.1 && v !== 0 ? v.toFixed(3) : v.toFixed(2).replace(/\.00$/, '')) + '%';
  const num = (v) => {
    const a = Math.abs(v);
    const dp = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
    return (+v.toFixed(dp)).toLocaleString('en-US', { maximumFractionDigits: dp });
  };
  // Whole dollars in the table keep five columns inside a 320px screen.
  const wholeMoney = (v) => (Math.abs(v) >= 100 ? (v < -0.5 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-US') : money(v));
  const pts = (v) => (+v.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const STATUS = { ok: 'OK', call: 'Margin call', gone: 'Equity gone' };

  function mount(doc) {
    const box = doc.getElementById('fmBox');
    if (!box) return;
    const f = (id) => doc.getElementById(id);
    const status = f('fmStatus'), out = f('fmResult'), body = f('fmBody'), note = f('fmNote');
    function read() {
      return {
        price: parseNumber(f('fmPrice').value),
        multiplier: parseNumber(f('fmMult').value),
        contracts: parseNumber(f('fmQty').value),
        side: f('fmSide').value,
        initial: parseNumber(f('fmInit').value),
        maintenance: parseNumber(f('fmMaint').value),
        equity: parseNumber(f('fmEquity').value),
        movePct: parseNumber(f('fmMove').value),
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
      f('fmNotional').textContent = money(res.notional);
      f('fmNotionalSub').textContent = `${res.notionalToMargin.toFixed(1)}x the ${money(res.initialTotal)} initial margin`;
      f('fmLoss').textContent = money(-res.mine.loss);
      f('fmLossSub').textContent = `${pct(input.movePct)} against you · ${pct(res.mine.pctOfEquity)} of equity`;
      f('fmCall').textContent = res.alreadyCalled ? 'Now' : pct(res.callPct);
      f('fmCallSub').textContent = res.alreadyCalled ? 'Equity is already at or below maintenance' : `Price ${num(res.callPrice)} · ${pts(res.callPoints)} points`;
      for (const r of res.rows) {
        const tr = doc.createElement('tr');
        if (r.yours) tr.className = 'lesson-yours';
        [pct(r.pct) + (r.yours ? ' (yours)' : ''), num(r.price), wholeMoney(-r.loss), wholeMoney(r.after), STATUS[r.status]].forEach((text, i) => {
          const td = doc.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.scope = 'row';
          td.textContent = text;
          if (i === 4) td.className = 'fm-' + r.status;
          tr.appendChild(td);
        });
        body.appendChild(tr);
      }
      const side = input.side === 'long' ? 'long' : 'short';
      const dir = input.side === 'long' ? 'fall' : 'rise';
      const parts = [];
      parts.push(`${input.contracts} ${side} contract${input.contracts === 1 ? '' : 's'} at ${num(input.price)} with a $${num(input.multiplier)} multiplier control ${money(res.notional)}: each 1-point move is ${money(res.pointValue)}. The ${money(res.initialTotal)} initial margin is only ${pct(res.marginPctOfNotional)} of that.`);
      if (res.underfunded) parts.push(`Your ${money(input.equity)} equity is below the ${money(res.initialTotal)} initial margin, so a broker would normally not let you open this position.`);
      if (res.alreadyCalled) parts.push(`Equity is already at or below the ${money(res.maintenanceTotal)} maintenance requirement.`);
      else parts.push(`A ${pct(res.callPct)} ${dir} (to about ${num(res.callPrice)}) takes equity down to the ${money(res.maintenanceTotal)} maintenance level, and a ${pct(res.gonePct)} ${dir} (to about ${num(res.gonePrice)}) loses the whole ${money(input.equity)}.`);
      if (res.mine.status === 'call') parts.push(`At your ${pct(input.movePct)} move equity would be ${money(res.mine.after)}: a margin call, and restoring it to the initial requirement would take about ${money(res.mine.topUp)}.`);
      if (res.mine.status === 'gone') parts.push(`At your ${pct(input.movePct)} move the loss is larger than the account: you could owe ${money(-res.mine.after)} on top of losing the equity.`);
      parts.push('Brokers can raise margin at any time and may close positions before you can add funds.');
      note.textContent = parts.join(' ');
    }
    box.addEventListener('input', render);
    box.addEventListener('change', render);
    box.addEventListener('submit', (e) => { e.preventDefault(); render(); });
    box.querySelectorAll('[data-fm-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [price, mult, qty, side, init, maint, eq, move] = btn.getAttribute('data-fm-preset').split(',');
        f('fmPrice').value = price; f('fmMult').value = mult; f('fmQty').value = qty; f('fmSide').value = side;
        f('fmInit').value = init; f('fmMaint').value = maint; f('fmEquity').value = eq; f('fmMove').value = move;
        render();
      });
    });
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document));
    else mount(document);
  }

  return { MOVES, validate, adversePrice, analyse, parseNumber, money };
});
