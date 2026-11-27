/* FYNX perpetual futures funding cost example (site-qa run 121).
 * Linear (USD-margined) perpetual with a constant notional and a constant
 * funding rate: each funding payment = notional x rate. Positive funding:
 * longs pay shorts; negative funding: shorts pay longs. Real rates change
 * every interval, so this is worked math, not a forecast.
 * Pure functions are exported for tests; the widget is wired on the
 * "Spot vs Perpetual Futures" lesson.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxPerpFunding = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const PERIODS = [1, 7, 30, 90, 365];
  const HOURS = [1, 2, 4, 8];
  const EPS = 1e-9;

  // Full funding payments while a position is open for `days` days.
  function intervals(days, hours) {
    return Math.floor((days * 24) / hours + EPS);
  }

  // Signed cash flow for the holder: negative = the holder pays.
  function payment({ notional, side, ratePct }) {
    const raw = (notional * ratePct) / 100;
    const flow = side === 'short' ? raw : -raw;
    return Math.abs(flow) < 1e-12 ? 0 : flow;
  }

  function validate({ notional, side, ratePct, hours, days, leverage }) {
    if (!Number.isFinite(notional) || notional <= 0 || notional > 1e9) return 'Enter a position size above $0.';
    if (side !== 'long' && side !== 'short') return 'Choose long or short.';
    if (!Number.isFinite(ratePct) || Math.abs(ratePct) > 1) return 'Enter a funding rate from −1% to 1% per interval (for example 0.01).';
    if (!HOURS.includes(hours)) return 'Choose how often funding is paid.';
    if (!Number.isFinite(days) || days <= 0 || days > 3650) return 'Enter days held above 0 and up to 3,650.';
    if (leverage != null && (!Number.isFinite(leverage) || leverage < 1 || leverage > 200)) return 'Enter leverage from 1x to 200x, or leave it blank.';
    return '';
  }

  function row(input, days, yours) {
    const per = payment(input);
    const n = intervals(days, input.hours);
    const total = per * n;
    const margin = input.leverage ? input.notional / input.leverage : null;
    return {
      days,
      yours,
      intervals: n,
      total,
      pctOfPosition: (total / input.notional) * 100,
      pctOfMargin: margin ? (total / margin) * 100 : null,
    };
  }

  function analyse(input) {
    const error = validate(input);
    if (error) return { error };
    const perDayCount = 24 / input.hours;
    const per = payment(input);
    const margin = input.leverage ? input.notional / input.leverage : null;
    const mine = row(input, input.days, true);
    const set = new Map();
    for (const d of PERIODS) set.set(d, row(input, d, false));
    set.set(input.days, mine);
    const rows = [...set.values()].sort((a, b) => a.days - b.days);
    // Days until funding alone has used the whole margin (only when paying).
    let daysToMargin = null;
    if (margin && per < 0) {
      const n = Math.ceil(margin / -per - EPS);
      daysToMargin = (n * input.hours) / 24;
    }
    return {
      perInterval: per,
      perDay: per * perDayCount,
      perDayCount,
      total: mine.total,
      intervals: mine.intervals,
      pctOfPosition: mine.pctOfPosition,
      pctOfMargin: mine.pctOfMargin,
      margin,
      annualPct: input.ratePct * perDayCount * 365,
      paying: per < 0,
      receiving: per > 0,
      daysToMargin,
      rows,
    };
  }

  function parseNumber(text, allowNegative) {
    const cleaned = String(text == null ? '' : text).replace(/[,$%x×\s]/gi, '').replace(/[−–]/g, '-');
    if (cleaned === '') return NaN;
    if (!(allowNegative ? /^-?\d*\.?\d+$/ : /^\d*\.?\d+$/).test(cleaned)) return NaN;
    const v = Number(cleaned);
    return v === 0 ? 0 : v;
  }

  function money(v) {
    const a = Math.abs(v);
    const dp = a > 0 && a < 0.995 ? (a < 0.0995 ? 4 : 3) : 2;
    const s = a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dp });
    return (v < 0 ? '−$' : '$') + s;
  }
  const signedMoney = (v) => (v === 0 ? '$0.00' : (v > 0 ? '+' : '') + money(v));
  const signedPct = (v, dp = 2) => {
    const a = Math.abs(v);
    const s = a.toFixed(a > 0 && a < 0.01 ? 4 : dp);
    return Number(s) === 0 ? '0.00%' : (v > 0 ? '+' : '−') + s + '%';
  };
  const plainPct = (v) => {
    const a = Math.abs(v);
    return a.toFixed(a > 0 && a < 0.01 ? 4 : 2) + '%';
  };
  const daysLabel = (d) => {
    const n = +d.toFixed(2);
    return n + (n === 1 ? ' day' : ' days');
  };
  const rateText = (v) => (v < 0 ? '−' : '') + String(+Math.abs(v).toFixed(6)) + '%';

  function mount(doc) {
    const box = doc.getElementById('fundBox');
    if (!box) return;
    const f = (id) => doc.getElementById(id);
    const status = f('fundStatus'), out = f('fundResult'), body = f('fundBody'), note = f('fundNote');
    function read() {
      const levText = f('fundLev').value.trim();
      return {
        notional: parseNumber(f('fundSize').value),
        side: f('fundSide').value,
        ratePct: parseNumber(f('fundRate').value, true),
        hours: Number(f('fundHours').value),
        days: parseNumber(f('fundDays').value),
        leverage: levText === '' ? null : parseNumber(levText),
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
      const verb = (v) => (v < 0 ? 'You pay' : v > 0 ? 'You receive' : 'No payment');
      f('fundPer').textContent = money(Math.abs(res.perInterval));
      f('fundPerSub').textContent = `${verb(res.perInterval)} every ${input.hours} hour${input.hours === 1 ? '' : 's'}`;
      f('fundDay').textContent = money(Math.abs(res.perDay));
      f('fundDaySub').textContent = `${verb(res.perDay)} · ${res.perDayCount} payments`;
      f('fundTotal').textContent = money(Math.abs(res.total));
      f('fundTotalSub').textContent = `${verb(res.total)} over ${daysLabel(input.days)} (${res.intervals} payment${res.intervals === 1 ? '' : 's'})`;
            for (const r of res.rows) {
        const tr = doc.createElement('tr');
        if (r.yours) tr.className = 'lesson-yours';
        [daysLabel(r.days) + (r.yours ? ' (yours)' : ''), signedMoney(r.total), signedPct(r.pctOfPosition), r.pctOfMargin == null ? '—' : signedPct(r.pctOfMargin)].forEach((text, i) => {
          const td = doc.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.scope = 'row';
          td.textContent = text;
          tr.appendChild(td);
        });
        body.appendChild(tr);
      }
      const side = input.side === 'long' ? 'long' : 'short';
      const parts = [];
      if (input.ratePct === 0) {
        parts.push('At a 0% funding rate neither side pays.');
      } else {
        const payer = input.ratePct > 0 ? 'longs pay shorts' : 'shorts pay longs';
        parts.push(`At ${rateText(input.ratePct)} every ${input.hours} hours, ${payer}, so a ${side} ${res.paying ? 'pays' : 'receives'} ${money(Math.abs(res.total))} over ${daysLabel(input.days)}: ${plainPct(res.pctOfPosition)} of the position.`);
        if (res.paying) parts.push(`The price would have to move ${plainPct(res.pctOfPosition)} in your favour just to cover funding.`);
        if (res.margin) parts.push(`At ${+input.leverage.toFixed(2)}x leverage that is ${plainPct(res.pctOfMargin)} of the ${money(res.margin)} margin.`);
        if (res.daysToMargin != null) parts.push(`Funding alone would use up the whole margin in about ${daysLabel(res.daysToMargin >= 10 ? Math.round(res.daysToMargin) : res.daysToMargin)} if the rate stayed the same.`);
        parts.push(`The rate works out to ${plainPct(res.annualPct)} a year of the position.`);
      }
      parts.push('A spot holding of the same size pays no funding (custody and trading fees aside).');
      note.textContent = parts.join(' ');
    }
    box.addEventListener('input', render);
    box.addEventListener('change', render);
    box.addEventListener('submit', (e) => { e.preventDefault(); render(); });
    box.querySelectorAll('[data-fund-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [size, side, rate, hours, days, lev] = btn.getAttribute('data-fund-preset').split(',');
        f('fundSize').value = size; f('fundSide').value = side; f('fundRate').value = rate; f('fundHours').value = hours; f('fundDays').value = days; f('fundLev').value = lev;
        render();
      });
    });
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document));
    else mount(document);
  }

  return { PERIODS, intervals, payment, validate, analyse, parseNumber, money };
});
