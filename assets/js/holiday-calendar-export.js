/* Download a snapshot of the currently filtered market holiday planning reference.
   No remote requests, reminders, or calendar permissions are involved. */
(function (root) {
  'use strict';

  const NOTICE = 'Planning reference only. Coverage may be incomplete. Confirm current closures and early-close times with official exchange notices. This downloaded snapshot does not update automatically.';
  const STATUS = { closed: 'Market closed', early: 'Early close', warning: 'Liquidity warning' };
  const encoder = new TextEncoder();

  function escapeText(value) {
    return String(value == null ? '' : value)
      .replace(/\\/g, '\\\\')
      .replace(/\r\n|\r|\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');
  }

  // RFC 5545 folds content lines at 75 *octets*, not 75 JS characters.
  function foldLine(line) {
    let current = '';
    let length = 0;
    for (const char of line) {
      const bytes = encoder.encode(char).length;
      if (length + bytes > 75) {
        current += '\r\n ';
        length = 1; // continuation space counts toward the 75-octet limit
      }
      current += char;
      length += bytes;
    }
    return current;
  }

  function civilDate(date) {
    if (!date || typeof date.getTime !== 'function' || !Number.isFinite(date.getTime())) {
      throw new TypeError('An event has an invalid date');
    }
    return String(date.getFullYear()).padStart(4, '0') +
      String(date.getMonth() + 1).padStart(2, '0') +
      String(date.getDate()).padStart(2, '0');
  }

  function followingCivilDate(date) {
    return civilDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1));
  }

  function eventUid(event) {
    // Stable local ID to avoid duplicates when importing overlapping downloads.
    const input = String(event.id || [event.name, civilDate(event.date), (event.exchanges || []).join('|')].join('|'));
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
    }
    return civilDate(event.date) + '-' + (hash >>> 0).toString(16).padStart(8, '0') + '@fynxfinanceworld.com';
  }

  function serialize(events, generatedAt = new Date()) {
    if (!Array.isArray(events)) throw new TypeError('Expected an array of events');
    if (!generatedAt || typeof generatedAt.toISOString !== 'function') throw new TypeError('Invalid generation time');

    const stamp = generatedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//FYNX Finance World//Holiday Planning Reference//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:FYNX Market Holiday Planning',
      'X-WR-CALDESC:' + escapeText(NOTICE)
    ];

    for (const event of events) {
      const status = STATUS[event.status] || 'Market schedule notice';
      const exchange = (event.exchanges || []).join(', ') || 'Market';
      const details = [
        'Status: ' + status,
        'Impact: ' + (event.impact || 'not specified'),
        'Exchanges: ' + exchange,
        'Market types: ' + (event.markets || []).join(', '),
        'Regions: ' + (event.regions || []).join(', '),
        event.notes || '',
        NOTICE
      ].filter(Boolean).join('\n');

      lines.push(
        'BEGIN:VEVENT',
        'UID:' + eventUid(event),
        'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + civilDate(event.date),
        'DTEND;VALUE=DATE:' + followingCivilDate(event.date),
        'SUMMARY:' + escapeText(status + ': ' + (event.name || 'Holiday') + ' (' + exchange + ')'),
        'DESCRIPTION:' + escapeText(details),
        'TRANSP:TRANSPARENT',
        'END:VEVENT'
      );
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }

  function filename(year) {
    if (!Number.isInteger(year) || year < 2025 || year > 2029) {
      throw new RangeError('Unsupported holiday calendar year');
    }
    return 'fynx-market-holidays-' + year + '.ics';
  }

  function download(events, year) {
    if (!events.length) throw new Error('No events match the selected filters');
    const name = filename(year);
    const payload = serialize(events);
    const url = root.URL.createObjectURL(new root.Blob([payload], { type: 'text/calendar;charset=utf-8' }));
    const link = root.document.createElement('a');
    link.href = url;
    link.download = name;
    link.hidden = true;
    root.document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
    }
    return { name, count: events.length };
  }

  root.FynxHolidayCalendarExport = Object.freeze({ serialize, filename, download });
})(window);
