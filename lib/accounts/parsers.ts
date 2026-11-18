import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import { currency, emptyCoverage, LIMITS, normalizeDeal, normalizeSnapshot, normalizeSymbol, conversion, toUSD } from './normalize';
import { parseTimestamp } from './time';
import { groupDeals } from './group';
import type { Deal, ParseIssue, ParseOptions, ParsedStatement, Side, Trade } from './types';
export const CSV_FIELDS = ['id', 'kind', 'time', 'open_time', 'close_time', 'symbol', 'side', 'quantity', 'quantity_unit', 'entry_price', 'exit_price', 'price', 'entry_type', 'position_id', 'order_id', 'gross_pnl', 'net_pnl', 'commission', 'swap', 'fees', 'stop_loss', 'take_profit', 'initial_risk', 'balance', 'magic', 'timeframe', 'strategy_id'] as const;
const key = (text: string) => text.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Record<string, string[]> = { id: ['id', 'ticket', 'deal'], kind: ['kind', 'type'], time: ['time', 'date', 'timestamp'], open_time: ['opentime', 'entrytime', 'entrydate'], close_time: ['closetime', 'exittime', 'exitdate'], symbol: ['symbol', 'item', 'instrument'], side: ['side', 'direction', 'type'], quantity: ['quantity', 'volume', 'size', 'lots'], quantity_unit: ['quantityunit'], entry_price: ['entryprice', 'openprice'], exit_price: ['exitprice', 'closeprice'], price: ['price'], entry_type: ['entrytype', 'entry', 'direction'], position_id: ['positionid', 'position'], order_id: ['orderid', 'order'], gross_pnl: ['grosspnl', 'profit'], net_pnl: ['netpnl', 'pnl', 'netprofit'], commission: ['commission', 'commissions'], swap: ['swap', 'swaps'], fees: ['fees', 'fee', 'taxes'], stop_loss: ['stoploss', 'sl'], take_profit: ['takeprofit', 'tp'], initial_risk: ['initialrisk', 'riskamount'], balance: ['balance', 'balanceafter'], magic: ['magic', 'magicnumber'], timeframe: ['timeframe'], strategy_id: ['strategyid'] };
export function parseCSVRows(text: string, delimiter: ',' | ';' | '\t' = ',', maxRows: number = LIMITS.rows): string[][] {
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false, ended = false;
  const cell = () => { if (value.length > 100000) throw new Error('A CSV cell is too large.'); row.push(value.trim()); value = ''; ended = false; if (row.length > 200) throw new Error('CSV has too many columns.'); };
  const line = () => { cell(); if (row.some(Boolean)) rows.push(row); row = []; if (rows.length > maxRows + 1) throw new Error('Statement exceeds its row limit.'); };
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (quoted) { if (c === '"' && text[i + 1] === '"') { value += '"'; i++; } else if (c === '"') { quoted = false; ended = true; } else value += c; } else if (c === '"') { if (value || ended) throw new Error('Malformed CSV quoting.'); quoted = true; } else if (c === delimiter) cell(); else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; line(); } else if (ended && c.trim()) throw new Error('Unexpected content after a quoted CSV value.'); else if (!ended) value += c; }
  if (quoted) throw new Error('Unclosed CSV quote.'); if (value || row.length || ended) line(); return rows;
}
function numeric(text: string | undefined, options: ParseOptions, required = false): number | null {
  if (text === undefined || !text.trim() || text.trim() === '—' || text.trim() === '-') { if (required) throw new Error('A required numeric value is missing.'); return null; }
  let value = text.trim().replace(/[\u00a0\u202f ]/g, ''); let negative = false;
  if (/^\(.*\)$/.test(value)) { negative = true; value = value.slice(1, -1); }
  if (options.decimalSeparator === ',') { if (/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(value)) value = value.replaceAll('.', ''); value = value.replace(',', '.'); }
  else if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(value)) value = value.replaceAll(',', '');
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) throw new Error('Invalid numeric value; select the correct decimal format.');
  const number = Number(value) * (negative ? -1 : 1); if (!Number.isFinite(number) || Math.abs(number) > LIMITS.money) throw new Error('Numeric value exceeds the supported range.'); return number;
}
function cells(root: DefaultTreeAdapterTypes.Node): string {
  const stack = [root], values: string[] = []; let visited = 0, length = 0;
  while (stack.length) { const node = stack.pop()!; if (++visited > 500000) throw new Error('Statement HTML structure is too large.');
    if (node.nodeName === '#text') { const value = (node as DefaultTreeAdapterTypes.TextNode).value; length += value.length; if (length > LIMITS.bytes) throw new Error('Statement text exceeds its processing budget.'); values.push(value); }
    else if ('childNodes' in node && !['script', 'style', 'template', 'noscript'].includes(node.nodeName)) for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]);
  }
  return values.join(' ').replace(/\s+/g, ' ').trim();
}
function htmlRows(text: string, maxRows: number): { rows: string[][]; text: string } {
  const document = parse(text, { scriptingEnabled: false }), rows: string[][] = [], stack: { node: DefaultTreeAdapterTypes.Node; depth: number }[] = [{ node: document, depth: 0 }]; let nodes = 0;
  while (stack.length) { const { node, depth } = stack.pop()!; if (depth > 256) throw new Error('Statement HTML nesting exceeds its limit.'); if (++nodes > 500000) throw new Error('Statement HTML structure is too large.'); if (node.nodeName === 'tr' && 'childNodes' in node) { const row = node.childNodes.filter(child => child.nodeName === 'td' || child.nodeName === 'th').map(cells); if (row.length > 200) throw new Error('Statement has too many columns.'); if (row.length) rows.push(row); if (rows.length > maxRows + 1000) throw new Error('Statement exceeds its row limit.'); } if ('childNodes' in node && !['script', 'style', 'template', 'noscript'].includes(node.nodeName)) for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push({ node: node.childNodes[i], depth: depth + 1 }); }
  return { rows, text: cells(document) };
}
function stableRowId(row: string[], occurrence: Map<string, number>): string {
  let hash = 14695981039346656037n; for (const char of JSON.stringify(row)) { hash ^= BigInt(char.codePointAt(0)!); hash = BigInt.asUintN(64, hash * 1099511628211n); }
  const key = hash.toString(16), count = (occurrence.get(key) || 0) + 1; occurrence.set(key, count); return `statement:${key}:${count}`;
}
function headerMap(headers: string[], format: ParsedStatement['format'], options: ParseOptions): Record<string, number> {
  const normalized = headers.map(key), out: Record<string, number> = {};
  for (const field of CSV_FIELDS) { const mapped = options.columns?.[field]; const index = mapped ? headers.findIndex(h => h.trim() === mapped.trim()) : normalized.findIndex(h => (aliases[field] || []).includes(h)); if (index >= 0) out[field] = index; }
  if (format === 'mt4-html') { const times = normalized.map((h, i) => h === 'time' ? i : -1).filter(i => i >= 0), prices = normalized.map((h, i) => h === 'price' ? i : -1).filter(i => i >= 0); if (out.open_time === undefined && times.length) out.open_time = times[0]; if (out.close_time === undefined && times.length > 1) out.close_time = times[1]; if (out.entry_price === undefined && prices.length) out.entry_price = prices[0]; if (out.exit_price === undefined && prices.length > 1) out.exit_price = prices[1]; }
  if (format === 'mt5-html') { const type = normalized.indexOf('type'), direction = normalized.indexOf('direction'); if (type >= 0) out.side = type; if (direction >= 0) out.entry_type = direction; }
  return out;
}
export function parseStatement(text: string, options: ParseOptions = {}): ParsedStatement {
  const maxBytes = Math.min(options.maxBytes ?? LIMITS.bytes, LIMITS.bytes), maxRows = Math.min(options.maxRows ?? LIMITS.rows, LIMITS.rows);
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || !Number.isInteger(maxRows) || maxRows < 1) throw new Error('Invalid statement processing budget.');
  if (typeof text !== 'string' || !text.trim()) throw new Error('The statement is empty.'); if (new TextEncoder().encode(text).length > maxBytes) throw new Error('Statements must be at most 5 MB.');
  const html = options.format === 'mt4-html' || options.format === 'mt5-html' || options.format !== 'csv' && /<(?:html|table)\b/i.test(text), parsed = html ? htmlRows(text, maxRows) : { rows: parseCSVRows(text, options.delimiter || ',', maxRows), text: '' };
  const rows = parsed.rows; if (!rows.length) throw new Error('No statement rows were found.');
  const format: ParsedStatement['format'] = options.format === 'mt4-html' ? 'mt4-html' : options.format === 'mt5-html' ? 'mt5-html' : html ? rows.some(r => r.map(key).includes('deal') && r.map(key).includes('direction')) ? 'mt5-html' : 'mt4-html' : 'csv';
  const statedCurrency = /\b(?:Currency|Deposit currency)\s*:\s*([A-Z0-9]{3,12})\b/i.exec(parsed.text)?.[1]?.toUpperCase();
  if (options.currency && statedCurrency && currency(options.currency) !== statedCurrency) throw new Error('Selected currency differs from the statement currency.');
  const code = currency(options.currency || statedCurrency || ''), issues: ParseIssue[] = [], deals: Deal[] = [], trades: Trade[] = [], occurrence = new Map<string, number>();
  const headerIndex = html ? rows.findIndex(row => { const h = headerMap(row, format, options); return h.symbol !== undefined && h.quantity !== undefined && (format === 'mt5-html' ? h.entry_type !== undefined && h.time !== undefined : h.open_time !== undefined && h.close_time !== undefined); }) : 0;
  if (headerIndex < 0) throw new Error('Unsupported statement table. Export MT4 closed history, MT5 Deals, or map a CSV trade table.');
  let headers = rows[headerIndex], map = headerMap(headers, format, options), count = 0;
  if (format === 'csv' && new Set(headers.map(key)).size !== headers.length) throw new Error('CSV has duplicate column headers; choose unique columns before import.');
  const executionMode = map.entry_type !== undefined && map.time !== undefined;
  const required = executionMode ? ['time', 'symbol', 'side', 'quantity', 'price', 'entry_type'] : ['open_time', 'close_time', 'symbol', 'side', 'quantity', 'entry_price', 'exit_price'];
  if (required.some(field => map[field] === undefined)) throw new Error(`Map the required ${executionMode ? 'execution' : 'closed-trade'} columns: ${required.join(', ')}.`);
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]; if (html && row.length === 1 && /^(positions|open trades|working orders|results|summary)\b/i.test(row[0])) break;
    const repeated = headerMap(row, format, options); if (repeated.symbol !== undefined && repeated.quantity !== undefined) { headers = row; map = repeated; continue; }
    if (format === 'csv' && row.length !== headers.length) { issues.push({ severity: 'error', code: 'COLUMN_COUNT', message: 'Row has a different number of columns from the header.', row: i + 1 }); if (issues.length > 1000) throw new Error('Statement exceeds its validation-issue limit.'); continue; }
    const get = (field: string) => map[field] === undefined ? undefined : row[map[field]], sideText = (get('side') || '').toLowerCase().trim(), kindText = (get('kind') || '').toLowerCase().trim();
    const cashKind = /^(balance|deposit|withdrawal|withdraw|credit|fee|adjustment|dividend)$/.test(kindText || sideText) ? (kindText || sideText) : null;
    if (html && !['buy', 'sell'].includes(sideText) && !cashKind) continue;
    try {
      const number = (field: string, required = false) => numeric(get(field), options, required), cost = (field: string) => { const n = number(field); return n === null ? null : options.costConvention === 'positive-costs' ? -Math.abs(n) : n; };
      const id = get('id')?.trim() || stableRowId(row, occurrence); if (id.length > 180) throw new Error('Statement identifier is too long.');
      if (cashKind) { let amount = number('net_pnl') ?? number('gross_pnl'); if (amount === null) throw new Error('Cash movement has no recorded amount.'); const kind = cashKind === 'balance' ? amount >= 0 ? 'deposit' : 'withdrawal' : cashKind === 'withdraw' ? 'withdrawal' : cashKind as Deal['kind']; if (kind === 'withdrawal') amount = -Math.abs(amount); const time = parseTimestamp(get('time') || get('close_time') || get('open_time') || '', options); deals.push(normalizeDeal({ externalId: id, time, kind, currency: code, source: format, grossPnl: amount, netPnl: amount, commission: 0, swap: 0, fees: 0, balanceAfter: number('balance'), fx: options.fx })); count++; continue; }
      if (!['buy', 'sell', 'long', 'short'].includes(sideText)) throw new Error('Trade side must be buy/sell or long/short.');
      const side: Side = sideText === 'buy' || sideText === 'long' ? 'buy' : 'sell', rawSymbol = get('symbol')?.trim() || '', normalized = normalizeSymbol(rawSymbol), quantity = number('quantity', true)!;
      if (quantity <= 0) throw new Error('Trade quantity must be positive.'); const unitText = get('quantity_unit') || 'lots'; if (!['lots', 'units', 'contracts'].includes(unitText)) throw new Error('Unknown quantity unit.'); const quantityUnit = unitText as Trade['quantityUnit'];
      const commission = cost('commission'), swap = number('swap'), fees = cost('fees'), grossPnl = number('gross_pnl'), reportedNet = number('net_pnl');
      const netPnl = reportedNet ?? ([grossPnl, commission, swap, fees].every(n => n !== null) ? grossPnl! + commission! + swap! + fees! : null);
      const stopLoss = number('stop_loss'), takeProfit = number('take_profit'), initialRisk = number('initial_risk'); if (initialRisk !== null && initialRisk <= 0) throw new Error('Initial risk must be positive when supplied.');
      const common = { externalId: id, symbol: normalized.symbol, rawSymbol, side, quantity, quantityUnit, currency: code, commission, swap, fees, grossPnl, netPnl, stopLoss: stopLoss && stopLoss > 0 ? stopLoss : null, takeProfit: takeProfit && takeProfit > 0 ? takeProfit : null, initialRisk, magic: get('magic') || null, timeframe: get('timeframe') || null, strategyId: get('strategy_id') || null, source: format, fx: options.fx || null };
      if (executionMode) { const entryText = (get('entry_type') || '').trim().toLowerCase().replace('_', '-'); if (!['in', 'out', 'inout', 'out-by'].includes(entryText)) throw new Error('Execution direction must be in, out, inout or out-by.'); const time = parseTimestamp(get('time') || '', options); deals.push(normalizeDeal({ ...common, time, kind: 'trade', entryType: entryText as Deal['entryType'], price: number('price', true), positionId: get('position_id') || null, orderId: get('order_id') || null, balanceAfter: number('balance'), stopLossBasis: 'reported-final' })); }
      else { const openedAt = parseTimestamp(get('open_time') || '', options), closedAt = parseTimestamp(get('close_time') || '', options), entry = number('entry_price', true)!, exit = number('exit_price', true)!; if (closedAt < openedAt || entry <= 0 || exit <= 0) throw new Error('Trade dates or entry/exit prices are invalid.'); const fx = conversion(code, closedAt, options.fx); trades.push({ ...common, id: `statement-trade:${id}`, dealIds: [], positionId: get('position_id') || null, status: 'closed', openedAt, closedAt, closedQuantity: quantity, remainingQuantity: 0, entry, exit, rMultiple: initialRisk === null || netPnl === null ? null : netPnl / initialRisk, riskBasis: initialRisk === null ? 'unknown' : 'user-declared', costsComplete: [commission, swap, fees].every(n => n !== null), realizedPnl: [{ time: closedAt, netPnl }], tags: [], coverageReasons: initialRisk === null ? ['The reported final stop does not establish original monetary risk. R is unavailable.'] : ['Initial monetary risk is supplied by the imported file.'], fx, usd: fx ? { netPnl: toUSD(netPnl, fx), initialRisk: toUSD(initialRisk, fx) } : null }); }
      if (normalized.symbol === null) issues.push({ severity: 'warning', code: 'SYMBOL_UNMAPPED', message: 'Instrument remains in its reported form; no FYNX symbol was guessed.', row: i + 1 }); count++;
    } catch (error) { issues.push({ severity: 'error', code: 'INVALID_ROW', message: error instanceof Error ? error.message : 'Invalid statement row.', row: i + 1 }); }
    if (count > maxRows || issues.length > 1000) throw new Error('Statement exceeds the row or validation-issue limit.');
  }
  if (!count) throw new Error(issues.find(i => i.severity === 'error')?.message || 'No supported trades or cash movements were parsed.');
  const uniqueTrades = new Map<string, string>(); let uniqueCount = 0; for (const trade of trades) { const fingerprint = JSON.stringify(trade), old = uniqueTrades.get(trade.id); if (old && old !== fingerprint) throw new Error('Conflicting rows share a trade identifier.'); if (!old) { uniqueTrades.set(trade.id, fingerprint); trades[uniqueCount++] = trade; } } trades.length = uniqueCount;
  const grouped = groupDeals(deals, { accountMode: options.accountMode }); trades.push(...grouped.trades); issues.push(...grouped.issues);
  trades.sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  const times = [...deals.map(d => d.time), ...trades.flatMap(t => [t.openedAt, ...(t.closedAt ? [t.closedAt] : [])])].sort();
  const dateText = /\b(?:Date|Generated)\s*:\s*(\d{4}[.\/-]\d{2}[.\/-]\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)/i.exec(parsed.text)?.[1];
  let statementAsOf = options.statementAsOf ? parseTimestamp(options.statementAsOf, options) : null; if (!statementAsOf && dateText) statementAsOf = parseTimestamp(dateText, options);
  const reportAmount = (name: string): number | null => { const expression = new RegExp(`(?:^|\\s)${name}\\s*:\\s*([+-]?[\\d ,\\u00a0]+(?:\\.\\d+)?)`, 'i'), match = expression.exec(parsed.text); return match ? numeric(match[1], options) : null; };
  const endingBalance = html ? reportAmount('Balance') : null, equity = html ? reportAmount('Equity') : null;
  const coverage = { ...emptyCoverage(['Statement imports do not establish continuous equity or broker-day compliance.']), from: times[0] || null, to: statementAsOf || times.at(-1) || null, historyComplete: options.historyComplete === true && grouped.ungrouped.length === 0 && !issues.some(i => i.severity === 'error'), cashflowsComplete: options.historyComplete === true && grouped.ungrouped.length === 0 && !issues.some(i => i.severity === 'error'), positionsComplete: false };
  const snapshots = statementAsOf && (endingBalance !== null || equity !== null) ? [normalizeSnapshot({ asOf: statementAsOf, balance: endingBalance, equity, currency: code, source: format, balanceBasis: 'statement-reported', coverage, fx: options.fx })] : [];
  if (options.initialBalance !== undefined && options.initialBalanceAt) { const at = parseTimestamp(options.initialBalanceAt, options); snapshots.unshift(normalizeSnapshot({ asOf: at, balance: options.initialBalance, currency: code, source: 'user-declared-import-start', balanceBasis: 'user-declared', coverage: emptyCoverage(), fx: options.fx })); }
  const login = /\bAccount\s*:\s*(\d{4,30})\b/i.exec(parsed.text)?.[1];
  return { format, schemaVersion: 1, currency: code, deals, trades, positions: [], snapshots, preview: trades.slice(0, 20), previewDeals: deals.slice(0, 20), issues, coverage, metadata: { source: format, timezone: options.timezone || null, maskedLogin: login ? '••••' + login.slice(-4) : null, statementAsOf, startingBalance: options.initialBalance ?? null, endingBalance, balanceBasis: endingBalance === null ? 'unknown' : 'statement-reported', rows: count } };
}
