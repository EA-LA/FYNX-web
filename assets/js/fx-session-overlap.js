(function () {
  'use strict';
  const get = id => document.getElementById(id);
  const form = get('fx-overlap-form');
  if (!form || typeof MARKETS === 'undefined') return;

  const sessions = new Map(MARKETS.forex.sessions.map(session => [session.id, session]));
  const first = get('fx-overlap-first');
  const second = get('fx-overlap-second');
  const date = get('fx-overlap-date');
  const displayZone = get('tz');
  const result = get('fx-overlap-result');
  const calendar = get('fx-overlap-calendar');
  const calendarStatus = get('fx-overlap-calendar-status');
  // Cached planner HTML can load this newer script without the calendar markup.
  const hasCalendar = !!(calendar && calendarStatus);
  const dayMs = 86_400_000;
  const minuteMs = 60_000;
  const formatters = new Map();
  let hasResult = false;
  let calendarResult = null;

  for (const select of [first, second]) {
    for (const session of sessions.values()) {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = session.venue;
      select.append(option);
    }
  }
  first.value = 'london';
  second.value = 'newyork';
  date.value = new Date().toISOString().slice(0, 10);

  // All session start/end hours come from the existing Forex model. Convert
  // its daytime wall times with real zone rules, not fixed UTC offsets.
  function toUtc(y, m, d, hours, minutes, zone) {
    if (!formatters.has(zone)) {
      formatters.set(zone, new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hourCycle: 'h23', calendar: 'gregory', numberingSystem: 'latn',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      }));
    }
    const wanted = Date.UTC(y, m, d, hours, minutes);
    let candidate = wanted;
    for (let n = 0; n < 4; n++) {
      const fields = Object.fromEntries(formatters.get(zone).formatToParts(candidate)
        .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
      const observed = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute);
      if (observed === wanted) return candidate;
      candidate += wanted - observed;
    }
    throw new Error('Session wall time could not be resolved');
  }

  function hoursFor(session, utcStart) {
    const periods = [];
    // A local session may land partly on the previous or next UTC day.
    for (const delta of [-1, 0, 1]) {
      const localDate = new Date(utcStart + delta * dayMs);
      const weekday = localDate.getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      const parts = [localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate()];
      const start = toUtc(...parts, session.open.h, session.open.m, session.tz);
      const end = toUtc(...parts, session.close.h, session.close.m, session.tz);
      if (end <= start) throw new Error('Unrecognized Forex session hours');
      if (start < utcStart + dayMs && end > utcStart) {
        periods.push([Math.max(start, utcStart), Math.min(end, utcStart + dayMs)]);
      }
    }
    return periods;
  }

  function timeRange(start, end, zone) {
    const format = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hourCycle: 'h23', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    return `${format.format(start)} to ${format.format(end)}`;
  }

  function clearCalendar() {
    calendarResult = null;
    if (calendar) calendar.disabled = true;
    if (calendarStatus) calendarStatus.textContent = '';
  }

  const selectionKey = () => [first.value, second.value, date.value, displayZone.value].join('|');
  function icsStamp(value) {
    return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  if (hasCalendar) calendar.addEventListener('click', () => {
    if (!calendarResult || calendarResult.key !== selectionKey()) {
      clearCalendar();
      return;
    }
    const { pair, venues, periods, utcDate } = calendarResult;
    const now = icsStamp(Date.now());
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FYNX//Forex Session Planner//EN', 'CALSCALE:GREGORIAN'];
    for (const [start, end] of periods) {
      lines.push('BEGIN:VEVENT',
        `UID:fx-${pair}-${start.toString(36)}-${end.toString(36)}@fynxfinanceworld.com`,
        `DTSTAMP:${now}`, `DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`,
        `SUMMARY:${venues} forex overlap (indicative)`,
        'DESCRIPTION:Modeled hours only. Not live or holiday-adjusted.',
        'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
    const payload = lines.concat('END:VCALENDAR', '').join('\r\n');
    let url;
    let link;
    try {
      url = URL.createObjectURL(new Blob([payload], { type: 'text/calendar;charset=utf-8' }));
      link = document.createElement('a');
      link.href = url;
      link.download = `fynx-forex-overlap-${pair}-${utcDate}.ics`;
      link.hidden = true;
      document.body.append(link);
      link.click();
      calendarStatus.textContent = 'Calendar file prepared. Open it in your calendar app to import.';
    } catch {
      calendarStatus.textContent = 'Could not prepare the calendar file in this browser.';
    } finally {
      link?.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    clearCalendar();
    const a = sessions.get(first.value);
    const b = sessions.get(second.value);
    const utcStart = Date.parse(`${date.value}T00:00:00.000Z`);
    hasResult = true;
    if (!a || !b || a === b) {
      result.textContent = 'Choose two different sessions.';
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value) ||
        date.value < '2000-01-01' || date.value > '2100-12-31' ||
        !Number.isFinite(utcStart) || new Date(utcStart).toISOString().slice(0, 10) !== date.value) {
      result.textContent = 'Choose a valid UTC date between 2000 and 2100.';
      return;
    }

    try {
      const periods = [];
      for (const [aStart, aEnd] of hoursFor(a, utcStart)) {
        for (const [bStart, bEnd] of hoursFor(b, utcStart)) {
          const start = Math.max(aStart, bStart);
          const end = Math.min(aEnd, bEnd);
          if (start < end) periods.push([start, end]);
        }
      }
      periods.sort((x, y) => x[0] - y[0]);
      const label = `${a.venue} and ${b.venue}, ${date.value} (UTC)`;
      if (!periods.length) {
        result.textContent = `${label}: no scheduled overlap.`;
        return;
      }
      const zone = displayZone.value || 'UTC';
      const times = periods.map(([start, end]) => {
        const mins = (end - start) / minuteMs;
        const hours = Math.floor(mins / 60);
        const duration = [hours && `${hours} hr`, mins % 60 && `${mins % 60} min`].filter(Boolean).join(' ');
        const local = zone === 'UTC' ? '' : `; ${timeRange(start, end, zone)} ${zone}`;
        return `${timeRange(start, end, 'UTC')} UTC${local} (${duration})`;
      });
      result.textContent = `${label}: ${times.join(' | ')}.`;
      if (!hasCalendar) return;
      // Sort the pair for stable event IDs when the two dropdowns are reversed.
      const order = [a, b].sort((x, y) => x.id.localeCompare(y.id));
      calendarResult = { key: selectionKey(), pair: order.map(s => s.id).join('-'),
        venues: order.map(s => s.venue).join(' / '), periods, utcDate: date.value };
      calendar.disabled = false;
    } catch {
      result.textContent = 'Could not convert these session hours. Try another date or display time zone.';
    }
  });
  const invalidate = () => {
    clearCalendar();
    if (hasResult) result.textContent = 'Selection changed. Find overlap again for the current inputs.';
  };
  for (const input of [first, second, date, displayZone]) {
    input.addEventListener('input', invalidate);
    input.addEventListener('change', invalidate);
  }
  get('fx-overlap-fields').disabled = false;
  get('fx-overlap-run').disabled = false;
})();
