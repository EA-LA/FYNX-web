// Currency converter extras: what a provider's rate costs against a reference
// rate the user checked, and a quick amounts table in both directions.
// Uses only rates the user typed; nothing here fetches or invents a market rate.
(function exposeFynxCurrencyCheck(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FynxCurrencyCheck = api;
})(typeof window === "undefined" ? null : window, function createFynxCurrencyCheck() {
  "use strict";

  const STANDARD_AMOUNTS = [1, 10, 100, 500, 1000, 5000];

  function positive(n) {
    return typeof n === "number" && Number.isFinite(n) && n > 0;
  }

  // rate and reference are both "units of the target currency per 1 unit of the source".
  // Returns null when either input is unusable.
  function providerCost(amount, rate, reference) {
    if (!positive(amount) || !positive(rate) || !positive(reference)) return null;
    const received = amount * rate;
    const atReference = amount * reference;
    const shortfall = atReference - received; // in the target currency; < 0 means your rate is better
    const markupPct = (reference - rate) / reference * 100;
    const ratio = rate / reference;
    // Rates more than 50% apart are almost always a typo or a rate quoted the other way round.
    const farApart = ratio > 1.5 || ratio < 1 / 1.5;
    // One rate close to 1 / the other while the two differ by more than 10%: probably
    // one is quoted the other way round (e.g. 0.92 EUR per USD vs 1.087 USD per EUR).
    const looksInverted = Math.abs(rate * reference - 1) < 0.05 && Math.abs(ratio - 1) > 0.10;
    return {
      received,
      atReference,
      shortfall,
      shortfallSource: shortfall / reference,
      markupPct,
      better: shortfall < 0,
      same: Math.abs(markupPct) < 1e-9,
      farApart,
      looksInverted
    };
  }

  // Standard amounts plus the user's amount (marked), sorted, without duplicates.
  function quickAmounts(amount, rate) {
    if (!positive(rate)) return [];
    const list = STANDARD_AMOUNTS.slice();
    const hasYours = positive(amount);
    if (hasYours && !list.some(a => Math.abs(a - amount) < 1e-9)) list.push(amount);
    list.sort((a, b) => a - b);
    return list.map(a => ({
      amount: a,
      forward: a * rate,
      backward: a / rate,
      yours: hasYours && Math.abs(a - amount) < 1e-9
    }));
  }

  return { providerCost, quickAmounts, STANDARD_AMOUNTS };
});
