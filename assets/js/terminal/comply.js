/* FYNX Terminal plugin: COMPLY. Screens a post, newsletter, research note or memo against the content standards of
 * FINRA Rule 2210 (communications with the public) and the SEC Marketing Rule (206(4)-1): promises and guarantees,
 * predictions, unlabelled hypothetical or back-tested results, performance without context, testimonials, possible
 * inside information, unqualified recommendations, superlatives and pressure. It highlights each phrase, explains the
 * rule, checks the disclosures the content needs and drafts a cleaner version. A screen, not legal advice: a
 * registered principal or counsel still has to approve real communications. Runs entirely in the browser. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {el, btn, store, finite} = T;
  const QL = T.QuantLab, QR = T.QuantResearch;
  if (!QL || !QR) return;
  const {kpis} = QL;
  const {card, note} = QR.ui;
  const A = "(?:'|’)";
  // [id, severity, pattern, title, why, rule, replacement or null]
  const RULES = [
    ['guarantee', 'high', new RegExp(`\\b(guarantee[ds]?|guaranteed (?:returns?|profits?|income|gains?)|risk[- ]free|can${A}?t lose|cannot lose|no[- ]risk|zero risk|sure[- ](?:thing|fire|bet)|certain (?:profits?|gains?|returns?)|safe bet|100% (?:safe|sure|certain|accurate)|never lose)\\b`, 'gi'),
      'Promise or guarantee of results', 'Communications may not promise specific results or suggest an investment cannot lose money.', 'FINRA 2210(d)(1)(B); SEC Marketing Rule 206(4)-1(a)(1)', m => /lose/i.test(m) ? 'could lose money' : /risk/i.test(m) ? 'involves risk' : 'potential'],
    ['projection', 'high', new RegExp(`\\b(?:will|is going to|${'is set to'}|are going to)\\s+(?:double|triple|10x|moon|skyrocket|explode|soar|surge|rally|rise|climb|hit|reach|go up|outperform)\\b|\\b(?:will (?:hit|reach)|heading to|going to) \\$?\\d[\\d,.]*`, 'gi'),
      'Prediction of future performance', 'Retail communications generally may not predict or project an investment’s performance.', 'FINRA 2210(d)(1)(F)', () => 'could rise or fall'],
    ['mnpi', 'high', new RegExp(`\\b(?:inside(?:r)? (?:info(?:rmation)?|tip|scoop)|before (?:it${A}?s|it is) (?:announced|public|released)|not (?:yet )?public|confidential (?:tip|info(?:rmation)?)|heard from (?:someone|a friend) at)\\b`, 'gi'),
      'Possible material non-public information', 'Trading on or passing on material non-public information can be illegal insider trading.', 'Exchange Act §10(b) and Rule 10b-5; Regulation FD', null],
    ['hypothetical', 'high', /\b(?:back-?test(?:ed|ing|s)?|hypothetical(?:ly)?|simulated|paper[- ]trad(?:ed|ing)|model portfolio|would have (?:made|earned|returned|turned|grown))\b/gi,
      'Hypothetical or back-tested results', 'Hypothetical performance needs prominent labelling, the assumptions and risks behind it, and must suit the audience; it may not be shown to a general retail audience as if it were real.', 'SEC Marketing Rule 206(4)-1(a)(5) and (d)(6); FINRA Regulatory Notice 17-06', null],
    ['performance', 'medium', /[+]?\b\d{1,4}(?:\.\d+)?\s?%(?:\s?(?:return|gain|profit|a year|per year|annually|annualized|in (?:a|one|\d+) (?:day|week|month|year)s?))?/gi,
      'Performance figure', 'Performance needs its period, whether it is net of fees, and a statement that past performance does not guarantee future results; short periods and cherry-picked results are misleading.', 'SEC Marketing Rule 206(4)-1(d)(1)–(3); FINRA 2210(d)(1)(A)', null],
    ['testimonial', 'medium', new RegExp(`\\b(?:testimonials?|clients? (?:said|says|made|earned)|our (?:members|clients|subscribers) (?:made|earned|returned)|i (?:made|earned) \\$?\\d[\\d,.]*|made me \\$?\\d[\\d,.]*|5[- ]stars?|★{3,})`, 'gi'),
      'Testimonial or endorsement', 'Testimonials need clear disclosure of whether the person is a client, whether they were paid and any material conflicts.', 'SEC Marketing Rule 206(4)-1(b); FINRA 2210(d)(6)', null],
    ['advice', 'medium', new RegExp(`\\b(?:you (?:should|must|need to) (?:buy|sell|short)|buy (?:it )?now|sell (?:it )?now|load up|back up the truck|go all[- ]in|all[- ]in on|mortgage your house)\\b`, 'gi'),
      'Unqualified recommendation', 'A recommendation needs a reasonable basis, balanced risks and context about who it suits.', 'FINRA Rule 2111 (suitability); 2210(d)(1)(A)–(B)', m => /all|load|truck|mortgage/i.test(m) ? 'consider a position size that fits your risk tolerance' : 'consider whether it fits your goals'],
    ['superlative', 'low', /\b(?:the best|best[- ]performing|#1|number one|top[- ]performing|unbeatable|unmatched|world[- ]class|the only (?:way|strategy|fund|stock))\b/gi,
      'Unsupported superlative', 'Claims such as “best” or “#1” need a fair, verifiable basis with the source, period and ranking universe.', 'FINRA 2210(d)(1)(A)', m => /only/i.test(m) ? m.replace(/the only/i, 'one') : 'a strong'],
    ['pressure', 'low', new RegExp(`\\b(?:act now|don${A}?t miss(?: out)?|limited time|last chance|before it${A}?s too late|hurry|only today|fomo|now or never)\\b`, 'gi'),
      'High-pressure language', 'Urgency language works against a fair and balanced presentation of risks.', 'FINRA 2210(d)(1)(A)', () => 'take your time'],
    ['hype', 'low', new RegExp(`(?:🚀|💎|🙌|to the moon|moonshot|lambo|can${A}?t miss|no[- ]brainer|easy money|free money|get rich(?: quick)?|printing money)`, 'gi'),
      'Hype or promissory slang', 'Slang that implies easy or certain gains is promissory and not fair and balanced.', 'FINRA 2210(d)(1)(B); FINRA Regulatory Notice 17-18 (social media)', () => '']
  ];
  const SEV = {high: ['HIGH', '#ff5a4f', 25], medium: ['MEDIUM', '#ffb000', 10], low: ['LOW', '#5b8def', 4]};
  const DISC = {
    risk: [/\b(?:involves? (?:substantial )?risks?|risk of loss|(?:may|can|could) lose|lose (?:some|all) of)\b/i, 'Risk disclosure', 'Investing involves risk, including the possible loss of principal.'],
    past: [/past (?:performance|results) (?:is|are|does|do)(?:n[’']t| not| no) (?:a )?(?:indicat|guarant|predict|reliable)/i, 'Past-performance statement', 'Past performance does not guarantee future results.'],
    hypo: [/hypothetical.{0,120}(?:not|do not|does not|don[’']t) (?:represent |reflect )?(?:actual|real)/i, 'Hypothetical-results label', 'Hypothetical results are not actual trading results, do not reflect fees, slippage or real-money decisions, and have inherent limitations.'],
    notadvice: [/\b(?:not (?:investment|financial|personal) advice|for (?:informational|educational) purposes)\b/i, 'Not-personal-advice statement', 'This is general information, not personal investment advice.'],
    conflicts: [/\b(?:i|we|the author|fynx)\b.{0,40}\b(?:own|hold|holds|have|has)\b.{0,30}\b(?:position|shares|stake)|\bno position\b|\bdo not (?:own|hold)\b/i, 'Positions and conflicts', 'The author [holds / does not hold] a position in the securities mentioned.'],
    source: [/\b(?:source|data from|as of|according to)\b/i, 'Sources and dates', 'Sources: [name the data sources and the date of the data].']
  };
  function scan(text) {
    const flags = [];
    for (const [id, sev, re, title, why, rule, fix] of RULES) { re.lastIndex = 0; let m; while ((m = re.exec(text))) { if (!m[0].trim()) { re.lastIndex++; continue; }
      // “does not guarantee”, “no guarantee”, “is not risk-free” are the opposite of a promise
      if (id === 'guarantee' && /\b(?:not|no|never|cannot|can[’']t|without|isn[’']t|aren[’']t)\s+(?:\w+\s+)?$/i.test(text.slice(Math.max(0, m.index - 24), m.index))) continue; flags.push({id, sev, title, why, rule, fix, start: m.index, end: m.index + m[0].length, text: m[0]}); if (flags.length > 400) break; } }
    flags.sort((a, b) => a.start - b.start || b.end - a.end);
    // keep the first (longest) flag where several overlap
    const kept = []; let edge = -1; for (const f of flags) { if (f.start >= edge) { kept.push(f); edge = f.end; } }
    const has = k => DISC[k][0].test(text), ids = new Set(kept.map(f => f.id));
    const need = new Set(['risk']);
    if (ids.has('performance') || ids.has('testimonial')) need.add('past');
    if (ids.has('hypothetical')) need.add('hypo');
    if (ids.has('advice') || ids.has('projection') || /\b(?:buy|sell|recommend|rating|price target)\b/i.test(text)) { need.add('notadvice'); need.add('conflicts'); }
    if (ids.has('performance')) need.add('source');
    const checklist = Object.keys(DISC).map(k => ({k, name: DISC[k][1], needed: need.has(k), present: has(k), text: DISC[k][2]}));
    const missing = checklist.filter(c => c.needed && !c.present);
    // a hypothetical result that is properly labelled is downgraded, as is a performance figure with a past-performance line
    for (const f of kept) { if (f.id === 'hypothetical' && has('hypo')) f.sev = 'low'; if (f.id === 'performance' && has('past')) f.sev = 'low'; }
    const count = s => kept.filter(f => f.sev === s).length;
    const score = Math.max(0, Math.min(100, 100 - kept.reduce((s, f) => s + SEV[f.sev][2], 0) - missing.length * 8));
    return {flags: kept, checklist, missing, score, high: count('high'), medium: count('medium'), low: count('low'), words: (text.match(/\S+/g) || []).length};
  }
  function rewrite(text, res) {
    let out = '', at = 0;
    for (const f of res.flags) { out += text.slice(at, f.start); out += typeof f.fix === 'function' ? f.fix(f.text) : f.text; at = f.end; }
    out += text.slice(at);
    out = out.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,!?])/g, '$1').trim();
    if (res.missing.length) out += '\n\n' + res.missing.map(c => c.text).join(' ');
    return out;
  }
  const EXAMPLE = 'NVDA is the best AI stock and it will double by summer 🚀. Our members made 340% last year with this strategy, and our backtest shows it would have turned $10,000 into $95,000. Guaranteed returns with almost no risk. Act now: this is a no-brainer, load up before it’s too late!';
  const CV = (() => { let s = {}; try { s = JSON.parse(store.get('comply') || '{}') || {}; } catch (_) {} return {text: typeof s.text === 'string' && s.text.trim() ? s.text.slice(0, 20000) : EXAMPLE}; })();
  const save = () => store.set('comply', JSON.stringify(CV));
  const st = el('style'); st.id = 'fx-comply-style';
  st.textContent = `.fx-ql textarea.fx-cp-in{width:100%;min-height:150px;box-sizing:border-box;resize:vertical;background:#0b0f0e!important;border:1px solid #2a3330!important;border-radius:3px;color:#e8ecea!important;-webkit-text-fill-color:#e8ecea!important;opacity:1!important;font:13px/1.55 Inter,Arial,sans-serif;padding:10px 12px}
.fx-ql textarea.fx-cp-in::placeholder{color:#6f7c75!important;-webkit-text-fill-color:#6f7c75!important}
.fx-cp-in:focus{outline:2px solid var(--am);outline-offset:1px}
.fx-cp-text{white-space:pre-wrap;font:13px/1.75 Inter,Arial,sans-serif;color:#d7dfda;background:#0b0f0e;border:1px solid var(--ln);padding:12px 14px}
.fx-cp-text mark{color:#0b0f0e;border-radius:3px;padding:1px 2px;cursor:help}
.fx-cp-list{display:flex;flex-direction:column;gap:8px}
.fx-cp-item{display:grid;grid-template-columns:72px 1fr;gap:10px;padding:9px 11px;background:#0d1312;border:1px solid var(--ln);border-left:3px solid var(--c)}
.fx-cp-item b.sev{font:700 10.5px 'IBM Plex Mono',monospace;color:var(--c);letter-spacing:.05em}
.fx-cp-item h4{margin:0 0 3px;font:700 12.5px Inter,sans-serif;color:#e8ecea}.fx-cp-item p{margin:0;color:#aeb9b3;font-size:12px;line-height:1.5}.fx-cp-item q{color:#fff;font-style:normal}
.fx-cp-item small{display:block;margin-top:3px;color:#7d8a83;font:11px 'IBM Plex Mono',monospace}
.fx-cp-check{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.fx-cp-check div{padding:8px 10px;border:1px solid var(--ln);background:#0d1312;font-size:12px;color:#c9d2cd}.fx-cp-check b{display:block;font:700 11px 'IBM Plex Mono',monospace;margin-bottom:2px}`;
  document.head.append(st);
  function highlighted(text, res) {
    const box = el('div', 'fx-cp-text'); let at = 0;
    for (const f of res.flags) { box.append(document.createTextNode(text.slice(at, f.start))); const m = el('mark', '', f.text); m.style.background = SEV[f.sev][1]; m.title = `${f.title}: ${f.why}`; box.append(m); at = f.end; }
    box.append(document.createTextNode(text.slice(at))); return box;
  }
  function renderPage(host) {
    PG.setHead('COMPLY', 'Compliance check (SEC / FINRA)', 'Screen a post, newsletter or research note for promises, predictions, unlabelled hypothetical results and missing disclosures');
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap);
    const ic = el('div', 'fx-ql-card'); ic.append(el('h3', '', 'TEXT TO CHECK'));
    const ta = el('textarea', 'fx-cp-in'); ta.value = CV.text; ta.setAttribute('aria-label', 'Text to check'); ta.maxLength = 20000;
    const row = el('div', 'fx-ql-row'); row.style.marginTop = '8px';
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px';
    const run = () => { CV.text = ta.value.slice(0, 20000); save(); show(); };
    row.append(btn('Check compliance', 'fx-ql-btn pri', run), btn('Load example', 'fx-ql-btn', () => { ta.value = EXAMPLE; run(); }));
    if (T.lastMemo?.text) row.append(btn(`Check my ${T.lastMemo.sym} committee memo`, 'fx-ql-btn', () => { ta.value = T.lastMemo.text; run(); }));
    row.append(btn('Clear', 'fx-ql-btn', () => { ta.value = ''; ta.focus(); }));
    ic.append(ta, row); wrap.append(ic, out);
    function show() {
      out.replaceChildren(); const text = CV.text;
      if (!text.trim()) { out.append(note('Paste a social post, newsletter, ad, research note or memo, then press Check compliance.')); return; }
      const r = scan(text), col = r.high ? '#ff5a4f' : r.medium || r.missing.length ? '#ffb000' : '#3ecf8e';
      const hd = el('div', 'fx-ql-head'), s0 = el('span', 'fx-ql-state', r.high ? 'HIGH-RISK LANGUAGE FOUND' : r.medium || r.missing.length ? 'NEEDS CHANGES' : 'NO ISSUES FOUND'); s0.style.color = col;
      hd.append(s0, el('span', 'fx-ql-sub', `${r.words} words screened: ${r.high} high, ${r.medium} medium and ${r.low} low-severity flags, ${r.missing.length} missing disclosure${r.missing.length === 1 ? '' : 's'}.`)); out.append(hd);
      kpis(out, [['SCORE', `${r.score} / 100`, r.score >= 85 ? 'ready for principal review' : r.score >= 60 ? 'revise first' : 'do not publish as is', col], ['HIGH', String(r.high), 'promises, predictions, MNPI, hypotheticals', r.high ? '#ff5a4f' : null], ['MEDIUM', String(r.medium), 'performance, testimonials, advice', r.medium ? '#ffb000' : null], ['LOW', String(r.low), 'superlatives, pressure, hype'], ['DISCLOSURES', `${r.checklist.filter(c => c.needed && c.present).length} / ${r.checklist.filter(c => c.needed).length}`, 'required ones present', r.missing.length ? '#ffb000' : '#3ecf8e']]);
      out.append(card('YOUR TEXT · HOVER A HIGHLIGHT FOR THE REASON (RED HIGH · AMBER MEDIUM · BLUE LOW)', highlighted(text, r)));
      if (r.flags.length) {
        const list = el('div', 'fx-cp-list');
        for (const f of [...r.flags].sort((a, b) => SEV[b.sev][2] - SEV[a.sev][2])) {
          const it = el('div', 'fx-cp-item'), body = el('div'), h = el('h4'); it.style.setProperty('--c', SEV[f.sev][1]);
          h.append(f.title + ': ', el('q', '', f.text)); body.append(h, el('p', '', f.why), el('small', '', f.rule + (typeof f.fix === 'function' ? ` · suggested: “${f.fix(f.text) || 'remove'}”` : '')));
          it.append(el('b', 'sev', SEV[f.sev][0]), body); list.append(it);
        }
        out.append(card(`WHAT TO FIX (${r.flags.length})`, list));
      }
      const ck = el('div', 'fx-cp-check');
      r.checklist.forEach(c => { const d = el('div'), b = el('b', '', `${c.present ? '✓' : c.needed ? '✕' : '·'} ${c.name}`); b.style.color = c.present ? '#3ecf8e' : c.needed ? '#ff5a4f' : '#7d8a83'; d.append(b, c.present ? 'Present.' : c.needed ? 'Needed for this content.' : 'Not required by what was flagged.'); ck.append(d); });
      out.append(card('DISCLOSURE CHECKLIST', ck));
      const fixed = rewrite(text, r), pre = el('div', 'fx-cp-text', fixed), r2 = scan(fixed), cr = el('div', 'fx-ql-row');
      cr.append(btn('Copy cleaner draft', 'fx-ql-btn pri', async () => { try { await navigator.clipboard.writeText(fixed); T.say?.('Draft copied.'); } catch (_) { T.say?.('Copy failed: select the text instead.'); } }), btn('Check the draft again', 'fx-ql-btn', () => { ta.value = fixed; run(); }));
      out.append(card(`CLEANER DRAFT · SCORE ${r2.score} / 100 AFTER AUTOMATIC FIXES`, pre, cr, note(r2.high || r2.medium ? 'Some flags (performance figures, testimonials, hypothetical results, possible inside information) need a human decision: remove them or add the context described above.' : 'Automatic fixes soften promissory words and add the missing disclosures; read it once more before use.')));
      out.append(card('ABOUT THIS CHECK', ...['Rules screened: FINRA Rule 2210 content standards (fair and balanced, no promissory or exaggerated claims, no predictions of performance, testimonial disclosures), the SEC Marketing Rule 206(4)-1 (performance, hypothetical performance and testimonials), FINRA Rule 2111 (suitability of recommendations) and insider-trading red flags (Rule 10b-5).', 'This is an automated screen of wording, not legal or compliance advice. Communications by a broker-dealer or adviser still need approval by a registered principal or counsel. Your text stays in your browser.'].map(note)));
    }
    show();
  }
  if (PG) { for (const n of ['comply', 'compliance', 'finra']) { T.premium?.(n, 'analysis', 'Compliance check', ['comply']); PG.add(n, 'Compliance check', renderPage); } T.PAGE_NAMES.push('COMPLY', 'COMPLIANCE', 'FINRA'); }
  T.Comply = {scan, rewrite, RULES};
});
