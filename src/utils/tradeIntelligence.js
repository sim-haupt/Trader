const { completedBars, marketDayKey, marketTime } = require("./marketSession");

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function wilder(values, length) {
  if (values.length < length) return null;
  return values.slice(length).reduce((avg, value) => (avg * (length - 1) + value) / length, mean(values.slice(0, length)));
}

function returns(close, base) {
  return close > 0 && base > 0 ? (close / base - 1) * 100 : null;
}

function newsCategory(news) {
  if (!news?.length) return null;
  const first = news[0].headline || "";
  if (/earnings|quarterly results|revenue|guidance/i.test(first)) return "Earnings / guidance";
  if (/fda|phase [123]|clinical trial|approval/i.test(first)) return "Clinical / regulatory";
  if (/offering|financing|private placement/i.test(first)) return "Financing";
  if (/acqui(?:re|sition)|merger|buyout/i.test(first)) return "M&A";
  if (/contract|partnership|agreement/i.test(first)) return "Contract / partnership";
  return "Other news";
}

async function buildEntrySnapshot({ fill, side, bars, daily, benchmark, benchmarkDaily, adjustedMinutes = [], news, relativeVolume, feed }) {
  const { calculateEmaSeries, calculateVwapSeries, calculateMacdSeries } = await import("../../frontend/src/utils/priceIndicators.mjs");
  const minute = completedBars(bars, fill.time);
  const dayKey = marketDayKey(fill.time);
  const prior = daily.filter((row) => marketDayKey(new Date(row.time * 1000)) < dayKey);
  const spyPrior = benchmarkDaily.filter((row) => marketDayKey(new Date(row.time * 1000)) < dayKey);
  const close = minute.at(-1)?.close ?? null;
  const vwap = calculateVwapSeries(minute).at(-1)?.value ?? null;
  const ema9 = minute.length >= 9 ? calculateEmaSeries(minute, 9).at(-1).value : null;
  const ema20 = minute.length >= 20 ? calculateEmaSeries(minute, 20).at(-1).value : null;
  const macd = minute.length >= 35 ? calculateMacdSeries(minute) : null;
  const changes = minute.slice(1).map((row, index) => row.close - minute[index].close);
  const avgGain = wilder(changes.map((value) => Math.max(value, 0)), 14);
  const avgLoss = wilder(changes.map((value) => Math.max(-value, 0)), 14);
  const rsi = avgGain === null ? null : avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  const atr = wilder(prior.slice(1).map((row, index) =>
    Math.max(row.high - row.low, Math.abs(row.high - prior[index].close), Math.abs(row.low - prior[index].close))), 14);
  const openTime = marketTime(dayKey, "09:30").getTime();
  const beforeOpen = minute.filter(({ time }) => time * 1000 < openTime);
  const spyReturn = returns(completedBars(benchmark, fill.time).at(-1)?.close, spyPrior.at(-1)?.close);
  const adjustedPremarket = completedBars(adjustedMinutes, fill.time)
    .filter(({ time }) => time * 1000 < openTime);
  const premarketGap = returns(adjustedPremarket.at(-1)?.close, prior.at(-1)?.close);
  const benchmarkRanges = spyPrior.slice(1).map((row, index) => {
    const previousClose = spyPrior[index].close;
    return Math.max(row.high - row.low, Math.abs(row.high - previousClose), Math.abs(row.low - previousClose)) / previousClose * 100;
  }).filter(Number.isFinite);
  const recentBenchmarkRange = benchmarkRanges.length >= 34 ? mean(benchmarkRanges.slice(-14)) : null;
  const referenceRange = benchmarkRanges.length >= 34 ? mean(benchmarkRanges.slice(-74, -14)) : null;
  const regime = referenceRange > 0 ? recentBenchmarkRange > referenceRange * 1.2 ? "Elevated volatility"
    : recentBenchmarkRange < referenceRange * 0.8 ? "Low volatility" : "Typical volatility" : null;
  const direction = side === "SHORT" ? -1 : 1;
  const level = minute.length >= 20 ? (direction > 0 ? Math.max(...minute.slice(-20).map((row) => row.high))
    : Math.min(...minute.slice(-20).map((row) => row.low))) : null;
  let setupCandidate = null;
  if (!fill.approximate && fill.price && ema9 !== null && ema20 !== null && vwap !== null) {
    if (level !== null && (fill.price - level) * direction > 0 && (ema9 - ema20) * direction > 0) {
      setupCandidate = direction > 0 ? "Range breakout" : "Range breakdown";
    } else if ((ema9 - ema20) * direction > 0 && (fill.price - vwap) * direction >= 0 &&
      Math.abs(fill.price - ema9) / fill.price <= 0.003) {
      setupCandidate = "Trend pullback";
    }
  }

  const referencePrice = fill.approximate ? close : fill.price;
  return {
    asOf: fill.time.toISOString(), feed, price: referencePrice,
    premarketVolume: beforeOpen.length ? beforeOpen.reduce((sum, row) => sum + row.volume, 0) : null,
    premarketGap, relativeVolume, vwap, vwapDistance: returns(referencePrice, vwap), ema9, ema20, ema9Distance: returns(referencePrice, ema9), ema20Distance: returns(referencePrice, ema20),
    sma50: prior.length >= 50 ? mean(prior.slice(-50).map(({ close }) => close)) : null,
    sma200: prior.length >= 200 ? mean(prior.slice(-200).map(({ close }) => close)) : null,
    rsi, atr, atrPercent: atr !== null && prior.at(-1)?.close > 0 ? atr / prior.at(-1).close * 100 : null,
    macd: macd?.macdLine.at(-1)?.value ?? null, macdSignal: macd?.signalLine.at(-1)?.value ?? null,
    rangePercent: minute.length ? returns(Math.max(...minute.map(({ high }) => high)), Math.min(...minute.map(({ low }) => low))) : null,
    benchmarkReturn: spyReturn, marketDirection: spyReturn === null ? null : spyReturn > 0.3 ? "Up" : spyReturn < -0.3 ? "Down" : "Flat",
    benchmarkRangePercent: recentBenchmarkRange, regime,
    news, catalyst: newsCategory(news), setupCandidate
  };
}

function efficiency(bars, price, side, exit = false) {
  if (!bars.length || !(price > 0)) return null;
  const low = Math.min(...bars.map((bar) => bar.low));
  const high = Math.max(...bars.map((bar) => bar.high));
  if (!(high > low)) return null;
  const location = Math.min(1, Math.max(0, (price - low) / (high - low)));
  return (exit === (side === "LONG") ? location : 1 - location) * 100;
}

module.exports = { buildEntrySnapshot, efficiency };
