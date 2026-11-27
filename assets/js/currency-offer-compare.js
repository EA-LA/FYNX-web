(function () {
  'use strict';
  const id = name => document.getElementById(name);
  const form = id('currency-offer-form');
  if (!form || !window.Decimal) return;
  const Decimal = window.Decimal.clone({ precision: 60 });
  const amount = id('amount');
  const from = id('fromCurrency');
  const to = id('toCurrency');
  const fields = ['offer-a-rate','offer-a-fee','offer-b-rate','offer-b-fee'].map(id);
  const basis = id('currency-offer-basis');
  const status = id('currency-offer-status');
  const results = id('currency-offer-results');
  const net = [id('offer-a-net'),id('offer-b-net')];
  const maximum = new Decimal('1000000000');

  const currentPair = () => from.value + '/' + to.value;
  let pair = currentPair();
  const draftsByPair = new Map();
  function showBasis() {
    basis.textContent = from.value && to.value
      ? `Rates in ${to.value} per 1 ${from.value}. Fees in ${from.value}.`
      : 'Choose the sending and receiving currencies above.';
  }
  function clear(message = '') {
    results.hidden = true;
    net.forEach(el => { el.textContent = ''; });
    status.textContent = message;
  }
  function updatePair() {
    if (pair === currentPair()) return false;
    const draft = fields.map(field => field.value);
    if (draft.some(value => value.trim())) draftsByPair.set(pair,draft);
    else draftsByPair.delete(pair);
    pair = currentPair();
    const recalled = draftsByPair.get(pair);
    fields.forEach((field,index) => { field.value = recalled?.[index] ?? ''; });
    showBasis();
    clear(recalled
      ? 'Currency pair changed. Review the restored offers before comparing.'
      : 'Currency pair changed. Enter both offers in the new currencies.');
    return true;
  }
  function parse(input, allowZero = false) {
    const raw = input.value.trim();
    if (!/^(?:\d{1,10}(?:\.\d{0,8})?|\.\d{1,8})$/.test(raw)) return null;
    const number = new Decimal(raw);
    return number.lte(maximum) && (allowZero || number.gt(0)) ? number : null;
  }
  function format(value, currency) {
    return `${value.toFixed(Math.max(2, value.decimalPlaces()))} ${currency}`;
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (updatePair()) return;
    if (!/^[A-Z]{3}$/.test(from.value) || !/^[A-Z]{3}$/.test(to.value) || from.value === to.value) {
      return clear('Choose two different currencies above.');
    }
    const budget = parse(amount);
    const [rateA,feeA,rateB,feeB] = fields.map((field,i) => parse(field,i%2===1));
    if (!budget || !rateA || !feeA || !rateB || !feeB) {
      return clear('Enter a positive budget and rates, and enter fees of 0 or more. Use plain numbers up to 1 billion and 8 decimal places.');
    }
    if (feeA.gte(budget) || feeB.gte(budget)) {
      return clear('Each fee must be less than your total budget.');
    }
    const a = budget.minus(feeA).times(rateA);
    const b = budget.minus(feeB).times(rateB);
    net[0].textContent = format(a,to.value);
    net[1].textContent = format(b,to.value);
    const difference = a.minus(b);
    status.textContent = difference.isZero() ? 'Both offers deliver the same amount.'
      : `Offer ${difference.gt(0) ? 'A' : 'B'} delivers ${format(difference.abs(),to.value)} more in this model.`;
    results.hidden = false;
  });
  for (const input of [amount,...fields]) {
    const edit = () => { if (!results.hidden) clear('Inputs changed. Compare offers again.'); };
    input.addEventListener('input',edit);
    input.addEventListener('change',edit);
  }
  [from,to].forEach(select => select.addEventListener('change',updatePair));
  id('swapBtn').addEventListener('click',updatePair);
  id('clearBtn').addEventListener('click',() => { clear();updatePair(); });
  showBasis();
  ['currency-offer-a','currency-offer-b','currency-offer-run'].forEach(name => { id(name).disabled = false; });
})();
