import test from "node:test";
import assert from "node:assert/strict";
import { buildExitReport, exitTradeMetadata } from "../frontend/src/utils/exitReportMetrics.mjs";

const settings = { offsets: [5, 10], windows: [5, 10], pricing: "preferred", matched: false, activeOffset: 5,
  activeWindow: 5, group: "setup", period: "monthly", rolling: 20 };
function trade(id, actualNet, options = {}) {
  const exit = Date.parse("2026-11-20T13:55:13.010Z") + Number(id) * 60000;
  return { id: String(id), status: "ready", entry: exit - 20000, exit, date: "2026-11-20", timestamp: new Date(exit).toISOString(),
    actualNet, actualGross: actualNet + 2, grossPeak: 35, giveback: Math.max(0, 35 - actualNet - 2),
    givebackPct: 10, offsets: [[5, 10, null]], post: [[5, 2, 10, 2, 1, 3, true, false]], setup: "Breakout",
    symbol: "TEST", ...options };
}

test("report uses quote priority, matched intersection, and covered wins and losses for conversions", () => {
  const rows = [
    trade(1, 10, { offsets: [[-10, 1, null], [-5, 1, null], [5, 6, -20], [10, 10, null]] }),
    trade(2, -5, { offsets: [[5, 15, 10], [10, 5, null]] }),
    trade(3, 3, { offsets: [[5, 0, null]], post: [] }),
    { id: "4", status: "pending" }
  ];
  const result = buildExitReport(rows, settings);
  const compared = result.timing.find((row) => row.seconds === 5);
  assert.deepEqual([compared.n, compared.quote, compared.total, compared.median], [3, 2, -10, 0]);
  assert.equal(compared.wins, 2);
  assert.equal(compared.losses, 1);
  assert.equal(compared.winToLoss, 50);
  assert.equal(compared.lossToWin, 100);
  assert.equal(compared.unchanged, 100 / 3);
  assert.equal(result.summary.matched, 1);
  assert.equal(result.post[0].n, 2);
  assert.equal(result.summary.pending, 1);
  const matched = buildExitReport(rows, { ...settings, matched: true });
  assert.ok(matched.timing.every(({ n }) => n === 1));
  const quote = buildExitReport(rows, { ...settings, pricing: "quote" });
  assert.equal(quote.timing.find(({ seconds }) => seconds === 5).n, 2);
});

test("automatic findings include open entries and require consistent exit samples", () => {
  const rows = Array.from({ length: 20 }, (_, index) => trade(index, 3, {
    hasExit: true, offsets: [[5, index < 12 ? 4 : -3, null], [-5, -20, null]]
  }));
  const open = { id: "open", status: "ready", hasExit: false, entryPerformance: { move: -2, midpointCost: null, approximate: true } };
  const pending = { id: "pending", status: "pending" };
  const result = buildExitReport([...rows, open, pending], { ...settings, automatic: true });
  assert.equal(result.summary.eligible, 22);
  assert.equal(result.summary.analyzed, 21);
  assert.equal(result.summary.exitAnalyzed, 20);
  assert.equal(result.summary.pending, 1);
  assert.equal(result.entry.move.median, -2);
  assert.equal(result.entry.adverse, 100);
  assert.equal(result.entry.midpointCost.n, 0);
  assert.equal(result.leading.seconds, 5);
  assert.equal(result.leading.improved, 60);
  assert.equal(buildExitReport(rows.slice(1), { ...settings, automatic: true }).leading, null);
});

test("classifies New York session/day boundaries and rolls a bounded chart for large histories", () => {
  const boundary = exitTradeMetadata({ id: "0", symbol: "TEST", setup: "A", entryPrice: 2, quantity: 100 }, {
    entry: Date.parse("2026-07-10T13:29:59.999Z"), exit: Date.parse("2026-07-10T13:30:01.300Z")
  });
  assert.equal(boundary.session, "Premarket");
  assert.equal(boundary.weekday, "Fri");
  assert.equal(boundary.timestamp, "2026-07-10T13:30:01.300Z");
  const rows = Array.from({ length: 5000 }, (_, index) => trade(index, 20,
    { offsets: [[5, index < 4980 ? 10 : -20, null]], giveback: index < 4980 ? 10 : 30 }));
  const report = buildExitReport(rows, { ...settings, rolling: 50 });
  assert.equal(report.summary.eligible, 5000);
  assert.equal(report.summary.giveback.total, 50400);
  assert.ok(report.rolling.length <= 301);
  assert.equal(report.rolling.at(-1).index, 5000);
  assert.ok(report.alerts.some(({ metric }) => metric === "Exit quality"));
  assert.ok(report.alerts.some(({ metric }) => metric === "Giveback"));
});
