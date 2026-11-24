import assert from "node:assert/strict";
import test from "node:test";
import { buildNextTradeStreaks, buildOpeningPerformance, buildRiskAnalytics, makeRiskRecords, summarizeDiscipline } from "./riskAnalytics.js";
import { monteCarlo, reconstructExit, simulateTrades } from "./tradeSimulation.js";

const timestamp = (clock, day = "2026-11-23") => new Date(`${day}T${clock}-05:00`).getTime();
function trade(id, entry, exit, grossPnl, extra = {}) {
  return {
    id, symbol: "TEST", side: "LONG", quantity: 100, entryPrice: 10,
    entryDate: entry, exitDate: exit, grossPnl, commissions: 1, fees: 1,
    entryReview: { plannedInitialRisk: 20, plannedStop: 9.9 },
    executions: [{ source: "IMPORTED", action: "BUY", quantity: 100, price: 10, occurredAt: entry }],
    ...extra
  };
}
const rows = () => makeRiskRecords([
  trade("loss", timestamp("08:00:00"), timestamp("08:05:00"), -28),
  trade("overlap", timestamp("08:04:00"), timestamp("08:20:00"), 52),
  trade("late", timestamp("08:06:00"), timestamp("08:30:00"), 12)
]);

test("reports the next entry separately after one, two, and three consecutive wins or losses", () => {
  const outcomes = [102, 52, 32, -8, -18, -28, 42];
  const records = makeRiskRecords(outcomes.map((pnl, index) =>
    trade(`trade-${index}`, timestamp(`08:0${index}:00`), timestamp(`08:0${index}:30`), pnl)));
  const next = buildNextTradeStreaks(records);
  assert.deepEqual(next.map(({ closed, expectancy, winRate }) => [closed, expectancy, winRate]), [
    [1, 50, 100], [1, 30, 100], [1, -10, 0], [1, -20, 0], [1, -30, 0], [1, 40, 100]
  ]);
});

test("uses the first later entry only, excludes ties, and resets streaks on the next day", () => {
  const day = "2026-11-24";
  const records = makeRiskRecords([
    trade("starting-win", timestamp("08:00:00"), timestamp("08:01:00"), 20),
    trade("same-time", timestamp("08:01:00"), timestamp("08:10:00"), 12),
    trade("next", timestamp("08:02:00"), timestamp("08:11:00"), 12),
    trade("overlap", timestamp("08:03:00"), timestamp("08:12:00"), 12),
    trade("next-day", timestamp("08:00:00", day), timestamp("08:05:00", day), 12)
  ]);
  assert.deepEqual(buildNextTradeStreaks(records).map(({ count }) => count), [1, 0, 0, 0, 0, 0]);
  assert.deepEqual(buildNextTradeStreaks(records, new Set(["same-time", "overlap", "next-day"]))
    .map(({ count }) => count), [0, 0, 0, 0, 0, 0]);
});

test("opening-day groups measure only trades entered after the relevant opening closes", () => {
  const next = "2026-11-24";
  const records = makeRiskRecords([
    trade("large loss", timestamp("08:00:00"), timestamp("08:05:00"), -118),
    trade("second loss", timestamp("08:03:00"), timestamp("08:08:00"), -18),
    trade("between closes", timestamp("08:06:00"), timestamp("08:11:00"), 22),
    trade("after both", timestamp("08:09:00"), timestamp("08:12:00"), 42),
    trade("first win", timestamp("08:00:00", next), timestamp("08:03:00", next), 22),
    trade("second win", timestamp("08:04:00", next), timestamp("08:05:00", next), 32),
    trade("after two wins", timestamp("08:06:00", next), timestamp("08:07:00", next), -8)
  ]);
  const ids = new Set(records.map(({ id }) => id));
  assert.deepEqual(buildOpeningPerformance(records, ids, 100).map(({ openingDays, closed, pnl }) => [openingDays, closed, pnl]),
    [[1, 2, 20], [1, 1, -10], [1, 2, 60], [1, 1, 40], [1, 2, 60]]);
  assert.equal(buildOpeningPerformance(records, ids, 150).at(-1).openingDays, 0);
  const [,, firstLoss, secondLoss] = buildOpeningPerformance(records, new Set(["between closes"]), 100);
  assert.equal(firstLoss.pnl, 20);
  assert.equal(secondLoss.pnl, null);
});

test("discipline uses only assessed rules and does not depend on realized P&L", () => {
  const report = { setup: "followed", entry: "followed", exit: "unknown",
    rules: [{ id: "x", result: "followed" }, { id: "x", result: "followed" }], tags: ["FOMO"] };
  assert.deepEqual(summarizeDiscipline(report), { checked: 3, followed: 3, violated: 0, score: 100 });
  assert.equal(summarizeDiscipline({ setup: "unknown" }).score, null);
  const sample = makeRiskRecords([trade("loss", timestamp("08:01:00"), timestamp("08:02:00"), -25,
    { analysis: { behavior: report } })]);
  const stats = buildRiskAnalytics(sample, {});
  assert.equal(stats.disciplineScore, 100);
  assert.equal(stats.behavior.find((row) => row.label === "Tag: FOMO").winRate, 0);
});

