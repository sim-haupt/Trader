const test = require("node:test");
const assert = require("node:assert/strict");
const { marketTime } = require("../src/utils/marketSession");
const { buildEntrySnapshot, efficiency } = require("../src/utils/tradeIntelligence");
const { calculateEntryOutcome, firstFill } = require("../src/utils/entryReview");

test("entry snapshot uses completed bars and previous daily sessions only", async () => {
  const day = "2026-11-23";
  const fillTime = marketTime(day, "08:20:42");
  const base = marketTime(day, "07:40").getTime() / 1000;
  const bars = Array.from({ length: 45 }, (_, index) => {
    const price = index >= 40 ? 500 : 10 + index * .02;
    return { time: base + index * 60, high: price + .01, low: price - .01, close: price, volume: 1000 };
  });
  const daily = Array.from({ length: 210 }, (_, index) =>
    ({ time: marketTime(day, "00:00").getTime() / 1000 - 86400 * (210 - index), high: 11, low: 9, close: 10 }));
  daily.push({ time: marketTime(day, "00:00").getTime() / 1000, high: 900, low: 800, close: 700 });
  const snapshot = await buildEntrySnapshot({ fill: { time: fillTime, price: 10.9 }, side: "LONG",
    bars, adjustedMinutes: bars, daily, benchmark: bars, benchmarkDaily: daily,
    news: [{ headline: "Acquisition announced" }], relativeVolume: 1.9, feed: "sip"
  });
  assert.equal(snapshot.premarketVolume, 40_000);
  assert.equal(snapshot.sma200, 10);
  assert.ok(Math.abs(snapshot.premarketGap - 7.8) < 1e-8);
  assert.equal(snapshot.atrPercent, 20);
  assert.equal(snapshot.catalyst, "M&A");
  assert.equal(snapshot.setupCandidate, "Range breakout");
  assert.equal(snapshot.rsi, 100);
});

test("entry and exit efficiency are direction-aware and require a nonzero range", () => {
  const bars = [{ low: 8, high: 12 }];
  assert.equal(efficiency(bars, 9, "LONG"), 75);
  assert.equal(efficiency(bars, 9, "SHORT"), 25);
  assert.equal(efficiency(bars, 9, "LONG", true), 25);
  assert.equal(efficiency(bars, 9, "SHORT", true), 75);
  assert.equal(efficiency([{ low: 8, high: 8 }], 8, "LONG"), null);
});

test("excursion markers carry the time and price of genuine in-position extremes", () => {
  const entryDate = new Date("2026-11-23T13:00:00Z");
  const exitDate = new Date("2026-11-23T13:03:00Z");
  const trade = { entryDate, exitDate, side: "LONG", executions: [
    { action: "BUY", occurredAt: entryDate, price: 10, quantity: 100, source: "IMPORTED" },
    { action: "SELL", occurredAt: exitDate, price: 11, quantity: 100, source: "IMPORTED" }
  ] };
  const time = entryDate.getTime() / 1000;
  const result = calculateEntryOutcome(trade, firstFill(trade), [
    { time, low: 8, high: 10, close: 10 },
    { time: time + 60, low: 9, high: 11, close: 10 },
    { time: time + 120, low: 10, high: 12, close: 12 }
  ], null);
  assert.deepEqual(result.mfePoint, { time: time + 120, price: 12 });
  assert.deepEqual(result.maePoint, { time, price: 8 });
});
