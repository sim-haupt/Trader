import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Card from "../ui/Card";
import CustomSelect from "../ui/CustomSelect";
import EmptyState from "../ui/EmptyState";
import { buildAdvancedAnalytics, CONDITIONAL_DIMENSIONS } from "../../utils/advancedAnalytics";
import { getAdvancedMetricDefinition } from "../../utils/advancedMetricDefinitions";
import { formatCostCurrency, formatCurrency, formatPercent } from "../../utils/formatters";

const GREEN = "#34e0a1";
const RED = "#ff5f7a";
const YELLOW = "#ffd84d";

function formatNumber(value, digits = 2) {
  return value === null || value === undefined || Number.isNaN(Number(value))
    ? "Unavailable"
    : Number(value).toFixed(digits);
}

function formatR(value) {
  return value === null || value === undefined ? "Unavailable" : `${Number(value).toFixed(2)}R`;
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  if (safeSeconds < 60) return `${Math.round(safeSeconds)}s`;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.round(safeSeconds % 60);
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function toneForValue(value) {
  if (value > 0) return "text-mint";
  if (value < 0) return "text-coral";
  return "text-warning";
}

function ChartTooltip({ active, payload, label, mode = "currency" }) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0].value || 0);
  const formatted =
    mode === "percent"
      ? formatPercent(value)
      : mode === "count"
        ? value.toLocaleString("en-US")
        : mode === "ratio"
          ? value.toFixed(2)
          : formatCurrency(value);

  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-2">
      <p className="text-xs font-medium text-white/72">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${value >= 0 ? "text-mint" : "text-coral"}`}>
        {formatted}
      </p>
    </div>
  );
}

function MetricDefinition({ metricKey }) {
  const definition = getAdvancedMetricDefinition(metricKey);
  const [open, setOpen] = useState(false);
  const id = `metric-definition-${metricKey}`;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/15 text-[11px] font-semibold text-white/58 transition hover:border-mint hover:text-mint focus:border-mint focus:text-mint focus:outline-none"
        aria-label={`${definition.displayName} definition`}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        i
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute right-0 top-7 z-[80] w-[min(320px,80vw)] rounded-[6px] border border-[var(--line)] bg-black p-3 text-left shadow-xl"
        >
          <span className="block text-xs font-semibold text-white">{definition.displayName}</span>
          <span className="mt-1 block text-xs leading-5 text-white/62">{definition.shortTooltip}</span>
          <span className="mt-2 block text-xs leading-5 text-white/46">
            <span className="text-white/70">Formula:</span> {definition.formula}
          </span>
          <span className="mt-1 block text-xs leading-5 text-white/46">
            <span className="text-white/70">Interpretation:</span> {definition.interpretation}
          </span>
          <span className="mt-1 block text-xs leading-5 text-white/46">
            <span className="text-white/70">Limit:</span> {definition.limitations}
          </span>
        </span>
      ) : null}
    </span>
  );
}

function SectionTitle({ title, metricKey, subtitle }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="ui-title text-[11px] text-white/72">{title}</h3>
        {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-white/48">{subtitle}</p> : null}
      </div>
      {metricKey ? <MetricDefinition metricKey={metricKey} /> : null}
    </div>
  );
}

function AdvancedMetricCard({ label, value, detail, metricKey, tone = "text-white", status }) {
  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-black p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/44">{label}</p>
        {metricKey ? <MetricDefinition metricKey={metricKey} /> : null}
      </div>
      <p className={`mt-4 text-2xl font-semibold ${tone}`}>{value}</p>
      {detail ? <p className="mt-2 text-xs leading-5 text-white/48">{detail}</p> : null}
      {status ? <p className="mt-3 text-xs font-semibold text-white/62">{status}</p> : null}
    </div>
  );
}

function DataTable({ columns, rows, emptyLabel = "No rows available." }) {
  if (!rows.length) {
    return <div className="rounded-[6px] border border-dashed border-white/12 bg-black px-4 py-8 text-center text-sm text-white/48">{emptyLabel}</div>;
  }

  return (
    <div className="overflow-x-auto rounded-[6px] border border-[var(--line)] bg-black">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-white/42">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-4 py-3 font-semibold">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row.label || row.dayKey || "row"}-${rowIndex}`} className="border-b border-white/10 last:border-b-0">
              {columns.map((column) => (
                <td key={column.key} className="whitespace-nowrap px-4 py-3 text-white/72">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnavailablePanel({ title, metricKey, description }) {
  return (
    <div className="rounded-[6px] border border-dashed border-white/12 bg-black p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-2 text-sm leading-6 text-white/48">{description}</p>
        </div>
        <MetricDefinition metricKey={metricKey} />
      </div>
    </div>
  );
}

function RollingExpectancyChart({ data, mode }) {
  if (!data.length) {
    return (
      <UnavailablePanel
        title="Not enough trades"
        metricKey="rollingExpectancy"
        description="The selected rolling window needs more completed trades before a line can be displayed."
      />
    );
  }

  const dataKey = mode === "rMultiple" ? "rMultiple" : "currency";

  return (
    <div className="h-[280px] pb-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} minTickGap={18} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} tickFormatter={(value) => (mode === "rMultiple" ? `${value}R` : `$${value}`)} />
          <Tooltip content={<ChartTooltip mode={mode === "rMultiple" ? "ratio" : "currency"} />} />
          <Line type="monotone" dataKey={dataKey} stroke={GREEN} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HorizontalBarChart({ data, dataKey, mode = "currency" }) {
  if (!data.length) return null;

  return (
    <div className="h-[300px] pb-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.slice(0, 12)} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 16 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
          <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} width={118} interval={0} tick={{ fill: "#c6cedb", fontSize: 11 }} />
          <Tooltip content={<ChartTooltip mode={mode} />} />
          <Bar dataKey={dataKey} radius={[0, 6, 6, 0]} barSize={18}>
            {data.slice(0, 12).map((entry) => (
              <Cell key={entry.label} fill={Number(entry[dataKey] || 0) >= 0 ? GREEN : RED} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HistogramChart({ data, dataKey = "count" }) {
  if (!data.length) {
    return <div className="rounded-[6px] border border-dashed border-white/12 bg-black px-4 py-8 text-center text-sm text-white/48">No distribution data available.</div>;
  }

  return (
    <div className="h-[240px] pb-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 10 }} interval={0} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
          <Tooltip content={<ChartTooltip mode="count" />} />
          <Bar dataKey={dataKey} fill={GREEN} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScatterPanel({ data, xLabel }) {
  if (!data.length) {
    return <div className="rounded-[6px] border border-dashed border-white/12 bg-black px-4 py-8 text-center text-sm text-white/48">No scatter data available.</div>;
  }

  return (
    <div className="h-[260px] pb-4">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="x" name={xLabel} axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
          <YAxis dataKey="y" name="Realized" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltip />} />
          <Scatter data={data} fill={YELLOW} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function buildPeriodOptions(analytics) {
  return analytics.availablePeriods.map((period) => ({ label: period.label, value: period.key }));
}

function buildColumns(kind = "standard") {
  const common = [
    { key: "label", label: "Group" },
    { key: "tradeCount", label: "Trades" },
    { key: "winRate", label: "Win rate", render: (row) => formatPercent(row.winRate || 0) },
    { key: "expectancy", label: "Expectancy", render: (row) => formatCurrency(row.expectancy || 0) },
    { key: "totalNetPnl", label: "Net P&L", render: (row) => formatCurrency(row.totalNetPnl || 0) },
    { key: "profitFactor", label: "Profit factor", render: (row) => row.profitFactor === null ? "No losses" : formatNumber(row.profitFactor) }
  ];

  if (kind === "setup") {
    return [
      ...common.slice(0, 4),
      { key: "averageWinner", label: "Avg winner", render: (row) => formatCurrency(row.averageWinner || 0) },
      { key: "averageLoser", label: "Avg loser", render: (row) => formatCurrency(row.averageLoser || 0) },
      ...common.slice(4),
      { key: "totalNetR", label: "Net R", render: (row) => formatR(row.totalNetR) }
    ];
  }

  if (kind === "conditional") {
    return [
      ...common,
      { key: "averageWinner", label: "Avg winner", render: (row) => formatCurrency(row.averageWinner || 0) },
      { key: "averageLoser", label: "Avg loser", render: (row) => formatCurrency(row.averageLoser || 0) },
      { key: "medianNetPnl", label: "Median", render: (row) => formatCurrency(row.medianNetPnl || 0) },
      { key: "averageMfe", label: "Avg MFE", render: (row) => row.averageMfe === null ? "Unavailable" : formatCurrency(row.averageMfe) },
      { key: "averageMae", label: "Avg MAE", render: (row) => row.averageMae === null ? "Unavailable" : formatCurrency(row.averageMae) },
      { key: "mfeCapture", label: "MFE capture", render: (row) => row.mfeCapture === null ? "Unavailable" : formatPercent(row.mfeCapture) },
      { key: "costPerTrade", label: "Cost/trade", render: (row) => row.costPerTrade === null ? "Unavailable" : formatCostCurrency(row.costPerTrade) }
    ];
  }

  return common;
}

function OverviewSection({ analytics }) {
  const summary = analytics.summary;
  const previous = analytics.previousSummary;
  const change = analytics.comparisons.expectancyChange;
  const status = summary.tradeCount < 10 ? "Small sample" : summary.expectancy > 0 ? "Positive" : summary.expectancy < 0 ? "Negative" : "Neutral";

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <AdvancedMetricCard
        label="Net expectancy"
        value={formatCurrency(summary.expectancy || 0)}
        tone={toneForValue(summary.expectancy || 0)}
        detail={`Previous: ${previous.tradeCount ? formatCurrency(previous.expectancy || 0) : "Unavailable"} | Change: ${change === null ? "Unavailable" : formatCurrency(change)}`}
        status={`${summary.tradeCount} trades | ${status}`}
        metricKey="netExpectancy"
      />
      <AdvancedMetricCard
        label="Expectancy in R"
        value={formatR(summary.expectancyR)}
        tone={toneForValue(summary.expectancyR || 0)}
        detail="Derived only when planned initial risk is present."
        status={`${analytics.trades.filter((trade) => trade.rMultiple !== null).length} R-qualified trades`}
        metricKey="netExpectancy"
      />
      <AdvancedMetricCard
        label="Profit factor"
        value={summary.profitFactor === null ? "No losses" : formatNumber(summary.profitFactor)}
        detail={`Gross profit ${formatCurrency(summary.grossProfit || 0)} | Gross loss ${formatCurrency(summary.grossLoss || 0)}`}
        status={`${summary.tradeCount} trades`}
        metricKey="profitFactor"
      />
      <AdvancedMetricCard
        label="Payoff ratio"
        value={summary.payoffRatio === null ? "Unavailable" : formatNumber(summary.payoffRatio)}
        detail={`R payoff: ${summary.payoffRatioR === null ? "Unavailable" : formatNumber(summary.payoffRatioR)}`}
        status="Interpret with win rate"
        metricKey="payoffRatio"
      />
      <AdvancedMetricCard label="Median net P&L" value={formatCurrency(summary.medianNetPnl || 0)} detail={`Average: ${formatCurrency(summary.averageNetPnl || 0)}`} metricKey="medianTradeResult" />
      <AdvancedMetricCard label="Median net R" value={formatR(summary.medianNetR)} detail={`Average R: ${formatR(summary.averageNetR)}`} metricKey="medianTradeResult" />
      <AdvancedMetricCard label="Trading-cost drag" value={analytics.tradingCostDrag.costDragPercent === null ? "Not meaningful" : formatPercent(analytics.tradingCostDrag.costDragPercent)} detail={`${formatCostCurrency(analytics.tradingCostDrag.totalCosts || 0)} total costs | ${formatCostCurrency(analytics.tradingCostDrag.costPerTrade || 0)} per trade`} metricKey="tradingCostDrag" />
      <AdvancedMetricCard label="Max drawdown" value={formatCurrency(-(analytics.drawdown.maxDrawdown || 0))} tone="text-coral" detail={`Current: ${formatCurrency(-(analytics.drawdown.currentDrawdown || 0))} | Duration: ${analytics.drawdown.drawdownDurationTrades} trades`} metricKey="drawdown" />
    </div>
  );
}

function EdgeSection({ analytics }) {
  const [rollingWindow, setRollingWindow] = useState("20");
  const [rollingMode, setRollingMode] = useState("currency");
  const [sortKey, setSortKey] = useState("expectancy");
  const sortedSetups = [...analytics.expectancyBySetup].sort((left, right) => Number(right[sortKey] || 0) - Number(left[sortKey] || 0));

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle title="Edge And Expectancy" metricKey="rollingExpectancy" subtitle="Rolling and grouped views reuse the same net expectancy calculation as the summary cards." />
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <CustomSelect value={rollingWindow} onChange={setRollingWindow} options={["20", "50", "100"].map((value) => ({ label: `Last ${value} trades`, value }))} className="w-[180px]" />
          <CustomSelect value={rollingMode} onChange={setRollingMode} options={[{ label: "Currency", value: "currency" }, { label: "R-multiples", value: "rMultiple" }]} className="w-[180px]" />
        </div>
        <RollingExpectancyChart data={analytics.rollingExpectancy[rollingWindow] || []} mode={rollingMode} />
      </Card>

      <Card>
        <SectionTitle title="Expectancy By Setup" metricKey="expectancyBySetup" />
        <div className="mb-4 flex justify-end">
          <CustomSelect
            value={sortKey}
            onChange={setSortKey}
            options={[
              { label: "Expectancy", value: "expectancy" },
              { label: "Total P&L", value: "totalNetPnl" },
              { label: "Trade count", value: "tradeCount" },
              { label: "Profit factor", value: "profitFactor" }
            ]}
            className="w-[180px]"
          />
        </div>
        <DataTable columns={buildColumns("setup")} rows={sortedSetups} />
      </Card>

      <Card>
        <SectionTitle title="Expectancy By Time Of Day" metricKey="expectancyByTimeOfDay" subtitle={`Session buckets use ${analytics.timeZone}.`} />
        <DataTable
          columns={[
            { key: "label", label: "Bucket" },
            { key: "tradeCount", label: "Trades" },
            { key: "expectancy", label: "Expectancy", render: (row) => formatCurrency(row.expectancy || 0) },
            { key: "winRate", label: "Win rate", render: (row) => formatPercent(row.winRate || 0) },
            { key: "averagePnl", label: "Avg P&L", render: (row) => formatCurrency(row.averagePnl || 0) },
            { key: "totalNetPnl", label: "Total P&L", render: (row) => formatCurrency(row.totalNetPnl || 0) }
          ]}
          rows={analytics.expectancyByTimeOfDay}
        />
      </Card>
    </div>
  );
}

function ExcursionSection({ analytics }) {
  const excursions = analytics.excursions;

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle title="Entry And Exit Efficiency" metricKey="mfeMae" />
        {!excursions.available ? (
          <UnavailablePanel
            title="MFE data is not recorded for these trades"
            metricKey="mfeMae"
            description="Calculating MFE, MAE, edge ratio, capture efficiency, winner MAE, and profit giveback requires intratrade high/low data or execution-level price history."
          />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <AdvancedMetricCard label="Average MFE" value={formatCurrency(excursions.averageMfe || 0)} metricKey="mfeMae" />
              <AdvancedMetricCard label="Median MFE" value={formatCurrency(excursions.medianMfe || 0)} metricKey="mfeMae" />
              <AdvancedMetricCard label="Average MAE" value={formatCurrency(excursions.averageMae || 0)} metricKey="mfeMae" />
              <AdvancedMetricCard label="Median MAE" value={formatCurrency(excursions.medianMae || 0)} metricKey="mfeMae" />
              <AdvancedMetricCard label="Edge ratio" value={excursions.edgeRatio === null ? "Unavailable" : formatNumber(excursions.edgeRatio)} metricKey="mfeMae" />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <div><SectionTitle title="MFE Distribution" metricKey="mfeMae" /><HistogramChart data={excursions.mfeHistogram} /></div>
              <div><SectionTitle title="MAE Distribution" metricKey="mfeMae" /><HistogramChart data={excursions.maeHistogram} /></div>
              <div><SectionTitle title="MFE Versus Realized Result" metricKey="mfeMae" /><ScatterPanel data={excursions.mfeScatter} xLabel="MFE" /></div>
              <div><SectionTitle title="MAE Versus Realized Result" metricKey="mfeMae" /><ScatterPanel data={excursions.maeScatter} xLabel="MAE" /></div>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle title="MFE Capture And Profit Giveback" metricKey="mfeMae" />
        {!excursions.available ? (
          <UnavailablePanel title="Capture and giveback unavailable" metricKey="mfeMae" description="These metrics require positive MFE values recorded on profitable trades." />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <AdvancedMetricCard label="Average capture" value={excursions.mfeCapture.averageCapture === null ? "Unavailable" : formatPercent(excursions.mfeCapture.averageCapture)} metricKey="mfeMae" detail={`${excursions.mfeCapture.sampleSize} qualifying trades`} />
              <AdvancedMetricCard label="Median capture" value={excursions.mfeCapture.medianCapture === null ? "Unavailable" : formatPercent(excursions.mfeCapture.medianCapture)} metricKey="mfeMae" detail={`${excursions.mfeCapture.extremeCount} extreme values flagged`} />
              <AdvancedMetricCard label="Average giveback" value={excursions.giveback.averageGiveback === null ? "Unavailable" : formatCurrency(excursions.giveback.averageGiveback)} metricKey="mfeMae" />
              <AdvancedMetricCard label="Average giveback %" value={excursions.giveback.averageGivebackPercent === null ? "Unavailable" : formatPercent(excursions.giveback.averageGivebackPercent)} metricKey="mfeMae" />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <div><SectionTitle title="Capture By Setup" metricKey="mfeMae" /><DataTable columns={buildColumns()} rows={excursions.captureBySetup} /></div>
              <div><SectionTitle title="Winner MAE Distribution" metricKey="mfeMae" /><HistogramChart data={excursions.winnerMae.histogram} /></div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function CostsAndHoldingSection({ analytics }) {
  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle title="Execution Costs" metricKey="tradingCostDrag" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdvancedMetricCard label="Total costs" value={formatCostCurrency(analytics.tradingCostDrag.totalCosts || 0)} metricKey="tradingCostDrag" />
          <AdvancedMetricCard label="Cost per trade" value={formatCostCurrency(analytics.tradingCostDrag.costPerTrade || 0)} metricKey="tradingCostDrag" />
          <AdvancedMetricCard label="Gross expectancy" value={formatCurrency(analytics.tradingCostDrag.grossExpectancy || 0)} metricKey="tradingCostDrag" />
          <AdvancedMetricCard label="Net expectancy" value={formatCurrency(analytics.tradingCostDrag.netExpectancy || 0)} metricKey="tradingCostDrag" />
        </div>
        <div className="mt-5">
          <UnavailablePanel
            title="Entry and exit slippage unavailable"
            metricKey="tradingCostDrag"
            description="The current trade model stores fills and trade prices, but it does not store intended-entry, signal, decision, or expected-exit reference prices needed to normalize slippage without estimation."
          />
        </div>
      </Card>

      <Card>
        <SectionTitle title="Holding-Time Performance" metricKey="holdingTimePerformance" />
        <DataTable
          columns={[
            { key: "label", label: "Bucket" },
            { key: "tradeCount", label: "Trades" },
            { key: "expectancy", label: "Expectancy", render: (row) => formatCurrency(row.expectancy || 0) },
            { key: "winRate", label: "Win rate", render: (row) => formatPercent(row.winRate || 0) },
            { key: "averagePnl", label: "Avg P&L", render: (row) => formatCurrency(row.averagePnl || 0) },
            { key: "averageR", label: "Avg R", render: (row) => formatR(row.averageR) },
            { key: "profitFactor", label: "Profit factor", render: (row) => row.profitFactor === null ? "No losses" : formatNumber(row.profitFactor) },
            { key: "mfeCapture", label: "Avg MFE capture", render: (row) => row.mfeCapture === null ? "Unavailable" : formatPercent(row.mfeCapture) }
          ]}
          rows={analytics.holdingTimePerformance}
        />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <AdvancedMetricCard label="Median holding time" value={formatDuration(analytics.trades.length ? analytics.trades.map((trade) => trade.holdSeconds).sort((a, b) => a - b)[Math.floor(analytics.trades.length / 2)] : 0)} metricKey="holdingTimePerformance" />
          <AdvancedMetricCard label="Average holding time" value={formatDuration(analytics.trades.reduce((sum, trade) => sum + trade.holdSeconds, 0) / Math.max(analytics.trades.length, 1))} metricKey="holdingTimePerformance" detail="Time to MFE and time to stop require intratrade history." />
        </div>
      </Card>
    </div>
  );
}

function BehaviorSessionRiskSection({ analytics }) {
  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle title="Behavioral Performance" metricKey="performanceAfterLosses" />
        <div className="grid gap-5 xl:grid-cols-2">
          <div>
            <SectionTitle title="Performance After Losses" metricKey="performanceAfterLosses" />
            <DataTable columns={buildColumns()} rows={analytics.performanceAfterLosses} />
          </div>
          <div>
            <SectionTitle title="Performance By Trade Number" metricKey="tradeNumberPerformance" />
            <DataTable columns={buildColumns()} rows={analytics.tradeNumberPerformance} />
          </div>
        </div>
        <div className="mt-5">
          <UnavailablePanel
            title="Rule compliance and discipline cost unavailable"
            metricKey="ruleCompliance"
            description="No dedicated compliance category exists in the current trade schema. Add a trade-level compliance field before calculating rule-compliance performance or discipline cost."
          />
        </div>
      </Card>

      <Card>
        <SectionTitle title="Session Performance" metricKey="sessionGiveback" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdvancedMetricCard label="Average giveback" value={formatCurrency(analytics.sessionGiveback.averageGiveback || 0)} metricKey="sessionGiveback" />
          <AdvancedMetricCard label="Median giveback" value={formatCurrency(analytics.sessionGiveback.medianGiveback || 0)} metricKey="sessionGiveback" />
          <AdvancedMetricCard label="Largest giveback" value={formatCurrency(analytics.sessionGiveback.largestGiveback || 0)} metricKey="sessionGiveback" />
          <AdvancedMetricCard label="Giveback % of peak" value={formatPercent(analytics.sessionGiveback.averageGivebackPercent || 0)} metricKey="sessionGiveback" />
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="h-[280px] pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.sessionGiveback.chart} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="peakPnl" fill={GREEN} radius={[6, 6, 0, 0]} />
                <Bar dataKey="closingPnl" fill={YELLOW} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DataTable
            columns={[
              { key: "dayKey", label: "Session" },
              { key: "peakPnl", label: "Peak", render: (row) => formatCurrency(row.peakPnl || 0) },
              { key: "closingPnl", label: "Close", render: (row) => formatCurrency(row.closingPnl || 0) },
              { key: "giveback", label: "Giveback", render: (row) => formatCurrency(row.giveback || 0) },
              { key: "givebackPercent", label: "Giveback %", render: (row) => row.givebackPercent === null ? "N/A" : formatPercent(row.givebackPercent) }
            ]}
            rows={analytics.sessionGiveback.largestSessions}
          />
        </div>
      </Card>

      <Card>
        <SectionTitle title="Risk And Drawdown" metricKey="drawdown" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdvancedMetricCard label="Current drawdown" value={formatCurrency(-(analytics.drawdown.currentDrawdown || 0))} tone="text-coral" metricKey="drawdown" />
          <AdvancedMetricCard label="Maximum drawdown" value={formatCurrency(-(analytics.drawdown.maxDrawdown || 0))} tone="text-coral" metricKey="drawdown" />
          <AdvancedMetricCard label="Max drawdown in R" value={formatR(analytics.drawdown.maxDrawdownR)} metricKey="drawdown" />
          <AdvancedMetricCard label="Recovery trades" value={analytics.drawdown.tradesRequiredToRecover} detail={`${analytics.drawdown.drawdownDurationDays} calendar days in longest drawdown`} metricKey="drawdown" />
        </div>
        <div className="mt-5 h-[280px] pb-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.drawdown.underwaterCurve} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="drawdown" stroke={RED} strokeWidth={2.5} fill={RED} fillOpacity={0.16} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div>
            <SectionTitle title="Tail-Loss Analysis" metricKey="tailLoss" subtitle={analytics.tailLoss.percentileMethod} />
            <div className="grid gap-4 md:grid-cols-2">
              <AdvancedMetricCard label="Largest loss" value={analytics.tailLoss.largestLoss === null ? "Unavailable" : formatCurrency(analytics.tailLoss.largestLoss)} metricKey="tailLoss" />
              <AdvancedMetricCard label="Median loser" value={analytics.tailLoss.medianLosingTrade === null ? "Unavailable" : formatCurrency(analytics.tailLoss.medianLosingTrade)} metricKey="tailLoss" />
              <AdvancedMetricCard label="95th pct loss" value={analytics.tailLoss.p95LosingTrade === null ? "Unavailable" : formatCurrency(analytics.tailLoss.p95LosingTrade)} metricKey="tailLoss" />
              <AdvancedMetricCard label="Top 5 loss share" value={analytics.tailLoss.topFiveLossSharePercent === null ? "Unavailable" : formatPercent(analytics.tailLoss.topFiveLossSharePercent)} metricKey="tailLoss" />
            </div>
          </div>
          <div>
            <SectionTitle title="Losing Streaks" metricKey="losingStreaks" />
            <div className="grid gap-4 md:grid-cols-2">
              <AdvancedMetricCard label="Current losing streak" value={analytics.losingStreaks.currentLosingStreak} metricKey="losingStreaks" />
              <AdvancedMetricCard label="Longest losing streak" value={analytics.losingStreaks.longestLosingStreak} metricKey="losingStreaks" />
              <AdvancedMetricCard label="Average losing streak" value={formatNumber(analytics.losingStreaks.averageLosingStreak)} metricKey="losingStreaks" />
            </div>
            <div className="mt-4"><HistogramChart data={analytics.losingStreaks.distribution} /></div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ConditionalSection({ analytics, dimension, setDimension, minimumSample, setMinimumSample }) {
  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle title="Setup Contribution" metricKey="setupContribution" />
        <div className="grid gap-5 xl:grid-cols-2">
          <DataTable
            columns={[
              { key: "label", label: "Setup" },
              { key: "tradeCount", label: "Trades" },
              { key: "totalNetPnl", label: "Net P&L", render: (row) => formatCurrency(row.totalNetPnl || 0) },
              { key: "totalGrossProfit", label: "Gross profit", render: (row) => formatCurrency(row.totalGrossProfit || 0) },
              { key: "totalGrossLoss", label: "Gross loss", render: (row) => formatCurrency(row.totalGrossLoss || 0) },
              { key: "totalNetR", label: "Net R", render: (row) => formatR(row.totalNetR) }
            ]}
            rows={analytics.setupContribution}
          />
          <HorizontalBarChart data={analytics.setupContribution.map((row) => ({ label: row.label, totalNetPnl: row.totalNetPnl }))} dataKey="totalNetPnl" />
        </div>
      </Card>

      <Card>
        <SectionTitle title="Concentration Metrics" metricKey="concentration" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <AdvancedMetricCard label="Top 5 winners" value={analytics.concentration.topFiveWinningTradeProfitPercent === null ? "Unavailable" : formatPercent(analytics.concentration.topFiveWinningTradeProfitPercent)} metricKey="concentration" />
          <AdvancedMetricCard label="Top 5 losers" value={analytics.concentration.topFiveLosingTradeLossPercent === null ? "Unavailable" : formatPercent(analytics.concentration.topFiveLosingTradeLossPercent)} metricKey="concentration" />
          <AdvancedMetricCard label="Best setup P&L" value={analytics.concentration.bestSetupPnlPercent === null ? "Unavailable" : formatPercent(analytics.concentration.bestSetupPnlPercent)} detail={analytics.concentration.bestSetup || ""} metricKey="concentration" />
          <AdvancedMetricCard label="Best symbol P&L" value={analytics.concentration.bestSymbolPnlPercent === null ? "Unavailable" : formatPercent(analytics.concentration.bestSymbolPnlPercent)} detail={analytics.concentration.bestSymbol || ""} metricKey="concentration" />
          <AdvancedMetricCard label="Most-traded symbol" value={analytics.concentration.mostTradedSymbolVolumePercent === null ? "Unavailable" : formatPercent(analytics.concentration.mostTradedSymbolVolumePercent)} detail={analytics.concentration.mostTradedSymbol || ""} metricKey="concentration" />
        </div>
      </Card>

      <Card>
        <SectionTitle title="Conditional Performance Explorer" metricKey="conditionalExplorer" />
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <CustomSelect
            value={dimension}
            onChange={setDimension}
            options={CONDITIONAL_DIMENSIONS.map((entry) => ({ label: entry.label, value: entry.key }))}
            className="w-[240px]"
          />
          <label className="flex items-center gap-2 text-sm text-white/58">
            Min sample
            <input
              type="number"
              min="1"
              value={minimumSample}
              onChange={(event) => setMinimumSample(Math.max(1, Number(event.target.value || 1)))}
              className="ui-input h-[42px] w-[92px]"
            />
          </label>
        </div>
        <DataTable columns={buildColumns("conditional")} rows={analytics.conditionalExplorer} emptyLabel="No groups meet the minimum sample filter." />
      </Card>
    </div>
  );
}

function DataQualitySection({ analytics }) {
  return (
    <Card>
      <SectionTitle title="Data-Quality Notices" metricKey="mfeMae" />
      {analytics.dataQualityNotices.length ? (
        <div className="space-y-3">
          {analytics.dataQualityNotices.map((notice) => (
            <div key={notice} className="rounded-[6px] border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-white/72">
              {notice}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[6px] border border-mint/20 bg-mint/10 px-4 py-3 text-sm text-white/72">
          No missing-field notices for the selected trades.
        </div>
      )}
    </Card>
  );
}

function AdvancedReportsTab({ trades, defaultCommission = 0, defaultFees = 0 }) {
  const [viewMode, setViewMode] = useState("total");
  const [periodKey, setPeriodKey] = useState("");
  const [dimension, setDimension] = useState("setup");
  const [minimumSample, setMinimumSample] = useState(10);
  const analytics = useMemo(
    () =>
      buildAdvancedAnalytics(trades, {
        defaultCommission,
        defaultFees,
        mode: viewMode,
        periodKey,
        conditionalDimension: dimension,
        minimumSample
      }),
    [trades, defaultCommission, defaultFees, viewMode, periodKey, dimension, minimumSample]
  );
  const periodOptions = buildPeriodOptions(analytics);
  const effectivePeriodKey = analytics.selectedPeriodKey;

  if (!analytics.trades.length) {
    return (
      <EmptyState
        title="No trades match this advanced view"
        description="Try a different week, month, or global report filter."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card className="relative z-20 overflow-visible" bodyClassName="overflow-visible">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[190px]">
              <label className="mb-2 block text-xs font-medium text-white/72">Advanced view</label>
              <CustomSelect
                value={viewMode}
                onChange={(value) => {
                  setViewMode(value);
                  setPeriodKey("");
                }}
                options={[
                  { label: "Total / All Time", value: "total" },
                  { label: "Weekly", value: "weekly" },
                  { label: "Monthly", value: "monthly" }
                ]}
                buttonClassName="!py-3"
              />
            </div>
            {viewMode !== "total" ? (
              <div className="w-[210px]">
                <label className="mb-2 block text-xs font-medium text-white/72">Period</label>
                <CustomSelect
                  value={effectivePeriodKey}
                  onChange={setPeriodKey}
                  options={periodOptions}
                  buttonClassName="!py-3"
                />
              </div>
            ) : null}
          </div>
          <div className="text-sm text-white/48">
            {analytics.summary.tradeCount} trades in view
            {viewMode === "weekly" && analytics.comparisons.trailingFourWeekExpectancy !== null
              ? ` | 4-week avg expectancy ${formatCurrency(analytics.comparisons.trailingFourWeekExpectancy)}`
              : ""}
            {viewMode === "monthly" && analytics.comparisons.trailingThreeMonthExpectancy !== null
              ? ` | 3-month avg ${formatCurrency(analytics.comparisons.trailingThreeMonthExpectancy)}`
              : ""}
            {viewMode === "monthly" && analytics.comparisons.trailingSixMonthExpectancy !== null
              ? ` | 6-month avg ${formatCurrency(analytics.comparisons.trailingSixMonthExpectancy)}`
              : ""}
          </div>
        </div>
        {analytics.summary.tradeCount < 10 ? (
          <div className="mt-4 rounded-[6px] border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-white/70">
            Not enough trades for high-confidence conclusions. Treat these metrics as directional.
          </div>
        ) : null}
      </Card>

      <Card>
        <SectionTitle title="Overview" metricKey="netExpectancy" />
        <OverviewSection analytics={analytics} />
      </Card>

      <EdgeSection analytics={analytics} />
      <ExcursionSection analytics={analytics} />
      <CostsAndHoldingSection analytics={analytics} />
      <BehaviorSessionRiskSection analytics={analytics} />
      <ConditionalSection
        analytics={analytics}
        dimension={dimension}
        setDimension={setDimension}
        minimumSample={minimumSample}
        setMinimumSample={setMinimumSample}
      />
      <DataQualitySection analytics={analytics} />
    </div>
  );
}

export default AdvancedReportsTab;
