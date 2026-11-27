/* FYNX daily-reset leveraged/inverse product path example (site-qa run 122).
 * A product that targets L x the benchmark's *daily* move compounds
 * value *= 1 + L x move each day, so its multi-day return depends on the
 * path and is not L x the benchmark's multi-day return. Before fees,
 * financing, futures roll and tracking error. Worked math, not a quote.
 * Pure functions are exported for tests; the widget is wired on the
 * "Volatility ETFs: Risks and Uses" lesson.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxLeveragedPath = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_MOVES = 60;
  const MAX_DAYS = 500;
  const DAILY_ROWS = 20;

  function parseNumber(text, allowNegative) {
    const cleaned = String(text == null ? '' : text).replace(/[$%x×\s]/gi, '').replace(/[−–]/g, '-').replace(/^\+/, '');
    if (cleaned === '') return NaN;
    if (!(allowNegative ? /^-?\d*\.?\d+$/ : /^\d*\.?\d+$/).test(cleaned)) return NaN;
    const v = Number(cleaned);
    return v === 0 ? 0 : v;
  }

  // "10, -10" or "+3 −3" or "1;2;-1" -> [10, -10]; null when any part is not a number.
  function parseMoves(text) {
    const parts = String(text == null ? '' : text).split(/[,;\n]+|\s+(?=[+\-−–]?\d)/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return [];
    const out = parts.map((p) => parseNumber(p, true));
    return out.some((v) => !Number.isFinite(v)) ? null : out;
  }

  function validate({ leverage, moves, repeat, start }) {
    if (!Number.isFinite(leverage) || leverage === 0 || Math.abs(leverage) > 5) return 'Enter a daily multiple from −5 to 5, not 0 (for example 2, 3, −1 or −2).';
    if (moves == null) return 'Daily moves must be numbers in %, separated by commas (for example 10, -10).';
    if (!moves.length) return 'Enter at least one daily benchmark move in %.';
    if (moves.length > MAX_MOVES) return `Enter up to ${MAX_MOVES} daily moves (use “Repeat” for longer stretches).`;
    if (moves.some((m) => m <= -100 || m > 100)) return 'Each daily move must be above −100% and at most 100%.';
    if (!Number.isInteger(repeat) || repeat < 1 || repeat > 50) return 'Enter a whole number of repeats from 1 to 50.';
    if (moves.length * repeat > MAX_DAYS) return `That is more than ${MAX_DAYS} days; use fewer moves or repeats.`;
    if (!Number.isFinite(start) || start <= 0 || start > 1e9) return 'Enter a starting value above 0.';
    return '';
  }

  function analyse(input) {
    const error = validate(input);
    if (error) return { error };
    const { leverage, moves, repeat, start } = input;
    const days = moves.length * repeat;
    let bench = start, prod = start, wipedDay = null;
    const path = [];
    for (let d = 1; d <= days; d++) {
      const m = moves[(d - 1) % moves.length];
      bench *= 1 + m / 100;
      if (wipedDay == null) {
        const step = 1 + (leverage * m) / 100;
        if (step <= 0) { prod = 0; wipedDay = d; } else prod *= step;
      }
      path.push({ day: d, move: m, productMove: wipedDay != null && wipedDay < d ? 0 : Math.max(leverage * m, -100), bench, prod });
    }
    const benchPct = (bench / start - 1) * 100;
    const prodPct = (prod / start - 1) * 100;
    const naivePct = Math.max(leverage * benchPct, -100);
    let rows;
    if (days <= DAILY_ROWS) rows = path;
    else if (repeat > 1) rows = path.filter((p) => p.day % moves.length === 0);
    else rows = path.filter((p, i) => (i + 1) % Math.ceil(days / DAILY_ROWS) === 0 || i === days - 1);
    return {
      days,
      benchEnd: bench,
      prodEnd: prod,
      benchPct,
      prodPct,
      naivePct,
      gapPts: prodPct - naivePct,
      wipedDay,
      daily: days <= DAILY_ROWS,
      rows,
    };
  }

  const num = (v, dp = 2) => {
    const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return (v < 0 && Number(Math.abs(v).toFixed(dp)) !== 0 ? '−' : '') + s;
  };
  const signedPct = (v, dp = 2) => {
    const s = Math.abs(v).toFixed(dp);
    return Number(s) === 0 ? '0.00%' : (v > 0 ? '+' : '−') + s + '%';
  };
  const multiple = (L) => (L < 0 ? '−' : '') + String(+Math.abs(L).toFixed(3)) + '×';

  function mount(doc) {
    const box = doc.getElementById('levBox');
    if (!box) return;
    const f = (id) => doc.getElementById(id);
    const status = f('levStatus'), out = f('levResult'), body = f('levBody'), note = f('levNote');
    function read() {
      return {
        leverage: parseNumber(f('levMult').value, true),
        moves: parseMoves(f('levMoves').value),
        repeat: parseNumber(f('levRepeat').value),
        start: parseNumber(f('levStart').value.replace(/,/g, '')),
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
      const L = multiple(input.leverage);
      f('levBench').textContent = signedPct(res.benchPct);
      f('levBenchSub').textContent = `${num(input.start)} → ${num(res.benchEnd)}`;
      f('levProd').textContent = signedPct(res.prodPct);
      f('levProdSub').textContent = `${num(input.start)} → ${num(res.prodEnd)}`;
      f('levNaive').textContent = signedPct(res.naivePct);
      f('levNaiveSub').textContent = `${L} the benchmark’s ${res.days}-day return`;
      f('levProdLabel').textContent = `${L} daily product`;
      f('levCaption').textContent = res.daily ? 'Day by day' : `Value after every ${input.moves.length > 1 && input.repeat > 1 ? input.moves.length + ' days (one pass of your moves)' : Math.ceil(res.days / DAILY_ROWS) + ' days'}`;
      for (const r of res.rows) {
        const tr = doc.createElement('tr');
        if (r.day === res.days) tr.className = 'lesson-yours';
        const cells = res.daily
          ? [String(r.day), signedPct(r.move), signedPct(r.productMove), num(r.bench), num(r.prod)]
          : [String(r.day), '', '', num(r.bench), num(r.prod)];
        cells.forEach((text, i) => {
          const td = doc.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.scope = 'row';
          td.textContent = text;
          tr.appendChild(td);
        });
        body.appendChild(tr);
      }
      box.querySelector('.lev-table').classList.toggle('lev-summary', !res.daily);
      const parts = [];
      if (res.wipedDay != null) {
        parts.push(`On day ${res.wipedDay} a ${signedPct(input.moves[(res.wipedDay - 1) % input.moves.length])} benchmark move becomes ${signedPct(input.leverage * input.moves[(res.wipedDay - 1) % input.moves.length])} for a ${L} product, so it would lose everything and stay at 0 even if the benchmark recovered. Real products usually have safeguards, but losses can still be total.`);
      } else {
        parts.push(`Over ${res.days} day${res.days === 1 ? '' : 's'} the benchmark returned ${signedPct(res.benchPct)} and the ${L} daily product ${signedPct(res.prodPct)}, not ${signedPct(res.naivePct)}.`);
        const gap = res.gapPts;
        if (Math.abs(gap) < 0.005) parts.push(res.days === 1 ? 'Here the two match: over a single day the daily target and the period target are the same thing.' : 'Here the two match, so the daily reset made no difference on this path.');
        else if (gap < 0) parts.push(`The daily reset cost ${num(-gap)} percentage points versus a fixed ${L} of the whole period. Choppy, back-and-forth moves cause this “volatility drag”; it grows with the multiple and with how much the benchmark swings.`);
        else parts.push(`The daily reset added ${num(gap)} percentage points versus a fixed ${L} of the whole period. Steady moves in the product’s favour compound; choppy markets do the opposite.`);
      }
      parts.push('Before management fees, financing, futures roll costs and tracking error, which reduce real returns further.');
      note.textContent = parts.join(' ');
    }
    box.addEventListener('input', render);
    box.addEventListener('change', render);
    box.addEventListener('submit', (e) => { e.preventDefault(); render(); });
    box.querySelectorAll('[data-lev-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [mult, moves, repeat] = btn.getAttribute('data-lev-preset').split('|');
        f('levMult').value = mult; f('levMoves').value = moves; f('levRepeat').value = repeat; f('levStart').value = '100';
        render();
      });
    });
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document));
    else mount(document);
  }

  return { MAX_MOVES, MAX_DAYS, parseNumber, parseMoves, validate, analyse };
});
