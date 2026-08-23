import { useMemo } from "react";
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

  const compareEffectiveness = (left, right) =>
    right.winRate - left.winRate || right.totalPnl - left.totalPnl || right.trades - left.trades;

  const rankBuckets = (rows) =>
    rows
      .map(finalizeBucket)
      .sort(compareEffectiveness);

  const setups = rankBuckets(Array.from(setupBuckets.values()));
  const tags = rankBuckets(Array.from(tagBuckets.values()));
  const combinations = rankBuckets(Array.from(comboBuckets.values()));
  const allRows = [...setups, ...tags, ...combinations].sort(compareEffectiveness);
  const qualified = allRows.filter((row) => row.trades >= MIN_SAMPLE_SIZE);
  const best = qualified[0] || allRows[0] || null;
  const worst = [...qualified].sort((left, right) => left.winRate - right.winRate || left.totalPnl - right.totalPnl)[0] || null;
  const totalPnl = trades.reduce(
    (sum, trade) => sum + getTradePnlByType(trade, options.pnlType, options.defaultCommission, options.defaultFees),
    0
  );
  const topComboPnl = combinations[0]?.totalPnl || 0;

  return {
    setups,
    tags,
    combinations,
    best,
    worst,
    totalPnl: Number(totalPnl.toFixed(2)),
    concentration: totalPnl ? Math.abs((topComboPnl / totalPnl) * 100) : 0
  };
}

function StrategyTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const row = payload[0].payload;

  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-2">
      <div className="max-w-[260px] text-xs font-medium text-white/72">{row.label}</div>
      <div className="mt-1 text-sm font-semibold text-mint">
        Win rate {formatPercent(row.winRate)}
      </div>
      <div className="mt-1 text-xs text-white/52">
        {row.trades} trades | {formatCurrency(row.totalPnl)} total | {formatCurrency(row.expectancy)} expectancy
      </div>
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
  const chartData = data.slice(0, 10);

  return (
    <Card title={title}>
      <div className="h-[330px] pb-4">
        {chartData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 16 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} tickFormatter={(value) => `${value}%`} />
              <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} width={132} interval={0} tick={{ fill: "#c6cedb", fontSize: 11 }} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<StrategyTooltip />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
              <Bar dataKey="winRate" radius={[0, 6, 6, 0]} barSize={18}>
                {chartData.map((row) => (
                  <Cell key={row.label} fill={row.totalPnl >= 0 ? GREEN : RED} opacity={row.trades >= MIN_SAMPLE_SIZE ? 1 : 0.45} />
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
        <MetricCard label="Best strategy" value={analytics.best?.label || "Unavailable"} detail={analytics.best ? `${analytics.best.type} | ${analytics.best.trades} trades | ${formatPercent(analytics.best.winRate)} win | ${formatCurrency(analytics.best.totalPnl)}` : "Needs more tagged trades"} tone="text-mint" />
        <MetricCard label="Weakest qualified" value={analytics.worst?.label || "Unavailable"} detail={analytics.worst ? `${analytics.worst.type} | ${analytics.worst.trades} trades | ${formatPercent(analytics.worst.winRate)} win | ${formatCurrency(analytics.worst.totalPnl)}` : "No qualified sample yet"} tone="text-coral" />
        <MetricCard label="Tagged strategy P&L" value={formatCurrency(analytics.totalPnl)} detail="Filtered report P&L across strategy-tagged trades" tone={analytics.totalPnl >= 0 ? "text-mint" : "text-coral"} />
        <MetricCard label="Top combo concentration" value={formatPercent(analytics.concentration)} detail="Share of filtered P&L from the strongest setup/tag combination" />
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
