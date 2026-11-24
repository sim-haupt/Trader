const { positionBefore } = require("./exitTiming");

const SECOND_OFFSETS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 120, 300];
const MINUTE_OFFSETS = [60, 300, 900, 1800];

function latestCompleted(events, time) {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (events[mid].end <= time) low = mid + 1;
    else high = mid;
  }
  return events[low - 1];
}

function scalpComparison(plan, market, windowSeconds, now, quote) {
  const { events, resolution } = market;
  const step = resolution === "minute" ? 60 : 1;
  const maxAge = resolution === "minute" ? 60_000 : 5000;
  const points = [];
  for (let seconds = -Math.floor(windowSeconds / step) * step; seconds <= windowSeconds; seconds += step) {
    const time = plan.exit + seconds * 1000;
    const event = latestCompleted(events, time);
    const priceKnown = time <= now && event?.close > 0 && time - event.end < maxAge && (seconds <= 0 || event.end > plan.exit);
    const sample = { seconds, time, ...(priceKnown && { price: event.close, observedAt: event.stamp ?? event.end }) };
    if (!seconds) points.push({ ...sample, net: plan.actualNet, actual: true });
    else if (time <= plan.entry) points.push({ ...sample, reason: "Before entry" });
    else if (time > now) points.push({ ...sample, reason: "Time has not occurred" });
    else {
      const { position, cash, lastEntry } = positionBefore(plan, time);
      if (!priceKnown || event.end <= lastEntry) points.push({ ...sample, reason: "No recent completed observation" });
      else if (!position) points.push({ ...sample, reason: "No open position" });
      else {
        const delta = cash + position * event.close - plan.actualGross;
        points.push({ ...sample, delta, net: plan.actualNet + delta });
      }
    }
  }
  const valid = points.filter((point) => !point.actual && Number.isFinite(point.net));
  const best = valid.reduce((best, row) => !best || row.delta > best.delta ? row : best, null);
  const worst = valid.reduce((worst, row) => !worst || row.delta < worst.delta ? row : worst, null);
  const upper = Math.max(0, best?.delta ?? 0);
  const lower = Math.min(0, worst?.delta ?? 0);
  const postLeft = valid.reduce((best, row) => row.seconds > 0 ? Math.max(best ?? 0, row.delta) : best, null);
  const post = events.filter((event) => event.time > plan.exit && event.end <= Math.min(now, plan.exit + windowSeconds * 1000));
  let peak;
  let low;
  for (const event of post) {
    const favorable = plan.direction * ((plan.direction > 0 ? event.high : event.low) - plan.exitPrice);
    const adverse = plan.direction * (plan.exitPrice - (plan.direction > 0 ? event.low : event.high));
    if (!peak || favorable > peak.value) peak = { value: favorable, time: event.end };
    if (low == null || adverse > low) low = adverse;
  }
  const retrace = peak?.value > 0 && post.find((event) => event.end > peak.time &&
    plan.direction * (event.close - plan.exitPrice) <= peak.value / 2);
  let breakEven = 0;
  let previous = plan.actualNet;
  for (const row of points.filter((item) => item.seconds > 0)) {
    if (previous != null && previous < 0 && row.net >= 0) breakEven += 1;
    previous = row.net ?? null;
  }
  const quoteTime = quote ? Date.parse(quote.time) : null;
  const validQuote = quoteTime < plan.exit && plan.exit - quoteTime <= 2000 && quote?.bid > 0 && quote.ask >= quote.bid;
  const quotePrice = validQuote ? (plan.direction > 0 ? quote.bid : quote.ask) : null;

  return { points, metrics: {
    best, worst, profitLeft: postLeft, quality: upper > lower ? -lower / (upper - lower) * 100 : null,
    postMfe: peak ? Math.max(0, peak.value * plan.finalShares) : null,
    postMae: low == null ? null : Math.max(0, low * plan.finalShares),
    peakSeconds: peak?.value > 0 ? (peak.time - plan.exit) / 1000 : null,
    reversalSeconds: retrace ? (retrace.end - peak.time) / 1000 : null,
    breakEven: valid.some((row) => row.seconds > 0) ? breakEven : null,
    slippage: quotePrice != null ? { perShare: (quotePrice - plan.exitPrice) * plan.direction, quotePrice, time: quote.time } : null
  } };
}

module.exports = { SECOND_OFFSETS, MINUTE_OFFSETS, latestCompleted, scalpComparison };
