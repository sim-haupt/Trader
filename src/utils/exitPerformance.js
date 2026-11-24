const { positionBefore } = require("./exitTiming");
const { latestCompleted, scalpComparison } = require("./scalpExit");

const WINDOW = 300;

function measureHeldPath(plan, market) {
  let grossPeak = null;
  let favorablePrice = null;
  const executions = new Set(plan.fills.map(({ time }) => time));
  for (const event of market.events) {
    if (event.time <= plan.entry || event.end >= plan.exit || executions.has(event.time)) continue;
    const before = positionBefore(plan, event.time);
    const end = positionBefore(plan, event.end);
    if (!before.position || before.position !== end.position || before.cash !== end.cash) continue;
    const price = plan.direction > 0 ? event.high : event.low;
    if (!(price > 0)) continue;
    const gross = before.cash + before.position * price;
    grossPeak = Math.max(grossPeak ?? 0, gross, 0);
    favorablePrice = favorablePrice == null ? price : plan.direction > 0
      ? Math.max(favorablePrice, price) : Math.min(favorablePrice, price);
  }
  return { grossPeak, favorablePrice, heldResolution: grossPeak == null ? null : market.resolution,
    giveback: grossPeak == null ? null : Math.max(0, grossPeak - plan.actualGross),
    givebackPct: grossPeak > 0 ? Math.max(0, grossPeak - plan.actualGross) / grossPeak * 100 : null };
}

function makeExitPerformance(plan, market, quotes, heldMarket, now) {
  const rows = scalpComparison(plan, market, WINDOW, now).points;
  const step = market.resolution === "minute" ? 60 : 1;
  const byOffset = new Map(rows.map((row) => [row.seconds, row]));
  const held = measureHeldPath(plan, heldMarket);
  const offsets = [];
  const post = [];
  const position = plan.finalShares;
  const entryPrice = plan.fills[0].price;
  const events = market.events.filter((event) => event.time > plan.exit && event.end <= now);
  let index = 0;
  let favorable = null;
  let adverse = null;
  let min = Infinity;
  let max = -Infinity;

  for (let seconds = -WINDOW; seconds <= WINDOW; seconds += quotes.length ? 1 : step) {
    if (seconds === 0) continue;
    const row = byOffset.get(seconds);
    const time = plan.exit + seconds * 1000;
    let quoteDelta = null;
    if (quotes.length && time > plan.entry && time <= now) {
      const observation = latestCompleted(quotes, time);
      if (observation?.bid > 0 && observation.ask >= observation.bid && time - observation.end < 2000 &&
        (plan.direction > 0 ? observation.bidSize : observation.askSize) > 0 && (seconds < 0 || observation.end > plan.exit)) {
        const before = positionBefore(plan, time);
        if (before.position && observation.end > before.lastEntry) {
          const price = before.position > 0 ? observation.bid : observation.ask;
          quoteDelta = before.cash + before.position * price - plan.actualGross;
        }
      }
    }
    if (quoteDelta != null || row?.delta != null) offsets.push([seconds, row?.delta ?? null, quoteDelta]);

    if (seconds <= 0 || seconds % step || time > now) continue;
    while (events[index]?.end <= time) {
      const event = events[index++];
      const good = plan.direction * ((plan.direction > 0 ? event.high : event.low) - plan.exitPrice);
      const bad = plan.direction * (plan.exitPrice - (plan.direction > 0 ? event.low : event.high));
      if (!favorable || good > favorable.value) favorable = { value: good, time: event.end };
      if (!adverse || bad > adverse.value) adverse = { value: bad, time: event.end };
      min = Math.min(min, event.low);
      max = Math.max(max, event.high);
    }
    if (!favorable || row?.price == null) continue;
    const directional = plan.direction * (row.price - plan.exitPrice) / plan.exitPrice * 100;
    const reached = held.favorablePrice == null ? null
      : plan.direction * ((plan.direction > 0 ? max : min) - held.favorablePrice) > 0;
    const returned = plan.exitPrice >= entryPrice ? min <= entryPrice : max >= entryPrice;
    post.push([seconds, directional, Math.max(0, favorable.value * position), Math.max(0, adverse.value * position),
      favorable.value > 0 ? (favorable.time - plan.exit) / 1000 : null,
      adverse.value > 0 ? (adverse.time - plan.exit) / 1000 : null, reached, returned]);
  }

  return { resolution: market.resolution, feed: market.feed, approximate: plan.approximate,
    actualNet: plan.actualNet, actualGross: plan.actualGross, entry: plan.entry, exit: plan.exit,
    offsets, post, ...held };
}

module.exports = { WINDOW, makeExitPerformance, measureHeldPath };
