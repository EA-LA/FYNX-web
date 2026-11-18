/* Two-point Fibonacci levels. All calculations run locally. */
(function () {
  function calculate({ high, low, direction = 'up', entry = null }) {
    if (!Number.isFinite(high) || !Number.isFinite(low) || low <= 0 || high <= low) {
      throw new Error('Enter a positive swing low and a swing high greater than the low.');
    }
    if (!['up', 'down'].includes(direction)) throw new Error('Choose an uptrend or downtrend.');
    if (entry !== null && (!Number.isFinite(entry) || entry <= 0)) throw new Error('Enter a positive entry price, or leave it blank.');
    const range = high - low;
    const retracements = [0.236, 0.382, 0.5, 0.618, 0.786].map(ratio => ({
      ratio, price: direction === 'up' ? high - range * ratio : low + range * ratio,
    }));
    const extensions = [1.272, 1.618, 2].map(ratio => ({
      ratio, price: direction === 'up' ? low + range * ratio : high - range * ratio,
    }));
    if (![...retracements, ...extensions].every(level => Number.isFinite(level.price))) throw new Error('The price range is too large. Use smaller finite inputs.');
    const nearest = entry === null ? null : retracements.reduce((a, b) => Math.abs(a.price - entry) <= Math.abs(b.price - entry) ? a : b);
    return { range, retracements, extensions, nearest };
  }
  // Where an entry sits inside the swing, plus a reference stop and targets in R multiples.
  // Stop defaults to the start of the swing (100%); targets are the swing end (0%) and the 127.2% / 161.8% extensions.
  function plan({ high, low, direction = 'up', entry, stop = null, eps = 0 }) {
    const base = calculate({ high, low, direction, entry });
    const up = direction === 'up';
    const range = base.range;
    const start = up ? low : high; // 100%
    const end = up ? high : low;   // 0%
    const depth = up ? (high - entry) / range : (entry - low) / range;
    const ladder = [{ ratio: 0, price: end }, ...base.retracements, { ratio: 1, price: start }];
    let zone;
    const at = ladder.find(level => Math.abs(level.price - entry) <= eps);
    if (at) zone = { kind: 'at', level: at };
    else if (depth < 0) zone = { kind: 'beyondEnd' };
    else if (depth > 1) zone = { kind: 'beyondStart' };
    else {
      let i = 0;
      while (i < ladder.length - 1 && ladder[i + 1].ratio < depth) i++;
      zone = { kind: 'between', shallow: ladder[i], deep: ladder[i + 1] };
    }
    let stopPrice = start; let stopSource = 'swing';
    if (stop !== null) {
      if (!Number.isFinite(stop) || stop <= 0) throw new Error('Enter a positive stop price, or leave it blank to use the swing start.');
      stopPrice = stop; stopSource = 'custom';
    }
    if (up ? stopPrice >= entry : stopPrice <= entry) {
      throw new Error(up
        ? (stopSource === 'custom' ? 'For an uptrend (buy) the stop must be below the entry price.' : 'The entry is at or below the swing low, so there is no room for a stop at the swing start. Enter your own stop below the entry.')
        : (stopSource === 'custom' ? 'For a downtrend (sell) the stop must be above the entry price.' : 'The entry is at or above the swing high, so there is no room for a stop at the swing start. Enter your own stop above the entry.'));
    }
    const risk = Math.abs(entry - stopPrice);
    const targets = [{ label: 'swing end', ratio: 0, price: end }, base.extensions[0], base.extensions[1]].map(t => {
      const reward = up ? t.price - entry : entry - t.price;
      return { label: t.label || 'extension', ratio: t.ratio, price: t.price, reward, r: reward / risk };
    });
    return { depth, zone, stop: { price: stopPrice, source: stopSource, risk }, targets };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { calculate, plan };
  if (typeof document === 'undefined') return;
  const el = id => document.getElementById(id);
  function render() {
    try {
      const rawEntry = el('entryPrice').value.trim();
      const result = calculate({ high: el('swingHigh').valueAsNumber, low: el('swingLow').valueAsNumber, direction: el('trendDirection').value, entry: rawEntry === '' ? null : el('entryPrice').valueAsNumber });
      const precision = Number(el('pricePrecision').value);
      const price = value => value.toFixed(precision);
      const percent = ratio => `${Number((ratio * 100).toFixed(1))}%`;
      el('fibError').hidden = true;
      el('zoneChip').textContent = 'Calculated';
      el('zoneTitle').textContent = el('trendDirection').value === 'up' ? 'Uptrend reference levels' : 'Downtrend reference levels';
      el('zoneDesc').textContent = 'Levels reflect your selected swing. They do not indicate the probability of a reversal.';
      el('rangeValue').textContent = price(result.range);
      el('goldenZoneValue').textContent = [result.retracements[2].price, result.retracements[3].price].sort((a,b) => a-b).map(price).join(' – ');
      el('nearestValue').textContent = result.nearest ? `${percent(result.nearest.ratio)} · ${price(result.nearest.price)}` : 'No entry provided';
      el('fibLevels').replaceChildren();
      for (const [type, levels] of [['Retracement', result.retracements], ['Extension', result.extensions]]) {
        for (const level of levels) {
          const row = document.createElement('tr');
          for (const text of [type, percent(level.ratio), price(level.price)]) {
            const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
          }
          el('fibLevels').append(row);
        }
      }
      renderPlan(rawEntry, precision, price, percent);
    } catch (error) {
      el('fibPlan').hidden = true;
      el('fibError').textContent = error.message; el('fibError').hidden = false;
      el('zoneChip').textContent = 'Check inputs'; el('zoneTitle').textContent = 'No valid calculation';
      el('zoneDesc').textContent = error.message;
      for (const id of ['rangeValue', 'goldenZoneValue', 'nearestValue']) el(id).textContent = '—';
      el('fibLevels').replaceChildren();
    }
  }
  function renderPlan(rawEntry, precision, price, percent) {
    const box = el('fibPlan');
    if (rawEntry === '') { box.hidden = true; return; }
    box.hidden = false;
    const up = el('trendDirection').value === 'up';
    const rawStop = el('stopPrice').value.trim();
    const entry = el('entryPrice').valueAsNumber;
    const name = level => level.ratio === 0 ? `the swing ${up ? 'high' : 'low'} (0%)`
      : level.ratio === 1 ? `the swing ${up ? 'low' : 'high'} (100%)` : `${percent(level.ratio)} (${price(level.price)})`;
    const pull = d => `${Number((d * 100).toFixed(1))}%`;
    let p = null; let err = '';
    try {
      p = plan({ high: el('swingHigh').valueAsNumber, low: el('swingLow').valueAsNumber, direction: el('trendDirection').value,
        entry, stop: rawStop === '' ? null : el('stopPrice').valueAsNumber, eps: 0.5 * Math.pow(10, -precision) });
    } catch (e) { err = e.message; }
    if (!p) {
      // Still describe where the entry sits, using the swing start as a harmless stop stand-in.
      try { p = plan({ high: el('swingHigh').valueAsNumber, low: el('swingLow').valueAsNumber, direction: el('trendDirection').value, entry, stop: up ? entry / 2 : entry * 2, eps: 0.5 * Math.pow(10, -precision) }); } catch (_) { p = null; }
    }
    let zone = '';
    if (p) {
      const z = p.zone; const e = price(entry);
      if (z.kind === 'at') zone = `Your entry ${e} is at ${z.level.ratio === 0 || z.level.ratio === 1 ? name(z.level) : `the ${name(z.level)} level`}.`;
      else if (z.kind === 'between') zone = `Your entry ${e} is a ${pull(p.depth)} pullback, between ${name(z.shallow)} and ${name(z.deep)}.`;
      else if (z.kind === 'beyondEnd') zone = `Your entry ${e} is ${up ? 'above the swing high' : 'below the swing low'}: price has not pulled back into this swing yet.`;
      else zone = `Your entry ${e} is ${up ? 'below the swing low' : 'above the swing high'}: the whole swing has been retraced (${pull(p.depth)}).`;
    }
    el('fibPlanZone').textContent = zone;
    el('fibPlanError').textContent = err; el('fibPlanError').hidden = !err;
    el('fibPlanTable').hidden = !!err;
    el('fibPlanRows').replaceChildren();
    if (err || !p) return;
    const signed = v => { const r = Number(v.toFixed(precision)); return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(precision); };
    const addRow = (cells, cls) => {
      const row = document.createElement('tr'); if (cls) row.className = cls;
      cells.forEach((text, i) => { const c = document.createElement(i === 0 ? 'th' : 'td'); if (i === 0) c.scope = 'row'; c.textContent = text; row.append(c); });
      el('fibPlanRows').append(row);
    };
    addRow([p.stop.source === 'custom' ? 'Your stop' : `Stop (swing ${up ? 'low' : 'high'})`, price(p.stop.price), signed(p.stop.price - entry), '−1R'], 'is-stop');
    for (const t of p.targets) {
      const label = t.ratio === 0 ? `Swing ${up ? 'high' : 'low'}` : `${percent(t.ratio)} ext`;
      addRow([label, price(t.price), signed(t.price - entry), t.reward > 0 ? `${t.r.toFixed(2)}R` : 'passed'], t.reward > 0 ? '' : 'is-passed');
    }
  }
  el('calculateBtn').addEventListener('click', render);
  el('resetBtn').addEventListener('click', () => {
    for (const [id, value] of Object.entries({ swingHigh: '1.1200', swingLow: '1.1000', entryPrice: '1.1124', stopPrice: '', trendDirection: 'up', pricePrecision: '4' })) el(id).value = value;
    render();
  });
  // Number inputs emit `input` before blur (including on iPhone); keep visible levels in sync.
  // `change` is retained for dropdowns and keyboard behavior.
  for (const id of ['swingHigh', 'swingLow', 'entryPrice', 'stopPrice']) el(id).addEventListener('input', render);
  for (const id of ['swingHigh', 'swingLow', 'entryPrice', 'stopPrice', 'trendDirection', 'pricePrecision']) {
    el(id).addEventListener('change', render);
    el(id).addEventListener('keydown', event => { if (event.key === 'Enter') render(); });
  }
  render();
})();
