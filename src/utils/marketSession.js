const parseNewYorkLocalDateTime = require("./parseMarketDateTime");

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function marketDayKey(date) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function marketTime(day, clock) {
  return parseNewYorkLocalDateTime(`${day}T${clock}`);
}

function shiftDay(day, amount) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function startOfMinute(value) {
  return new Date(Math.floor(value.getTime() / 60_000) * 60_000);
}

function completedBars(bars, cutoff) {
  return bars.filter((bar) => (bar.time + 60) * 1000 <= cutoff.getTime());
}

module.exports = { marketDayKey, marketTime, shiftDay, startOfMinute, completedBars };
