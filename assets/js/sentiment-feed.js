/* Daily observations from Alternative.me; source timestamps are UTC dates. */
(() => {
  const status = document.getElementById('sentimentStatus');
  const refresh = document.getElementById('sentimentRefresh');
  const rows = document.getElementById('sentimentHistory');
  const value = document.getElementById('sentimentValue');
  const classification = document.getElementById('sentimentClass');
  const meter = document.getElementById('sentimentMeter');
  let busy = false;

  function observation(item, now) {
    if (!item || typeof item !== 'object') return null;
    const raw = item.value;
    if (!(typeof raw === 'number' || typeof raw === 'string' && /^\d{1,3}$/.test(raw.trim()))) return null;
    const score = Number(raw);
    const seconds = Number(item.timestamp);
    const label = typeof item.value_classification === 'string' ? item.value_classification.trim() : '';
    if (!Number.isInteger(score) || score < 0 || score > 100 || !Number.isSafeInteger(seconds) || seconds <= 0 || !label) return null;
    const at = seconds * 1000;
    if (!Number.isFinite(at) || at > now + 300000) return null;
    return { score, label, at, date: new Date(at).toISOString().slice(0, 10) };
  }

  // Bound the entire response, including JSON decoding, even without newer abort APIs.
  async function fetchObservation() {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Sentiment feed timed out'));
          controller?.abort();
        }, 15000);
      });
      const request = (async () => {
        const response = await fetch('https://api.alternative.me/fng/?limit=7', controller ? { signal: controller.signal } : {});
        if (!response.ok) throw new Error('Feed unavailable');
        return response.json();
      })();
      return await Promise.race([request, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function load() {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    status.textContent = 'Checking the latest daily observation…';
    try {
      const payload = await fetchObservation();
      const now = Date.now();
      const data = Array.isArray(payload?.data) ? payload.data : [];
      const seen = new Set();
      const valid = data.map(item => observation(item, now)).filter(Boolean)
        .sort((a, b) => b.at - a.at)
        .filter(item => { if (seen.has(item.at)) return false; seen.add(item.at); return true; })
        .slice(0, 7);
      if (!valid.length) throw new Error('Invalid feed');

      const latest = valid[0];
      value.textContent = latest.score + ' / 100';
      classification.textContent = latest.label;
      meter.value = latest.score;
      status.textContent = 'Observation: ' + latest.date + ' UTC · Daily Bitcoin sentiment index' +
        (now - latest.at > 172800000 ? ' · Older observation; check the source for updates.' : '.');
      rows.replaceChildren();
      for (const item of valid) {
        const tr = document.createElement('tr');
        for (const entry of [item.date, String(item.score), item.label]) {
          const td = document.createElement('td');
          td.textContent = entry;
          tr.append(td);
        }
        rows.append(tr);
      }
    } catch (error) {
      window.FynxMonitor?.report('feed', 'sentiment-load', error);
      status.textContent = 'Daily sentiment feed is unavailable. Use the source link or try again. No estimated scores are displayed.';
      value.textContent = 'Unavailable';
      classification.textContent = '';
      rows.replaceChildren();
      meter.removeAttribute('value');
    } finally {
      busy = false;
      refresh.disabled = false;
    }
  }

  refresh.addEventListener('click', load);
  load();
})();
