import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Card from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import { formatCurrency, formatPercent } from "../../utils/formatters";
import { getTradePnlByType } from "../../utils/tradePnl";

const GREEN = "#34e0a1";
const RED = "#ff5f7a";
const BLUE = "#84b7ff";
const YELLOW = "#ffd84d";
const MIN_SAMPLE_SIZE = 3;

function compareEffectiveness(left, right) {
  return right.winRate - left.winRate || right.totalPnl - left.totalPnl || right.trades - left.trades;
}

function comparePnl(left, right) {
  return right.totalPnl - left.totalPnl || right.winRate - left.winRate || right.trades - left.trades;
}

function splitTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function emptyBucket(label, type) {
  return {
    label,
    type,
    trades: 0,
    wins: 0,
    losses: 0,
    totalPnl: 0,
    winningPnl: 0,
    losingPnl: 0,
    volume: 0,
    bestTrade: null,
    worstTrade: null
  };
}

function addTradeToBucket(bucket, trade, pnl) {
  const quantity = Math.abs(Number(trade.quantity || 0));

  bucket.trades += 1;
  bucket.totalPnl += pnl;
  bucket.volume += quantity;

  if (pnl > 0) {
    bucket.wins += 1;
    bucket.winningPnl += pnl;
  } else if (pnl < 0) {
    bucket.losses += 1;
    bucket.losingPnl += pnl;
  }

  if (bucket.bestTrade === null || pnl > bucket.bestTrade) {
    bucket.bestTrade = pnl;
  }

  if (bucket.worstTrade === null || pnl < bucket.worstTrade) {
    bucket.worstTrade = pnl;
  }
}

function finalizeBucket(bucket) {
  const expectancy = bucket.trades ? bucket.totalPnl / bucket.trades : 0;
  const winRate = bucket.trades ? (bucket.wins / bucket.trades) * 100 : 0;
  const averageWinner = bucket.wins ? bucket.winningPnl / bucket.wins : 0;
  const averageLoser = bucket.losses ? bucket.losingPnl / bucket.losses : 0;
  const profitFactor = Math.abs(bucket.losingPnl) > 0 ? bucket.winningPnl / Math.abs(bucket.losingPnl) : bucket.winningPnl > 0 ? Infinity : 0;

  return {
    ...bucket,
    totalPnl: Number(bucket.totalPnl.toFixed(2)),
    expectancy: Number(expectancy.toFixed(2)),
    winRate: Number(winRate.toFixed(1)),
    averageWinner: Number(averageWinner.toFixed(2)),
    averageLoser: Number(averageLoser.toFixed(2)),
    profitFactor: Number.isFinite(profitFactor) ? Number(profitFactor.toFixed(2)) : null,
    volume: Number(bucket.volume.toFixed(2)),
    bestTrade: Number((bucket.bestTrade || 0).toFixed(2)),
    worstTrade: Number((bucket.worstTrade || 0).toFixed(2)),
    sampleStatus: bucket.trades >= MIN_SAMPLE_SIZE ? "Qualified" : "Small sample"
  };
}

function buildStrategyAnalytics(trades, options) {
  const setupBuckets = new Map();
  const tagBuckets = new Map();
  const comboBuckets = new Map();

  for (const trade of trades) {
    const pnl = getTradePnlByType(trade, options.pnlType, options.defaultCommission, options.defaultFees);
    const setup = String(trade.setup || trade.strategy || "No setup").trim() || "No setup";
    const tags = splitTags(trade.tags);

    if (!setupBuckets.has(setup)) {
      setupBuckets.set(setup, emptyBucket(setup, "Setup"));
    }
    addTradeToBucket(setupBuckets.get(setup), trade, pnl);

    for (const tag of tags.length ? tags : ["No tag"]) {
      if (!tagBuckets.has(tag)) {
        tagBuckets.set(tag, emptyBucket(tag, "Tag"));
      }
      addTradeToBucket(tagBuckets.get(tag), trade, pnl);
    }

    const comboLabel = `${setup} + ${(tags.length ? [...tags].sort((left, right) => left.localeCompare(right)) : ["No tag"]).join(" + ")}`;
    if (!comboBuckets.has(comboLabel)) {
      comboBuckets.set(comboLabel, emptyBucket(comboLabel, "Setup + tags"));
    }
    addTradeToBucket(comboBuckets.get(comboLabel), trade, pnl);
  }

  const rankBuckets = (rows) =>
    rows
      .map(finalizeBucket)
      .sort(compareEffectiveness);

  const setups = rankBuckets(Array.from(setupBuckets.values()));
  const tags = rankBuckets(Array.from(tagBuckets.values()));
  const combinations = rankBuckets(Array.from(comboBuckets.values()));
  const bestSetup = setups.find((row) => row.trades >= MIN_SAMPLE_SIZE) || setups[0] || null;
  const bestTag = tags.find((row) => row.trades >= MIN_SAMPLE_SIZE) || tags[0] || null;
  const bestCombination = combinations.find((row) => row.trades >= MIN_SAMPLE_SIZE) || combinations[0] || null;
  const weakestCombination =
    combinations
      .filter((row) => row.trades >= MIN_SAMPLE_SIZE)
      .sort((left, right) => left.winRate - right.winRate || left.totalPnl - right.totalPnl)[0] ||
    combinations.slice().sort((left, right) => left.winRate - right.winRate || left.totalPnl - right.totalPnl)[0] ||
    null;

  return {
    setups,
    tags,
    combinations,
    bestSetup,
    bestTag,
    bestCombination,
    weakestCombination
  };
}

