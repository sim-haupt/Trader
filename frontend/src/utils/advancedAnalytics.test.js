import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvancedAnalytics, normalizeAdvancedTrades } from "./advancedAnalytics.js";
import { ADVANCED_METRIC_DEFINITIONS } from "./advancedMetricDefinitions.js";

function trade(overrides = {}) {
  return {
    id: overrides.id || Math.random().toString(36).slice(2),
    symbol: "MOMO",
    side: "LONG",
    quantity: 100,
    entryPrice: 10,
    exitPrice: 10.5,
    entryDate: "2026-01-05T14:30:00.000Z",
    exitDate: "2026-01-05T14:31:00.000Z",
    grossPnl: 50,
    commissions: 1,
    fees: 0.5,
    strategy: "Opening drive",
    tags: "A setup",
    ...overrides
  };
}

test("handles empty and malformed datasets without fake zero availability", () => {
  const analytics = buildAdvancedAnalytics([null, {}, { entryDate: "bad" }]);
  assert.equal(analytics.summary.tradeCount, 0);
  assert.equal(analytics.summary.expectancy, 0);
  assert.ok(analytics.dataQualityNotices.some((notice) => notice.includes("MFE and MAE")));
});

test("calculates all-winning, all-losing, mixed, and breakeven expectancy", () => {
  const allWinning = buildAdvancedAnalytics([
    trade({ id: "w1", grossPnl: 100 }),
    trade({ id: "w2", grossPnl: 50, entryDate: "2026-01-05T14:31:00.000Z" })
  ]);
  assert.equal(allWinning.summary.winningTrades, 2);
  assert.equal(allWinning.summary.losingTrades, 0);
  assert.equal(allWinning.summary.profitFactor, null);
  assert.equal(allWinning.summary.expectancy, 73.5);

  const allLosing = buildAdvancedAnalytics([
    trade({ id: "l1", grossPnl: -100 }),
    trade({ id: "l2", grossPnl: -50, entryDate: "2026-01-05T14:31:00.000Z" })
  ]);
  assert.equal(allLosing.summary.winningTrades, 0);
  assert.equal(allLosing.summary.losingTrades, 2);
  assert.equal(allLosing.tradingCostDrag.costDragPercent, null);
  assert.equal(allLosing.summary.expectancy, -76.5);

  const mixed = buildAdvancedAnalytics([
    trade({ id: "m1", grossPnl: 101.5 }),
    trade({ id: "m2", grossPnl: -48.5, entryDate: "2026-01-05T14:31:00.000Z" }),
    trade({ id: "m3", grossPnl: 1.5, entryDate: "2026-01-05T14:32:00.000Z" })
  ]);
  assert.equal(mixed.summary.winningTrades, 1);
  assert.equal(mixed.summary.losingTrades, 1);
  assert.equal(mixed.summary.breakevenTrades, 1);
  assert.equal(mixed.summary.expectancy, 16.6667);
});

test("uses stored net/gross values and missing commissions safely", () => {
  const analytics = buildAdvancedAnalytics([
    trade({ id: "n1", grossPnl: 100, commissions: undefined, fees: undefined }),
    trade({ id: "n2", side: "SHORT", grossPnl: -25, entryDate: "2026-01-05T14:31:00.000Z" })
  ]);
  assert.equal(analytics.summary.totalNetPnl, 73.5);
  assert.equal(analytics.summary.tradeCount, 2);
});

test("derives R only from planned initial risk and marks missing risk unavailable", () => {
  const analytics = buildAdvancedAnalytics([
    trade({ id: "r1", grossPnl: 101.5, plannedInitialRisk: 50 }),
    trade({ id: "r2", grossPnl: -48.5, plannedInitialRisk: 50, entryDate: "2026-01-05T14:31:00.000Z" }),
    trade({ id: "r3", grossPnl: 100, entryDate: "2026-01-05T14:32:00.000Z" })
  ]);
  assert.equal(analytics.summary.expectancyR, 0.5);
  assert.equal(analytics.trades.filter((item) => item.rMultiple !== null).length, 2);
});

