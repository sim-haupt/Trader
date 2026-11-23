import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { buildEvidence, compareCohorts, goalValue, sessionSupport, formatMetric } from "../src/utils/intelligenceEvidence.mjs";

const require = createRequire(import.meta.url);
const { scheduledRanges, pendingPeriods, comparisonPeriod, nextSchedule } = require("../src/utils/intelligencePeriods");
const { buildCsv, buildSimplePdf } = require("../src/utils/reportExport");
const ranges = { current: { from: "2026-11-09", to: "2026-11-23" }, previous: { from: "2026-10-25", to: "2026-11-08" } };

function trade(id, day, netPnl, extra = {}) {
  return {
    id, entryDate: `${day}T08:00:00-05:00`, exitDate: `${day}T08:10:00-05:00`, symbol: "MOCK",
    strategy: "Opening drive", side: "LONG", quantity: 100, entryPrice: 10, exitPrice: 11,
    grossPnl: netPnl + 2, netPnl, fees: 1, commissions: 1, ...extra
  };
}

test("keeps unsupported metrics absent and verifies covered commissions and comparative cohorts", () => {
  const rows = [
    trade("a", "2026-11-10", 18, { analysis: { behavior: { confidence: 5, setup: "followed" } } }),
    trade("b", "2026-11-11", -10, { grossPnl: null, analysis: { behavior: { confidence: 2, exit: "violated" } } })
  ];
  const result = buildEvidence({ trades: rows, previousTrades: [], ranges });
  assert.equal(result.summary.net, 8);
  assert.equal(result.summary.grossSamples, 1);
  assert.equal(result.summary.averageR, null);
  assert(!result.evidence.find((item) => item.id === "overview").facts.some((fact) => fact.unit === "r"));
  assert.equal(result.insights.length, 0);
  assert(result.evidence.find((item) => item.id === "setup-best").assessment.includes("Small sample"));
  const comparisons = compareCohorts({ trades: rows, filter: { confidence: "high", compliance: "followed" } },
    { trades: rows, filter: { confidence: "low", compliance: "violated" } });
  assert.equal(comparisons.a.count, 1);
  assert.equal(comparisons.b.net, -10);
  assert.equal(comparisons.overlap, 0);
  assert.equal(comparisons.pairedGrossNet[0].gross - comparisons.pairedGrossNet[0].net, 2);
  assert.equal(comparisons.pairedGrossNet[1].count, 0);
});

test("supports changes across independent session units and includes examples owned by the selected sample", () => {
  const rows = Array.from({ length: 12 }, (_, i) => trade(`current-${i}`, `2026-11-${10 + i}`, 70 + i % 3));
  const previous = Array.from({ length: 12 }, (_, i) => trade(`prior-${i}`, `2026-10-${10 + i}`, -20 - i % 4));
  const result = buildEvidence({ trades: rows, previousTrades: previous, ranges, requestedCap: 1 });
  assert(result.insights.some((item) => item.id === "expectancy-change"));
  assert(result.insights.every((item) => item.trades.every((row) => row.id.startsWith("current-"))));
  assert.equal(result.simulation.actual, result.simulation.hypothetical);
  assert.equal(result.evidence.find((row) => row.id === "simulation").type, "hypothetical");
  assert.equal(sessionSupport([1e9], [-1e9]).strong, false);
  assert.equal(formatMetric(0.00014, "p value"), "<0.001");
});

test("goal compliance is assessed only with known exposure and preserves observed discipline", () => {
  const incomplete = trade("unknown", "2026-11-10", -10);
  const assessed = trade("known", "2026-11-11", -13, {
    entryReview: { plannedInitialRisk: 20 }, analysis: { behavior: { setup: "followed", exit: "unknown" } }
  });
  assert.deepEqual(goalValue([incomplete, assessed], {}, "riskCompliance", { weeklyExposure: 30 }), { value: null, n: 0 });
  assert.deepEqual(goalValue([incomplete, assessed], {}, "riskCompliance", { weeklyExposure: 10 }), { value: 0, n: 1 });
  assert.deepEqual(goalValue([incomplete, assessed], {}, "discipline", {}), { value: 100, n: 1 });
});

test("uses closed ET scheduling periods and bounds/reuses catch-up periods", () => {
  const mondayAfter = new Date("2026-11-23T13:01:00Z");
  const ranges = scheduledRanges(mondayAfter, 8, ["daily", "weekly", "monthly"]);
  assert.deepEqual(ranges[0], { kind: "daily", from: "2026-11-20", to: "2026-11-20" });
  assert.deepEqual(ranges[1], { kind: "weekly", from: "2026-11-16", to: "2026-11-22" });
  assert.deepEqual(ranges[2], { kind: "monthly", from: "2026-10-01", to: "2026-10-31" });
  const catchup = pendingPeriods(mondayAfter, new Date("2026-11-19T13:00:00Z"), 8, ["daily", "weekly"]);
  assert.equal(catchup.filter(({ kind }) => kind === "weekly").length, 2);
  assert.equal(new Set(catchup.map(({ kind, to }) => `${kind}:${to}`)).size, catchup.length);
  assert.deepEqual(comparisonPeriod({ from: "2026-11-01", to: "2026-11-12" }, "monthly"), { from: "2026-10-01", to: "2026-10-12" });
  assert.equal(nextSchedule(new Date("2026-03-07T14:00:00Z"), 8).toISOString(), "2026-03-08T12:00:00.000Z");
});

test("exports genuine numeric cells and neutralizes user-authored spreadsheet formulas", () => {
  const result = buildCsv([[-15, "  =SUM(A1)"], [-2, 'Quote,"example"']],
    [{ label: "Net", value: (row) => row[0] }, { label: "Setup", value: (row) => row[1] }], { allowNumbers: true });
  assert.match(result, /^Net,Setup\n-15,'  =SUM\(A1\)/);
  assert.match(result, /-2,"Quote,""example"""/);
  const pdf = buildSimplePdf(["Report", "(entry)"], "Page");
  assert.equal(pdf.toString().slice(0, 8), "%PDF-1.4");
  assert(pdf.toString().includes("Page 1 of 1"));
});