function StrategyTooltip({ active, payload, mode = "winRate" }) {
  if (!active || !payload?.length) {
    return null;
  }

  const row = payload[0].payload;

  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-2">
      <div className="max-w-[260px] text-xs font-medium text-white/72">{row.label}</div>
      <div className={`mt-1 text-sm font-semibold ${mode === "pnl" ? (row.totalPnl >= 0 ? "text-mint" : "text-coral") : "text-mint"}`}>
        {mode === "pnl" ? `P&L ${formatCurrency(row.totalPnl)}` : `Win rate ${formatPercent(row.winRate)}`}
      </div>
      <div className="mt-1 text-xs text-white/52">
        {row.trades} trades | {formatCurrency(row.totalPnl)} total | {formatCurrency(row.expectancy)} expectancy
      </div>
    </div>
  );
}

function MetricSwitch({ value, onChange }) {
  return (
    <div className="ui-segment">
      {[
        { label: "Win Rate", value: "winRate" },
        { label: "P&L", value: "pnl" }
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          data-active={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MetricCard({ label, value, detail, tone = "text-white" }) {
  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-black p-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/44">{label}</p>
      <p className={`mt-4 text-2xl font-semibold ${tone}`}>{value}</p>
      {detail ? <p className="mt-2 text-xs leading-5 text-white/48">{detail}</p> : null}
    </div>
  );
}

function EffectivenessChart({ title, data }) {
  const [metric, setMetric] = useState("winRate");
  const chartData = useMemo(
    () => [...data].sort(metric === "pnl" ? comparePnl : compareEffectiveness),
    [data, metric]
  );
  const dataKey = metric === "pnl" ? "totalPnl" : "winRate";
  const chartHeight = Math.max(330, chartData.length * 34 + 72);

  return (
    <Card title={title} action={<MetricSwitch value={metric} onChange={setMetric} />}>
      <div className="pb-4" style={{ height: `${chartHeight}px` }}>
        {chartData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 16 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis
                type="number"
                domain={metric === "winRate" ? [0, 100] : undefined}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#c6cedb", fontSize: 11 }}
                tickFormatter={(value) => (metric === "winRate" ? `${value}%` : `$${value}`)}
              />
              <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} width={132} interval={0} tick={{ fill: "#c6cedb", fontSize: 11 }} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<StrategyTooltip mode={metric} />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
              <Bar dataKey={dataKey} radius={[0, 6, 6, 0]} barSize={18}>
                {chartData.map((row) => (
                  <Cell
                    key={row.label}
                    fill={metric === "pnl" ? (row.totalPnl >= 0 ? GREEN : RED) : row.totalPnl >= 0 ? BLUE : RED}
                    opacity={row.trades >= MIN_SAMPLE_SIZE ? 1 : 0.45}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No strategy data" description="Add setups or tags to trades to populate this chart." />
        )}
      </div>
    </Card>
  );
}

function PnlWinRateChart({ data }) {
  const chartData = data.slice(0, 12);

  return (
    <Card title="P&L AND WIN RATE BY COMBINATION">
      <div className="h-[340px] pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 10 }} minTickGap={18} />
            <YAxis yAxisId="pnl" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} tickFormatter={(value) => `$${value}`} />
            <YAxis yAxisId="win" orientation="right" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<StrategyTooltip />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
            <Bar yAxisId="pnl" dataKey="totalPnl" barSize={18} radius={[6, 6, 0, 0]}>
              {chartData.map((row) => (
                <Cell key={row.label} fill={row.totalPnl >= 0 ? BLUE : RED} />
              ))}
            </Bar>
            <Line yAxisId="win" type="monotone" dataKey="winRate" stroke={YELLOW} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function StrategyTable({ title, rows }) {
  return (
    <Card title={title}>
      <div className="overflow-x-auto rounded-[6px] border border-[var(--line)] bg-black">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-white/42">
            <tr>
              {["Strategy", "Trades", "Win %", "Total P&L", "Expectancy", "Profit factor", "Avg win", "Avg loss", "Sample"].map((label) => (
                <th key={label} className="whitespace-nowrap px-4 py-3 font-semibold">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 16).map((row) => (
              <tr key={`${row.type}-${row.label}`} className="border-b border-white/10 last:border-b-0">
                <td className="max-w-[280px] truncate px-4 py-3 font-semibold text-white/82">{row.label}</td>
                <td className="whitespace-nowrap px-4 py-3 text-white/72">{row.trades}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-mint">{formatPercent(row.winRate)}</td>
                <td className={`whitespace-nowrap px-4 py-3 font-semibold ${row.totalPnl >= 0 ? "text-mint" : "text-coral"}`}>{formatCurrency(row.totalPnl)}</td>
                <td className={`whitespace-nowrap px-4 py-3 font-semibold ${row.expectancy >= 0 ? "text-mint" : "text-coral"}`}>{formatCurrency(row.expectancy)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-white/72">{row.profitFactor === null ? "No losses" : row.profitFactor.toFixed(2)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-mint">{formatCurrency(row.averageWinner)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-coral">{formatCurrency(row.averageLoser)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-white/56">{row.sampleStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StrategyReportsTab({ trades, pnlType = "GROSS", defaultCommission = 0, defaultFees = 0 }) {
  const analytics = useMemo(
    () => buildStrategyAnalytics(trades, { pnlType, defaultCommission, defaultFees }),
    [trades, pnlType, defaultCommission, defaultFees]
  );

  if (!trades.length) {
    return <EmptyState title="No strategy data" description="Add setups and tags to trades to see strategy effectiveness." />;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Best strategy"
          value={analytics.bestCombination?.label || "Unavailable"}
          detail={analytics.bestCombination ? `${analytics.bestCombination.trades} trades | ${formatPercent(analytics.bestCombination.winRate)} win | ${formatCurrency(analytics.bestCombination.totalPnl)}` : "Needs setup + tag data"}
          tone="text-mint"
        />
        <MetricCard
          label="Weakest strategy"
          value={analytics.weakestCombination?.label || "Unavailable"}
          detail={analytics.weakestCombination ? `${analytics.weakestCombination.trades} trades | ${formatPercent(analytics.weakestCombination.winRate)} win | ${formatCurrency(analytics.weakestCombination.totalPnl)}` : "No setup + tag sample yet"}
          tone="text-coral"
        />
        <MetricCard
          label="Best setup"
          value={analytics.bestSetup?.label || "Unavailable"}
          detail={analytics.bestSetup ? `${analytics.bestSetup.trades} trades | ${formatPercent(analytics.bestSetup.winRate)} win | ${formatCurrency(analytics.bestSetup.totalPnl)}` : "Needs setup data"}
          tone="text-mint"
        />
        <MetricCard
          label="Best tag"
          value={analytics.bestTag?.label || "Unavailable"}
          detail={analytics.bestTag ? `${analytics.bestTag.trades} trades | ${formatPercent(analytics.bestTag.winRate)} win | ${formatCurrency(analytics.bestTag.totalPnl)}` : "Needs tag data"}
          tone="text-mint"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <EffectivenessChart title="SETUP WIN RATE" data={analytics.setups} />
        <EffectivenessChart title="TAG WIN RATE" data={analytics.tags} />
        <EffectivenessChart title="SETUP + TAG WIN RATE" data={analytics.combinations} />
      </div>

      <PnlWinRateChart data={analytics.combinations} />
      <div className="grid gap-5">
        <StrategyTable title="SETUP DETAIL" rows={analytics.setups} />
        <StrategyTable title="TAG DETAIL" rows={analytics.tags} />
        <StrategyTable title="SETUP + TAG DETAIL" rows={analytics.combinations} />
      </div>
    </div>
  );
}

export default StrategyReportsTab;
