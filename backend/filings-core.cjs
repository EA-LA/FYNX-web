'use strict';
/* SEC EDGAR filing index for one company (the "submissions" JSON): company identity and its recent filings with
 * direct links to each document on sec.gov. Only SEC metadata is returned (forms, dates, SEC's own document
 * descriptions and Form 8-K item numbers); no filing text. */
const FORM_GROUPS = [
  ['annual', /^(10-K|10-K405|10-KT|20-F|40-F)(\/A)?$/],
  ['quarterly', /^10-Q(\/A)?$/],
  ['current', /^(8-K|6-K)(\/A)?$/],
  ['proxy', /^(DEF 14A|DEFA14A|PRE 14A|DEFM14A|DEF 14C|PRE 14C)$/],
  ['insider', /^(3|4|5|144)(\/A)?$/],
  ['ownership', /^(SC 13D|SC 13G|SCHEDULE 13D|SCHEDULE 13G|13F-HR)(\/A)?$/],
  ['registration', /^(S-1|S-3|S-4|S-8|F-1|F-3|424B\d|FWP)(\/A)?$/]];
const groupOf = form => (FORM_GROUPS.find(([, re]) => re.test(String(form || '').toUpperCase())) || ['other'])[0];
// Form 8-K item titles as defined by the SEC (Form 8-K General Instructions).
const ITEMS_8K = {'1.01': 'Material agreement', '1.02': 'Agreement terminated', '1.03': 'Bankruptcy or receivership', '1.05': 'Cybersecurity incident', '2.01': 'Acquisition or disposition', '2.02': 'Results of operations', '2.03': 'New financial obligation', '2.04': 'Obligation accelerated', '2.05': 'Exit or disposal costs', '2.06': 'Material impairment',
  '3.01': 'Listing notice', '3.02': 'Unregistered equity sale', '3.03': 'Change to holders’ rights', '4.01': 'Auditor change', '4.02': 'Non-reliance on financials', '5.01': 'Change in control', '5.02': 'Officer or director change', '5.03': 'Charter or bylaw amendment', '5.05': 'Code of ethics change', '5.07': 'Shareholder vote', '5.08': 'Director nominations',
  '7.01': 'Regulation FD disclosure', '8.01': 'Other events', '9.01': 'Financial statements and exhibits'};
const DAY_RE = /^\d{4}-\d\d-\d\d$/;
function recentFilings(sub, cik, limit = 400) {
  if (!sub || typeof sub !== 'object' || Number(sub.cik) !== Number(cik)) throw Object.assign(Error('SEC company data did not match the request.'), {status: 502});
  const r = sub.filings?.recent || {}, n = Math.min((r.accessionNumber || []).length, limit), out = [];
  for (let i = 0; i < n; i++) {
    const acc = String(r.accessionNumber[i] || ''), form = String(r.form?.[i] || '').trim(), filed = String(r.filingDate?.[i] || ''), doc = String(r.primaryDocument?.[i] || '');
    if (!/^\d{10}-\d\d-\d{6}$/.test(acc) || !form || !DAY_RE.test(filed)) continue;
    const folder = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc.replace(/-/g, '')}/`;
    const items = String(r.items?.[i] || '').split(',').map(x => x.trim()).filter(x => /^\d\.\d\d$/.test(x));
    out.push({form, group: groupOf(form), filed, report: DAY_RE.test(r.reportDate?.[i] || '') ? r.reportDate[i] : null, accession: acc,
      description: String(r.primaryDocDescription?.[i] || '').replace(/\s+/g, ' ').trim().slice(0, 120) || null,
      items: items.map(code => ({code, title: ITEMS_8K[code] || null})), size: Number(r.size?.[i]) || null,
      url: /^[\w.\-]+$/.test(doc) ? folder + doc : null, index: `${folder}${acc}-index.htm`});
  }
  const addr = sub.addresses?.business || {}, fye = String(sub.fiscalYearEnd || '');
  return {cik: Number(cik), name: String(sub.name || '').slice(0, 160), tickers: (sub.tickers || []).slice(0, 8), exchanges: (sub.exchanges || []).slice(0, 8),
    sic: sub.sic || null, industry: sub.sicDescription || null, category: sub.category || null, incorporated: sub.stateOfIncorporationDescription || sub.stateOfIncorporation || null,
    fiscalYearEnd: /^\d{4}$/.test(fye) ? `${fye.slice(0, 2)}-${fye.slice(2)}` : null, city: addr.city || null, state: addr.stateOrCountryDescription || addr.stateOrCountry || null,
    formerNames: (sub.formerNames || []).slice(0, 6).map(f => ({name: String(f.name || '').slice(0, 160), from: String(f.from || '').slice(0, 10), to: String(f.to || '').slice(0, 10)})),
    filings: out, total: (r.accessionNumber || []).length, olderFiles: (sub.filings?.files || []).length,
    secURL: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${String(cik).padStart(10, '0')}&type=&dateb=&owner=include&count=40`};
}
module.exports = {recentFilings, groupOf, ITEMS_8K};
