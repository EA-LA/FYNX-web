/* FYNX currency basket exposure example (site-qa run 125).
 * Each forex position is split into its two currency legs:
 *   buy  L lots of BASE/QUOTE -> long  L of BASE, short L of QUOTE
 *   sell L lots of BASE/QUOTE -> short L of BASE, long  L of QUOTE
 * Legs are counted in lots of the pair (no price conversion), so the table
 * shows which currencies repeat and on which side, not money amounts.
 * Optional stop risk per position: for each currency, the stops tied to a
 * fall are the positions long that currency, the stops tied to a rise are
 * the positions short it. If one currency moves against all of them at once,
 * those stops can be hit together (and slippage can make it worse).
 * Everything comes from the reader's own hypothetical positions; no quotes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxBasketExposure = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // Market convention: the earlier currency in this list is the base of the pair.
  const CURRENCIES = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
  const PAIRS = [];
  for (let i = 0; i < CURRENCIES.length; i++) for (let j = i + 1; j < CURRENCIES.length; j++) PAIRS.push(CURRENCIES[i] + '/' + CURRENCIES[j]);
  const MAX_ROWS = 4;
  const clean = (v) => Math.round(v * 1e8) / 1e8;

  function splitPair(pair) {
    const m = /^([A-Z]{3})\/([A-Z]{3})$/.exec(String(pair || ''));
    if (!m || PAIRS.indexOf(pair) < 0) return null;
    return [m[1], m[2]];
  }

  function validate(positions) {
    if (!Array.isArray(positions) || positions.length === 0) return 'Choose a pair for at least one position.';
    if (positions.length > MAX_ROWS) return `Enter up to ${MAX_ROWS} positions.`;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i], n = i + 1;
      if (!splitPair(p.pair)) return `Position ${n}: choose a currency pair from the list.`;
      if (p.side !== 'buy' && p.side !== 'sell') return `Position ${n}: choose buy or sell.`;
      if (!Number.isFinite(p.lots) || p.lots < 0.01 || p.lots > 1000) return `Position ${n}: enter a size from 0.01 to 1,000 lots.`;
      if (p.risk != null && (!Number.isFinite(p.risk) || p.risk < 0 || p.risk > 1e9)) return `Position ${n}: enter the stop risk as $0 or more, or leave it blank.`;
    }
    return '';
  }

  function analyse(positions) {
    const error = validate(positions);
    if (error) return { error };
    const map = new Map();
    const get = (c) => {
      if (!map.has(c)) map.set(c, { currency: c, long: [], short: [], net: 0, gross: 0, riskIfFalls: 0, riskIfRises: 0 });
      return map.get(c);
    };
    const hasRisk = positions.some((p) => p.risk != null);
    let totalRisk = 0;
    positions.forEach((p, i) => {
      const [base, quote] = splitPair(p.pair);
      const s = p.side === 'buy' ? 1 : -1;
      const risk = p.risk == null ? 0 : p.risk;
      totalRisk += risk;
      for (const [c, sign] of [[base, s], [quote, -s]]) {
        const row = get(c);
        row.net = clean(row.net + sign * p.lots);
        row.gross = clean(row.gross + p.lots);
        if (sign > 0) { row.long.push(i); row.riskIfFalls = clean(row.riskIfFalls + risk); }
        else { row.short.push(i); row.riskIfRises = clean(row.riskIfRises + risk); }
      }
    });
    const rows = [...map.values()].sort((a, b) =>
      Math.abs(b.net) - Math.abs(a.net) || (b.long.length + b.short.length) - (a.long.length + a.short.length) || CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency));

    // Biggest shared bet: the currency and side that the most positions repeat.
    let shared = null;
    for (const r of rows) {
      for (const [side, list, risk] of [['long', r.long, r.riskIfFalls], ['short', r.short, r.riskIfRises]]) {
        const lots = clean(list.reduce((a, i) => a + positions[i].lots, 0));
        const cand = { currency: r.currency, side, count: list.length, positions: list.slice(), lots, risk };
        if (!list.length) continue;
        if (!shared || cand.count > shared.count || (cand.count === shared.count && (cand.risk > shared.risk || (cand.risk === shared.risk && cand.lots > shared.lots)))) shared = cand;
      }
    }

    // Currencies held on both sides partly cancel.
    const offsets = rows.filter((r) => r.long.length && r.short.length).map((r) => r.currency);
    // If only two currencies are left with equal and opposite nets, the basket acts like one pair.
    const open = rows.filter((r) => Math.abs(r.net) > 1e-9);
    let actsLike = null;
    if (positions.length > 1 && open.length === 2 && Math.abs(open[0].net + open[1].net) < 1e-9) {
      const [a, b] = open.slice().sort((x, y) => CURRENCIES.indexOf(x.currency) - CURRENCIES.indexOf(y.currency));
      actsLike = { pair: a.currency + '/' + b.currency, side: a.net > 0 ? 'buy' : 'sell', lots: Math.abs(a.net) };
    }
    const flat = open.length === 0;
    return { rows, shared, offsets, actsLike, flat, hasRisk, totalRisk: clean(totalRisk), count: positions.length };
  }

  // Blank means "not entered" (null) for optional fields; anything else must be a plain positive number.
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
    return (v < -0.004 ? '−$' : '$') + a.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  }
  const lots = (v) => (+Math.abs(v).toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  function netText(v) {
    if (Math.abs(v) < 1e-9) return 'Flat';
    return (v > 0 ? 'Long ' : 'Short ') + lots(v);
  }
  function listNames(nums) {
    const names = nums.map((i) => '#' + (i + 1));
    return names.length < 3 ? names.join(' and ') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  function mount(doc) {
    const box = doc.getElementById('bxBox');
    if (!box) return;
    const f = (id) => doc.getElementById(id);
    const status = f('bxStatus'), out = f('bxResult'), body = f('bxBody'), note = f('bxNote');
    for (let i = 1; i <= MAX_ROWS; i++) {
      const sel = f('bxPair' + i);
      if (!sel || sel.options.length > 1) continue;
      for (const p of PAIRS) {
        const o = doc.createElement('option');
        o.value = p; o.textContent = p;
        sel.appendChild(o);
      }
      sel.value = sel.getAttribute('data-initial') || '';
    }
    function read() {
      const list = [];
      for (let i = 1; i <= MAX_ROWS; i++) {
        const pair = f('bxPair' + i).value;
        const lotsText = f('bxLots' + i).value, riskText = f('bxRisk' + i).value;
        if (!pair) continue;
        list.push({ pair, side: f('bxSide' + i).value, lots: parseNumber(lotsText), risk: parseOptional(riskText), row: i });
      }
      return list;
    }
    function render() {
      const positions = read();
      const res = analyse(positions);
      body.textContent = '';
      if (res.error) {
        // Report errors by the row number the reader sees, not the filtered index.
        status.textContent = res.error.replace(/^Position (\d+)/, (m, n) => 'Position ' + (positions[n - 1] ? positions[n - 1].row : n));
        status.hidden = false;
        out.hidden = true;
        return;
      }
      status.hidden = true;
      out.hidden = false;
      const rowNo = (i) => positions[i].row;
      f('bxCount').textContent = plural(res.count, 'position');
      f('bxCountSub').textContent = `${res.rows.length} currencies involved`;
      f('bxTotal').textContent = res.hasRisk ? money(res.totalRisk) : '—';
      f('bxTotalSub').textContent = res.hasRisk ? 'Sum of the stop risks you entered' : 'Add stop risk to see it';
      const sh = res.shared;
      f('bxShared').textContent = `${sh.side === 'long' ? 'Long' : 'Short'} ${sh.currency}`;
      f('bxSharedSub').textContent = `In ${plural(sh.count, 'position')}` + (res.hasRisk ? ` · ${money(sh.risk)} of stops` : '');
      for (const r of res.rows) {
        const tr = doc.createElement('tr');
        if (r.currency === sh.currency && sh.count > 1) tr.className = 'lesson-yours';
        const used = [];
        if (r.long.length) used.push(`long in ${listNames(r.long.map((i) => rowNo(i) - 1))}`);
        if (r.short.length) used.push(`short in ${listNames(r.short.map((i) => rowNo(i) - 1))}`);
        const cells = [r.currency, used.join('; '), netText(r.net), res.hasRisk ? money(r.riskIfFalls) : '—', res.hasRisk ? money(r.riskIfRises) : '—'];
        cells.forEach((text, i) => {
          const td = doc.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.scope = 'row';
          td.textContent = text;
          tr.appendChild(td);
        });
        body.appendChild(tr);
      }
      const parts = [];
      if (sh.count > 1) {
        const names = listNames(sh.positions.map((i) => rowNo(i) - 1));
        parts.push(`Positions ${names} are ${sh.count === 2 ? 'both' : 'all'} ${sh.side} ${sh.currency}, so they are one ${sh.currency} bet in ${sh.count} tickers, not ${sh.count} separate ideas.`);
        if (res.hasRisk) parts.push(`If ${sh.currency} ${sh.side === 'long' ? 'falls' : 'rises'} sharply against ${sh.count === 2 ? 'both' : 'all'} of them, their stops can be hit together: ` + (Math.abs(sh.risk - res.totalRisk) < 0.005 ? `all ${money(sh.risk)} of your stop risk.` : `${money(sh.risk)} of the ${money(res.totalRisk)} total.`));
      } else {
        parts.push('No currency appears on the same side in more than one position, so no single currency move hits every stop at once.');
      }
      if (res.offsets.length) parts.push(`${res.offsets.join(', ')} ${res.offsets.length === 1 ? 'is' : 'are'} held long in one position and short in another, so ${res.offsets.length === 1 ? 'it partly cancels' : 'they partly cancel'}.`);
      if (res.flat) parts.push('Every currency nets to flat: the positions cancel out, so the basket mostly carries spreads and costs.');
      else if (res.actsLike) parts.push(`Overall the basket behaves like ${res.actsLike.side === 'buy' ? 'buying' : 'selling'} ${lots(res.actsLike.lots)} ${Math.abs(res.actsLike.lots - 1) < 1e-9 ? 'lot' : 'lots'} of ${res.actsLike.pair}: the other currencies cancel out.`);
      parts.push('Net sizes are in lots of each pair, not converted at a price, and this does not measure correlation: compare return correlations over more than one window too.');
      note.textContent = parts.join(' ');
    }
    box.addEventListener('input', render);
    box.addEventListener('change', render);
    box.addEventListener('submit', (e) => { e.preventDefault(); render(); });
    box.querySelectorAll('[data-bx-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rows = btn.getAttribute('data-bx-preset').split(';');
        for (let i = 1; i <= MAX_ROWS; i++) {
          const [pair = '', side = 'buy', l = '', risk = ''] = (rows[i - 1] || '').split(',');
          f('bxPair' + i).value = pair; f('bxSide' + i).value = side; f('bxLots' + i).value = l; f('bxRisk' + i).value = risk;
        }
        render();
      });
    });
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document));
    else mount(document);
  }

  return { CURRENCIES, PAIRS, MAX_ROWS, splitPair, validate, analyse, parseNumber, parseOptional, money, netText };
});
