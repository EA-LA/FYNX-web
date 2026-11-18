const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timezone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timezone); if (!fmt) { try { fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); } catch { throw new Error('Choose a valid IANA statement timezone.'); } formatters.set(timezone, fmt); } return fmt;
}
function parts(ms: number, timezone: string): Record<string, string> { return Object.fromEntries(formatter(timezone).formatToParts(new Date(ms)).filter(p => p.type !== 'literal').map(p => [p.type, p.value])); }
function wall(ms: number, timezone: string): string { const p = parts(ms, timezone); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`; }
export function localDay(time: string | number, timezone: string): string { const ms = typeof time === 'number' ? time : Date.parse(time); if (!Number.isFinite(ms)) throw new Error('Invalid observation timestamp.'); return wall(ms, timezone).slice(0, 10); }
export function wallToUTC(value: string, timezone: string): string {
  const target = Date.parse(value + 'Z'); if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 19) !== value) throw new Error('Invalid calendar date or time.');
  const offsets = new Set<number>(); for (const delta of [-86400000, 0, 86400000]) { const probe = target + delta; offsets.add(Date.parse(wall(probe, timezone) + 'Z') - probe); }
  const matches = [...offsets].map(offset => target - offset).filter(ms => wall(ms, timezone) === value);
  if (matches.length !== 1) throw new Error(matches.length ? 'Ambiguous daylight-saving time: provide an explicit UTC offset.' : 'This local time does not exist across the daylight-saving change.');
  return new Date(matches[0]).toISOString();
}
export function parseTimestamp(value: string, options: { timezone?: string; dateFormat?: 'iso' | 'ymd' | 'dmy' | 'mdy' } = {}): string {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    const ms = Date.parse(text), date = text.slice(0, 10); if (!Number.isFinite(ms) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw new Error('Invalid ISO timestamp.'); return new Date(ms).toISOString();
  }
  let match: string[] | null = /^(\d{4})[.\/-](\d{2})[.\/-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(text);
  if (!match && (options.dateFormat === 'dmy' || options.dateFormat === 'mdy')) { const p = /^(\d{2})[.\/-](\d{2})[.\/-](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(text); if (p) match = [p[0], p[3], options.dateFormat === 'dmy' ? p[2] : p[1], options.dateFormat === 'dmy' ? p[1] : p[2], p[4], p[5], p[6], p[7]]; }
  if (!match) throw new Error('Unrecognized date. Use ISO timestamps or choose an explicit date format.');
  if (!options.timezone) throw new Error('The statement has local times. Select its broker timezone; UTC cannot be guessed.');
  const seconds = wallToUTC(`${match[1]}-${match[2]}-${match[3]}T${match[4] || '00'}:${match[5] || '00'}:${match[6] || '00'}`, options.timezone);
  return new Date(Date.parse(seconds) + Number((match[7] || '').padEnd(3, '0'))).toISOString();
}
export function resetBoundary(asOf: string, timezone: string, localTime = '00:00'): string {
  if (!/^\d{2}:\d{2}$/.test(localTime)) throw new Error('Invalid local reset time.');
  let day = localDay(asOf, timezone), reset = wallToUTC(`${day}T${localTime}:00`, timezone);
  if (Date.parse(reset) > Date.parse(asOf)) { day = new Date(Date.parse(day + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10); reset = wallToUTC(`${day}T${localTime}:00`, timezone); } return reset;
}
