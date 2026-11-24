const { test } = require("node:test");
const assert = require("node:assert/strict");
const { completedBars, marketDayKey, marketTime } = require("../src/utils/marketSession");
const { firstFill, calculateEntryOutcome } = require("../src/utils/entryReview");

const day = "2026-11-23";
const at = (clock) => marketTime(day, clock);
const bar = (clock, close, volume = 10_000, high = close, low = close) =>
  ({ time: at(clock).getTime() / 1000, open: close, close, volume, high, low });

test("blind cutoffs exclude the complete candle containing the fill and use New York DST", () => {
  const bars = [bar("08:41", 5), bar("08:42", 6), bar("08:43", 7)];
  const fill = at("08:42:17");
  assert.equal(fill.toISOString(), "2026-11-23T13:42:17.000Z");
  assert.equal(marketTime("2026-07-13", "08:42:17").toISOString(), "2026-07-13T12:42:17.000Z");
  assert.equal(marketDayKey(new Date("2026-11-23T02:00:00Z")), "2026-11-22");
  assert.deepEqual(completedBars(bars, fill).map(({ close }) => close), [5]);
  assert.deepEqual(completedBars(bars, at("08:42")).map(({ close }) => close), [5]);
});

test("review anchors on the first execution and marks incomplete entry records as approximate", () => {
  const entryDate = at("08:42:17");
  const trade = {
    entryDate, entryPrice: 6, side: "LONG",
    executions: [
      { occurredAt: entryDate, price: 5, quantity: 50, action: "BUY", source: "IMPORTED" },
      { occurredAt: at("08:44"), price: 7, quantity: 50, action: "BUY", source: "IMPORTED" }
    ]
  };
  assert.equal(firstFill(trade).price, 5);
  assert.equal(firstFill(trade).approximate, false);
  assert.equal(firstFill({ ...trade, executions: [] }).approximate, true);
  const averaged = firstFill({ ...trade, executions: [], reportedExecutionCount: 4 });
  assert.equal(averaged.price, null);
  assert.equal(averaged.quantity, null);
});

test("short excursion uses scale-outs and skips bars that contain a fill", () => {
  const entryDate = at("08:42:17");
  const exitDate = at("08:48:10");
  const trade = {
    entryDate, exitDate, side: "SHORT",
    executions: [
      { occurredAt: entryDate, price: 5, quantity: 100, action: "SELL", source: "IMPORTED" },
      { occurredAt: at("08:44:12"), price: 4, quantity: 50, action: "BUY", source: "IMPORTED" },
      { occurredAt: exitDate, price: 3, quantity: 50, action: "BUY", source: "IMPORTED" }
    ]
  };
  const bars = [
    bar("08:42", 4.5, 10_000, 10, 1),
    bar("08:43", 4.5, 10_000, 5.5, 4.5),
    bar("08:44", 4, 10_000, 10, 1),
    bar("08:45", 3, 10_000, 4, 3),
    bar("08:46", 3), bar("08:47", 3)
  ];
  const result = calculateEntryOutcome(trade, firstFill(trade), bars, 5.25);
  assert.equal(result.mfe, 150);
  assert.equal(result.mae, 50);
  assert.equal(result.slippagePerShare, 0.25);
  assert.equal(Math.round(result.checkpoints[0].movePercent), 10);
  assert.equal(Math.round(result.checkpoints[1].movePercent), 40);
  assert.equal(result.checkpoints[2].movePercent, null);
});
