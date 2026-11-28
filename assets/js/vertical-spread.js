/* FYNX vertical spread payoff at expiration (site-qa run 126).
 * Two options of the same type and expiration, lower strike L, upper strike H,
 * width W = H - L, net premium P per unit, multiplier m, contracts q, fees F ($ total).
 *   Spread intrinsic value at expiration price S:
 *     call spread v = clamp(S - L, 0, W)    put spread v = clamp(H - S, 0, W)
 *   Debit (bull call: long L / short H call; bear put: long H / short L put):
 *     P/L per unit = v - P, max loss P, max gain W - P
 *   Credit (bear call: short L / long H call; bull put: short H / long L put):
 *     P/L per unit = P - v, max gain P, max loss W - P
 *   Position P/L = per unit x m x q - F; break-even where it is 0 (inside the strikes).
 * Assumes both legs stay open to expiration and settle at intrinsic value.
 * All inputs are the reader's own hypothetical numbers; nothing is a quote.
 * Pure functions are exported for tests; the widget is wired on the
 * "Defined-Risk Strategies" options lesson.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxVerticalSpread = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const KINDS = {
    'call-debit': { name: 'bull call spread', type: 'call', debit: true, long: 'low', bias: 'up' },
    'put-debit': { name: 'bear put spread', type: 'put', debit: true, long: 'high', bias: 'down' },
    'call-credit': { name: 'bear call spread', type: 'call', debit: false, long: 'high', bias: 'down' },
    'put-credit': { name: 'bull put spread', type: 'put', debit: false, long: 'low', bias: 'up' },
  };
  const clean = (v) => Math.round(v * 1e8) / 1e8;

  function validate(input) {
    const { kind, low, high, premium, multiplier, contracts, fees, price } = input;
    if (!KINDS[kind]) return 'Choose a spread type.';
    if (!Number.isFinite(low) || low <= 0 || low > 1e7) return 'Enter the lower strike above 0.';
    if (!Number.isFinite(high) || high <= 0 || high > 1e7) return 'Enter the upper strike above 0.';
    if (high <= low) return 'The upper strike must be above the lower strike.';
    const width = clean(high - low);
    if (!Number.isFinite(premium) || premium <= 0) return `Enter the net ${KINDS[kind].debit ? 'debit paid' : 'credit received'} per unit above 0.`;
    if (premium >= width) {
      return KINDS[kind].debit
        ? `A debit of ${width} or more is at least the strike width, so this spread could never make money at expiration. Enter less than ${width}.`
        : `A credit of ${width} or more is at least the strike width, which a real market would not offer. Enter less than ${width}.`;
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 1e6) return 'Enter the contract multiplier above 0 (often 100 for US equity options).';
    if (!Number.isInteger(contracts) || contracts < 1 || contracts > 10000) return 'Enter a whole number of spreads from 1 to 10,000.';
    if (!Number.isFinite(fees) || fees < 0 || fees > 1e9) return 'Enter total fees of $0 or more (leave blank for none).';
    if (price != null && (!Number.isFinite(price) || price < 0 || price > 1e8)) return 'Enter a price at expiration of 0 or more, or leave it blank.';
    return '';
  }

  // Spread intrinsic value per unit at expiration price s.
  function intrinsic(kind, low, high, s) {
    const w = high - low;
    const raw = KINDS[kind].type === 'call' ? s - low : high - s;
    return clean(Math.min(Math.max(raw, 0), w));
  }

  function payoff(input, s) {
    const k = KINDS[input.kind];
    const v = intrinsic(input.kind, input.low, input.high, s);
    const unit = clean(k.debit ? v - input.premium : input.premium - v);
    return { unit, total: clean(unit * input.multiplier * input.contracts - input.fees) };
  }

  function breakEven(input) {
    const k = KINDS[input.kind];
    const units = input.multiplier * input.contracts;
    // Intrinsic value v at which the position nets 0 after fees.
    const v = clean(k.debit ? input.premium + input.fees / units : input.premium - input.fees / units);
    const width = clean(input.high - input.low);
    if (!(v > 0 && v < width)) return null;
    return clean(k.type === 'call' ? input.low + v : input.high - v);
  }

  function analyse(input) {
    const error = validate(input);
    if (error) return { error };
    const k = KINDS[input.kind];
    const width = clean(input.high - input.low);
    const units = input.multiplier * input.contracts;
    const unitGain = clean(k.debit ? width - input.premium : input.premium);
    const unitLoss = clean(k.debit ? input.premium : width - input.premium);
    const maxGain = clean(unitGain * units - input.fees);
    const maxLoss = clean(unitLoss * units + input.fees);
    const be = breakEven(input);
    const cash = clean(input.premium * units);
    const res = {
      kind: input.kind,
      name: k.name,
      debit: k.debit,
      width,
      units,
      cash,
      unitGain,
      unitLoss,
      maxGain,
      maxLoss,
      ratio: maxGain > 0 ? clean(maxGain / maxLoss) : null,
      breakEven: be,
      // Where the maximum gain / loss applies.
      gainAt: k.bias === 'up' ? { side: 'atOrAbove', strike: input.high } : { side: 'atOrBelow', strike: input.low },
      lossAt: k.bias === 'up' ? { side: 'atOrBelow', strike: input.low } : { side: 'atOrAbove', strike: input.high },
      shortStrike: k.long === 'low' ? input.high : input.low,
      longStrike: k.long === 'low' ? input.low : input.high,
      type: k.type,
    };
    // Rows: below, lower strike, break-even, midpoint, upper strike, above, and the reader's price.
    const pts = [
      { price: clean(Math.max(0, input.low - width)), label: 'below' },
      { price: input.low, label: 'lower strike' },
      { price: clean((input.low + input.high) / 2), label: 'midpoint' },
      { price: input.high, label: 'upper strike' },
      { price: clean(input.high + width), label: 'above' },
    ];
    if (be != null) pts.push({ price: be, label: 'break-even' });
    if (input.price != null) pts.push({ price: input.price, label: 'yours', yours: true });
    const map = new Map();
    for (const p of pts) {
      const key = Math.round(p.price * 1e6);
      const prev = map.get(key);
      if (prev) {
        // Keep the more specific label; 'yours' always marks the row.
        if (p.yours) prev.yours = true;
        if (p.label === 'break-even' || (prev.label === 'midpoint' && p.label !== 'yours')) prev.label = p.label;
        continue;
      }
      map.set(key, { ...p, yours: !!p.yours });
    }
    res.rows = [...map.values()].sort((a, b) => a.price - b.price).map((r) => ({ ...r, ...payoff(input, r.price) }));
    if (input.price != null) res.atPrice = payoff(input, input.price);
    // Leg risk if only the short leg were left open (long leg closed, exercised or never filled).
    res.shortAlone = k.type === 'call'
      ? { capped: false }
      : { capped: true, worst: clean(res.shortStrike * units) };
    return res;
  }

  function parseNumber(text) {
    const cleaned = String(text == null ? '' : text).replace(/[,$\s]/g, '');
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
  function signedMoney(v) {
    return v > 0.004 ? '+' + money(v) : money(v);
  }
  const num = (v) => (+v.toFixed(6)).toLocaleString('en-US', { maximumFractionDigits: 4 });
  function signedNum(v) {
    if (Math.abs(v) < 5e-7) return '0';
    return (v < 0 ? '−' : '+') + num(Math.abs(v));
  }
  const count = (v) => v.toLocaleString('en-US');

  function mount(doc) {
    const box = doc.getElementById('vsBox');
    if (!box) return;
    const f = (id) => doc.getElementById(id);
    const status = f('vsStatus'), out = f('vsResult'), body = f('vsBody'), note = f('vsNote'), legs = f('vsLegs');
    function read() {
      return {
        kind: f('vsKind').value,
        low: parseNumber(f('vsLow').value),
        high: parseNumber(f('vsHigh').value),
        premium: parseNumber(f('vsPrem').value),
        multiplier: parseNumber(f('vsMult').value),
        contracts: parseNumber(f('vsQty').value),
        fees: parseOptional(f('vsFees').value) ?? 0,
        price: parseOptional(f('vsPrice').value),
      };
    }
    function sideText(at) {
      return `${at.side === 'atOrAbove' ? 'at or above' : 'at or below'} ${num(at.strike)}`;
    }
    function render() {
      const input = read();
      f('vsPremLabel').textContent = (input.kind || '').endsWith('credit') ? 'Net credit received (per unit)' : 'Net debit paid (per unit)';
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
      const fees = input.fees > 0;
      f('vsMaxLoss').textContent = money(res.maxLoss);
      f('vsLossSub').textContent = `${sideText(res.lossAt)} · ${num(res.unitLoss)} per unit` + (fees ? ' + fees' : '');
      if (res.maxGain > 0) {
        f('vsMaxGain').textContent = money(res.maxGain);
        f('vsGainSub').textContent = `${sideText(res.gainAt)} · ${num(res.unitGain)} per unit` + (fees ? ' − fees' : '');
      } else {
        f('vsMaxGain').textContent = money(res.maxGain);
        f('vsGainSub').textContent = 'Fees use up the whole maximum gain';
      }
      if (res.breakEven != null) {
        f('vsBe').textContent = num(res.breakEven);
        f('vsBeSub').textContent = res.ratio != null ? `Gain ${num(+res.ratio.toFixed(2))}× the risk at best` : '';
      } else {
        f('vsBe').textContent = 'None';
        f('vsBeSub').textContent = 'No price makes money after fees';
      }
      f('vsTotalHead').textContent = `Position (× ${count(input.multiplier)} × ${count(input.contracts)})`;
      for (const r of res.rows) {
        const tr = doc.createElement('tr');
        if (r.yours) tr.className = 'lesson-yours';
        const tag = r.yours ? (r.label === 'yours' ? 'your price' : `your price · ${r.label}`) : r.label;
        const th = doc.createElement('th');
        th.scope = 'row';
        th.textContent = num(r.price);
        const span = doc.createElement('span');
        span.className = 'vs-tag';
        span.textContent = tag;
        th.appendChild(span);
        tr.appendChild(th);
        for (const text of [signedNum(r.unit), signedMoney(r.total)]) {
          const td = doc.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        }
        body.appendChild(tr);
      }
      const units = `${count(input.contracts)} spread${input.contracts === 1 ? '' : 's'} × ${count(input.multiplier)}`;
      const parts = [];
      const Name = res.name.charAt(0).toUpperCase() + res.name.slice(1);
      parts.push(`${Name} ${num(input.low)}/${num(input.high)}: you ${res.debit ? 'pay' : 'receive'} ${num(input.premium)} per unit, ${money(res.cash)} for ${units}.`);
      parts.push(`At expiration it loses the most, ${money(res.maxLoss)}, ${sideText(res.lossAt)}` + (res.maxGain > 0 ? ` and makes the most, ${money(res.maxGain)}, ${sideText(res.gainAt)}.` : '; after fees no expiration price makes money.'));
      if (res.breakEven != null) parts.push(`Between the strikes the result changes by ${money(res.units)} for each 1.00 move and is zero at ${num(res.breakEven)}` + (fees ? ', fees included.' : '.'));
      if (res.atPrice) parts.push(`At your price of ${num(input.price)} the position would ${res.atPrice.total >= 0 ? 'make' : 'lose'} ${money(Math.abs(res.atPrice.total))}.`);
      parts.push(fees ? 'Fees are taken off every row.' : 'Before fees, slippage and taxes.');
      note.textContent = parts.join(' ');
      const shortLeg = `short ${num(res.shortStrike)} ${res.type}`;
      legs.textContent = res.shortAlone.capped
        ? `If the long ${num(res.longStrike)} put is closed, never filled or exercised early and the ${shortLeg} stays open, the cap is gone: below ${num(res.shortStrike)} that leg alone loses money all the way down, up to ${money(res.shortAlone.worst)} (strike × ${units}) if the price reached 0, less the premium it collected. Early assignment on the short put can also leave you holding the shares.`
        : `If the long ${num(res.longStrike)} call is closed, never filled or exercised early and the ${shortLeg} stays open, the cap is gone: above ${num(res.shortStrike)} that leg alone keeps losing with no upper limit. Early assignment on the short call can also leave you short the shares, for example just before a dividend.`;
    }
    box.addEventListener('input', render);
    box.addEventListener('change', render);
    box.addEventListener('submit', (e) => { e.preventDefault(); render(); });
    box.querySelectorAll('[data-vs-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [kind, low, high, prem, mult, qty, fees, price] = btn.getAttribute('data-vs-preset').split(',');
        f('vsKind').value = kind; f('vsLow').value = low; f('vsHigh').value = high; f('vsPrem').value = prem;
        f('vsMult').value = mult; f('vsQty').value = qty; f('vsFees').value = fees; f('vsPrice').value = price;
        render();
      });
    });
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document));
    else mount(document);
  }

  return { KINDS, validate, intrinsic, payoff, breakEven, analyse, parseNumber, parseOptional, money };
});
