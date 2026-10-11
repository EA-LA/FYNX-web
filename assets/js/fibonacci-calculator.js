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
  if (typeof module !== 'undefined' && module.exports) module.exports = { calculate };
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
    } catch (error) {
      el('fibError').textContent = error.message; el('fibError').hidden = false;
      el('zoneChip').textContent = 'Check inputs'; el('zoneTitle').textContent = 'No valid calculation';
      el('zoneDesc').textContent = error.message;
      for (const id of ['rangeValue', 'goldenZoneValue', 'nearestValue']) el(id).textContent = '—';
      el('fibLevels').replaceChildren();
    }
  }
  el('calculateBtn').addEventListener('click', render);
  el('resetBtn').addEventListener('click', () => {
    for (const [id, value] of Object.entries({ swingHigh: '1.1200', swingLow: '1.1000', entryPrice: '1.1124', trendDirection: 'up', pricePrecision: '4' })) el(id).value = value;
    render();
  });
  for (const id of ['swingHigh', 'swingLow', 'entryPrice', 'trendDirection', 'pricePrecision']) {
    el(id).addEventListener('change', render);
    el(id).addEventListener('keydown', event => { if (event.key === 'Enter') render(); });
  }
  render();
})();
