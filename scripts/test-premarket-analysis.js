const { test } = require("node:test");
const assert = require("node:assert/strict");
const { completedBars, marketDayKey, marketTime } = require("../src/utils/marketSession");
const { summarizePremarket, classifyPremarket } = require("../src/utils/premarketMetrics");
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

test("premarket leaderboard excludes stale prints and ranks by gains and eligible volume", () => {
  const symbols = ["A", "B", "C", "D"];
  const daily = new Map(symbols.map((symbol) => [symbol, [{ close: 10 }]]));
  const minutes = new Map([
    ["A", [bar("07:59", 15, 30_000, 20)]],
    ["B", [bar("07:58", 12, 30_000, 15)]],
    ["C", [bar("07:46", 30, 50_000)]],
    ["D", [bar("07:59", 14, 100)]]
  ]);
  const result = summarizePremarket(symbols, minutes, daily, at("08:00"), 100_000);
  assert.deepEqual(result.top.map(({ symbol }) => symbol), ["A", "B"]);
  assert.deepEqual(result.counts, [2, 2, 1]);
  assert.equal(result.totalDollarVolume, 810_000);
  assert.equal(result.top[0].retained, 50);
});

test("heat requires comparable sessions, handles ties, and identifies a rising cycle", () => {
  const make = (n, volume = 100_000) => ({
    universeSize: 20, covered: 20, counts: [n, 0, 0], medianTopFive: n,
    totalDollarVolume: n * 1000, top: [{ symbol: "A", volume }], symbolVolumes: { A: volume }
  });
  const baseline = Array.from({ length: 28 }, (_, i) => make(i < 4 ? 90 : i < 9 ? 1 : 20));
  assert.equal(classifyPremarket(make(20), baseline.slice(0, 9)).heat, null);
  assert.equal(classifyPremarket(make(20), Array(20).fill(make(20))).score, 50);
  const rising = classifyPremarket(make(100, 200_000), baseline);
  assert.equal(rising.heat, "Hot");
  assert.equal(rising.cycle, "Heating up");
  assert.equal(rising.top[0].relativeVolume, 2);
  assert.equal(classifyPremarket({ ...make(100), covered: 5 }, baseline).heat, null);
});
