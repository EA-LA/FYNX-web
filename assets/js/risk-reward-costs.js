(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const form = byId('riskRewardCostForm');
  if (!form || !window.Decimal) return;

  const Decimal = window.Decimal.clone({ precision: 36 });
  const button = byId('compareRiskRewardCosts');
  const costField = byId('roundTripUnitCost');
  const prices = ['entry', 'sl', 'tp'].map(byId);
  const status = byId('riskRewardCostStatus');
  const results = byId('riskRewardCostResults');
  const metrics = ['netStopLoss', 'netTargetResult', 'netCostRatio', 'netCostBreakEven'].map(byId);
  const maximum = new Decimal('1000000000000');

  function read(field) {
    const raw = field.value.trim();
    if (raw.length > 32 || !/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,12})?|\.\d{1,12})$/.test(raw)) return null;
    const value = new Decimal(raw.replaceAll(',', ''));
    return value.lte(maximum) ? value : null;
  }

  function invalidate(message = '') {
    results.hidden = true;
    metrics.forEach(metric => { metric.textContent = ''; });
    status.textContent = message;
  }

  function percentage(value) {
    if (value.gt(0) && value.lt('0.005')) return 'less than 0.01%';
    if (value.lt(100) && value.gte('99.995')) return 'just under 100%';
    return value.toFixed(2) + '%';
  }

  function ratio(value) {
    return value.gt(0) && value.lt('0.005') ? 'less than 0.01 : 1' : value.toFixed(2) + ' : 1';
  }

  function amount(value) {
    return value.toFixed(Math.max(2, value.decimalPlaces()));
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const [entry, stop, target] = prices.map(read);
    const cost = read(costField);
    if (!entry?.gt(0) || !stop?.gt(0) || !target?.gt(0) ||
        !((stop.lt(entry) && target.gt(entry)) || (stop.gt(entry) && target.lt(entry)))) {
      invalidate('Enter positive prices up to 1 trillion (at most 12 decimal places) with the stop and target on opposite sides of entry.');
      return;
    }
    if (cost === null) {
      invalidate('Enter a cost from 0 to 1 trillion, using at most 12 decimal places.');
      return;
    }

    const grossLoss = entry.minus(stop).abs();
    const grossReward = target.minus(entry).abs();
    const netLoss = grossLoss.plus(cost);
    const netReward = grossReward.minus(cost);
    const totalRange = grossLoss.plus(grossReward);
    const grossRate = percentage(grossLoss.times(100).div(totalRange));
    metrics[0].textContent = amount(netLoss);
    metrics[1].textContent = amount(netReward);
    metrics[2].textContent = netReward.gt(0)
      ? `${ratio(grossReward.div(grossLoss))} before → ${ratio(netReward.div(netLoss))} after`
      : `${ratio(grossReward.div(grossLoss))} before → No positive reward after costs`;
    metrics[3].textContent = netReward.lt(0)
      ? `${grossRate} before → Not possible after costs`
      : `${grossRate} before → ${percentage(netLoss.times(100).div(totalRange))} after`;
    status.textContent = netReward.lt(0) ? 'Even the target would produce a loss after costs.'
      : netReward.isZero() ? 'The target only covers costs. You would need a 100% win rate to break even in this model.'
        : 'After-cost comparison for the current inputs.';
    results.hidden = false;
  });

  [...prices, costField].forEach(input => {
    const onEdit = () => {
      if (!results.hidden || status.textContent) invalidate('Inputs changed. Compare again to see current results.');
    };
    input.addEventListener('input', onEdit);
    input.addEventListener('change', onEdit);
  });
  byId('clearBtn').addEventListener('click', () => {
    costField.value = '0';
    invalidate();
  });
  button.disabled = false;
})();
