import { getMarketDayKey, getMarketParts, getPeriodKey } from "./advancedAnalytics.js";
import { getMarketSession } from "./marketSessions.js";

export const DEFAULT_OFFSETS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];
export const DEFAULT_POST = [5, 10, 15, 30, 60];
export const GROUPS = {
  setup: "Setup", ticker: "Ticker", session: "Session", hour: "Entry hour (ET)", weekday: "Entry weekday (ET)",
  price: "Entry price", rvol: "Relative volume", volatility: "ATR %", duration: "Holding duration",
  size: "Position size", conditions: "Market conditions"
};
const EPS = 0.005;

function describe(input) {
  const values = input.filter(Number.isFinite).sort((a, b) => a - b);
  const n = values.length;
  if (!n) return { n, average: null, median: null, total: null, deviation: null };
  const total = values.reduce((a, b) => a + b, 0);
  const average = total / n;
  const middle = Math.floor(n / 2);
  const median = n % 2 ? values[middle] : (values[middle] + values[middle - 1]) / 2;
  const deviation = n > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (n - 1)) : null;
  return { n, average, median, total, deviation };
}

function percentage(number, total) {
  return total ? 100 * number / total : null;
}

function bucket(value, bounds, suffix = "") {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "Unavailable";
  const index = bounds.findIndex((bound) => Number(value) < bound);
  if (index === 0) return `Under ${bounds[0]}${suffix}`;
  if (index === -1) return `${bounds.at(-1)}${suffix} and above`;
  return `${bounds[index - 1]}–<${bounds[index]}${suffix}`;
}

export function exitTradeMetadata(trade, row) {
  const entry = row.entry ?? Date.parse(trade.entryDate);
  const exit = row.exit ?? Date.parse(trade.exitDate);
  const parts = getMarketParts(entry);
  return {
    id: trade.id, symbol: trade.symbol, date: getMarketDayKey(exit),
    setup: trade.setup || trade.strategy || "Unclassified",
    ticker: trade.symbol, session: getMarketSession(Number(parts.hour) * 60 + Number(parts.minute)),
    hour: `${parts.hour}:00`, weekday: parts.weekday,
    price: bucket(trade.entryPrice, [1, 2, 5, 10, 20], " USD"),
    rvol: bucket(trade.entryRelativeVolume, [1, 2, 5, 10], "×"),
    volatility: bucket(trade.analysis?.snapshot?.atrPercent, [3, 8, 15], "%"),
    duration: bucket((exit - entry) / 1000, [10, 30, 60, 180, 600], "s"),
    size: bucket(trade.quantity, [100, 500, 1000, 5000], " shares"),
    conditions: trade.analysis?.snapshot?.regime || trade.analysis?.snapshot?.marketDirection || "Unavailable",
    recordedEfficiency: trade.analysis?.execution?.exitEfficiency ?? null,
    exit, entry, timestamp: new Date(exit).toISOString()
  };
}

function partition(rows, group) {
  const result = new Map();
  for (const row of rows) {
    const key = group(row);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(row);
  }
  return result;
}

function histogram(input) {
  const values = input.filter(Number.isFinite);
  if (!values.length) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    min = Math.min(value, min);
    max = Math.max(value, max);
  }
  if (max === min) return [{ label: min.toFixed(2), count: values.length }];
  const width = (max - min) / 10;
  const result = Array.from({ length: 10 }, (_, i) => ({
    label: `${(min + width * i).toFixed(2)} to ${(min + width * (i + 1)).toFixed(2)}`, count: 0
  }));
  for (const value of values) result[Math.min(9, Math.floor((value - min) / width))].count += 1;
  return result;
}

function offsetMetrics(rows, seconds, includeDistribution) {
  const eligible = rows.filter((row) => row.scenarios.has(seconds));
  const deltas = eligible.map((row) => row.scenarios.get(seconds).delta);
  const wins = eligible.filter(({ actualNet }) => actualNet > EPS);
  const losses = eligible.filter(({ actualNet }) => actualNet < -EPS);
  return { seconds, ...describe(deltas),
    quote: eligible.filter((row) => row.scenarios.get(seconds).quoted).length,
    improved: percentage(deltas.filter((value) => value > EPS).length, eligible.length),
    worsened: percentage(deltas.filter((value) => value < -EPS).length, eligible.length),
    unchanged: percentage(deltas.filter((value) => Math.abs(value) <= EPS).length, eligible.length),
    winToLoss: percentage(wins.filter((row) => row.actualNet + row.scenarios.get(seconds).delta < -EPS).length, wins.length), wins: wins.length,
    lossToWin: percentage(losses.filter((row) => row.actualNet + row.scenarios.get(seconds).delta > EPS).length, losses.length), losses: losses.length,
    ...(includeDistribution && { distribution: histogram(deltas) })
  };
}

