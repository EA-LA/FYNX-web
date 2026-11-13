/* FYNX Journal · Trading Coach. Every number here is computed from the member's own journal
   trades (manual entries and MT5 imports). Nothing is estimated or invented: an insight only
   appears when there are enough trades behind it, and each one shows its sample size. */
(function (root) {
  'use strict';
  const MIN = 5; // minimum trades in a bucket before we compare it
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const fmt = v => (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const pct = v => (v * 100).toFixed(0) + '%';
  const mins = m => m < 60 ? Math.round(m) + ' min' : m < 1440 ? (m / 60).toFixed(1) + ' h' : (m / 1440).toFixed(1) + ' days';

  function stats(list) {
    const n = list.length, wins = list.filter(t => t.pl > 0), losses = list.filter(t => t.pl < 0);
    const gw = wins.reduce((a, t) => a + t.pl, 0), gl = -losses.reduce((a, t) => a + t.pl, 0), net = gw - gl;
    return {n, wins: wins.length, losses: losses.length, net, winRate: n ? wins.length / n : 0, pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0),
      avgWin: wins.length ? gw / wins.length : 0, avgLoss: losses.length ? gl / losses.length : 0, exp: n ? net / n : 0};
  }
  function groupBy(list, key) { const m = new Map(); for (const t of list) { const k = key(t); if (k == null || k === '') continue; if (!m.has(k)) m.set(k, []); m.get(k).push(t); } return m; }
  const time = t => { const v = t.closeTime || t.openTime; if (v) { const d = new Date(v); if (!isNaN(d)) return d; } return t.date ? new Date(t.date + 'T12:00:00') : null; };
  const openT = t => (t.openTime ? new Date(t.openTime) : null);

  function analyze(raw) {
    const trades = (raw || []).filter(t => Number.isFinite(Number(t.pl))).map(t => ({...t, pl: Number(t.pl)})).sort((a, b) => (time(a) || 0) - (time(b) || 0));
    const all = stats(trades), out = {all, trades, insights: [], strengths: []};
    if (trades.length < MIN) return out;
    const add = (tone, title, detail, advice, sample) => out.insights.push({tone, title, detail, advice, sample});
    const good = (title, detail, sample) => out.strengths.push({title, detail, sample});

    // Edge overview
    if (all.losses && all.wins) {
      const payoff = all.avgWin / all.avgLoss, breakeven = 1 / (1 + payoff);
      if (all.exp < 0) add('bad', 'Your current approach loses money per trade', `Expectancy is ${fmt(all.exp)} per trade: you win ${pct(all.winRate)} of trades and the average win is ${payoff.toFixed(2)}× the average loss. At that payoff you need a ${pct(breakeven)} win rate just to break even.`,
        payoff < 1 ? 'Your losers are bigger than your winners. Set a fixed stop before entry and only take trades where the target is at least as far as the stop.' : 'Your payoff is fine but you lose too often. Cut the setups, symbols and sessions that show up as weak below and trade only your best ones for the next 20 trades.', all.n);
      else good('Positive expectancy', `You make ${fmt(all.exp)} per trade on average (profit factor ${Number.isFinite(all.pf) ? all.pf.toFixed(2) : '∞'}).`, all.n);
    }
    // Biggest loss vs average win
    const worst = trades.reduce((a, t) => (t.pl < a.pl ? t : a), trades[0]);
    if (worst.pl < 0 && all.avgWin > 0 && -worst.pl >= 3 * all.avgWin)
      add('bad', 'One loss is wiping out many wins', `Your largest loss (${fmt(worst.pl)} on ${esc(worst.symbol)}, ${esc(worst.date)}) equals ${(-worst.pl / all.avgWin).toFixed(1)} average winning trades.`, 'Decide your maximum loss per trade (many traders use 0.5–1% of the account) and place the stop the moment you enter. Never move a stop further away.', 1);

    // Symbols
    const bySym = [...groupBy(trades, t => (t.symbol || '').toUpperCase())].map(([k, l]) => ({k, ...stats(l)})).filter(s => s.n >= MIN);
    if (bySym.length >= 2) {
      bySym.sort((a, b) => b.net - a.net); const best = bySym[0], low = bySym.at(-1);
      if (best.net > 0) good(`${best.k} is your best market`, `${fmt(best.net)} net over ${best.n} trades, ${pct(best.winRate)} win rate.`, best.n);
      if (low.net < 0) add('warn', `${low.k} is costing you`, `${fmt(low.net)} net over ${low.n} trades with a ${pct(low.winRate)} win rate${best.net > 0 ? `, while ${best.k} made ${fmt(best.net)}` : ''}.`, `Pause ${low.k} for your next 20 trades, or trade it with half size until your journal shows a positive result there.`, low.n);
    }
    // Sessions
    const bySes = [...groupBy(trades, t => t.session)].map(([k, l]) => ({k, ...stats(l)})).filter(s => s.n >= MIN);
    if (bySes.length >= 2) {
      bySes.sort((a, b) => b.exp - a.exp); const best = bySes[0], low = bySes.at(-1);
      if (low.exp < 0 && best.exp > 0) add('warn', `You trade best in ${best.k}, worst in ${low.k}`, `${best.k}: ${fmt(best.exp)} per trade over ${best.n} trades. ${low.k}: ${fmt(low.exp)} per trade over ${low.n} trades.`, `Concentrate your trading in the ${best.k} session and stay flat during ${low.k} unless you have a clear plan for it.`, best.n + low.n);
      else if (best.exp > 0) good(`${best.k} session works for you`, `${fmt(best.exp)} per trade over ${best.n} trades.`, best.n);
    }
    // Weekdays
    const byDay = [...groupBy(trades, t => { const d = time(t); return d ? DAYS[d.getDay()] : null; })].map(([k, l]) => ({k, ...stats(l)})).filter(s => s.n >= MIN);
    if (byDay.length >= 3) { byDay.sort((a, b) => a.net - b.net); const low = byDay[0];
      if (low.net < 0 && low.net < -0.25 * Math.abs(all.net || 1)) add('warn', `${low.k} is your weakest day`, `${fmt(low.net)} net on ${low.k}s over ${low.n} trades (${pct(low.winRate)} wins).`, `Review your ${low.k} trades in the calendar. If they share a pattern (news days, Monday gaps, Friday fatigue), trade lighter or skip that day.`, low.n); }

    // Holding time: disposition effect (cut winners early, let losers run)
    const timed = trades.filter(t => Number.isFinite(t.holdMinutes) || (t.openTime && t.closeTime)).map(t => ({...t, hold: Number.isFinite(t.holdMinutes) ? t.holdMinutes : (new Date(t.closeTime) - new Date(t.openTime)) / 60000}));
    const hw = timed.filter(t => t.pl > 0), hl = timed.filter(t => t.pl < 0);
    if (hw.length >= MIN && hl.length >= MIN) {
      const med = a => { const s = a.map(t => t.hold).sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
      const mw = med(hw), ml = med(hl);
      if (ml > mw * 1.5 && ml - mw > 5) add('bad', 'You hold losers longer than winners', `Typical losing trade is held ${mins(ml)}, typical winner only ${mins(mw)}. This is the classic "take profits fast, hope on losers" pattern.`, 'Let the stop decide when a loser ends, not hope. For winners, try taking half off at your first target and trailing the rest instead of closing everything early.', hw.length + hl.length);
      else if (mw >= ml) good('You let winners run', `Typical winner is held ${mins(mw)} vs ${mins(ml)} for losers.`, hw.length + hl.length);
    }
    // Revenge trading: a new trade opened within 15 minutes of closing a loss
    const seq = trades.filter(t => t.openTime && t.closeTime).sort((a, b) => new Date(a.openTime) - new Date(b.openTime));
    if (seq.length >= 10) {
      const after = [];
      for (let i = 1; i < seq.length; i++) {
        const prev = seq.slice(0, i).filter(p => new Date(p.closeTime) <= new Date(seq[i].openTime)).sort((a, b) => new Date(b.closeTime) - new Date(a.closeTime))[0];
        if (prev && prev.pl < 0 && (new Date(seq[i].openTime) - new Date(prev.closeTime)) / 60000 <= 15) after.push({t: seq[i], prev});
      }
      if (after.length >= 3) {
        const s = stats(after.map(a => a.t)), bigger = after.filter(a => Number(a.t.volume) > Number(a.prev.volume)).length;
        if (s.exp < all.exp) add('bad', 'Quick re-entries after a loss are hurting you', `${after.length} trades were opened within 15 minutes of a losing trade. They averaged ${fmt(s.exp)} per trade vs ${fmt(all.exp)} overall${bigger ? `, and ${bigger} of them used a bigger size than the loss before` : ''}.`, 'After any loss, step away for at least 15 minutes before the next entry. If you hit two losses in a row, stop for the session.', after.length);
      }
    }
    // Size up after losses (needs volume)
    const withVol = seq.filter(t => Number(t.volume) > 0);
    if (withVol.length >= 10) {
      let up = 0, base = 0;
      for (let i = 1; i < withVol.length; i++) if (withVol[i - 1].pl < 0) { base++; if (Number(withVol[i].volume) > Number(withVol[i - 1].volume) * 1.2) up++; }
      if (base >= MIN && up / base >= 0.3) add('warn', 'You increase size after losses', `After ${base} losing trades, you raised your lot size on the next trade ${up} times (${pct(up / base)}).`, 'Keep the same risk per trade no matter what the last result was. Trying to win it back quickly is how small drawdowns become big ones.', base);
    }
    // Overtrading: days with far more trades than usual
    const byDate = [...groupBy(trades, t => t.date)].map(([k, l]) => ({k, ...stats(l)}));
    if (byDate.length >= 8) {
      const counts = byDate.map(d => d.n).sort((a, b) => a - b), typical = counts[Math.floor(counts.length / 2)], limit = Math.max(typical * 2, typical + 3);
      const heavy = byDate.filter(d => d.n >= limit), normal = byDate.filter(d => d.n < limit);
      if (heavy.length >= 2) {
        const hn = heavy.reduce((a, d) => a + d.net, 0) / heavy.length, nn = normal.reduce((a, d) => a + d.net, 0) / Math.max(1, normal.length);
        if (hn < nn) add('warn', 'Busy days are your worst days', `On ${heavy.length} days you took ${limit}+ trades (your usual is ${typical}). Those days averaged ${fmt(hn)} vs ${fmt(nn)} on normal days.`, `Set a daily cap of ${Math.max(2, typical + 1)} trades. When you hit it, you are done for the day.`, heavy.reduce((a, d) => a + d.n, 0));
      }
    }
    // Stop-loss discipline
    const noSL = trades.filter(t => !String(t.sl || '').trim() || Number(t.sl) === 0), withSL = trades.filter(t => String(t.sl || '').trim() && Number(t.sl) !== 0);
    if (noSL.length >= MIN && noSL.length / trades.length >= 0.2) {
      const a = stats(noSL), b = stats(withSL);
      add(a.exp < b.exp || !withSL.length ? 'bad' : 'warn', `${pct(noSL.length / trades.length)} of your trades had no stop loss`, `${noSL.length} trades without a stop averaged ${fmt(a.exp)}${withSL.length >= MIN ? `, vs ${fmt(b.exp)} for trades with one` : ''}. Their worst result was ${fmt(Math.min(...noSL.map(t => t.pl)))}.`, 'Put a stop on every trade when you open it. A trade without a stop has no defined risk, so you can’t size it correctly.', noSL.length);
    }
    // Streaks
    let cur = 0, maxL = 0; for (const t of trades) { cur = t.pl < 0 ? cur + 1 : 0; maxL = Math.max(maxL, cur); }
    if (maxL >= 5) add('info', `Longest losing streak: ${maxL} trades`, `Streaks like this happen even with a working strategy. What matters is that each loss stays small.`, `Plan for it: if you risk the same amount per trade, a ${maxL}-loss streak costs about ${maxL}× that amount. Make sure your account and your head can handle that.`, trades.length);
    // Long vs short
    const bySide = [...groupBy(trades, t => t.side)].map(([k, l]) => ({k, ...stats(l)})).filter(s => s.n >= MIN);
    if (bySide.length === 2) { bySide.sort((a, b) => b.exp - a.exp); const [b, w] = bySide;
      if (w.exp < 0 && b.exp > 0) add('info', `You do better ${b.k === 'buy' ? 'buying' : 'selling'}`, `${b.k === 'buy' ? 'Longs' : 'Shorts'}: ${fmt(b.exp)} per trade (${b.n}). ${w.k === 'buy' ? 'Longs' : 'Shorts'}: ${fmt(w.exp)} per trade (${w.n}).`, `Ask whether your ${w.k === 'buy' ? 'long' : 'short'} entries fight the trend. Consider taking them only when the higher timeframe agrees.`, b.n + w.n); }
    // Costs
    const cost = trades.reduce((a, t) => a + Math.min(0, Number(t.commission) || 0) + Math.min(0, Number(t.swap) || 0), 0), gross = trades.reduce((a, t) => a + (Number(t.grossProfit) || 0), 0);
    if (cost < 0 && gross > 0 && -cost / gross >= 0.25) add('warn', 'Costs are eating your profit', `Commission and swap cost ${fmt(cost)}, which is ${pct(-cost / gross)} of your gross profit (${fmt(gross)}).`, 'Hold fewer positions overnight to cut swap, and favour fewer, higher-quality trades over many small scalps.', trades.length);

    const order = {bad: 0, warn: 1, info: 2}; out.insights.sort((a, b) => order[a.tone] - order[b.tone]);
    return out;
  }

  function render(trades) {
    const box = document.getElementById('coachBox'); if (!box) return;
    const r = analyze(trades || root.FynxJournal?.visible?.() || []);
    const signedIn = !!root.FynxJournal?.uid?.();
    if (r.trades.length < MIN) {
      box.innerHTML = `<div class="card coach-empty"><div class="bd"><b>Your Trading Coach needs at least ${MIN} closed trades</b><p>${r.trades.length ? `You have ${r.trades.length} in this range.` : signedIn ? 'There are no trades in this range yet.' : 'Sign in to see coaching based on your journal.'} Connect your MT5 history to fill your journal in one step, or log trades manually.</p><div class="coach-cta"><button type="button" class="mt5-import" data-go="mt5">Connect MT5</button><button type="button" class="mt5-cancel" data-go="entry">Log a trade</button></div></div></div>`;
    } else {
      const a = r.all, card = (i, kind) => `<article class="coach-item tone-${kind || i.tone}"><div class="coach-item-hd"><b>${esc(i.title)}</b><small>${i.sample} trade${i.sample === 1 ? '' : 's'}</small></div><p>${i.detail}</p>${i.advice ? `<p class="coach-advice"><strong>What to do:</strong> ${esc(i.advice)}</p>` : ''}</article>`;
      box.innerHTML = `
        <div class="coach-kpis">
          <div><small>Trades</small><b>${a.n}</b></div><div><small>Win rate</small><b>${pct(a.winRate)}</b></div>
          <div><small>Profit factor</small><b>${Number.isFinite(a.pf) ? a.pf.toFixed(2) : '∞'}</b></div><div><small>Expectancy</small><b class="${a.exp >= 0 ? 'good' : 'bad'}">${fmt(a.exp)}</b></div>
          <div><small>Avg win / loss</small><b>${fmt(a.avgWin)} / ${fmt(-a.avgLoss)}</b></div><div><small>Net</small><b class="${a.net >= 0 ? 'good' : 'bad'}">${fmt(a.net)}</b></div>
        </div>
        <div class="coach-cols">
          <section><h3>Fix first</h3>${r.insights.length ? r.insights.map(i => card(i)).join('') : '<p class="coach-none">No clear problems in this range. Keep logging and recheck after more trades.</p>'}</section>
          <section><h3>Keep doing</h3>${r.strengths.length ? r.strengths.map(i => card(i, 'good')).join('') : '<p class="coach-none">Not enough evidence yet for a clear strength. Patterns appear after more trades per symbol and session.</p>'}</section>
        </div>
        <p class="coach-note">Computed only from the trades in your journal for the selected range. Insights need at least ${MIN} trades in a group. This is educational feedback on your own history, not financial advice.</p>`;
    }
    box.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => root.FynxJournal?.open(b.dataset.go)));
  }
  const api = {analyze, render, stats};
  root.FynxJournalCoach = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
