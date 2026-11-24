const test = require("node:test");
const assert = require("node:assert/strict");
const { exitTimingPlan, compareExitTiming } = require("../src/utils/exitTiming");

const at = (clock) => Date.parse(`2026-11-20T${clock}-05:00`);
const fill = (clock, action, price, quantity) => ({ occurredAt: at(clock), action, price, quantity, source: "IMPORTED" });
const bar = (clock, close) => ({ time: at(clock) / 1000, close });

test("replaces the final exit while preserving partial fills and recorded costs", () => {
  const plan = exitTimingPlan({
    side: "LONG", entryDate: at("08:00:15"), exitDate: at("08:10:15"), grossPnl: 160, commissions: 1, fees: 1,
    executions: [fill("08:00:15", "BUY", 10, 100), fill("08:04:15", "SELL", 11, 40), fill("08:10:15", "SELL", 12, 60)]
  });
  assert.equal(plan.actualNet, 158);
  const rows = compareExitTiming(plan, [
    bar("08:04:00", 11.5), bar("08:05:00", 200), bar("08:14:00", 14), bar("08:18:00", 10)
  ], at("08:40:15"));
  assert.deepEqual(rows.filter(({ net }) => net != null).map(({ minutes, net, delta }) => [minutes, net, delta]),
    [[-5, 128, -30], [5, 278, 120]]);
  assert.equal(rows.find(({ minutes }) => minutes === -15).reason, "Before the entry");
  assert.equal(rows.find(({ minutes }) => minutes === 15).reason, "No completed candle near this time");
});

test("handles reported shorts and declines incomplete or future comparisons", () => {
  const trade = { side: "SHORT", entryDate: at("08:00:00"), exitDate: at("08:30:00"),
    entryPrice: 10, exitPrice: 9, quantity: 50, fees: 1 };
  const plan = exitTimingPlan(trade);
  assert.equal(plan.approximate, true);
  const rows = compareExitTiming(plan, [bar("08:34:00", 8), bar("08:44:00", 7)], at("08:40:00"));
  assert.equal(rows.find(({ minutes }) => minutes === 5).net, 99);
  assert.equal(rows.find(({ minutes }) => minutes === 15).reason, "Time has not occurred yet");
  assert.match(exitTimingPlan({ ...trade, reportedExecutionCount: 4 }).reason, /missing/);
  assert.match(exitTimingPlan({ ...trade, exitDate: null }).reason, /closed trade/);
});
