/* Macro Desk calculations. Pure functions, no DOM, no network.
 * Shared by the browser page and the Node tests. Nothing here invents a value:
 * a missing input produces a missing output with a reason. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FynxMacroModel = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const DAY = 86400000;
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const TENOR_YEARS = {'1M': 1 / 12, '3M': 0.25, '6M': 0.5, '13W': 0.25, '1Y': 1, '2Y': 2, '3Y': 3, '5Y': 5, '7Y': 7, '10Y': 10, '20Y': 20, '30Y': 30, '40Y': 40};
  const AREAS = Object.freeze({
    US: {label: 'United States', short: 'US Treasuries', currency: 'USD'},
    EA: {label: 'Euro area', short: 'Euro area govt', currency: 'EUR'},
    GB: {label: 'United Kingdom', short: 'UK gilts', currency: 'GBP'},
    JP: {label: 'Japan', short: 'JGBs', currency: 'JPY'}
  });
  const CURRENCY_AREA = {USD: 'US', EUR: 'EA', GBP: 'GB', JPY: 'JP'};
  const BIS_AREA = {USD: 'US', EUR: 'XM', GBP: 'GB', JPY: 'JP', CHF: 'CH', CAD: 'CA', AUD: 'AU', NZD: 'NZ'};
  const PAIRS = Object.freeze([
    {id: 'EURUSD', base: 'EUR', quote: 'USD', quoteSymbol: 'EURUSD=X'},
    {id: 'GBPUSD', base: 'GBP', quote: 'USD', quoteSymbol: 'GBPUSD=X'},
    {id: 'USDJPY', base: 'USD', quote: 'JPY', quoteSymbol: 'JPY=X'},
    {id: 'AUDUSD', base: 'AUD', quote: 'USD', quoteSymbol: 'AUDUSD=X'},
    {id: 'USDCAD', base: 'USD', quote: 'CAD', quoteSymbol: 'CAD=X'},
    {id: 'USDCHF', base: 'USD', quote: 'CHF', quoteSymbol: 'CHF=X'},
    {id: 'NZDUSD', base: 'NZD', quote: 'USD', quoteSymbol: null},
    {id: 'EURJPY', base: 'EUR', quote: 'JPY', quoteSymbol: null},
    {id: 'GBPJPY', base: 'GBP', quote: 'JPY', quoteSymbol: null},
    {id: 'EURGBP', base: 'EUR', quote: 'GBP', quoteSymbol: null}
  ]);
  /* Weights are fixed and published on the page. Missing components are left out
   * and the remaining weights are rescaled, so coverage is always shown. */
  const WEIGHTS = Object.freeze({trend: 0.35, yields: 0.3, carry: 0.2, positioning: 0.15});

  /* --- Dates and schedules ------------------------------------------------ */
  function zoneOffsetMs(ms, timeZone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}).formatToParts(new Date(ms)).map(p => [p.type, p.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - ms;
  }
  /* Local wall-clock time in an IANA zone -> UTC epoch ms (DST-safe). */
  function zonedToUTC(date, time, timeZone) {
    const [y, mo, d] = date.split('-').map(Number), [h, mi] = (time || '12:00').split(':').map(Number);
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    let utc = guess - zoneOffsetMs(guess, timeZone);
    utc = guess - zoneOffsetMs(utc, timeZone);
    return utc;
  }
  function nextDecision(bank, now = Date.now()) {
    for (const date of bank.decisions || []) {
      const exact = bank.time ? zonedToUTC(date, bank.time, bank.timeZone) : null;
      const endOfDay = zonedToUTC(date, '23:59', bank.timeZone);
      if ((exact ?? endOfDay) + (exact ? 3600000 : 0) >= now) return {date, at: exact, timeKnown: Boolean(exact), daysAway: Math.max(0, Math.ceil(((exact ?? endOfDay) - now) / DAY))};
    }
    return null;
  }
  function lastDecisionBefore(bank, now = Date.now()) {
    const past = [bank.previous, ...(bank.decisions || [])].filter(Boolean).filter(date => zonedToUTC(date, bank.time || '23:59', bank.timeZone) < now);
    return past.sort().at(-1) || null;
  }
  function countdown(ms) {
    if (!finite(ms)) return '';
    if (ms <= 0) return 'now';
    const d = Math.floor(ms / DAY), h = Math.floor(ms % DAY / 3600000), m = Math.floor(ms % 3600000 / 60000);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  }

  /* --- Policy rates -------------------------------------------------------- */
  function policyRate(currency, desk) {
    if (currency === 'USD' && desk?.fed?.effr && finite(desk.fed.effr.targetFrom) && finite(desk.fed.effr.targetTo)) {
      const e = desk.fed.effr;
      return {value: (e.targetFrom + e.targetTo) / 2, display: `${e.targetFrom.toFixed(2)}–${e.targetTo.toFixed(2)}%`, observationDate: e.date, source: 'New York Fed (target range)', midpoint: true};
    }
    const row = desk?.rates?.rows?.find(r => r.area === BIS_AREA[currency]);
    return row && finite(row.value) ? {value: row.value, display: `${row.value.toFixed(2)}%`, observationDate: row.observationDate, source: 'BIS'} : null;
  }

  /* --- Curves -------------------------------------------------------------- */
  function rowOnOrBefore(history, target) {
    let found = null;
    for (const row of history) { if (row.date <= target) found = row; else break; }
    return found;
  }
  function curveView(curve) {
    const history = Array.isArray(curve?.history) ? curve.history : [];
    if (!history.length) return null;
    const latest = history.at(-1), t = Date.parse(latest.date + 'T00:00:00Z');
    const back = days => rowOnOrBefore(history, new Date(t - days * DAY).toISOString().slice(0, 10));
    const week = back(7), month = back(30);
    const tenors = Object.keys(latest.values).filter(k => TENOR_YEARS[k] !== undefined).sort((a, b) => TENOR_YEARS[a] - TENOR_YEARS[b]);
    const rows = tenors.map(tenor => {
      const v = latest.values[tenor], w = week?.values?.[tenor], m = month?.values?.[tenor];
      return {tenor, value: v, week: finite(w) ? w : null, month: finite(m) ? m : null,
        weekChangeBp: finite(w) ? Math.round((v - w) * 100) : null, monthChangeBp: finite(m) ? Math.round((v - m) * 100) : null};
    });
    const pick = (...names) => names.map(n => latest.values[n]).find(finite);
    const short = latest.values['2Y'] !== undefined ? '2Y' : latest.values['5Y'] !== undefined ? '5Y' : null;
    const spread = short && finite(latest.values['10Y']) && short !== '10Y' ? {label: `${short.replace('Y', 's')}10s`, bp: Math.round((latest.values['10Y'] - latest.values[short]) * 100),
      monthChangeBp: finite(month?.values?.['10Y']) && finite(month?.values?.[short]) ? Math.round(((latest.values['10Y'] - latest.values[short]) - (month.values['10Y'] - month.values[short])) * 100) : null} : null;
    return {latestDate: latest.date, weekDate: week?.date || null, monthDate: month?.date || null, rows, spread, tenYear: pick('10Y'), twoYear: pick('2Y')};
  }
  function yieldChange(curve, tenor, days) {
    const history = curve?.history || []; if (!history.length) return null;
    const latest = history.at(-1), past = rowOnOrBefore(history, new Date(Date.parse(latest.date) - days * DAY).toISOString().slice(0, 10));
    const a = latest.values?.[tenor], b = past?.values?.[tenor];
    return finite(a) && finite(b) ? {bp: (a - b) * 100, from: past.date, to: latest.date} : null;
  }

  /* --- Smart Bias -------------------------------------------------------- */
  function smartBias(pair, {desk, edgeMarket, livePrice} = {}) {
    const components = [];
    // Trend: where price sits inside its 20-day range, scaled by trend efficiency.
    const st = edgeMarket?.state, hi = st?.high20?.value, lo = st?.low20?.value, er = st?.efficiencyRatio?.value;
    const price = finite(livePrice) ? livePrice : st?.close?.value;
    if (finite(hi) && finite(lo) && hi > lo && finite(price)) {
      const position = clamp((price - (hi + lo) / 2) / ((hi - lo) / 2), -1, 1);
      const quality = finite(er) ? clamp(0.5 + er, 0.5, 1) : 0.75;
      components.push({key: 'trend', label: 'Trend', score: Math.round(position * quality * 100),
        detail: `Price ${finite(livePrice) ? '(live) ' : ''}is ${Math.round((position + 1) * 50)}% of the way up its 20-day range`});
    }
    // Yield momentum: change in the 2-year yield gap over one month.
    const ca = desk?.curves?.[CURRENCY_AREA[pair.base]], cb = desk?.curves?.[CURRENCY_AREA[pair.quote]];
    const ya = yieldChange(ca, '2Y', 30) || yieldChange(ca, '5Y', 30), yb = yieldChange(cb, '2Y', 30) || yieldChange(cb, '5Y', 30);
    if (ya && yb) {
      const gap = ya.bp - yb.bp;
      components.push({key: 'yields', label: 'Yield momentum', score: Math.round(clamp(gap / 40, -1, 1) * 100),
        detail: `${pair.base} short yields ${ya.bp >= 0 ? '+' : ''}${Math.round(ya.bp)} bp vs ${pair.quote} ${yb.bp >= 0 ? '+' : ''}${Math.round(yb.bp)} bp in a month`});
    }
    // Carry: policy-rate difference.
    const ra = policyRate(pair.base, desk), rb = policyRate(pair.quote, desk);
    if (ra && rb) {
      const diff = ra.value - rb.value;
      components.push({key: 'carry', label: 'Rate gap', score: Math.round(clamp(diff / 3, -1, 1) * 100),
        detail: `${pair.base} ${ra.display} vs ${pair.quote} ${rb.display} (${diff >= 0 ? '+' : ''}${diff.toFixed(2)} pts)`});
    }
    // Positioning: contrarian only when CFTC positioning is crowded.
    const net = edgeMarket?.positioning?.net?.value, crowded = edgeMarket?.positioning?.crowded?.value;
    if (finite(net) && typeof crowded === 'boolean') {
      const score = crowded ? Math.round(-Math.sign(net) * clamp(Math.abs(net) / 0.4, 0.5, 1) * 100) : 0;
      components.push({key: 'positioning', label: 'Positioning', score,
        detail: `Speculators net ${net >= 0 ? 'long' : 'short'} ${Math.abs(Math.round(net * 100))}%${crowded ? ' — crowded, so leaning the other way' : ' — not crowded, neutral'}`});
    }
    const total = components.reduce((sum, c) => sum + WEIGHTS[c.key], 0);
    if (!components.length || total < 0.5) return {pair: pair.id, score: null, label: 'Not scored', coverage: total, components, reason: 'Not enough current inputs to score this pair.'};
    const score = Math.round(components.reduce((sum, c) => sum + c.score * WEIGHTS[c.key], 0) / total);
    const label = score >= 50 ? 'Strong bullish' : score >= 15 ? 'Bullish' : score <= -50 ? 'Strong bearish' : score <= -15 ? 'Bearish' : 'Neutral';
    return {pair: pair.id, score, label, coverage: Math.round(total * 100), components: components.map(c => ({...c, weight: Math.round(WEIGHTS[c.key] / total * 100)}))};
  }

  /* --- Today's story ------------------------------------------------------- */
  const bp = v => `${v >= 0 ? '+' : ''}${Math.round(v)} bp`;
  function composeStory({desk, banks = [], headlines = [], bias = [], now = Date.now()} = {}) {
    const lines = [], facts = [], sources = new Set();
    const us = curveView(desk?.curves?.US), live10 = desk?.liveUS?.quotes?.find(q => q.tenor === '10Y');
    let title = 'What is moving rates today';
    if (live10 && finite(live10.previousClose)) {
      const change = (live10.price - live10.previousClose) * 100;
      title = Math.abs(change) < 2 ? 'Rates are steady' : change > 0 ? 'Yields are climbing' : 'Yields are falling';
      lines.push(`The US 10-year yield is at ${live10.price.toFixed(2)}%, ${bp(change)} on the day.`);
      facts.push({label: 'US 10-year', value: `${live10.price.toFixed(2)}%`, note: bp(change) + ' today'}); sources.add(desk.liveUS.source);
    } else if (us && finite(us.tenYear)) {
      lines.push(`The US 10-year Treasury yield closed at ${us.tenYear.toFixed(2)}% on ${us.latestDate}.`);
      facts.push({label: 'US 10-year', value: `${us.tenYear.toFixed(2)}%`, note: 'close ' + us.latestDate}); sources.add(desk.curves.US.source);
    }
    if (us?.spread) {
      const shape = us.spread.bp < 0 ? 'inverted' : us.spread.bp < 25 ? 'nearly flat' : 'upward-sloping';
      const move = finite(us.spread.monthChangeBp) && Math.abs(us.spread.monthChangeBp) >= 5 ? `, ${us.spread.monthChangeBp > 0 ? 'steepening' : 'flattening'} ${Math.abs(us.spread.monthChangeBp)} bp over the past month` : '';
      lines.push(`The Treasury curve is ${shape} (${us.spread.label} ${bp(us.spread.bp)})${move}.`);
    }
    const gaps = ['EA', 'JP', 'GB'].map(a => [a, curveView(desk?.curves?.[a])]).filter(([, v]) => v && finite(v.tenYear) && us && finite(us.tenYear));
    if (gaps.length) lines.push('US 10-year yields sit ' + gaps.map(([a, v]) => `${bp((us.tenYear - v.tenYear) * 100)} over ${AREAS[a].short}`).join(', ') + '.');
    const upcoming = banks.map(b => ({b, next: nextDecision(b, now)})).filter(x => x.next).sort((a, c) => (a.next.at ?? Date.parse(a.next.date)) - (c.next.at ?? Date.parse(c.next.date)))[0];
    if (upcoming) {
      const odds = upcoming.b.area === 'US' && desk?.fed?.odds?.meeting === upcoming.next.date ? desk.fed.odds : null;
      const oddsText = odds ? ` Futures price ${odds.hold}% odds of no change${odds.cut + odds.cut50 ? `, ${Math.round(odds.cut + odds.cut50)}% of a cut` : ''}${odds.hike + odds.hike50 ? `, ${Math.round(odds.hike + odds.hike50)}% of a hike` : ''}.` : '';
      const when = upcoming.next.at ? new Date(upcoming.next.at).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : new Date(upcoming.next.date + 'T12:00:00Z').toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'});
      lines.push(`Next central bank decision: ${upcoming.b.name} on ${when}, ${upcoming.next.daysAway === 0 ? 'today' : `in ${upcoming.next.daysAway} day${upcoming.next.daysAway === 1 ? '' : 's'}`}.${oddsText}`);
      facts.push({label: 'Next decision', value: upcoming.b.short, note: when});
    }
    const soon = (desk?.events?.events || []).filter(e => Date.parse(e.time) >= now && Date.parse(e.time) < now + 2 * DAY && e.impact !== 'low').slice(0, 2);
    if (soon.length) { lines.push('Watch next: ' + soon.map(e => `${e.currency} ${e.title}`).join('; ') + '.'); sources.add(desk.events.source); }
    const ranked = bias.filter(b => finite(b.score)).sort((a, c) => Math.abs(c.score) - Math.abs(a.score));
    if (ranked[0] && Math.abs(ranked[0].score) >= 15) facts.push({label: 'Strongest bias', value: ranked[0].pair.replace(/^(...)(...)$/, '$1/$2'), note: `${ranked[0].label} ${ranked[0].score > 0 ? '+' : ''}${ranked[0].score}`});
    const lead = headlines.find(h => h.kind === 'headline');
    if (lead) sources.add(lead.source);
    return {title, lines, facts, lead: lead ? {title: lead.title, url: lead.url, source: lead.source, publishedAt: lead.publishedAt} : null, sources: [...sources].filter(Boolean), available: lines.length > 0};
  }

  function validateDesk(data) {
    if (!data || data.version !== 1 || !Number.isFinite(Date.parse(data.generatedAt)) || typeof data.curves !== 'object' || typeof data.status !== 'object') throw new Error('The Macro Desk snapshot is unavailable.');
    for (const curve of Object.values(data.curves)) {
      if (!Array.isArray(curve.history) || !curve.history.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.values && Object.values(r.values).every(finite))) throw new Error('A yield curve in the snapshot is invalid.');
    }
    return data;
  }

  return {AREAS, PAIRS, WEIGHTS, TENOR_YEARS, zonedToUTC, nextDecision, lastDecisionBefore, countdown, policyRate, curveView, yieldChange, smartBias, composeStory, validateDesk};
});
