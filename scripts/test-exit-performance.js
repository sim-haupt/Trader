const test = require("node:test");
const assert = require("node:assert/strict");
const { exitTimingPlan } = require("../src/utils/exitTiming");
const { makeExitPerformance, measureEntry } = require("../src/utils/exitPerformance");

const begin = Date.parse("2026-07-10T09:29:55-04:00");
const at = (seconds) => begin + seconds * 1000;
const fill = (seconds, action, price, quantity) => ({ occurredAt: at(seconds), action, price, quantity, source: "IMPORTED" });
const tick = (seconds, price) => ({ time: at(seconds), end: at(seconds), open: price, high: price, low: price, close: price });
const market = (events, resolution = "tick") => ({ events, resolution });
const to = (result, seconds) => result.offsets.find(([offset]) => seconds === offset);
const approximately = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `Expected ${expected}, got ${actual}`);

test("30-second entry comparison uses a recent completed price and reports directional quote cost", () => {
  const first = { time: new Date(begin), price: 10, approximate: false };
  const quote = { bid: 9.89, ask: 10.09, time: new Date(at(-0.3)).toISOString() };
  const prints = market([tick(22, 20), tick(29, 9.9), tick(31, 12)]);
  const long = measureEntry(first, 1, prints, quote, at(60));
  approximately(long.move, -1);
  approximately(long.midpointCost, 0.01 / 9.99 * 10_000);
  const short = measureEntry(first, -1, prints, quote, at(60));
  approximately(short.move, 1);
  approximately(short.midpointCost, -long.midpointCost);
  assert.deepEqual(measureEntry({ ...first, approximate: true }, 1, prints, quote, at(60)),
    { move: long.move, midpointCost: null, approximate: true });
  for (const missing of [market([tick(20, 10)]), market([tick(29, 10)], "minute"), market([tick(31, 10)])]) {
    assert.equal(measureEntry(first, 1, missing, { ...quote, time: new Date(at(-3)) }, at(60)), null);
  }
  assert.equal(measureEntry(first, 1, prints, null, at(29.9)), null);
});

test("accounts for partial fills, fees, quote spreads and premarket to regular transition", () => {
  const plan = exitTimingPlan({
    side: "LONG", entryDate: at(0), exitDate: at(10), grossPnl: 160, fees: 1.25, commissions: .75,
    executions: [fill(0, "BUY", 10, 100), fill(4, "SELL", 11, 40), fill(10, "SELL", 12, 60)]
  });
  const historical = market([tick(2, 13), tick(4, 30), tick(5, 11.5), tick(10, 12), tick(12, 14), tick(14, 10)]);
  const quotes = [{ end: at(11.9), bid: 13.8, ask: 14.1, bidSize: 2, askSize: 2 }];
  const result = makeExitPerformance(plan, historical, quotes, historical, at(320));
  assert.equal(result.actualNet, 158);
  assert.equal(result.actualGross, 160);
  assert.equal(result.grossPeak, 300); // The simultaneous print at the partial exit is excluded.
  assert.equal(result.giveback, 140);
  approximately(to(result, -5)[1], -30);
  approximately(to(result, 2)[1], 120);
  approximately(to(result, 2)[2], 108);
  assert.equal(to(result, 4)[2], null);
  const [ , move, mfe, mae, peak, adverse, newExtreme, returned ] = result.post.find(([seconds]) => seconds === 4);
  assert.ok(move < 0);
  assert.deepEqual([mfe, mae, peak, adverse, newExtreme, returned], [120, 120, 2, 4, true, true]);
  assert.equal(result.post.find(([seconds]) => seconds === 30), undefined);
});

test("short quote estimates use the ask and minute fallback never prices sub-minute offsets", () => {
  const plan = exitTimingPlan({ side: "SHORT", entryDate: at(0), exitDate: at(2), entryPrice: 10, exitPrice: 9.8, quantity: 100, fees: 2 });
  const ticks = market([tick(1, 9.9), tick(3, 9.6)]);
  const quoted = makeExitPerformance(plan, ticks, [
    { end: at(2.9), bid: 9.55, ask: 9.65, bidSize: 1, askSize: 1 },
    { end: at(4), bid: 10, ask: 9, bidSize: 1, askSize: 1 }
  ], ticks, at(320));
  approximately(to(quoted, 1)[2], 15);
  assert.equal(to(quoted, 2)[2], null);
  assert.equal(to(quoted, -2), undefined);
  const minute = market([{ time: at(5), end: at(65), open: 9.5, high: 9.6, low: 9.2, close: 9.4 }], "minute");
  const missing = makeExitPerformance(plan, minute, [], minute, at(320));
  assert.equal(missing.grossPeak, null);
  assert.equal(missing.giveback, null);
  assert.ok(missing.offsets.every(([seconds]) => seconds % 60 === 0));
  assert.equal(to(missing, 1), undefined);
});
