/* FYNX Journal · Connect MT5. Reads the account-history report MetaTrader exports (MT5 or MT4
   HTML report, or a broker CSV) entirely in the browser, shows a preview, and saves the closed
   positions into the member's own journal. No broker password, investor password or server login
   is ever asked for, and the file never leaves the device: only the parsed trades are saved.
   Re-importing the same report updates the same trades (no duplicates). */
(function (root) {
  'use strict';
  const SESSIONS = ['Asia', 'London', 'Overlap', 'New York'];

  /* ---------- parsing helpers ---------- */
  const clean = s => String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  function num(v, decimalComma) {
    let s = clean(v).replace(/[^\d.,\-−]/g, '').replace('−', '-'); if (!s || s === '-') return null;
    const comma = s.includes(',') && !s.includes('.') && (decimalComma || /,\d{1,2}$/.test(s) || /^-?\d+,\d{4,}$/.test(s));
    s = comma ? s.replace(',', '.') : s.replace(/,/g, '');
    const n = Number(s); return Number.isFinite(n) ? n : null;
  }
  // "2026.11.10 14:32:05" / "2026-11-10 14:32" / "10/11/2026 14:32" → Date (report time, treated as UTC-like server time)
  function parseTime(v) {
    const s = clean(v); let m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
    m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
    const t = Date.parse(s); return Number.isFinite(t) ? new Date(t) : null;
  }
  const ymd = d => d.toISOString().slice(0, 10);
  // Session by the hour the position was opened (report/server time, typically GMT+2/+3 on MT5 servers).
  function sessionFor(d, offsetHours) {
    const h = (d.getUTCHours() - offsetHours + 24) % 24;
    if (h >= 12 && h < 16) return 'Overlap';
    if (h >= 7 && h < 12) return 'London';
    if (h >= 16 && h < 21) return 'New York';
    return 'Asia';
  }
  const side = v => { const s = clean(v).toLowerCase(); return /^buy/.test(s) ? 'buy' : /^sell/.test(s) ? 'sell' : null; };

  function tableRows(doc) {
    return [...doc.querySelectorAll('tr')].map(tr => [...tr.children].filter(td => !/hidden/.test(td.className || '') && td.style?.display !== 'none').flatMap(td => {
      const span = Math.max(1, Math.min(20, parseInt(td.getAttribute('colspan') || '1', 10) || 1));
      return [clean(td.textContent), ...Array(span - 1).fill('')];
    }));
  }
  function accountInfo(rows) {
    const info = {};
    for (const r of rows.slice(0, 40)) {
      const line = r.filter(Boolean).join(' ');
      let m = line.match(/Account:\s*([^\s(]+)(?:\s*\(([^)]*)\))?/i); if (m && !info.account) { info.account = m[1]; const parts = (m[2] || '').split(',').map(clean); info.currency = parts.find(p => /^[A-Z]{3}$/.test(p)) || ''; info.server = parts.find(p => /-|server/i.test(p)) || ''; }
      m = line.match(/Company:\s*(.+)$/i); if (m && !info.company) info.company = m[1];
      m = line.match(/Name:\s*(.+?)(?:\s+(?:Account|Currency|Leverage):|$)/i); if (m && !info.name) info.name = m[1];
      m = line.match(/Currency:\s*([A-Z]{3})\b/); if (m && !info.currency) info.currency = m[1];
    }
    return info;
  }

  /* MT5 "Trade History Report": section "Positions" with columns
     Time | Position | Symbol | Type | Volume | Price | S / L | T / P | Time | Price | Commission | Swap | Profit */
  function parseMT5(rows) {
    let section = '', header = null; const out = [];
    for (const r of rows) {
      const filled = r.filter(Boolean);
      if (filled.length === 1 && /^(Positions|Orders|Deals|Open Positions|Working Orders|Summary|Results)$/i.test(filled[0])) { section = filled[0].toLowerCase(); header = null; continue; }
      if (section !== 'positions') continue;
      if (!header) { if (r.some(c => /^symbol$/i.test(c)) && r.some(c => /^profit$/i.test(c))) header = r.map(c => c.toLowerCase()); continue; }
      const idx = (name, nth = 0) => { let k = -1; for (let i = 0; i <= nth; i++) k = header.indexOf(name, k + 1); return k; };
      const get = (name, nth) => { const i = idx(name, nth); return i >= 0 ? r[i] : ''; };
      const type = side(get('type')); if (!type) continue;
      const open = parseTime(get('time', 0)), close = parseTime(get('time', 1)); if (!open || !close) continue;
      out.push({position: get('position') || get('ticket'), symbol: get('symbol'), side: type, volume: num(get('volume')), openTime: open, closeTime: close,
        openPrice: num(get('price', 0)), closePrice: num(get('price', 1)), sl: num(get('s / l')), tp: num(get('t / p')),
        commission: num(get('commission')) || 0, swap: num(get('swap')) || 0, profit: num(get('profit'))});
    }
    return out;
  }
  /* MT4 "Statement": "Closed Transactions" with Ticket | Open Time | Type | Size | Item | Price | S / L | T / P | Close Time | Price | Commission | Taxes | Swap | Profit */
  function parseMT4(rows) {
    let on = false, header = null; const out = [];
    for (const r of rows) {
      const line = r.filter(Boolean).join(' ');
      if (/^Closed Transactions/i.test(line)) { on = true; header = null; continue; }
      if (/^(Open Trades|Working Orders|Summary)/i.test(line)) on = false;
      if (!on) continue;
      if (!header) { if (r.some(c => /^item$/i.test(c)) && r.some(c => /^profit$/i.test(c))) header = r.map(c => c.toLowerCase()); continue; }
      const at = (name, nth = 0) => { let k = -1; for (let i = 0; i <= nth; i++) k = header.indexOf(name, k + 1); return k >= 0 ? r[k] : ''; };
      const type = side(at('type')); if (!type) continue;
      const open = parseTime(at('open time')), close = parseTime(at('close time')); if (!open || !close) continue;
      out.push({position: at('ticket'), symbol: at('item'), side: type, volume: num(at('size')), openTime: open, closeTime: close,
        openPrice: num(at('price', 0)), closePrice: num(at('price', 1)), sl: num(at('s / l')), tp: num(at('t / p')),
        commission: (num(at('commission')) || 0) + (num(at('taxes')) || 0), swap: num(at('swap')) || 0, profit: num(at('profit'))});
    }
    return out;
  }
  /* Broker CSV with a header row. */
  function parseCSV(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim()); if (lines.length < 2) return [];
    const delim = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
    const split = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(clean); };
    const head = split(lines[0]).map(h => h.toLowerCase()), dc = delim === ';';
    const n = v => num(v, dc);
    const find = (...names) => { for (const n of names) { const i = head.findIndex(h => h === n || h.replace(/[^a-z]/g, '') === n.replace(/[^a-z]/g, '')); if (i >= 0) return i; } return -1; };
    const c = {pos: find('position', 'ticket', 'order', 'deal', 'id'), sym: find('symbol', 'item', 'instrument'), type: find('type', 'side', 'direction', 'action'), vol: find('volume', 'size', 'lots', 'quantity'),
      ot: find('open time', 'opentime', 'time open', 'open date', 'entry time', 'time'), ct: find('close time', 'closetime', 'time close', 'close date', 'exit time'),
      op: find('open price', 'openprice', 'entry price', 'price'), cp: find('close price', 'closeprice', 'exit price'), sl: find('s / l', 's/l', 'sl', 'stop loss'), tp: find('t / p', 't/p', 'tp', 'take profit'),
      com: find('commission', 'commissions', 'fee', 'fees'), swap: find('swap', 'swaps', 'rollover'), pro: find('profit', 'pnl', 'p/l', 'net profit', 'gain')};
    if (c.sym < 0 || c.pro < 0 || c.type < 0) return [];
    const out = [];
    for (const l of lines.slice(1)) {
      const r = split(l), t = side(r[c.type]); if (!t) continue;
      const open = parseTime(r[c.ot]), close = c.ct >= 0 ? parseTime(r[c.ct]) : open; if (!open || !close) continue;
      out.push({position: c.pos >= 0 ? r[c.pos] : '', symbol: r[c.sym], side: t, volume: n(r[c.vol]), openTime: open, closeTime: close,
        openPrice: n(r[c.op]), closePrice: c.cp >= 0 ? n(r[c.cp]) : null, sl: c.sl >= 0 ? n(r[c.sl]) : null, tp: c.tp >= 0 ? n(r[c.tp]) : null,
        commission: c.com >= 0 ? n(r[c.com]) || 0 : 0, swap: c.swap >= 0 ? n(r[c.swap]) || 0 : 0, profit: n(r[c.pro])});
    }
    return out;
  }

  function parseReport(text, fileName = '') {
    let positions = [], info = {}, format = '';
    if (/<(table|tr)\b/i.test(text)) {
      const doc = new DOMParser().parseFromString(text, 'text/html'), rows = tableRows(doc);
      info = accountInfo(rows);
      positions = parseMT5(rows); format = 'MT5 report';
      if (!positions.length) { positions = parseMT4(rows); format = 'MT4 statement'; }
    } else if (/\.(csv|txt)$/i.test(fileName) || /[,;\t]/.test(text.split('\n')[0] || '')) { positions = parseCSV(text); format = 'CSV'; }
    positions = positions.filter(p => p.symbol && Number.isFinite(p.profit));
    return {format, info, positions};
  }

  /* Journal rows: deterministic ids so a re-import updates instead of duplicating. */
  function toJournal(positions, info, offsetHours) {
    const acct = String(info.account || 'mt5').replace(/[^\w-]/g, '').slice(0, 24) || 'mt5';
    return positions.map((p, i) => {
      const key = String(p.position || '').replace(/[^\w-]/g, '').slice(0, 32) || (p.openTime.getTime().toString(36) + '-' + p.symbol.replace(/\W/g, '') + '-' + i);
      const net = +(p.profit + (p.commission || 0) + (p.swap || 0)).toFixed(2);
      const s = v => (v != null && Number.isFinite(v) && v > 0 ? String(v) : '');
      const notes = `Imported from ${info.company ? info.company + ' · ' : ''}MT5 account ${info.account || ''}`.trim() + ` · ${p.side === 'buy' ? 'Buy' : 'Sell'} ${p.volume ?? ''} lots${p.position ? ' · position #' + p.position : ''} · gross ${p.profit.toFixed(2)}, commission ${(p.commission || 0).toFixed(2)}, swap ${(p.swap || 0).toFixed(2)}`;
      return {id: `mt5-${acct}-${key}`.slice(0, 120), symbol: p.symbol.toUpperCase().slice(0, 24), date: ymd(p.closeTime), session: sessionFor(p.openTime, offsetHours),
        entry: s(p.openPrice), sl: s(p.sl), tp: s(p.tp), exit: s(p.closePrice), notes, pl: net, pnlSource: 'mt5-report', source: 'mt5',
        side: p.side, volume: p.volume ?? null, openTime: p.openTime.toISOString(), closeTime: p.closeTime.toISOString(),
        holdMinutes: Math.max(0, Math.round((p.closeTime - p.openTime) / 60000)), grossProfit: p.profit, commission: p.commission || 0, swap: p.swap || 0,
        account: String(info.account || ''), broker: String(info.company || ''), currency: String(info.currency || ''), position: String(p.position || '')};
    });
  }

  /* ---------- UI ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const money = (v, cur) => (v < 0 ? '−' : '') + (cur ? cur + ' ' : '') + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  let parsed = null;
  function render() {
    const box = document.getElementById('mt5Box'); if (!box || box.dataset.ready) return; box.dataset.ready = '1';
    box.innerHTML = `
      <div class="card mt5-card"><div class="hd"><div><b>Connect your MT5 account</b><small>Bring your real trade history into your journal, then get coaching from it.</small></div><div class="badge">Read-only</div></div>
      <div class="bd">
        <ol class="mt5-steps">
          <li><strong>In MetaTrader 5 (desktop, Windows or Mac)</strong> open <em>View → Toolbox</em> and the <em>History</em> tab. Right-click → choose the period (e.g. <em>All History</em>), then right-click again → <em>Report → HTML</em> and save the file.<span>MT4: <em>Account History</em> tab → right-click → <em>Save as Report</em>. Broker portal CSV statements also work.</span></li>
          <li><strong>Drop the file here.</strong> It’s read on your device. Only your closed trades are saved to your journal.</li>
          <li><strong>Review and import.</strong> Re-importing the same report later just updates those trades, so you can refresh any time.</li>
        </ol>
        <label class="mt5-drop" id="mt5Drop"><input type="file" id="mt5File" accept=".htm,.html,.csv,.txt,text/html,text/csv"><span class="mt5-drop-icon" aria-hidden="true">⇪</span><strong>Choose your MT5 report</strong><small>HTML report (.htm/.html) or CSV · up to 20 MB</small></label>
        <div class="mt5-opts"><label for="mt5Offset">Report time zone</label><select id="mt5Offset">${[-5,-4,0,1,2,3].map(o=>`<option value="${o}"${o===2?' selected':''}>Server time GMT${o>=0?'+':''}${o}${o===2?' (most MT5 brokers in winter)':o===3?' (most MT5 brokers in summer)':''}</option>`).join('')}</select><small>Used to place each trade in the right session (Asia, London, New York).</small></div>
        <p class="mt5-status" id="mt5Status" role="status" aria-live="polite"></p>
        <div id="mt5Preview"></div>
        <p class="mt5-safe">FYNX never asks for your broker password or investor password, and cannot place, change or close trades. Your trades are private to your FYNX account.</p>
      </div></div>`;
    const status = (t, kind) => { const s = document.getElementById('mt5Status'); s.textContent = t; s.dataset.kind = kind || ''; };
    const handle = async file => {
      if (!file) return; if (file.size > 20 * 1024 * 1024) return status('That file is larger than 20 MB. Export a shorter period.', 'error');
      status('Reading ' + file.name + '…');
      const buf = await file.arrayBuffer(); let text = new TextDecoder('utf-8').decode(buf);
      if (/\u0000/.test(text.slice(0, 200)) || (new Uint8Array(buf.slice(0, 2))[0] === 0xff)) text = new TextDecoder('utf-16le').decode(buf); // MT5 saves UTF-16 reports
      try { parsed = parseReport(text, file.name); } catch (e) { parsed = null; }
      if (!parsed || !parsed.positions.length) { document.getElementById('mt5Preview').innerHTML = ''; return status('No closed positions were found in this file. Export the History tab as Report → HTML (MT5) or Save as Report (MT4), and choose a period that includes trades.', 'error'); }
      preview(); status('');
    };
    const preview = () => {
      const off = Number(document.getElementById('mt5Offset').value), rows = toJournal(parsed.positions, parsed.info, off);
      const net = rows.reduce((a, r) => a + r.pl, 0), wins = rows.filter(r => r.pl > 0).length, cur = parsed.info.currency || '';
      const dates = rows.map(r => r.date).sort(), syms = [...new Set(rows.map(r => r.symbol))];
      const existing = new Set((root.FynxJournal?.trades() || []).map(t => t.id)), fresh = rows.filter(r => !existing.has(r.id)).length;
      document.getElementById('mt5Preview').innerHTML = `
        <div class="mt5-sum">
          <div><small>Account</small><b>${esc(parsed.info.account || '—')}</b><span>${esc([parsed.info.company, parsed.info.server].filter(Boolean).join(' · ') || parsed.format)}</span></div>
          <div><small>Closed trades</small><b>${rows.length}</b><span>${esc(dates[0])} → ${esc(dates.at(-1))}</span></div>
          <div><small>Net result</small><b class="${net >= 0 ? 'good' : 'bad'}">${esc(money(net, cur))}</b><span>after commission &amp; swap</span></div>
          <div><small>Win rate</small><b>${(wins / rows.length * 100).toFixed(1)}%</b><span>${syms.length} symbol${syms.length === 1 ? '' : 's'}</span></div>
        </div>
        <div class="mt5-table-wrap"><table class="mt5-table"><thead><tr><th>Closed</th><th>Symbol</th><th>Side</th><th>Lots</th><th>Session</th><th>Net</th></tr></thead><tbody>
          ${rows.slice(-8).reverse().map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.symbol)}</td><td>${r.side === 'buy' ? 'Buy' : 'Sell'}</td><td>${r.volume ?? '—'}</td><td>${esc(r.session)}</td><td class="${r.pl >= 0 ? 'good' : 'bad'}">${esc(money(r.pl, ''))}</td></tr>`).join('')}
        </tbody></table><small>Showing the latest ${Math.min(8, rows.length)} of ${rows.length}.</small></div>
        <div class="mt5-actions"><button type="button" class="mt5-import" id="mt5Import">Import ${rows.length} trade${rows.length === 1 ? '' : 's'} ${fresh < rows.length ? `(${fresh} new, ${rows.length - fresh} updated)` : ''}</button><button type="button" class="mt5-cancel" id="mt5Cancel">Cancel</button></div>`;
      document.getElementById('mt5Cancel').onclick = () => { parsed = null; document.getElementById('mt5Preview').innerHTML = ''; document.getElementById('mt5File').value = ''; status(''); };
      document.getElementById('mt5Import').onclick = async e => {
        const btn = e.currentTarget; if (!root.FynxJournal?.uid()) { status('Sign in to save these trades to your journal. Nothing has been saved.', 'error'); root.FynxAuth?.open('login'); return; }
        btn.disabled = true; btn.textContent = 'Importing…';
        try { const n = await root.FynxJournal.importTrades(rows, (d, t) => status(`Saved ${d} of ${t}…`)); status(`Imported ${n} trades from MT5. Your dashboard, analytics and Trading Coach now use them.`, 'ok'); btn.textContent = 'Imported ✓';
          const go = document.createElement('button'); go.type = 'button'; go.className = 'mt5-import'; go.textContent = 'Open Trading Coach →'; go.onclick = () => root.FynxJournal.open('coach'); btn.after(go);
        } catch (err) { btn.disabled = false; btn.textContent = 'Try again'; status(navigator.onLine ? 'We couldn’t save the trades. ' + (err?.message || '') : 'You’re offline. Reconnect and try again.', 'error'); }
      };
    };
    document.getElementById('mt5File').addEventListener('change', e => handle(e.target.files[0]));
    document.getElementById('mt5Offset').addEventListener('change', () => parsed && preview());
    const drop = document.getElementById('mt5Drop');
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => handle(e.dataTransfer.files[0]));
  }
  const api = {parseReport, toJournal, render, _num: num, _time: parseTime, sessions: SESSIONS};
  root.FynxJournalMT5 = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
