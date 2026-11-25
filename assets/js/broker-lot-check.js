(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const form = byId('broker-lot-form');
  if (!form || !window.Decimal) return;
  const Decimal = window.Decimal.clone({ precision: 96 });
  const fields = ['broker-risk', 'broker-stop', 'broker-pip-value', 'broker-step', 'broker-minimum'].map(byId);
  const result = byId('broker-lot-result');
  const limit = new Decimal('1000000000');

  function read(input, optional = false) {
    const value = input.value.trim();
    if (optional && !value) return new Decimal(0);
    if (value.length > 20 || !/^(?:\d+(?:\.\d{0,8})?|\.\d{1,8})$/.test(value)) return null;
    const number = new Decimal(value);
    return number.lte(limit) && (optional || number.gt(0)) ? number : null;
  }

  const quantity = value => value.toFixed();
  const usd = value => '$' + value.toFixed(Math.max(2, value.decimalPlaces()));

  form.addEventListener('submit', event => {
    event.preventDefault();
    const [budget, stop, pip, step, minimum] = fields.map((field, i) => read(field, i === 4));
    if (!budget || !stop || !pip || !step || !minimum) {
      result.textContent = 'Enter positive values with up to 8 decimal places, no greater than 1 billion. Leave the minimum blank or enter a value from 0 to 1 billion.';
      return;
    }

    const lossPerLot = stop.times(pip);
    const lossPerStep = lossPerLot.times(step);
    const minSteps = Decimal.max(1, minimum.div(step).ceil());
    // Truncate the step count before multiplying; never add a floating-point tolerance.
    const maxSteps = budget.dividedToIntegerBy(lossPerStep);
    if (maxSteps.lt(minSteps)) {
      result.textContent = `No positive lot size fits this model. The smallest grid size is ${quantity(step.times(minSteps))} lots and would risk ${usd(lossPerStep.times(minSteps))}, above your ${usd(budget)} budget.`;
      return;
    }
    const loss = maxSteps.times(lossPerStep);
    result.textContent = `Maximum modeled size: ${quantity(maxSteps.times(step))} lots. Loss at the stop: ${usd(loss)}. Unused risk budget: ${usd(budget.minus(loss))}.`;
  });

  const invalidate = () => {
    if (result.textContent) result.textContent = 'Inputs changed. Check lot size again for the current inputs.';
  };
  fields.forEach(field => {
    field.addEventListener('input', invalidate);
    field.addEventListener('change', invalidate);
  });
  byId('broker-lot-fields').disabled = false;
  byId('broker-lot-run').disabled = false;
})();
