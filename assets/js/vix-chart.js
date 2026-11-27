/* Source-verified Cboe VIX daily closes; never substitute estimates on a feed failure. */
(() => {
  'use strict';
  const root = document.getElementById('volWidget');
  const button = document.getElementById('retryVix');
  const range = document.getElementById('vixRange');
  const rangeControl = document.getElementById('vixRangeControl');
  const table = document.getElementById('vixObservationTable');
  const tableBody = document.getElementById('vixObservationRows');
  const tableCaption = document.getElementById('vixObservationCaption');
  if (!root || !button) return;

  const endpoint = 'https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketAnalytics?kind=vix';
  const svgNS = 'http://www.w3.org/2000/svg';
  let busy = false;
  let snapshot = null;
  let refreshFailed = false;

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    // An observation dated after the current UTC day cannot be a published daily close.
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value &&
      parsed.getTime() <= Date.now();
  }

  function verifiedRows(value, observationDate) {
    if (!Array.isArray(value) || value.length < 2 || value.length > 1000) {
      throw new Error('Missing VIX history');
    }
    const rows = value.map(row => {
      if (!row || !validDate(row.date) || typeof row.close !== 'number' ||
          !Number.isFinite(row.close) || row.close <= 0) {
        throw new Error('Invalid VIX observation');
      }
      return {date: row.date, close: row.close};
    }).sort((a, b) => a.date.localeCompare(b.date));
    if (rows.some((row, index) => index && row.date === rows[index - 1].date)) {
      throw new Error('Duplicate VIX dates');
    }
    // The advertised latest observation must agree with the verified daily rows.
    if (observationDate !== rows[rows.length - 1].date) throw new Error('Mismatched VIX source date');
    return rows.slice(-90);
  }

  function svgNode(name, attributes, content) {
    const node = document.createElementNS(svgNS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (content !== undefined) node.textContent = String(content);
    return node;
  }

  function note(message, kind = 'desc') {
    const element = document.createElement('p');
    element.className = kind;
    element.textContent = message;
    return element;
  }

  function render(data, availableRows) {
    const selected = Number(range?.value);
    const count = [20, 60, 90].includes(selected) ? selected : 90;
    const rows = availableRows.slice(-count);
    const values = rows.map(row => row.close);
    const min = Math.floor(Math.min(...values) - 1);
    const max = Math.ceil(Math.max(...values) + 1);
    const y = value => 300 - (value - min) / (max - min) * 260;
    const x = index => 60 + index / (rows.length - 1) * 600;
    const latest = rows[rows.length - 1];

    const headline = note('', '');
    headline.style.cssText = 'font-size:32px;font-weight:700;margin:16px 0';
    const close = document.createElement('strong');
    close.textContent = latest.close.toFixed(2);
    const date = document.createElement('span');
    date.style.cssText = 'font-size:14px;font-weight:400;margin-left:.5rem';
    date.textContent = `VIX · Daily close ${latest.date} (UTC)`;
    headline.append(close, date);

    const chart = svgNode('svg', {
      viewBox: '0 0 700 360', role: 'img',
      'aria-label': `Cboe VIX daily closing values, ${rows[0].date} to ${latest.date}, not live quotes`,
      style: 'width:100%;height:auto'
    });
    [min, (min + max) / 2, max].forEach(value => {
      chart.append(svgNode('line', {x1: 60, y1: y(value), x2: 660, y2: y(value), stroke: 'currentColor', opacity: '.12'}));
      chart.append(svgNode('text', {x: 8, y: y(value) + 5, fill: 'currentColor', 'font-size': 14}, value.toFixed(1)));
    });
    chart.append(svgNode('polyline', {
      fill: 'none', stroke: 'currentColor', 'stroke-width': 3,
      points: rows.map((row, index) => `${x(index)},${y(row.close)}`).join(' ')
    }));
    chart.append(svgNode('text', {x: 60, y: 340, fill: 'currentColor', 'font-size': 14}, rows[0].date));
    chart.append(svgNode('text', {x: 660, y: 340, 'text-anchor': 'end', fill: 'currentColor', 'font-size': 14}, latest.date));

    const fetchedAt = Date.parse(data.fetchedAt);
    const credibleRetrieval = typeof data.fetchedAt === 'string' && Number.isFinite(fetchedAt) &&
      fetchedAt <= Date.now() + 5 * 60 * 1000;
    const retrieved = credibleRetrieval ? ` · Retrieved ${new Date(fetchedAt).toLocaleString()}` : ' · Retrieval time unavailable';
    const stale = data.stale === true || Date.now() - Date.parse(`${latest.date}T00:00:00Z`) > 7 * 86400000;
    const status = note(`${stale ? 'Stale source · ' : ''}Latest source observation ${latest.date} (UTC)${retrieved}`);
    const low = rows.reduce((a, b) => a.close <= b.close ? a : b);
    const high = rows.reduce((a, b) => a.close >= b.close ? a : b);
    const change = Number((latest.close - rows[0].close).toFixed(2));
    const period = rows.length < count ? `${rows.length} of ${count} requested closes available` : `${rows.length} closes`;
    const details = note(`${period} · Low ${low.close.toFixed(2)} (${low.date}) · High ${high.close.toFixed(2)} (${high.date}) · First-to-last change ${change > 0 ? '+' : ''}${change.toFixed(2)} VIX points`);
    details.dataset.vixRangeSummary = 'true';
    root.replaceChildren(headline, chart, details, status);
    // The exact same validated slice backs the chart and the accessible data table.
    // Keep the disclosure outside the live region so refreshes do not announce 90 rows.
    if (table && tableBody && tableCaption) {
      const entries = rows.slice().reverse().map(row => {
        const tr = document.createElement('tr');
        const day = document.createElement('th');
        day.setAttribute('scope', 'row');
        day.textContent = row.date;
        const value = document.createElement('td');
        value.textContent = String(row.close);
        tr.append(day, value);
        return tr;
      });
      tableBody.replaceChildren(...entries);
      tableCaption.textContent = `Cboe VIX daily closes · ${period} · newest first`;
      table.hidden = false;
    }
  }

  function showRefreshWarning() {
    root.querySelector('[data-vix-retry-status]')?.remove();
    if (!refreshFailed) return;
    const warning = note('Update failed. Showing the last sourced daily observations, not a live quote. Retry to check for newer data.');
    warning.dataset.vixRetryStatus = 'true';
    warning.setAttribute('role', 'status');
    root.append(warning);
  }

  // Bound both the request and JSON body, including older WebViews that
  // lack AbortSignal.timeout (or AbortController entirely).
  async function fetchDailyObservations() {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    try {
      return await Promise.race([
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('VIX request timed out'));
            if (controller) controller.abort();
          }, 20000);
        }),
        (async () => {
          const response = await fetch(endpoint, controller ? {signal: controller.signal} : {});
          if (!response.ok) throw new Error('Feed unavailable');
          return response.json();
        })()
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function load() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    root.setAttribute('aria-busy', 'true');
    if (!snapshot) root.textContent = 'Loading Cboe VIX daily observations…';
    try {
      const data = await fetchDailyObservations();
      const valid = verifiedRows(data?.rows, data?.observationDate);
      render(data, valid);
      snapshot = {data, rows: valid};
      refreshFailed = false;
      if (rangeControl) rangeControl.hidden = false;
    } catch {
      if (snapshot) {
        refreshFailed = true;
        showRefreshWarning();
      } else {
        root.textContent = 'Cboe VIX observations are unavailable. Retry or open the official source below. No values are estimated.';
      }
    } finally {
      busy = false;
      button.disabled = false;
      root.removeAttribute('aria-busy');
    }
  }

  window.FynxVix = {load};
  button.addEventListener('click', load);
  range?.addEventListener('change', () => {
    if (!snapshot) return;
    render(snapshot.data, snapshot.rows);
    showRefreshWarning();
  });
  load();
})();