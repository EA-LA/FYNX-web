/* Free, local-only fee illustration. No stored inputs, requests or advice. */
(function () {
  'use strict';
  const guide = document.querySelector('.tool-explainer');
  if (!guide || document.getElementById('feeComparison')) return;
  const section = document.createElement('section');
  section.className = 'tool-explainer';
  section.id = 'feeComparison';
  section.setAttribute('aria-labelledby', 'feeComparisonTitle');
  section.innerHTML = `<h2 id="feeComparisonTitle">What could ongoing fees change?</h2>
    <p>Compare your inputs above with and without a hypothetical ongoing fee. This does not change the main calculator.</p>
    <label for="comparisonFee">Annual fee (% of balance)</label>
    <input id="comparisonFee" type="number" min="0" max="10" step="0.01" value="1" inputmode="decimal" style="display:block;width:100%;max-width:20rem;margin:12px 0">
    <button type="button" class="btn" id="compareFees">Compare fees</button>
    <p id="feeResult" role="status" aria-live="polite" aria-atomic="true" style="margin-top:16px"></p>
    <p class="hint">Model: the annual fee divided by 12 is deducted monthly, after growth and any deposit. No tax, trading costs or fixed charges. Assumed returns are not forecasts. The difference includes fees and their compounding effect; it is not the sum of fees charged. Inputs stay in this page and are not included in shared scenarios.</p>`;
  guide.before(section);
  const ids = ['startingBalance', 'monthlyDeposit', 'annualRate', 'years', 'compoundFrequency', 'depositTiming', 'comparisonFee'];
  const output = document.getElementById('feeResult');
  const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  function read(id) {
    const raw = document.getElementById(id).value.trim();
    return raw === '' ? NaN : Number(raw);
  }
  document.getElementById('compareFees').addEventListener('click', () => {
    const start = read('startingBalance'), deposit = read('monthlyDeposit'), annual = read('annualRate');
    const years = read('years'), freq = read('compoundFrequency'), fee = read('comparisonFee');
    const timing = document.getElementById('depositTiming').value;
    if (![start, deposit, annual, years, freq, fee].every(Number.isFinite) || start < 0 || deposit < 0 ||
        !Number.isInteger(years) || years < 1 || years > 100 || ![1, 2, 4, 12, 365].includes(freq) ||
        fee < 0 || fee > 10 || !['beginning', 'end'].includes(timing) || 1 + annual / 100 / freq <= 0) {
      output.textContent = 'Enter valid inputs above and a fee from 0% to 10%. Use 1–100 whole years and a return that does not wipe out a compounding period.';
      return;
    }
    const factor = Math.pow(1 + annual / 100 / freq, freq / 12);
    let before = start, after = start;
    for (let m = 0; m < years * 12; m++) {
      if (timing === 'beginning') { before += deposit; after += deposit; }
      before *= factor; after *= factor;
      if (timing === 'end') { before += deposit; after += deposit; }
      after *= 1 - fee / 1200;
    }
    if (![before, after, before - after].every(Number.isFinite)) {
      output.textContent = 'This scenario is too large to display. Reduce the rate, duration or amounts.';
      return;
    }
    output.textContent = `After ${years} years: without fees ${money(before)}; with ${fee}% annual fee ${money(after)}. Modeled balance difference: ${money(before - after)}.`;
  });
  ids.forEach(id => {
    const el = document.getElementById(id);
    ['input', 'change'].forEach(event => el.addEventListener(event, () => { output.textContent = 'Inputs changed. Compare fees again for an updated result.'; }));
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    document.getElementById('comparisonFee').value = '1';
    output.textContent = '';
  });
})();