test("calculates MFE/MAE, edge ratio, capture, giveback, and winner MAE when fields exist", () => {
  const analytics = buildAdvancedAnalytics([
    trade({ id: "e1", grossPnl: 80, mfe: 120, mae: 20 }),
    trade({ id: "e2", grossPnl: -40, mfe: 30, mae: 60, entryDate: "2026-01-05T14:31:00.000Z" })
  ]);
  assert.equal(analytics.excursions.available, true);
  assert.equal(analytics.excursions.averageMfe, 75);
  assert.equal(analytics.excursions.averageMae, 40);
  assert.equal(analytics.excursions.edgeRatio, 1.875);
  assert.equal(analytics.excursions.winnerMae.sampleSize, 1);
  assert.equal(analytics.excursions.mfeCapture.sampleSize, 1);
});

test("groups multiple trades in a session and resets trade sequence per session", () => {
  const analytics = buildAdvancedAnalytics([
    trade({ id: "s1", grossPnl: 100, entryDate: "2026-01-05T14:30:00.000Z" }),
    trade({ id: "s2", grossPnl: -50, entryDate: "2026-01-05T14:31:00.000Z" }),
    trade({ id: "s3", grossPnl: 25, entryDate: "2026-01-06T14:30:00.000Z" })
  ]);
  assert.equal(analytics.sessionGiveback.largestGiveback, 51.5);
  assert.equal(analytics.tradeNumberPerformance.find((row) => row.label === "Trades 1-3").tradeCount, 3);
});

test("handles weekly, monthly, timezone, and previous-period comparisons", () => {
  const trades = [
    trade({ id: "p1", grossPnl: 100, entryDate: "2026-01-04T23:30:00.000Z" }),
    trade({ id: "p2", grossPnl: -50, entryDate: "2026-01-05T14:30:00.000Z" }),
    trade({ id: "p3", grossPnl: 75, entryDate: "2026-02-02T14:30:00.000Z" })
  ];
  const normalized = normalizeAdvancedTrades(trades);
  assert.equal(normalized[0].dayKey, "2026-01-04");

  const weekly = buildAdvancedAnalytics(trades, { mode: "weekly", periodKey: "2026-01-05" });
  assert.equal(weekly.summary.tradeCount, 1);
  assert.equal(weekly.previousSummary.tradeCount, 1);

  const monthly = buildAdvancedAnalytics(trades, { mode: "monthly", periodKey: "2026-02" });
  assert.equal(monthly.summary.tradeCount, 1);
  assert.equal(monthly.previousSummary.tradeCount, 2);
});

test("calculates losing streaks, drawdown, recovery, and division-by-zero cases", () => {
  const analytics = buildAdvancedAnalytics([
    trade({ id: "d1", grossPnl: 100 }),
    trade({ id: "d2", grossPnl: -25, entryDate: "2026-01-05T14:31:00.000Z" }),
    trade({ id: "d3", grossPnl: -25, entryDate: "2026-01-05T14:32:00.000Z" }),
    trade({ id: "d4", grossPnl: 75, entryDate: "2026-01-05T14:33:00.000Z" })
  ]);
  assert.equal(analytics.losingStreaks.longestLosingStreak, 2);
  assert.equal(analytics.losingStreaks.currentLosingStreak, 0);
  assert.ok(analytics.drawdown.maxDrawdown > 0);
  assert.equal(analytics.summary.profitFactor > 0, true);
});

test("covers partial-exit shaped records without double-counting executions", () => {
  const analytics = buildAdvancedAnalytics([
    trade({
      id: "px",
      grossPnl: 125,
      netPnl: 123,
      commissions: 2,
      fees: 0,
      reportedExecutionCount: 4,
      executions: [
        { price: 10, quantity: 50 },
        { price: 10.1, quantity: 50 },
        { price: 10.8, quantity: 50 },
        { price: 11, quantity: 50 }
      ]
    })
  ]);
  assert.equal(analytics.summary.totalNetPnl, 123);
  assert.equal(analytics.summary.tradeCount, 1);
});

test("keeps metric definitions centralized for tooltips and duplicate-sensitive metrics", () => {
  assert.ok(ADVANCED_METRIC_DEFINITIONS.netExpectancy.formula.includes("win rate"));
  assert.ok(ADVANCED_METRIC_DEFINITIONS.profitFactor.formula.includes("Gross profit"));
  assert.ok(ADVANCED_METRIC_DEFINITIONS.drawdown.limitations.includes("open positions"));
});
