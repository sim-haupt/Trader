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

test("keeps trade grading grouped by premarket time", () => {
  const entryDate = "2026-11-23T14:15:00.000Z";
  const data = [
    trade({ id: "pre", entryDate, executions: [{ occurredAt: entryDate }], entryReview: {
      setupFit: 2, timing: 2, invalidation: 2, liquidity: 1, wouldRetake: true,
      plannedInitialRisk: "10.0000", outcome: { mfe: 24, mae: 5, slippagePerShare: 0.05 }
    } }),
    trade({ id: "open", entryDate: "2026-11-23T14:30:00.000Z" })
  ];
  const result = buildAdvancedAnalytics(data, { conditionalDimension: "gradeByPremarketTime", minimumSample: 1 });
  assert.equal(result.trades.find(({ id }) => id === "pre").mfe, 24);
  const graded = result.conditionalExplorer.find(({ label }) => label === "Premarket 09:00–09:30 · Strong (7–8)");
  assert.equal(graded.sessionCount, 1);
});

test("uses recorded outcomes, paired cost impact, close order, and covered holding minutes", () => {
  const data = [
    trade({ id: "open", grossPnl: null, netPnl: null, exitDate: null }),
    trade({ id: "net-only", grossPnl: null, netPnl: -20, exitDate: null }),
    trade({ id: "peak", grossPnl: 82, fees: 1, commissions: 1, plannedInitialRisk: 20, exitDate: "2026-01-05T14:40:00Z" }),
    trade({ id: "early-close", grossPnl: -10, fees: 0, commissions: 0, plannedInitialRisk: 10, entryDate: "2026-01-05T14:31:00Z", exitDate: "2026-01-05T14:33:00Z" })
  ];
  const analytics = buildAdvancedAnalytics(data);
  assert.equal(analytics.summary.tradeCount, 3);
  assert.equal(analytics.summary.grossExpectancy, 36);
  assert.equal(analytics.tradingCostDrag.expectancyDifference, 1);
  assert.equal(analytics.summary.netPerMinute, 70 / 12);
  assert.equal(analytics.drawdown.maxDrawdown, 30);
  assert.equal(analytics.drawdown.maxDrawdownR, 1);
  assert.equal(analytics.winningStreaks.current, 1);
});

test("deduplicates tags, keeps capture uncapped, and uses the ET year and week", () => {
  const normalized = normalizeAdvancedTrades([
    trade({ tags: "First, first, Other", grossPnl: 201.5, mfe: 100, entryDate: "2026-01-01T00:01:00Z" })
  ]);
  assert.equal(normalized[0].tags.length, 2);
  const analytics = buildAdvancedAnalytics(normalized.map((item) => item.source), { mode: "yearly" });
  assert.equal(analytics.selectedPeriodKey, "2025");
  assert.equal(analytics.excursions.mfeCapture.averageCapture, 200);
  assert.equal(analytics.excursions.mfeCapture.extremeCount, 1);
});

test("market inference counts sessions rather than treating repeated trades as independent", () => {
  const rows = Array.from({ length: 22 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1, 15));
    return trade({ entryDate: date.toISOString(), exitDate: date.toISOString(),
      entryPriorCloseDiffPercent: index, grossPnl: index * 2 });
  });
  const [gap] = buildAdvancedAnalytics(rows.flatMap((row) => [row, row])).marketAssociations;
  assert.equal(gap.count, 44);
  assert.equal(gap.sessions, 22);
  assert.ok(gap.correlation > 0.99);
  assert.ok(gap.adjustedP <= 0.05);
  assert.equal(buildAdvancedAnalytics(rows.slice(0, 19)).marketAssociations[0].correlation, null);
});

test("slippage references actual fills and a selected stop on short trades", () => {
  const [row] = normalizeAdvancedTrades([trade({ side: "SHORT",
    entryReview: { intendedPrice: "10.1", plannedStop: "10.5" },
    executions: [
      { id: "a", source: "IMPORTED", action: "SELL", price: "10" },
      { id: "b", source: "IMPORTED", action: "BUY", price: "10.6" }
    ],
    analysis: { intendedExit: "10.3", stopExecutionId: "b", execution: {
      quote: { bid: 9.9, ask: 10.2 }, exitQuote: { bid: 10.4, ask: 10.6 }
    } }
  })]);
  assert.ok(Math.abs(row.executionFacts.entrySlippage - 0.1) < 1e-8);
  assert.ok(Math.abs(row.executionFacts.exitSlippage - 0.3) < 1e-8);
  assert.ok(Math.abs(row.executionFacts.stopSlippage - 0.1) < 1e-8);
  assert.ok(Math.abs(row.executionFacts.exitVsMidpoint - 0.1) < 1e-8);
});
