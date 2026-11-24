import { useMemo, useState } from "react";
import Card from "../ui/Card";
import ScalpExitReport from "./ScalpExitReport";
import EmptyState from "../ui/EmptyState";
import { MarketEvidence, Table, TimeHeatmap } from "./PerformanceIntelligence";
import { __advancedAnalyticsInternals, MARKET_TIME_ZONE, normalizeAdvancedTrades } from "../../utils/advancedAnalytics";
import { summarizeExecution } from "../../utils/performanceIntelligence";
import { buildNextTradeStreaks, buildOpeningPerformance, makeRiskRecords } from "../../utils/riskAnalytics";
import { formatCostCurrency, formatCurrency, formatPercent } from "../../utils/formatters";

const { groupBy, summarizeItems } = __advancedAnalyticsInternals;
const GROUPS = { setup: "Setup", tag: "Tag", combination: "Setup + tags" };
const outcomeColumns = ["Closed trades", "Win rate", "Net P&L", "Avg. net"];
const metricCells = ({ closed, winRate, pnl, expectancy }) => [closed,
  winRate == null ? "–" : formatPercent(winRate), pnl == null ? "–" : formatCurrency(pnl),
  expectancy == null ? "–" : formatCurrency(expectancy)];

function breakdown(trades, dimension) {
  const members = trades.flatMap((trade) => {
    if (dimension === "setup") return [{ label: trade.setup, key: trade.setup, trade }];
    if (dimension === "tag") return trade.tags.length
      ? trade.tags.map((label) => ({ label, key: `tag:${label.toLowerCase()}`, trade }))
      : [{ label: "Untagged", key: "untagged", trade }];
    const sorted = [...trade.tags].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return [{
      label: `${trade.setup} · ${sorted.join(", ") || "Untagged"}`,
      key: JSON.stringify([trade.setup, ...sorted.map((tag) => tag.toLowerCase())]),
      trade
    }];
  });

  return Array.from(groupBy(members, (item) => item.key), ([key, rows]) => ({
    key,
    label: rows[0].label,
    ...summarizeItems(rows.map(({ trade }) => trade))
  })).sort((a, b) => b.totalNetPnl - a.totalNetPnl || b.tradeCount - a.tradeCount || a.label.localeCompare(b.label));
}

function Metrics({ items }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-mist">{label}</dt>
          <dd className="mt-1 text-lg tabular-nums text-white">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ExecutionSummary({ trades, summary }) {
  const execution = useMemo(() => summarizeExecution(trades), [trades]);
  const efficiency = (row) => row.value == null ? "–" : `${formatPercent(row.value)} · ${row.count} trades`;
  return <Metrics items={[
    ["Cost per trade", formatCostCurrency(summary.costPerTrade)],
    ["Average hold", summary.averageHoldSeconds == null ? "–" : `${(summary.averageHoldSeconds / 60).toFixed(1)} min`],
    ["Entry efficiency", efficiency(execution.entryEfficiency)],
    ["Exit efficiency", efficiency(execution.exitEfficiency)]
  ]} />;
}

export default function AdvancedReportsTab({ trades, tradeHistory, onRefreshHistory, defaultCommission, defaultFees }) {
  const [dimension, setDimension] = useState("setup");
  const [largeLoss, setLargeLoss] = useState("100");
  const normalized = useMemo(() => normalizeAdvancedTrades(trades, { defaultCommission, defaultFees }),
    [trades, defaultCommission, defaultFees]);
  const summary = useMemo(() => summarizeItems(normalized), [normalized]);
  const rows = useMemo(() => breakdown(normalized, dimension), [normalized, dimension]);
  const streakRecords = useMemo(() => makeRiskRecords(tradeHistory, { defaultCommission, defaultFees }),
    [tradeHistory, defaultCommission, defaultFees]);
  const selectedIds = useMemo(() => new Set(trades.map(({ id }) => id)), [trades]);
  const streaks = useMemo(() => buildNextTradeStreaks(streakRecords, selectedIds), [streakRecords, selectedIds]);
  const openings = useMemo(() => buildOpeningPerformance(streakRecords, selectedIds, Number(largeLoss)),
    [streakRecords, selectedIds, largeLoss]);

  if (!normalized.length) {
    return <EmptyState title="No recorded trade results" description="Choose another date range or adjust the report filters." />;
  }

  return (
    <div className="space-y-4">
      <Card title="Performance by strategy" action={
        <div className="analysis-field">
          <label htmlFor="advanced-report-group">Group by</label>
          <select id="advanced-report-group" value={dimension} onChange={(event) => setDimension(event.target.value)}>
            {Object.entries(GROUPS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      }>
        <Metrics items={[
          ["Trades", summary.tradeCount],
          ["Win rate", formatPercent(summary.winRate)],
          ["Net P&L", formatCurrency(summary.totalNetPnl)],
          ["Average net per trade", formatCurrency(summary.expectancy)]
        ]} />
        <div className="mt-4 max-h-[28rem] overflow-y-auto border-t border-[var(--line)] max-sm:[&_td]:px-1.5 max-sm:[&_th]:px-1.5">
          <Table caption="Strategy performance" headings={[GROUPS[dimension], "Trades", "Win rate", "Net P&L", "Avg. net"]}
            rows={rows.map((row) => [
              row, row.tradeCount, formatPercent(row.winRate), formatCurrency(row.totalNetPnl), formatCurrency(row.expectancy)
            ])} />
        </div>
        {dimension === "tag" && <p className="mt-2 text-sm text-mist">A trade can appear under multiple tags.</p>}
      </Card>
      <Card title="Performance after a streak" subtitle="The next entry after a win or loss streak on the same New York trading day. Report filters apply to the next trade.">
        <Table caption="Next trade after a streak" headings={["Before entry", ...outcomeColumns]}
          rows={streaks.map((row) => [row.label, ...metricCells(row)])} />
      </Card>
      <Card title="Performance after the day opens" subtitle="Results for later trades on the same New York trading day. The opening trade or trades must have closed before the later entry. Groups can overlap."
        action={<div className="analysis-field">
          <label htmlFor="large-opening-loss">Large loss threshold ($)</label>
          <input id="large-opening-loss" type="number" min="0.01" step="0.01" value={largeLoss}
            onChange={(event) => setLargeLoss(event.target.value)} />
        </div>}>
        <Table caption="Results after opening trades" headings={["Opening result", "Days", ...outcomeColumns]}
          rows={openings.map((row) => [row.label, row.openingDays, ...metricCells(row)])} />
      </Card>
      <TimeHeatmap trades={normalized} timeZone={MARKET_TIME_ZONE} />
      <Card title="Execution and holding time">
        <ExecutionSummary trades={normalized} summary={summary} />
      </Card>
      <MarketEvidence trades={normalized} onRefresh={onRefreshHistory} />
      <ScalpExitReport trades={trades} />
    </div>
  );
}
