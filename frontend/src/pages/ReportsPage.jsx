import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tagService from "../services/tagService";
import tradeService from "../services/tradeService";
import { formatCurrency, formatPercent } from "../utils/formatters";

const TAB_ITEMS = [
  "Overview",
  "Detailed",
  "Win vs Loss Days",
  "Drawdown",
  "Compare",
  "Tag Breakdown",
  "Advanced"
];

const RANGE_OPTIONS = [
  { key: "30", label: "30 Days", days: 30 },
  { key: "60", label: "60 Days", days: 60 },
  { key: "90", label: "90 Days", days: 90 },
  { key: "ALL", label: "All", days: null }
];

const REPORT_FILTERS = {
  symbol: "",
  tag: "",
  side: "",
  duration: "",
  from: "",
  to: ""
};

function getDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function normalizeTagList(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function getHoldMinutes(trade) {
  const entryDate = new Date(trade.entryDate);
  const exitDate = trade.exitDate ? new Date(trade.exitDate) : entryDate;
  return Math.max(0, (exitDate.getTime() - entryDate.getTime()) / 60000);
}

function asNumber(value) {
  const numericValue = Number(value || 0);
  return Number.isNaN(numericValue) ? 0 : numericValue;
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatMinutes(value) {
  const minutes = Math.round(Number(value || 0));
  if (minutes <= 0) {
    return "0 min";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function buildChartTooltip(mode = "currency") {
  return function TooltipContent({ active, payload, label }) {
    if (!active || !payload?.length) {
      return null;
    }

    const value = Number(payload[0].value || 0);
    const formattedValue =
      mode === "percent"
        ? `${value.toFixed(1)}%`
        : mode === "volume"
          ? value.toLocaleString("en-US")
          : formatCurrency(value);

    return (
      <div className="rounded-[12px] border border-white/10 bg-[#171d29]/95 px-3 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur">
        <div className="text-xs font-medium text-white/72">{label}</div>
        <div className={`mt-1 text-sm font-semibold ${value >= 0 ? "text-mint" : "text-coral"}`}>
          {formattedValue}
        </div>
      </div>
    );
  };
}

const CurrencyTooltip = buildChartTooltip("currency");
const PercentTooltip = buildChartTooltip("percent");
const VolumeTooltip = buildChartTooltip("volume");

function buildOverviewSeries(trades, rangeDays) {
  if (trades.length === 0) {
    return {
      grossDaily: [],
      cumulative: [],
      dailyVolume: [],
      winRate: []
    };
  }

  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
  );

  const latestDate = new Date(sortedTrades[sortedTrades.length - 1].entryDate);
  const latestStart = startOfDay(latestDate);
  const startDate = rangeDays
    ? (() => {
        const next = new Date(latestStart);
        next.setDate(next.getDate() - (rangeDays - 1));
        return next;
      })()
    : startOfDay(new Date(sortedTrades[0].entryDate));

  const dailyMap = new Map();

  for (const trade of sortedTrades) {
    const entryDate = new Date(trade.entryDate);

    if (entryDate < startDate) {
      continue;
    }

    const dayKey = getDayKey(entryDate);
    const pnl = Number(trade.netPnl ?? trade.grossPnl ?? 0);
    const grossPnl = Number(trade.grossPnl ?? trade.netPnl ?? 0);
    const quantity = Math.abs(Number(trade.quantity ?? 0));
    const dayStats = dailyMap.get(dayKey) || {
      date: dayKey,
      label: entryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      grossPnl: 0,
      netPnl: 0,
      volume: 0,
      trades: 0,
      wins: 0
    };

    dayStats.grossPnl = Number((dayStats.grossPnl + grossPnl).toFixed(2));
    dayStats.netPnl = Number((dayStats.netPnl + pnl).toFixed(2));
    dayStats.volume += quantity;
    dayStats.trades += 1;

    if (pnl > 0) {
      dayStats.wins += 1;
    }

    dailyMap.set(dayKey, dayStats);
  }

  const days = [];
  const cursor = new Date(startDate);
  const endDate = latestStart;
  let runningEquity = 0;

  while (cursor <= endDate) {
    const dayKey = getDayKey(cursor);
    const stats = dailyMap.get(dayKey) || {
      date: dayKey,
      label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      grossPnl: 0,
      netPnl: 0,
      volume: 0,
      trades: 0,
      wins: 0
    };

    runningEquity = Number((runningEquity + stats.grossPnl).toFixed(2));

    days.push({
      ...stats,
      cumulativeGrossPnl: runningEquity,
      winRate: stats.trades ? Number(((stats.wins / stats.trades) * 100).toFixed(2)) : 0
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    grossDaily: days.map((day) => ({
      date: day.date,
      label: day.label,
      grossPnl: day.grossPnl
    })),
    cumulative: days.map((day) => ({
      date: day.date,
      label: day.label,
      cumulativeGrossPnl: day.cumulativeGrossPnl
    })),
    dailyVolume: days.map((day) => ({
      date: day.date,
      label: day.label,
      volume: day.volume
    })),
    winRate: days.map((day) => ({
      date: day.date,
      label: day.label,
      winRate: day.winRate
    }))
  };
}

function calculateStandardDeviation(values) {
  if (values.length === 0) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

function summarizeTrades(trades, dayCountOverride) {
  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
  );
  const dailyStats = new Map();
  let totalPnl = 0;
  let totalVolume = 0;
  let largestGain = Number.NEGATIVE_INFINITY;
  let largestLoss = Number.POSITIVE_INFINITY;
  let totalWins = 0;
  let totalLosses = 0;
  let totalScratch = 0;
  let totalWinningPnl = 0;
  let totalLosingPnl = 0;
  let totalWinningHold = 0;
  let totalLosingHold = 0;
  let totalScratchHold = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let scratchTrades = 0;
  let totalPerShare = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  const pnlSeries = [];

  for (const trade of sortedTrades) {
    const pnl = asNumber(trade.netPnl ?? trade.grossPnl);
    const quantity = Math.abs(asNumber(trade.quantity));
    const perShare = quantity > 0 ? pnl / quantity : 0;
    const holdMinutes = getHoldMinutes(trade);
    const dayKey = getDayKey(new Date(trade.entryDate));
    const day = dailyStats.get(dayKey) || { pnl: 0, volume: 0 };

    day.pnl = Number((day.pnl + pnl).toFixed(2));
    day.volume += quantity;
    dailyStats.set(dayKey, day);

    totalPnl += pnl;
    totalVolume += quantity;
    totalPerShare += perShare;
    largestGain = Math.max(largestGain, pnl);
    largestLoss = Math.min(largestLoss, pnl);
    pnlSeries.push(pnl);

    if (pnl > 0) {
      totalWins += pnl;
      totalWinningPnl += pnl;
      totalWinningHold += holdMinutes;
      winningTrades += 1;
      currentWinStreak += 1;
      currentLossStreak = 0;
      maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
    } else if (pnl < 0) {
      totalLosses += Math.abs(pnl);
      totalLosingPnl += pnl;
      totalLosingHold += holdMinutes;
      losingTrades += 1;
      currentLossStreak += 1;
      currentWinStreak = 0;
      maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
    } else {
      totalScratch += 1;
      totalScratchHold += holdMinutes;
      scratchTrades += 1;
      currentWinStreak = 0;
      currentLossStreak = 0;
    }
  }

  const totalTrades = sortedTrades.length;
  const totalDays = Math.max(dayCountOverride ?? dailyStats.size, 1);

  return {
    totalPnl,
    totalVolume,
    totalTrades,
    totalDays,
    averageDailyGainLoss: totalPnl / totalDays,
    averageDailyVolume: totalVolume / totalDays,
    averageTradeGainLoss: totalTrades ? totalPnl / totalTrades : 0,
    averagePerShareGainLoss: totalTrades ? totalPerShare / totalTrades : 0,
    averageWinningTrade: winningTrades ? totalWinningPnl / winningTrades : 0,
    averageLosingTrade: losingTrades ? totalLosingPnl / losingTrades : 0,
    averageScratchHold: scratchTrades ? totalScratchHold / scratchTrades : 0,
    averageWinningHold: winningTrades ? totalWinningHold / winningTrades : 0,
    averageLosingHold: losingTrades ? totalLosingHold / losingTrades : 0,
    tradePnlStdDev: calculateStandardDeviation(pnlSeries),
    profitFactor: totalLosses ? totalWins / totalLosses : 0,
    largestGain: largestGain === Number.NEGATIVE_INFINITY ? 0 : largestGain,
    largestLoss: largestLoss === Number.POSITIVE_INFINITY ? 0 : largestLoss,
    winningTrades,
    losingTrades,
    scratchTrades,
    maxWinStreak,
    maxLossStreak,
    totalFees: sortedTrades.reduce((sum, trade) => sum + asNumber(trade.fees), 0)
  };
}

function buildDetailedStats(trades) {
  if (trades.length === 0) {
    return [];
  }

  const summary = summarizeTrades(trades);

  const rows = [
    [
      { label: "Total Gain/Loss", value: formatCurrency(summary.totalPnl), tone: summary.totalPnl >= 0 ? "text-mint" : "text-coral" },
      { label: "Largest Gain", value: formatCurrency(summary.largestGain), tone: "text-mint" },
      { label: "Largest Loss", value: formatCurrency(summary.largestLoss), tone: "text-coral" }
    ],
    [
      { label: "Average Daily Gain/Loss", value: formatCurrency(summary.averageDailyGainLoss), tone: summary.averageDailyGainLoss >= 0 ? "text-mint" : "text-coral" },
      { label: "Average Daily Volume", value: formatCompactNumber(summary.averageDailyVolume), tone: "text-white" },
      { label: "Average Per-share Gain/Loss", value: formatCurrency(summary.averagePerShareGainLoss), tone: summary.averagePerShareGainLoss >= 0 ? "text-mint" : "text-coral" }
    ],
    [
      { label: "Average Trade Gain/Loss", value: formatCurrency(summary.averageTradeGainLoss), tone: summary.averageTradeGainLoss >= 0 ? "text-mint" : "text-coral" },
      { label: "Average Winning Trade", value: formatCurrency(summary.averageWinningTrade), tone: "text-mint" },
      { label: "Average Losing Trade", value: formatCurrency(summary.averageLosingTrade), tone: "text-coral" }
    ],
    [
      { label: "Total Number of Trades", value: formatCompactNumber(summary.totalTrades), tone: "text-white" },
      { label: "Number of Winning Trades", value: `${summary.winningTrades} (${formatPercent(summary.totalTrades ? (summary.winningTrades / summary.totalTrades) * 100 : 0)})`, tone: "text-white" },
      { label: "Number of Losing Trades", value: `${summary.losingTrades} (${formatPercent(summary.totalTrades ? (summary.losingTrades / summary.totalTrades) * 100 : 0)})`, tone: "text-white" }
    ],
    [
      { label: "Average Hold Time (scratch trades)", value: formatMinutes(summary.averageScratchHold), tone: "text-white" },
      { label: "Average Hold Time (winning trades)", value: formatMinutes(summary.averageWinningHold), tone: "text-white" },
      { label: "Average Hold Time (losing trades)", value: formatMinutes(summary.averageLosingHold), tone: "text-white" }
    ],
    [
      { label: "Number of Scratch Trades", value: formatCompactNumber(summary.scratchTrades), tone: "text-white" },
      { label: "Max Consecutive Wins", value: formatCompactNumber(summary.maxWinStreak), tone: "text-white" },
      { label: "Max Consecutive Losses", value: formatCompactNumber(summary.maxLossStreak), tone: "text-white" }
    ],
    [
      { label: "Trade P&L Standard Deviation", value: formatCurrency(summary.tradePnlStdDev), tone: "text-white" },
      { label: "System Quality Number (SQN)", value: "Locked", tone: "text-white/38", locked: true },
      { label: "Probability of Random Chance", value: "Locked", tone: "text-white/38", locked: true }
    ],
    [
      { label: "Kelly Percentage", value: "Locked", tone: "text-white/38", locked: true },
      { label: "K-Ratio", value: "Locked", tone: "text-white/38", locked: true },
      { label: "Profit Factor", value: summary.profitFactor ? summary.profitFactor.toFixed(2) : "0.00", tone: "text-white" }
    ],
    [
      { label: "Total Commissions", value: "Locked", tone: "text-white/38", locked: true },
      { label: "Total Fees", value: formatCurrency(summary.totalFees), tone: "text-white" },
      null
    ],
    [
      { label: "Average position MAE", value: "Locked", tone: "text-white/38", locked: true },
      { label: "Average Position MFE", value: "Locked", tone: "text-white/38", locked: true },
      null
    ]
  ];

  return rows;
}

function buildWinLossDayRows(summary) {
  return [
    { label: "Total Gain / Loss", value: formatCurrency(summary.totalPnl), tone: summary.totalPnl >= 0 ? "text-mint" : "text-coral" },
    { label: "Average Daily Gain / Loss", value: formatCurrency(summary.averageDailyGainLoss), tone: summary.averageDailyGainLoss >= 0 ? "text-mint" : "text-coral" },
    { label: "Average Daily Volume", value: formatCompactNumber(summary.averageDailyVolume), tone: "text-white" },
    { label: "Average Per-share Gain / Loss", value: formatCurrency(summary.averagePerShareGainLoss), tone: summary.averagePerShareGainLoss >= 0 ? "text-mint" : "text-coral" },
    { label: "Average Trade Gain / Loss", value: formatCurrency(summary.averageTradeGainLoss), tone: summary.averageTradeGainLoss >= 0 ? "text-mint" : "text-coral" },
    { label: "Total Number of Trades", value: formatCompactNumber(summary.totalTrades), tone: "text-white" },
    { label: "Winning Trades", value: `${summary.winningTrades} (${formatPercent(summary.totalTrades ? (summary.winningTrades / summary.totalTrades) * 100 : 0)})`, tone: "text-white" },
    { label: "Losing Trades", value: `${summary.losingTrades} (${formatPercent(summary.totalTrades ? (summary.losingTrades / summary.totalTrades) * 100 : 0)})`, tone: "text-white" },
    { label: "Average Winning Trade", value: formatCurrency(summary.averageWinningTrade), tone: "text-mint" },
    { label: "Average Losing Trade", value: formatCurrency(summary.averageLosingTrade), tone: "text-coral" },
    { label: "Trade P&L Standard Deviation", value: formatCurrency(summary.tradePnlStdDev), tone: "text-white" },
    { label: "Probability of Random Chance", value: "Locked", tone: "text-white/38", locked: true },
    { label: "K-Ratio", value: "Locked", tone: "text-white/38", locked: true },
    { label: "System Quality Number (SQN)", value: "Locked", tone: "text-white/38", locked: true },
    { label: "Kelly Percentage", value: "Locked", tone: "text-white/38", locked: true },
    { label: "Average Hold Time (winning trades)", value: formatMinutes(summary.averageWinningHold), tone: "text-white" },
    { label: "Average Hold Time (losing trades)", value: formatMinutes(summary.averageLosingHold), tone: "text-white" },
    { label: "Profit Factor", value: summary.profitFactor ? summary.profitFactor.toFixed(2) : "0.00", tone: "text-white" },
    { label: "Largest Gain", value: formatCurrency(summary.largestGain), tone: "text-mint" },
    { label: "Largest Loss", value: formatCurrency(summary.largestLoss), tone: "text-coral" },
    { label: "Average Position MFE", value: "n/a", tone: "text-white/38", locked: true },
    { label: "Average Position MAE", value: "n/a", tone: "text-white/38", locked: true },
    { label: "Total Commissions", value: "Locked", tone: "text-white/38", locked: true },
    { label: "Total Fees", value: formatCurrency(summary.totalFees), tone: "text-white" }
  ];
}

function buildWinVsLossDaysStats(trades) {
  const dayMap = new Map();

  for (const trade of trades) {
    const date = new Date(trade.entryDate);
    const dayKey = getDayKey(date);
    const current = dayMap.get(dayKey) || {
      dayKey,
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
      pnl: 0,
      trades: []
    };

    current.pnl = Number((current.pnl + asNumber(trade.netPnl ?? trade.grossPnl)).toFixed(2));
    current.trades.push(trade);
    dayMap.set(dayKey, current);
  }

  const winningDays = [];
  const losingDays = [];
  const weekdayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const distributionMap = new Map(
    weekdayOrder.map((day) => [day, { day, winningDays: 0, losingDays: 0, winningPnl: 0, losingPnl: 0 }])
  );

  for (const day of dayMap.values()) {
    if (!distributionMap.has(day.weekday)) {
      continue;
    }

    const bucket = distributionMap.get(day.weekday);

    if (day.pnl > 0) {
      winningDays.push(day);
      bucket.winningDays += 1;
      bucket.winningPnl = Number((bucket.winningPnl + day.pnl).toFixed(2));
    } else if (day.pnl < 0) {
      losingDays.push(day);
      bucket.losingDays += 1;
      bucket.losingPnl = Number((bucket.losingPnl + day.pnl).toFixed(2));
    }
  }

  const winningTrades = winningDays.flatMap((day) => day.trades);
  const losingTrades = losingDays.flatMap((day) => day.trades);

  return {
    winningDayCount: winningDays.length,
    losingDayCount: losingDays.length,
    winningSummary: summarizeTrades(winningTrades, winningDays.length),
    losingSummary: summarizeTrades(losingTrades, losingDays.length),
    distributionByWeekday: Array.from(distributionMap.values()),
    pieData: [
      { name: "Winning Days", value: winningDays.length, fill: "#56f0a9" },
      { name: "Losing Days", value: losingDays.length, fill: "#ffc14d" }
    ]
  };
}

function DetailedStatsTable({ rows }) {
  return (
    <Card title="STATS">
      <div className="overflow-hidden rounded-[18px] border border-[#e5e7eb42] bg-white/[0.02]">
        {rows.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="grid border-b border-[#e5e7eb42] last:border-b-0 xl:grid-cols-3">
            {row.map((cell, cellIndex) => (
              <div
                key={`cell-${rowIndex}-${cellIndex}`}
                className={`min-h-[74px] border-r border-[#e5e7eb42] px-4 py-4 last:border-r-0 ${
                  !cell ? "hidden xl:block" : ""
                }`}
              >
                {cell ? (
                  <div className="flex h-full items-center justify-between gap-4">
                    <span className="text-sm font-medium text-white/52">{cell.label}</span>
                    <span className={`text-sm font-semibold ${cell.tone}`}>
                      {cell.locked ? "🔒" : cell.value}
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

function WinLossColumn({ title, count, rows, accent }) {
  return (
    <div className="rounded-[18px] border border-[#e5e7eb42] bg-white/[0.02]">
      <div className="border-b border-[#e5e7eb42] px-4 py-3">
        <p className={`text-sm font-semibold ${accent}`}>{count} {title}</p>
      </div>
      <div>
        {rows.map((row) => (
          <div
            key={`${title}-${row.label}`}
            className="flex items-center justify-between gap-4 border-b border-[#e5e7eb42] px-4 py-3 last:border-b-0"
          >
            <span className="text-sm font-medium text-white/52">{row.label}</span>
            <span className={`text-sm font-semibold ${row.tone}`}>{row.locked ? "🔒" : row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WinVsLossDaysSection({ stats }) {
  return (
    <div className="space-y-5">
      <Card title="STATISTICS">
        <p className="text-sm text-white/48">
          This report groups trades by whether the trading day finished positive or negative.
        </p>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <WinLossColumn
            title="Winning Days"
            count={stats.winningDayCount}
            rows={buildWinLossDayRows(stats.winningSummary)}
            accent="text-mint"
          />
          <WinLossColumn
            title="Losing Days"
            count={stats.losingDayCount}
            rows={buildWinLossDayRows(stats.losingSummary)}
            accent="text-[#ffc14d]"
          />
        </div>
      </Card>

      <div className="flex flex-col items-center gap-4 py-2">
        <div className="h-[140px] w-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={34}
                outerRadius={56}
                paddingAngle={3}
                stroke="none"
              >
                {stats.pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<PercentTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {["Day/Times", "Price/Volume", "Instrument", "Market Behavior", "Win/Loss/Expectation", "Liquidity"].map((item, index) => (
            <button
              key={item}
              type="button"
              className={`rounded-[10px] px-3 py-2 text-xs font-medium ${
                index === 0
                  ? "bg-white/[0.08] text-white"
                  : "border border-white/10 bg-white/[0.03] text-white/58"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="TRADE DISTRIBUTION BY DAY OF WEEK">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.distributionByWeekday}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="winningDays" fill="#56f0a9" radius={[6, 6, 0, 0]} />
                <Bar dataKey="losingDays" fill="#ffc14d" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="PERFORMANCE BY DAY OF WEEK">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.distributionByWeekday}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="winningPnl" fill="#56f0a9" radius={[6, 6, 0, 0]} />
                <Bar dataKey="losingPnl" fill="#ff6b6b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function applyReportFilters(trades, filters, rangeDays) {
  let nextTrades = [...trades];

  if (rangeDays && nextTrades.length > 0) {
    const latestTradeDate = nextTrades.reduce((latest, trade) => {
      const tradeDate = new Date(trade.entryDate);
      return tradeDate > latest ? tradeDate : latest;
    }, new Date(nextTrades[0].entryDate));
    const rangeStart = startOfDay(latestTradeDate);
    rangeStart.setDate(rangeStart.getDate() - (rangeDays - 1));
    nextTrades = nextTrades.filter((trade) => new Date(trade.entryDate) >= rangeStart);
  }

  if (filters.symbol) {
    const query = filters.symbol.trim().toLowerCase();
    nextTrades = nextTrades.filter((trade) => String(trade.symbol || "").toLowerCase().includes(query));
  }

  if (filters.tag) {
    nextTrades = nextTrades.filter((trade) =>
      normalizeTagList(trade.tags).some((tag) => tag.toLowerCase() === filters.tag.toLowerCase())
    );
  }

  if (filters.side) {
    nextTrades = nextTrades.filter((trade) => trade.side === filters.side);
  }

  if (filters.duration) {
    nextTrades = nextTrades.filter((trade) => {
      const holdMinutes = getHoldMinutes(trade);

      if (filters.duration === "SCALP") {
        return holdMinutes < 5;
      }

      if (filters.duration === "INTRADAY") {
        return holdMinutes >= 5 && holdMinutes < 60;
      }

      if (filters.duration === "SWING") {
        return holdMinutes >= 60;
      }

      return true;
    });
  }

  if (filters.from) {
    const from = new Date(filters.from);
    from.setHours(0, 0, 0, 0);
    nextTrades = nextTrades.filter((trade) => new Date(trade.entryDate) >= from);
  }

  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    nextTrades = nextTrades.filter((trade) => new Date(trade.entryDate) <= to);
  }

  return nextTrades;
}

function ReportsPage() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [rangeKey, setRangeKey] = useState("30");
  const [filters, setFilters] = useState(REPORT_FILTERS);
  const {
    data: trades,
    loading,
    error
  } = useCachedAsyncResource({
    peek: () => tradeService.peekTrades(),
    load: () => tradeService.getTrades(),
    initialValue: [],
    deps: []
  });
  const { data: tags = [] } = useCachedAsyncResource({
    peek: () => tagService.peekTags(),
    load: () => tagService.getTags(),
    initialValue: [],
    deps: []
  });

  const activeRange = RANGE_OPTIONS.find((item) => item.key === rangeKey) || RANGE_OPTIONS[0];
  const filteredTrades = useMemo(
    () => applyReportFilters(trades, filters, activeRange.days),
    [trades, filters, activeRange.days]
  );
  const reportSeries = useMemo(
    () => buildOverviewSeries(filteredTrades, activeRange.days),
    [filteredTrades, activeRange.days]
  );
  const detailedStats = useMemo(() => buildDetailedStats(filteredTrades), [filteredTrades]);
  const winVsLossDayStats = useMemo(() => buildWinVsLossDaysStats(filteredTrades), [filteredTrades]);

  function updateFilter(key, value) {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  function resetFilters() {
    setFilters(REPORT_FILTERS);
  }

  if (loading) {
    return <div className="text-sm text-mist">Loading reports...</div>;
  }

  if (error) {
    return <div className="ui-notice border-coral/30 bg-[#2a1111] text-coral">{error}</div>;
  }

  if (trades.length === 0) {
    return (
      <EmptyState
        title="No trades yet"
        description="Import or add trades to unlock your overview reports."
      />
    );
  }

  const suffix = activeRange.days ? `(${activeRange.days} Days)` : "(All)";

  return (
    <div className="space-y-5">
      <Card>
        <div className="space-y-5">
          <div className="grid gap-3 xl:grid-cols-[repeat(4,minmax(0,1fr))_1.2fr_auto]">
            <div>
              <label className="mb-2 block text-xs font-medium text-white/72">Symbol</label>
              <input
                value={filters.symbol}
                onChange={(event) => updateFilter("symbol", event.target.value)}
                placeholder="Symbol"
                className="ui-input"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium text-white/72">Tags</label>
              <select
                value={filters.tag}
                onChange={(event) => updateFilter("tag", event.target.value)}
                className="ui-input"
              >
                <option value="">Select</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium text-white/72">Side</label>
              <select
                value={filters.side}
                onChange={(event) => updateFilter("side", event.target.value)}
                className="ui-input"
              >
                <option value="">All</option>
                <option value="LONG">Long</option>
                <option value="SHORT">Short</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium text-white/72">Duration</label>
              <select
                value={filters.duration}
                onChange={(event) => updateFilter("duration", event.target.value)}
                className="ui-input"
              >
                <option value="">All</option>
                <option value="SCALP">Scalp</option>
                <option value="INTRADAY">Intraday</option>
                <option value="SWING">Swing</option>
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-medium text-white/72">From</label>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(event) => updateFilter("from", event.target.value)}
                  className="ui-input"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-white/72">To</label>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(event) => updateFilter("to", event.target.value)}
                  className="ui-input"
                />
              </div>
            </div>
            <div className="flex items-end justify-end gap-2">
              <button type="button" onClick={resetFilters} className="ui-button px-4 py-3 text-sm">
                Reset
              </button>
              <button type="button" className="ui-button-solid px-4 py-3 text-sm">
                Apply Filters
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-center gap-5">
              {TAB_ITEMS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`text-sm font-medium transition ${
                    tab === activeTab
                      ? "border-b border-mint pb-3 text-mint"
                      : "pb-3 text-white/62 hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <select className="ui-input max-w-[150px]" defaultValue="Gross">
                <option>Gross</option>
                <option>Net</option>
              </select>
              <select className="ui-input max-w-[160px]" defaultValue="$ Value">
                <option>$ Value</option>
                <option>% Return</option>
              </select>
              <select className="ui-input max-w-[180px]" defaultValue="Aggregate P&L">
                <option>Aggregate P&L</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {RANGE_OPTIONS.map((option) => {
                const active = option.key === rangeKey;

                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setRangeKey(option.key)}
                    className={`rounded-[12px] px-3 py-2 text-xs font-semibold tracking-[0.12em] transition ${
                      active
                        ? "bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.14)]"
                        : "border border-white/10 bg-white/[0.035] text-white/70 hover:bg-white/[0.07] hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {filteredTrades.length === 0 ? (
        <EmptyState
          title="No trades match these filters"
          description="Try expanding the date range or clearing one of the report filters."
        />
      ) : activeTab === "Detailed" ? (
        <DetailedStatsTable rows={detailedStats} />
      ) : activeTab === "Win vs Loss Days" ? (
        <WinVsLossDaysSection stats={winVsLossDayStats} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card title={`GROSS DAILY P&L ${suffix.toUpperCase()}`}>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportSeries.grossDaily}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} minTickGap={18} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CurrencyTooltip />} />
                  <Bar dataKey="grossPnl" barSize={20}>
                    {reportSeries.grossDaily.map((entry) => (
                      <Cell key={entry.date} fill={entry.grossPnl >= 0 ? "#56f0a9" : "#ff6b6b"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title={`GROSS CUMULATIVE P&L ${suffix.toUpperCase()}`}>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reportSeries.cumulative}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} minTickGap={18} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                  <Tooltip content={<CurrencyTooltip />} />
                  <Line type="monotone" dataKey="cumulativeGrossPnl" stroke="#18c87a" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title={`DAILY VOLUME ${suffix.toUpperCase()}`}>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportSeries.dailyVolume}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} minTickGap={18} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<VolumeTooltip />} />
                  <Bar dataKey="volume" barSize={20} fill="#56f0a9" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title={`WIN % ${suffix.toUpperCase()}`}>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportSeries.winRate}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} minTickGap={18} />
                  <YAxis axisLine={false} tickLine={false} domain={[0, 100]} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<PercentTooltip />} />
                  <Bar dataKey="winRate" barSize={20} fill="#56f0a9" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default ReportsPage;
