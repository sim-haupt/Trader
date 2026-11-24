import { useMemo, useState } from "react";
import Card from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import { MarketEvidence, Table, TimeHeatmap } from "./PerformanceIntelligence";
import { __advancedAnalyticsInternals, MARKET_TIME_ZONE, normalizeAdvancedTrades } from "../../utils/advancedAnalytics";
import { summarizeExecution } from "../../utils/performanceIntelligence";
import { formatCostCurrency, formatCurrency, formatPercent } from "../../utils/formatters";

const { groupBy, summarizeItems } = __advancedAnalyticsInternals;
const GROUPS = { setup: "Setup", tag: "Tag", combination: "Setup + tags" };

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

function ReportDetails({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="analysis-panel" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      {open && <div className="mt-4">{children}</div>}
    </details>
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

export default function AdvancedReportsTab({ trades, onRefreshHistory, defaultCommission, defaultFees }) {
  const [dimension, setDimension] = useState("setup");
  const normalized = useMemo(() => normalizeAdvancedTrades(trades, { defaultCommission, defaultFees }),
    [trades, defaultCommission, defaultFees]);
  const summary = useMemo(() => summarizeItems(normalized), [normalized]);
  const rows = useMemo(() => breakdown(normalized, dimension), [normalized, dimension]);

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
      <ReportDetails title="Trading windows">
        <TimeHeatmap trades={normalized} timeZone={MARKET_TIME_ZONE} />
      </ReportDetails>
      <ReportDetails title="Execution and holding time">
        <ExecutionSummary trades={normalized} summary={summary} />
      </ReportDetails>
      <ReportDetails title="Market conditions">
        <MarketEvidence trades={normalized} onRefresh={onRefreshHistory} />
      </ReportDetails>
    </div>
  );
}
