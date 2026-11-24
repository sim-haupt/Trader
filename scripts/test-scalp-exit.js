const test = require("node:test");
const assert = require("node:assert/strict");
const { exitTimingPlan } = require("../src/utils/exitTiming");
const { scalpComparison } = require("../src/utils/scalpExit");
const { simulateScalpExit } = require("../src/utils/scalpStrategy");

const open = Date.parse("2026-07-10T08:00:00-04:00");
const at = (seconds) => open + seconds * 1000;
const tick = (seconds, price) => ({ time: at(seconds), end: at(seconds), open: price, high: price, low: price, close: price });
const bar = (seconds, width, openPrice, high, low, close) =>
  ({ time: at(seconds), end: at(seconds + width), open: openPrice, high, low, close });
const fill = (seconds, action, price, quantity) => ({ occurredAt: new Date(at(seconds)), action, price, quantity, source: "IMPORTED" });
const plan = (short = false, seconds = 10) => exitTimingPlan({
  side: short ? "SHORT" : "LONG", entryDate: at(0), exitDate: at(seconds), grossPnl: 20, fees: 1.5, commissions: 0.5,
  executions: [fill(0, short ? "SELL" : "BUY", 10, 100), fill(seconds, short ? "BUY" : "SELL", short ? 9.8 : 10.2, 100)]
});
const market = (events, resolution = "tick") => ({ events, resolution, feed: "fixture" });
const settings = (type, overrides = {}) => ({ type, holdSeconds: 20, stop: 2, threshold: 2, partial: 50, addedCost: 1, ...overrides });

test("second-based long exits use completed observations, raw timestamp precision, and post-exit extrema", () => {
  const path = market([tick(8, 10.1), { ...tick(10.4, 10.21), stamp: "2026-07-10T12:00:10.400000123Z" },
    tick(11.5, 10.3), tick(12.1, 10.5), tick(14, 10.3), tick(16, 9.9)]);
  const result = scalpComparison(plan(), path, 20, at(50), {
    time: new Date(at(9.9)).toISOString(), bid: 10.22, ask: 10.24
  });
  const selected = (seconds) => result.points.find((row) => row.seconds === seconds);
  assert.equal(selected(1).observedAt, "2026-07-10T12:00:10.400000123Z");
  assert.equal(selected(2).price, 10.3);
  assert.equal(selected(15).net, undefined);
  assert.equal(selected(-10).reason, "Before entry");
  assert.ok(Math.abs(result.metrics.postMfe - 30) < 1e-8);
  assert.ok(Math.abs(result.metrics.postMae - 30) < 1e-8);
  assert.equal(result.metrics.peakSeconds, 2.1);
  assert.equal(result.metrics.reversalSeconds, 1.9);
  assert.ok(Math.abs(result.metrics.slippage.perShare - .02) < 1e-8);
});

test("shorts and very short trades respect first fill and fallback provides minute offsets only", () => {
  const short = plan(true, 2);
  const result = scalpComparison(short, market([tick(1, 9.7), tick(1.9, 9.7), tick(2.9, 9.5), tick(4, 10.1)]), 5, at(10));
  assert.equal(result.points.find((row) => row.seconds === 1).price, 9.5);
  assert.ok(result.metrics.postMfe > 29);
  assert.ok(result.metrics.postMae > 29);
  const fallback = scalpComparison(short, market([bar(0, 60, 10, 11, 9, 9.5)], "minute"), 120, at(180));
  assert.deepEqual(fallback.points.map(({ seconds }) => seconds), [-120, -60, 0, 60, 120]);
  assert.equal(fallback.points.at(-1).reason, "No recent completed observation");
  const noPrint = scalpComparison(short, market([tick(1.9, 9.7)]), 5, at(10));
  assert.equal(noPrint.points.find(({ seconds }) => seconds === 1).net, undefined);
});

test("fixed target and stop use the next observed executable proxy and add configured fees", () => {
  const straight = simulateScalpExit(plan(), market([tick(2, 10), tick(3, 10.3), tick(4, 10.25)]), settings("target"));
  assert.ok(Math.abs(straight.net - 22) < 1e-8);
  assert.equal(straight.orders[0].price, 10.25);
  const short = simulateScalpExit(plan(true), market([tick(2, 10), tick(3, 10.3), tick(4, 10.25)]), settings("stop"));
  assert.ok(Math.abs(short.net - (-28)) < 1e-8);
  assert.match(simulateScalpExit(plan(), market([tick(2, 10), tick(3, 10.3), tick(15, 12)]), settings("target")).reason, /recent price/);
});

test("trailing stop avoids ambiguous candles and partial rules account for scale-ins and both exits", () => {
  const ambiguous = market([bar(1, 1, 10, 11, 9.99, 10.5), bar(2, 1, 10.5, 10.55, 10.3, 10.4)], "second");
  assert.match(simulateScalpExit(plan(), ambiguous, settings("trail")).reason, /unknown order/);
  const trailing = simulateScalpExit(plan(), market([tick(1, 10), tick(2, 10.6), tick(3, 10.3), tick(4, 10.25)]), settings("trail"));
  assert.equal(trailing.orders[0].trigger, "Trailing stop");

  const scaled = exitTimingPlan({ side: "LONG", entryDate: at(0), exitDate: at(10), fees: 2,
    executions: [fill(0, "BUY", 10, 50), fill(2, "BUY", 10, 50), fill(7, "SELL", 10.5, 25), fill(10, "SELL", 10.5, 75)] });
  const partial = simulateScalpExit(scaled, market([tick(1, 10), tick(3, 10.3), tick(4, 10.4), tick(9, 10.2), tick(20, 10.8)]), settings("partial"));
  assert.deepEqual(partial.orders.map(({ quantity, price }) => [quantity, price]), [[50, 10.4], [50, 10.8]]);
  assert.ok(Math.abs(partial.net - 56) < 1e-8);
  const fillInside = market([bar(1.5, 1, 10, 10.05, 9.95, 10)], "second");
  assert.match(simulateScalpExit(scaled, fillInside, settings("partial")).reason, /recorded fill/);
});

test("rejects ambiguous partial targets and stops, supports break-even and EMA, and never fills before entry", () => {
  const ambiguous = market([bar(1, 1, 10, 10.5, 9.5, 10)], "second");
  assert.match(simulateScalpExit(plan(), ambiguous, settings("partial")).reason, /unknown order/);
  const even = simulateScalpExit(plan(), market([tick(1, 10.4), tick(2, 10), tick(3, 9.95)]), settings("breakEven"));
  assert.equal(even.orders[0].trigger, "Return to entry");
  const ema = simulateScalpExit(plan(), market([...Array.from({ length: 9 }, (_, index) => tick(index + 1, 11)),
    tick(10, 10.5), tick(11, 10.4)]), settings("ema"));
  assert.equal(ema.orders[0].trigger, "EMA cross");
  const timed = simulateScalpExit(plan(), market([tick(19.99, 20), tick(20.1, 10.5)]), settings("time"));
  assert.equal(timed.orders[0].price, 10.5);
});

test("thirty-minute chart is bounded even on a dense tick path", () => {
  const large = market(Array.from({ length: 20000 }, (_, index) => tick(index / 10, 10 + index % 10 / 100)));
  const output = scalpComparison(plan(), large, 1800, at(2000));
  assert.equal(output.points.length, 3601);
  assert.ok(output.points.some(({ delta }) => Number.isFinite(delta)));
});