function postMetrics(rows, seconds, includeDistribution) {
  const samples = rows.map((row) => row.postByTime.get(seconds)).filter(Boolean);
  const direction = describe(samples.map((sample) => sample[1]));
  const mfe = describe(samples.map((sample) => sample[2]));
  const mae = describe(samples.map((sample) => sample[3]));
  const peak = describe(samples.map((sample) => sample[4]));
  const adverse = describe(samples.map((sample) => sample[5]));
  const extremesKnown = samples.filter((sample) => typeof sample[6] === "boolean");
  return { seconds, n: samples.length, direction, mfe, mae, peak, adverse,
    favorable: percentage(samples.filter((sample) => sample[1] > 0).length, direction.n),
    reversed: percentage(samples.filter((sample) => sample[1] < 0).length, direction.n),
    newExtreme: percentage(extremesKnown.filter((sample) => sample[6]).length, extremesKnown.length),
    extremeN: extremesKnown.length,
    returned: percentage(samples.filter((sample) => sample[7]).length, samples.length),
    ...(includeDistribution && { mfeDistribution: histogram(samples.map((sample) => sample[2])),
      maeDistribution: histogram(samples.map((sample) => sample[3])) })
  };
}

function rollingQuality(rows, length) {
  const ordered = rows.filter(({ quality }) => quality != null);
  let running = 0;
  const result = [];
  const step = Math.max(1, Math.ceil(ordered.length / 300));
  for (let i = 0; i < ordered.length; i += 1) {
    running += ordered[i].quality;
    if (i >= length) running -= ordered[i - length].quality;
    if (i >= length - 1 && ((i - length + 1) % step === 0 || i === ordered.length - 1)) {
      result.push({ date: ordered[i].date, index: i + 1, average: running / length });
    }
  }
  return result;
}

function changeAlert(recent, historical, metric, floor) {
  if (recent.n < 20 || historical.n < 20) return null;
  const change = recent.average - historical.average;
  const se = Math.hypot(recent.deviation / Math.sqrt(recent.n), historical.deviation / Math.sqrt(historical.n));
  return Math.abs(change) >= floor && Math.abs(change) > 2.58 * se ? { metric, change } : null;
}

