const { marketDayKey, marketTime, shiftDay } = require("./marketSession");

function daySpan(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();
const weekStart = (day) => shiftDay(day, -((weekday(day) + 6) % 7));
const monthStart = (day) => `${day.slice(0, 7)}-01`;

function comparisonPeriod(range, kind) {
  const span = daySpan(range.from, range.to);
  if (kind === "monthly" && range.from === monthStart(range.to)) {
    const oldLast = shiftDay(range.from, -1);
    const from = monthStart(oldLast);
    const complete = shiftDay(range.to, 1).slice(0, 7) !== range.to.slice(0, 7);
    return { from, to: complete ? oldLast : [shiftDay(from, span - 1), oldLast].sort()[0] };
  }
  if (kind === "weekly" && range.from === weekStart(range.to)) {
    return { from: shiftDay(range.from, -7), to: shiftDay(range.to, -7) };
  }
  if (span === 1) {
    const to = precedingWeekday(shiftDay(range.from, -1));
    return { from: to, to };
  }
  return { from: shiftDay(range.from, -span), to: shiftDay(range.from, -1) };
}

function precedingWeekday(day) {
  while ([0, 6].includes(weekday(day))) day = shiftDay(day, -1);
  return day;
}

function reportRange(kind, range) {
  if (kind === "daily") return { from: range.to, to: range.to };
  if (kind === "weekly") return { from: weekStart(range.to), to: range.to };
  if (kind === "monthly") return { from: monthStart(range.to), to: range.to };
  return range;
}

function scheduledRanges(now, hour, cadences) {
  const today = marketDayKey(now);
  const cutoff = marketTime(today, `${String(hour).padStart(2, "0")}:00`);
  const effectiveDay = now >= cutoff ? today : shiftDay(today, -1);
  const days = {
    daily: () => {
      const day = precedingWeekday(shiftDay(effectiveDay, -1));
      return { from: day, to: day };
    },
    weekly: () => {
      const start = weekStart(effectiveDay);
      return { from: shiftDay(start, -7), to: shiftDay(start, -1) };
    },
    monthly: () => {
      const last = shiftDay(monthStart(effectiveDay), -1);
      return { from: monthStart(last), to: last };
    }
  };
  return cadences.map((kind) => ({ kind, ...days[kind]() }));
}

function nextSchedule(now, hour) {
  const today = marketDayKey(now);
  const clock = `${String(hour).padStart(2, "0")}:00`;
  const todayAt = marketTime(today, clock);
  return todayAt > now ? todayAt : marketTime(shiftDay(today, 1), clock);
}

function pendingPeriods(now, dueAt, hour, cadences) {
  const until = marketDayKey(now);
  const visibleFrom = shiftDay(until, -6);
  const first = [visibleFrom, marketDayKey(dueAt)].sort().at(-1);
  const unique = new Map();
  for (let day = first; day <= until; day = shiftDay(day, 1)) {
    const at = marketTime(day, `${String(hour).padStart(2, "0")}:00`);
    if (at > now) continue;
    for (const range of scheduledRanges(at, hour, cadences)) {
      unique.set(`${range.kind}:${range.from}:${range.to}`, range);
    }
  }
  return [...unique.values()];
}

module.exports = { daySpan, comparisonPeriod, reportRange, scheduledRanges, nextSchedule, pendingPeriods };
