function parseDayKey(dayKey) {
  const match = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function formatDayKey(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDayKey(dayKey, offset) {
  const parts = parseDayKey(dayKey);

  if (!parts) {
    return dayKey;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offset, 12));
  return formatDayKey(date);
}

function nthWeekdayOfMonth(year, monthIndex, weekday, occurrence) {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1, 12));
  const firstWeekday = firstDay.getUTCDay();
  const delta = (weekday - firstWeekday + 7) % 7;
  const day = 1 + delta + (occurrence - 1) * 7;
  return formatDayKey(new Date(Date.UTC(year, monthIndex, day, 12)));
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0, 12));
  const lastWeekdayValue = lastDay.getUTCDay();
  const delta = (lastWeekdayValue - weekday + 7) % 7;
  lastDay.setUTCDate(lastDay.getUTCDate() - delta);
  return formatDayKey(lastDay);
}

function observedFixedHoliday(year, monthIndex, day) {
  const date = new Date(Date.UTC(year, monthIndex, day, 12));
  const weekday = date.getUTCDay();

  if (weekday === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  } else if (weekday === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return formatDayKey(date);
}

function calculateEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(Date.UTC(year, month - 1, day, 12));
}

const holidayCache = new Map();

function getUsMarketHolidayKeys(year) {
  if (holidayCache.has(year)) {
    return holidayCache.get(year);
  }

  const easter = calculateEaster(year);
  const goodFriday = new Date(easter);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);

  const holidays = new Set([
    observedFixedHoliday(year, 0, 1),
    nthWeekdayOfMonth(year, 0, 1, 3),
    nthWeekdayOfMonth(year, 1, 1, 3),
    formatDayKey(goodFriday),
    lastWeekdayOfMonth(year, 4, 1),
    ...(year >= 2022 ? [observedFixedHoliday(year, 5, 19)] : []),
    observedFixedHoliday(year, 6, 4),
    nthWeekdayOfMonth(year, 8, 1, 1),
    nthWeekdayOfMonth(year, 10, 4, 4),
    observedFixedHoliday(year, 11, 25)
  ]);

  holidayCache.set(year, holidays);
  return holidays;
}

function isUsMarketHoliday(dayKey) {
  const parts = parseDayKey(dayKey);

  if (!parts) {
    return false;
  }

  return [parts.year - 1, parts.year, parts.year + 1].some((year) =>
    getUsMarketHolidayKeys(year).has(dayKey)
  );
}

function isUsMarketDay(dayKey) {
  const parts = parseDayKey(dayKey);

  if (!parts) {
    return false;
  }

  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay();
  return weekday >= 1 && weekday <= 5 && !isUsMarketHoliday(dayKey);
}

function getLastMarketDayKeys(endDayKey, count) {
  const keys = [];
  let cursor = endDayKey;

  while (keys.length < count) {
    if (isUsMarketDay(cursor)) {
      keys.push(cursor);
    }

    cursor = shiftDayKey(cursor, -1);
  }

  return keys.reverse();
}

export {
  getLastMarketDayKeys,
  isUsMarketDay,
  parseDayKey,
  shiftDayKey
};