export function buildExitReport(input, options) {
  const offsets = options.offsets.flatMap((value) => [-value, value]).sort((a, b) => a - b);
  const allowed = new Set(offsets);
  const pricing = options.pricing;
  const rows = input.filter(({ status }) => status === "ready").map((row) => {
    const scenarios = new Map();
    for (const [seconds, price, quote] of row.offsets) {
      if (!allowed.has(seconds)) continue;
      const quoted = pricing !== "price" && Number.isFinite(quote);
      const delta = quoted ? quote : pricing !== "quote" ? price : null;
      if (Number.isFinite(delta)) scenarios.set(seconds, { delta, quoted });
    }
    let favorable = 0;
    let adverse = 0;
    let profitLeft = null;
    for (const [seconds, { delta }] of scenarios) {
      favorable = Math.max(favorable, delta);
      adverse = Math.min(adverse, delta);
      if (seconds > 0) profitLeft = Math.max(profitLeft ?? 0, delta);
    }
    return { ...row, scenarios, favorable, adverse, profitLeft,
      quality: favorable > adverse ? -adverse / (favorable - adverse) * 100 : null,
      postByTime: new Map(row.post.map((sample) => [sample[0], sample])) };
  }).sort((a, b) => a.exit - b.exit || a.id.localeCompare(b.id));
  const priced = rows.filter((row) => row.scenarios.size > 0);
  const matched = priced.filter((row) => row.scenarios.size === offsets.length);
  const coverage = options.matched ? matched : priced;
  const postAt = options.activeWindow;
  const summary = {
    eligible: input.length, analyzed: rows.length, pending: input.filter(({ status }) => status === "pending").length,
    priced: coverage.length, matched: matched.length, quality: describe(coverage.map(({ quality }) => quality)),
    recordedEfficiency: describe(input.map(({ recordedEfficiency }) => recordedEfficiency)),
    profitLeft: describe(coverage.map(({ profitLeft }) => profitLeft)),
    better: percentage(coverage.filter(({ favorable }) => favorable > EPS).length, coverage.length),
    worse: percentage(coverage.filter(({ adverse }) => adverse < -EPS).length, coverage.length),
    giveback: describe(rows.map(({ giveback }) => giveback)), givebackPct: describe(rows.map(({ givebackPct }) => givebackPct)),
    grossPeak: describe(rows.map(({ grossPeak }) => grossPeak)), post: postMetrics(rows, postAt, false),
    qualityDistribution: histogram(coverage.map(({ quality }) => quality)),
    givebackDistribution: histogram(rows.map(({ giveback }) => giveback))
  };
  const timing = offsets.map((seconds) => offsetMetrics(coverage, seconds, seconds === options.activeOffset));
  const post = options.windows.map((seconds) => postMetrics(rows, seconds, seconds === postAt));
  const timingIds = new Set(coverage.map(({ id }) => id));
  const groups = [...partition(rows, (row) => row[options.group])].map(([label, group]) => {
    const comparable = group.filter(({ id }) => timingIds.has(id));
    const best = offsets.map((seconds) => offsetMetrics(comparable, seconds, false))
      .filter((row) => row.n >= 10).sort((a, b) => b.average - a.average)[0] || null;
    return { label, n: group.length, comparable: comparable.length,
      quality: describe(comparable.map(({ quality }) => quality)),
      giveback: describe(group.map(({ giveback }) => giveback)),
      profitLeft: describe(comparable.map(({ profitLeft }) => profitLeft)), post: postMetrics(group, postAt, false), best };
  }).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  const trend = [...partition(rows, (row) => getPeriodKey(new Date(row.exit), options.period))].map(([period, group]) => ({
    period, n: group.length, quality: describe(group.filter(({ id }) => timingIds.has(id)).map(({ quality }) => quality)),
    giveback: describe(group.map(({ giveback }) => giveback)), post: postMetrics(group, postAt, false),
    timing: offsetMetrics(group.filter(({ id }) => timingIds.has(id)), options.activeOffset, false)
  }));
  const recent = rows.slice(-20);
  const historical = rows.slice(0, Math.max(0, rows.length - 20));
  const cohort = (group) => ({
    n: group.length, quality: describe(group.filter(({ id }) => timingIds.has(id)).map(({ quality }) => quality)),
    giveback: describe(group.map(({ giveback }) => giveback)), post: postMetrics(group, postAt, false),
    timing: offsetMetrics(group.filter(({ id }) => timingIds.has(id)), options.activeOffset, false)
  });
  const comparison = { recent: cohort(recent), historical: cohort(historical) };
  const alerts = [changeAlert(comparison.recent.quality, comparison.historical.quality, "Exit quality", 10),
    changeAlert(comparison.recent.giveback, comparison.historical.giveback, "Giveback",
      Math.max(5, Math.abs(comparison.historical.giveback.average ?? 0) * 0.2))].filter(Boolean);
  const drill = [...rows].reverse().map(({ scenarios, postByTime, ...row }) => ({
    id: row.id, symbol: row.symbol, setup: row.setup, timestamp: row.timestamp, actualNet: row.actualNet, actualGross: row.actualGross,
    grossPeak: row.grossPeak, giveback: row.giveback, givebackPct: row.givebackPct, heldResolution: row.heldResolution,
    quality: timingIds.has(row.id) ? row.quality : null, profitLeft: timingIds.has(row.id) ? row.profitLeft : null,
    offset: timingIds.has(row.id) ? scenarios.get(options.activeOffset) ?? null : null, post: postByTime.get(postAt) ?? null,
    approximate: row.approximate, resolution: row.resolution, group: row[options.group]
  }));
  return { summary, timing, post, groups, trend, rolling: rollingQuality(coverage, options.rolling), comparison, alerts, drill };
}