test("realized thresholds and risk exposure correctly handle overlapping trades", () => {
  const data = rows();
  const report = buildRiskAnalytics(data, { dailyLoss: 25, tradeRisk: 15, dailyExposure: 30, weeklyExposure: 50 });
  assert.equal(report.maxDailyLoss, 30);
  assert.equal(report.drawdown.maxDrawdown, 30);
  assert.equal(report.drawdown.tradesRequiredToRecover, 2);
  assert.equal(report.daily[0].peakRisk, 40);
  assert.equal(report.daily[0].dailyRisk, 60);
  assert.equal(report.weekly[0].risk, 60);
  assert.ok(!report.violations.get("overlap").includes("After daily loss limit"));
  assert.ok(report.violations.get("late").includes("After daily loss limit"));
  assert.ok(report.violations.get("late").includes("Weekly risk exposure"));
  assert.ok(Math.abs(report.plannedRiskRows[0].initial - 10) < 1e-8);
  assert.equal(buildRiskAnalytics(makeRiskRecords([trade("open", timestamp("08:00:00"), null, null, {
    entryReview: null, executions: []
  })]), {}).maxDailyLoss, null);
});

test("rescaling and hypothetical thresholds maintain chronological gating", () => {
  const data = rows();
  const simulated = simulateTrades(data, { size: 2, dailyLoss: 50 });
  assert.equal(simulated.actual.net, 30);
  assert.equal(simulated.comparable.net, 30);
  assert.equal(simulated.simulated.net, 40);
  assert.deepEqual(simulated.simulatedTrades.map(({ id }) => id), ["loss", "overlap"]);
  assert.equal(simulated.simulated.drawdown, 60);
  const fees = simulateTrades(data, { size: 1, commissionPerShare: 0, feePerShare: 0 });
  assert.equal(fees.simulated.net, 36);
  assert.equal(simulateTrades(data, { riskPerTrade: 10 }).simulated.net, 15);
  const assumed = simulateTrades(data, { winRate: 100, rewardRisk: 2, seed: 17 });
  assert.equal(assumed.simulated.net, 114);
});

test("price-path exit includes stop gaps, targets, holding time, and explicit uncertainty", () => {
  const entry = timestamp("08:00:00");
  const bar = (minute, open, high, low, close) => ({ time: entry / 1000 + minute * 60, open, high, low, close });
  const path = { entry, exit: entry + 180_000, entryPrice: 10, exitPrice: 10.5, shares: 100,
    bars: [bar(0, 10, 10.3, 9.8, 10.2), bar(1, 9.3, 10.1, 9.2, 9.4), bar(2, 9.4, 10.5, 9.35, 10.5)] };
  const gap = reconstructExit(path, 1, { stopPercent: 5 });
  assert.equal(gap.price, 9.3);
  const hold = reconstructExit(path, 1, { holdMinutes: 1 });
  assert.equal(hold.price, 10.2);
  assert.equal(hold.exit, entry + 60_000);
  const both = { ...path, bars: [bar(0, 10, 11, 9, 10)] };
  assert.match(reconstructExit(both, 1, { stopPercent: 5, targetPercent: 5 }).reason, /same candle/);
  assert.match(reconstructExit({ ...path, bars: path.bars.slice(1) }, 1, { stopPercent: 5 }).reason, /Missing minutes/);
  assert.match(reconstructExit({ ...both, entry: entry + 1000 }, 1, { stopPercent: 5 }).reason, /partial candle/);
  assert.equal(reconstructExit(path, -1, { targetPercent: 5 }).price, 9.5);
});

test("session bootstrap produces exact deterministic scenario ranges for a constant block", () => {
  const records = rows().slice(0, 1);
  const options = { trials: 100, sessions: 3, capital: 100, ruinFloor: 35, drawdownThreshold: 60, size: 1, seed: 42 };
  assert.deepEqual(monteCarlo([], options), null);
  const simulated = monteCarlo(records, options);
  assert.deepEqual(simulated.returns, [-90, -90, -90]);
  assert.deepEqual(simulated.drawdowns, [90, 90, 90]);
  assert.deepEqual(simulated.losingStreaks, [3, 3, 3]);
  assert.equal(simulated.drawdownChance, 1);
  assert.equal(simulated.ruin, 1);
  assert.ok(simulated.ruinCI[0] < 1 && simulated.ruinCI[1] <= 1);
  const reduced = monteCarlo(records, { ...options, size: 0.5 });
  assert.deepEqual(reduced.fan.at(-1).range, [55, 55]);
  assert.equal(reduced.ruin, 0);
  assert.deepEqual(simulated, monteCarlo(records, options));
});
