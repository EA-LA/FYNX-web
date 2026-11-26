/* FYNX Terminal tick highlighting (Market Data Display).
 * When a value that came from a real feed changes, its own cell flashes: green when the new value is above the
 * previous valid value, red when below, amber for a neutral update (newly published or non-directional data).
 * Unchanged, missing, invalid, stale or out-of-order values never flash.
 *
 * Three layers:
 *  1. Tracker (pure, no DOM): remembers the last valid value per key ("px:AAPL", "chg:AAPL", "bid:BTC-USD"...)
 *     and records a tick event when a newer value differs at display precision.
 *  2. Painter: cells carry data-tick="<key>" (and data-tick-v="<value shown>"). Panels re-render by replacing
 *     their DOM, so a MutationObserver paints any newly inserted cell whose key ticked within the highlight
 *     window, continuing the flash from where it was. A cell rendered later than that (desk switch, page
 *     open, remount) does not flash. Persistent cells (streamed order books) call FynxTick.update().
 *     Cells marked data-tick-live update their own text in place, so full pages stay current without redraws.
 *  3. Settings: Market Data Display preferences in the Terminal's own storage (fx-term-*), plus the
 *     SETTINGS page.
 * Flashes are CSS animations of two registered custom properties (see terminal-all.css) painted as a
 * background overlay and/or text colour, so there are no per-cell timers and no layout changes. */
