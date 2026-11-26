(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const form = byId('stock-exit-form');
  if (!form || !window.Decimal) return;
  const Decimal = window.Decimal.clone({ precision: 60 });
  const fields = ['entryPrice','stopLoss','stock-exit-total','stock-exit-first','stock-exit-target-one','stock-exit-target-two'].map(byId);
  const status = byId('stock-exit-status');
  const results = byId('stock-exit-results');
  const metrics = ['stock-exit-both','stock-exit-reverse','stock-exit-stop'].map(byId);
  const maxPrice = new Decimal('1000000000');
  const maxShares = new Decimal('1000000');

  function read(field, integer) {
    const raw = field.value.trim();
    const pattern = integer ? /^\d{1,7}$/ : /^(?:\d{1,10}(?:\.\d{0,8})?|\.\d{1,8})$/;
    if (!pattern.test(raw)) return null;
    const n = new Decimal(raw);
    return n.gt(0) && n.lte(integer ? maxShares : maxPrice) ? n : null;
  }

  function reset(message = '') {
    results.hidden = true;
    metrics.forEach(metric => { metric.textContent = ''; });
    status.textContent = message;
  }

  function pnl(value) {
    return (value.lt(0) ? '−' : value.gt(0) ? '+' : '') + '$' +
      value.abs().toFixed(Math.max(2, value.decimalPlaces()));
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const [entry, stop, total, first, t1, t2] = fields.map((field, index) => read(field, index === 2 || index === 3));
    if (!entry || !stop || !t1 || !t2 || entry.eq(stop)) {
      return reset('Enter positive entry, stop and target prices (up to 1 billion and 8 decimal places). Entry and stop must differ.');
    }
    if (!total || !first || first.gte(total)) {
      return reset('Enter up to 1 million whole shares. Allocate at least one share to each target.');
    }
    const direction = entry.gt(stop) ? 1 : -1;
    const move = price => price.minus(entry).times(direction);
    const targetOneMove = move(t1);
    const targetTwoMove = move(t2);
    if (!targetOneMove.gt(0) || !targetTwoMove.gt(targetOneMove)) {
      return reset('Both targets must be on the profitable side of entry, with the second target farther away.');
    }

    const remainder = total.minus(first);
    const firstProfit = targetOneMove.times(first);
    metrics[0].textContent = pnl(firstProfit.plus(targetTwoMove.times(remainder)));
    metrics[1].textContent = pnl(firstProfit.plus(move(stop).times(remainder)));
    metrics[2].textContent = pnl(move(stop).times(total));
    status.textContent = `${direction > 0 ? 'Long' : 'Short'} model: ${first} shares at the first target, ${remainder} at the second. Gross profit or loss:`;
    results.hidden = false;
  });

  const invalidate = () => {
    if (status.textContent) reset('Inputs changed. Compare exits again for the current plan.');
  };
  fields.forEach(field => {
    field.addEventListener('input', invalidate);
    field.addEventListener('change', invalidate);
  });
  byId('clearBtn').addEventListener('click', () => reset());
  byId('stock-exit-fields').disabled = false;
  byId('stock-exit-compare').disabled = false;
})();