(function (root) {
  'use strict';
  const COLORS = Object.freeze({up: '#00C853', down: '#FF3347', neutral: '#FFB800'});
  const RGB = {up: [0, 200, 83], down: [255, 51, 71], neutral: [255, 184, 0]};
  const DURATIONS = Object.freeze([300, 500, 650, 1000]);
  const INTENSITIES = Object.freeze(['subtle', 'standard', 'strong']);
  const STYLES = Object.freeze(['background', 'text', 'both']);
  const DEFAULTS = Object.freeze({enabled: true, duration: 650, intensity: 'standard', style: 'background', neutral: true});
  const STORE_KEY = 'fx-term-market-display';
  // Background tint per intensity; "strong" is a solid block with black text, Bloomberg style.
  const BG_ALPHA = {background: {subtle: 0.18, standard: 0.32, strong: 1}, both: {subtle: 0.12, standard: 0.2, strong: 1}};

  /* ---------- values ---------- */
  function toNumber(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const t = v.trim().replace(/[−–]/g, '-').replace(/[,$%\s]/g, '').replace(/^\+/, '');
    if (!/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  function neutralValue(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t && t !== '—' && t !== '-' ? t : null;
  }
  function toTime(ts) {
    if (ts === null || ts === undefined || ts === '') return null;
    const n = typeof ts === 'number' ? ts : Date.parse(ts);
    return Number.isFinite(n) ? n : null;
  }
  function roundTo(v, digits) {
    if (typeof v !== 'number' || !Number.isInteger(digits)) return v;
    const f = 10 ** Math.max(0, Math.min(10, digits));
    return Math.round(v * f) / f;
  }
  function same(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
    return a === b;
  }

  /* ---------- 1. tracker ---------- */
  function createTracker({now = () => Date.now()} = {}) {
    const state = new Map();
    let seq = 0;
    /* ingest(key, value, {ts, src, digits, neutral, silent, track}) → 'up' | 'down' | 'neutral' | null
     *  ts      data timestamp; an older ts than the last accepted one is stale and ignored
     *  src     source label; a change of source (snapshot → live feed) re-baselines without a flash
     *  digits  display precision: changes invisible at this precision are not ticks
     *  neutral non-directional field: any change is a neutral update
     *  silent  record the value as the new baseline without a tick (initial load, catch-up refresh)
     *  track   remember a missing value, so its later first publication is a neutral update */
    function ingest(key, value, o = {}) {
      key = String(key || '');
      if (!key) return null;
      const cur = state.get(key), ts = toTime(o.ts), src = o.src === undefined || o.src === null ? null : String(o.src);
      let v = o.neutral ? neutralValue(value) : toNumber(value);
      if (v !== null && !o.neutral) v = roundTo(v, o.digits);
      if (v === null) {
        // Missing or invalid: keep the last valid value so the next valid one is compared with it.
        if (!cur && o.track) state.set(key, {v: null, ts, src, d: o.digits, dir: null, at: 0, seq: 0, prev: null});
        return null;
      }
      if (!cur) { state.set(key, {v, ts, src, d: o.digits, dir: null, at: 0, seq: 0, prev: null}); return null; }
      if (src !== null && cur.src !== null && src !== cur.src) { Object.assign(cur, {v, ts, src, d: o.digits}); return null; }
      if (ts !== null && cur.ts !== null && ts < cur.ts) return null;
      const wasMissing = cur.v === null;
      if (ts !== null) cur.ts = ts;
      if (src !== null) cur.src = src;
      cur.d = o.digits;
      if (!wasMissing && same(v, cur.v)) return null;
      const prev = cur.v; cur.v = v;
      if (o.silent) return null;
      const dir = wasMissing || o.neutral || typeof v !== 'number' || typeof prev !== 'number' ? 'neutral' : v > prev ? 'up' : 'down';
      cur.dir = dir; cur.at = now(); cur.seq = ++seq; cur.prev = prev;
      return dir;
    }
    // The tick still inside its highlight window, if any.
    function active(key, duration) {
      const s = state.get(String(key || ''));
      if (!s || !s.dir) return null;
      const elapsed = now() - s.at;
      return elapsed >= 0 && elapsed < duration ? {dir: s.dir, elapsed, seq: s.seq, value: s.v, digits: s.d} : null;
    }
    const get = key => { const s = state.get(String(key || '')); return s ? {...s} : null; };
    return {ingest, active, get, has: key => state.has(String(key || '')), size: () => state.size, clear: () => state.clear()};
  }

  /* ---------- 3. settings ---------- */
  function normalizeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULTS.enabled,
      duration: DURATIONS.includes(Number(r.duration)) ? Number(r.duration) : DEFAULTS.duration,
      intensity: INTENSITIES.includes(r.intensity) ? r.intensity : DEFAULTS.intensity,
      style: STYLES.includes(r.style) ? r.style : DEFAULTS.style,
      neutral: typeof r.neutral === 'boolean' ? r.neutral : DEFAULTS.neutral
    };
  }
  const storage = {
    read() { try { return normalizeSettings(JSON.parse(root.localStorage?.getItem(STORE_KEY) || 'null')); } catch { return normalizeSettings(null); } },
    write(s) { try { root.localStorage?.setItem(STORE_KEY, JSON.stringify(s)); return true; } catch { return false; } }
  };
  // What a flash looks like for a direction under the current settings (pure; used by the painter and tests).
  function flashSpec(dir, settings) {
    const s = normalizeSettings(settings), rgb = RGB[dir];
    if (!rgb || !s.enabled || (dir === 'neutral' && !s.neutral)) return null;
    const alpha = BG_ALPHA[s.style]?.[s.intensity];
    const bg = alpha === undefined ? null : `rgba(${rgb.join(',')},${alpha})`;
    const fg = s.intensity === 'strong' && s.style !== 'text' ? '#000000' : s.style === 'background' ? null : COLORS[dir];
    return {bg, fg, duration: s.duration};
  }

  /* ---------- 2. painter ---------- */
  const doc = root.document;
  const tracker = createTracker({now: () => (root.performance?.now ? root.performance.now() : Date.now())});
  let settings = storage.read();
  let lastCommit = -Infinity;
  const live = new Map(); // key → Set of cells that update their own text in place
  const reduced = () => { try { return !!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const nowMs = () => (root.performance?.now ? root.performance.now() : Date.now());

  const TK_CLASSES = ['fx-tk-b', 'fx-tk-f', 'fx-tk-1', 'fx-tk-2'];
  function clean(node) { node.classList.remove(...TK_CLASSES); delete node.dataset.tickDir; }
  function onEnd(e) { if (e.target === e.currentTarget && /^fxtk[12]$/.test(e.animationName)) clean(e.currentTarget); }
  /* One CSS animation per flash (keyframes fxtk1/fxtk2 in terminal-all.css). Alternating the two names restarts
   * a running flash without forcing layout; a negative delay continues a flash on a re-rendered cell. The
   * classes come off on animationend, so nothing is left behind and no timer is needed. */
  function flash(node, dir, elapsed = 0) {
    if (!node || node.nodeType !== 1) return false;
    const spec = flashSpec(dir, settings);
    if (!spec || elapsed >= spec.duration) return false;
    const running = node.classList.contains('fx-tk-1') ? 1 : node.classList.contains('fx-tk-2') ? 2 : 0;
    // The colour to fade back to is the cell's own (tone classes keep working); read it before flashing.
    if (spec.fg && !running) { try { node.__fxTickColor = root.getComputedStyle(node).color || ''; } catch { node.__fxTickColor = ''; } }
    node.classList.remove(...TK_CLASSES);
    const st = node.style;
    st.setProperty('--fx-tk-bg0', spec.bg || 'rgba(0,0,0,0)');
    st.setProperty('--fx-tk-fg0', spec.fg || 'currentcolor');
    st.setProperty('--fx-tk-fg1', node.__fxTickColor || 'currentcolor');
    st.setProperty('--fx-tk-dur', spec.duration + 'ms');
    st.setProperty('--fx-tk-delay', (elapsed > 0 ? -Math.round(elapsed) : 0) + 'ms');
    if (spec.bg) node.classList.add('fx-tk-b');
    if (spec.fg) node.classList.add('fx-tk-f');
    node.classList.add(running === 1 ? 'fx-tk-2' : 'fx-tk-1');
    node.dataset.tickDir = dir;
    if (!node.__fxTickEnd) { node.__fxTickEnd = true; node.addEventListener('animationend', onEnd); node.addEventListener('animationcancel', onEnd); }
    return true;
  }
  function matches(node, a) {
    const raw = node.dataset.tickV;
    if (raw === undefined) return true;
    if (typeof a.value !== 'number') return String(a.value) === raw.trim();
    const n = toNumber(raw);
    return n !== null && same(roundTo(n, a.digits), a.value);
  }
  function paintNode(node) {
    const key = node.dataset.tick;
    if (!key) return;
    if (node.dataset.tickLive) addLive(key, node);
    const a = tracker.active(key, settings.duration);
    if (!a || node.__fxTickSeq === a.seq || !matches(node, a)) return;
    node.__fxTickSeq = a.seq;
    flash(node, a.dir, a.elapsed);
  }
  function paint(scope) {
    if (!scope || scope.nodeType !== 1) return;
    if (scope.dataset?.tick) paintNode(scope);
    if (scope.firstElementChild) scope.querySelectorAll('[data-tick]').forEach(paintNode);
  }
  function addLive(key, node) { let set = live.get(key); if (!set) live.set(key, set = new Set()); set.add(node); }
  function pruneLive() { for (const [key, set] of live) { for (const n of set) if (!n.isConnected) set.delete(n); if (!set.size) live.delete(key); } }
  const formatNumber = (v, d) => v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
  function renderLive(node, value) {
    const kind = node.dataset.tickLive, d = Number.isInteger(Number(node.dataset.tickD)) ? Number(node.dataset.tickD) : 2;
    if (typeof value !== 'number') return;
    if (kind === 'pct') {
      node.textContent = `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(d)}%`;
      node.classList.remove('fx-up', 'fx-down', 'fx-flat', 'up', 'dn');
      node.classList.add(Math.abs(value) < 1e-9 ? 'fx-flat' : value > 0 ? 'fx-up' : 'fx-down');
    } else node.textContent = formatNumber(value, d);
    node.dataset.tickV = String(value);
  }
  function notifyLive(key) {
    const set = live.get(key);
    if (!set) return;
    const a = tracker.active(key, Infinity);
    for (const node of set) {
      if (!node.isConnected) { set.delete(node); continue; }
      if (!a) continue;
      renderLive(node, a.value);
      node.__fxTickSeq = a.seq;
      flash(node, a.dir, 0);
    }
  }

  /* ---------- public API ---------- */
  // Feed-side: record a value that just arrived from a data source.
  function ingest(key, value, o = {}) {
    const dir = tracker.ingest(key, value, o);
    if (dir) notifyLive(String(key));
    return dir;
  }
  // A feed finished a batch. Modules that draw derived values (portfolio totals) listen for fynx:ticks to redraw.
  function commit({silent = false} = {}) {
    pruneLive();
    if (silent) return;
    lastCommit = nowMs();
    try { root.dispatchEvent(new root.CustomEvent('fynx:ticks')); } catch {}
  }
  // Render-side observation for values only computed while drawing (portfolio totals): ticks only when the
  // drawing follows a real data batch closely, so ordinary redraws and remounts never flash.
  const OBSERVE_WINDOW = 2500;
  function observe(key, value, o = {}) { return ingest(key, value, {...o, silent: o.silent || nowMs() - lastCommit > OBSERVE_WINDOW}); }
  // Tag a cell; the painter flashes it if its key ticked moments ago.
  function mark(node, key, value, o = {}) {
    if (!node || node.nodeType !== 1 || !key) return node;
    node.dataset.tick = key;
    if (value !== undefined && value !== null && value !== '') node.dataset.tickV = String(value); else delete node.dataset.tickV;
    if (o.live) { node.dataset.tickLive = o.live; if (Number.isInteger(o.digits)) node.dataset.tickD = String(o.digits); }
    if (node.isConnected) paintNode(node);
    return node;
  }
  // Persistent cells (text updated in place): record and flash in one step.
  function update(node, key, value, o = {}) {
    const dir = tracker.ingest(key, value, o);
    if (node && node.nodeType === 1) {
      node.dataset.tick = key;
      if (dir) { const a = tracker.active(key, Infinity); node.__fxTickSeq = a?.seq; node.dataset.tickV = String(a?.value ?? value); flash(node, dir, 0); }
    }
    if (dir) notifyLive(String(key));
    return dir;
  }
  function setSettings(patch) {
    settings = normalizeSettings({...settings, ...(patch || {})});
    storage.write(settings);
    if (!settings.enabled) doc?.querySelectorAll?.('.fx-tk-1,.fx-tk-2').forEach(clean);
    try { root.dispatchEvent(new root.CustomEvent('fynx:market-display', {detail: {...settings}})); } catch {}
    return {...settings};
  }

  if (doc && typeof root.MutationObserver === 'function') {
    const start = () => {
      const target = doc.body || doc.documentElement;
      new root.MutationObserver(list => {
        if (!settings.enabled) return;
        for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) paint(n);
      }).observe(target, {childList: true, subtree: true});
    };
    if (doc.body) start(); else doc.addEventListener('DOMContentLoaded', start, {once: true});
  }
  // Another tab changed the preference.
  try { root.addEventListener?.('storage', e => { if (e.key === STORE_KEY) settings = storage.read(); }); } catch {}

  const api = {COLORS, DEFAULTS, DURATIONS, INTENSITIES, STYLES, STORE_KEY,
    createTracker, normalizeSettings, flashSpec, toNumber,
    ingest, commit, observe, mark, update, flash, paint,
    settings: () => ({...settings}), setSettings, tracker,
    // Settings in the shape the sandboxed Build Your Own widgets understand.
    sandboxSettings: () => ({...settings, reducedMotion: reduced()})};
  root.FynxTick = api;

  /* ---------- SETTINGS page: Market Data Display ---------- */
  (root.FynxTerminalPlugins = root.FynxTerminalPlugins || []).push((T, PG) => {
    if (!PG || !PG.add) return;
    const {el, btn} = T;
    const LABEL = {subtle: 'Subtle', standard: 'Standard', strong: 'Strong', background: 'Background', text: 'Text', both: 'Background + Text'};
    function group(title, note, items, current, pick) {
      const row = el('div', 'fx-mdd-row'), head = el('div', 'fx-mdd-label');
      head.append(el('b', '', title), el('small', '', note));
      const opts = el('div', 'pg-tabs fx-mdd-opts'); opts.setAttribute('role', 'group'); opts.setAttribute('aria-label', title);
      for (const [value, label] of items) { const b = btn(label, value === current ? 'on' : '', () => pick(value)); b.setAttribute('aria-pressed', String(value === current)); opts.append(b); }
      row.append(head, opts);
      return row;
    }
    function render(host) {
      PG.setHead('SET', 'Settings', 'Terminal preferences on this device');
      const s = api.settings(), set = patch => { api.setSettings(patch); PG.rerender(); };
      const sec = PG.section('Market Data Display');
      sec.append(el('p', 'pg-lead', 'When a price or other market value changes, its cell flashes for a moment: green when the new value is higher than the last one, red when it is lower, amber for a neutral update such as newly published data. Unchanged values never flash. Tick colour is separate from the day’s change, so a stock down on the day still flashes green when its latest price rises.'));
      const onOff = [[true, 'On'], [false, 'Off']];
      sec.append(
        group('Live Tick Highlighting', 'Flash a cell when its value changes', onOff, s.enabled, v => set({enabled: v})),
        group('Highlight Duration', 'How long a flash takes to fade', DURATIONS.map(d => [d, d + 'ms']), s.duration, v => set({duration: v})),
        group('Highlight Intensity', 'Strong uses a solid block with black text', INTENSITIES.map(k => [k, LABEL[k]]), s.intensity, v => set({intensity: v})),
        group('Highlight Style', 'What changes colour during a flash', STYLES.map(k => [k, LABEL[k]]), s.style, v => set({style: v})),
        group('Neutral Update Highlighting', 'Amber for newly published or non-directional updates', onOff, s.neutral, v => set({neutral: v})));
      const key = el('div', 'fx-mdd-key');
      for (const [dir, label] of [['up', 'Higher than the previous value'], ['down', 'Lower than the previous value'], ['neutral', 'Neutral update']]) {
        const item = el('span', 'fx-mdd-swatch'), chip = el('i'), spec = flashSpec(dir, {...s, enabled: true, neutral: true});
        if (spec.bg) chip.style.background = spec.bg; else chip.style.background = 'transparent';
        chip.style.color = spec.fg || 'inherit'; chip.textContent = '123.45'; chip.setAttribute('aria-hidden', 'true');
        item.append(chip, el('small', '', label)); key.append(item);
      }
      sec.append(key);
      sec.append(PG.sourceNote('Highlights follow the terminal’s existing feeds only and never imply real-time data: delayed quotes and snapshots stay labelled as delayed, closed markets simply stop flashing, and heat maps keep their day-change colours. Your system’s reduce-motion setting turns the fade into a brief on/off highlight. Saved in this browser with your other terminal preferences.'));
      sec.append(el('div', 'fx-chips'));
      sec.lastChild.append(btn('Restore defaults', 'fx-chip fx-chip-link', () => set({...DEFAULTS})));
      host.append(sec);
    }
    PG.add('settings', 'Settings', render);
    if (Array.isArray(T.PAGE_NAMES) && !T.PAGE_NAMES.includes('SETTINGS')) T.PAGE_NAMES.push('SETTINGS');
    if (Array.isArray(T.KEYS) && !T.KEYS.some(k => k[2] === 'settings')) T.KEYS.push(['SET', 'Settings', 'settings']);
  });
})(typeof window !== 'undefined' ? window : globalThis);
