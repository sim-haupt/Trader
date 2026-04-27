import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
import CustomSelect from "../components/ui/CustomSelect";
import DateRangePicker from "../components/ui/DateRangePicker";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tagService from "../services/tagService";
import strategyService from "../services/strategyService";
import tradeService from "../services/tradeService";
import { formatCurrency, formatPercent } from "../utils/formatters";
import { useAuth } from "../context/AuthContext";
import {
  getEffectiveTradeCommission,
  getTradeGrossPnl,
  getTradeNetPnl,
  getTradePnlByType
} from "../utils/tradePnl";
import { isUsMarketDay } from "../utils/marketCalendar";

const TAB_ITEMS = [
  "Overview",
  "Detailed",
  "Win vs Loss Days",
  "Drawdown",
  "Compare"
];

const RANGE_OPTIONS = [
  { key: "7", label: "7D", days: 7 },
  { key: "14", label: "14D", days: 14 },
  { key: "30", label: "30D", days: 30 },
  { key: "60", label: "60D", days: 60 },
  { key: "90", label: "90D", days: 90 },
  { key: "ALL", label: "All", days: null }
];

const REPORT_FILTERS = {
  symbol: "",
  tag: "",
  strategy: "",
  side: "",
  from: "",
  to: ""
};

const COMPARE_GROUP_FILTERS = {
  symbol: "",
  tag: "",
  strategy: "",
  side: "",
  tradePnl: "",
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
          : mode === "count"
            ? value.toLocaleString("en-US")
          : formatCurrency(value);

    return (
      <div className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-2">
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
const CountTooltip = buildChartTooltip("count");
const REPORT_GREEN = "#3dff9a";
const REPORT_RED = "#ff5f7a";
const REPORT_YELLOW = "#ffd84d";

function WinLossDaysPieTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  const value = Number(point?.value || 0);
  const total = Number(point?.total || 0);
  const share = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-2">
      <div className="text-xs font-medium text-white/72">{point?.name || "Days"}</div>
      <div className={`mt-1 text-sm font-semibold ${value >= 0 ? "text-mint" : "text-coral"}`}>
        {value} day{value === 1 ? "" : "s"}
      </div>
      <div className="mt-1 text-xs text-white/52">{share.toFixed(1)}%</div>
    </div>
  );
}

const WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MONTH_ORDER = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DETAILED_TIMEFRAME_OPTIONS = [
  { key: "60", label: "1H", minutes: 60 },
  { key: "30", label: "30M", minutes: 30 },
  { key: "15", label: "15M", minutes: 15 }
];
function formatHourBucket(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function formatAxisCurrency(value) {
  return `${value < 0 ? "-" : ""}$${Math.abs(value)}`;
}

function buildOverviewSeries(trades, rangeDays, options = {}) {
  const defaultCommission = options.defaultCommission || 0;
  const defaultFees = options.defaultFees || 0;
  const pnlType = options.pnlType || "GROSS";
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
    const pnl = getTradePnlByType(trade, pnlType, defaultCommission, defaultFees);
    const grossPnl = getTradeGrossPnl(trade);
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

    if (!isUsMarketDay(dayKey)) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    const stats = dailyMap.get(dayKey) || {
      date: dayKey,
      label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      grossPnl: 0,
      netPnl: 0,
      volume: 0,
      trades: 0,
      wins: 0
    };

    const dayPnl = pnlType === "GROSS" ? stats.grossPnl : stats.netPnl;
    runningEquity = Number((runningEquity + dayPnl).toFixed(2));

    days.push({
      ...stats,
      cumulativePnl: runningEquity,
      winRate: stats.trades ? Number(((stats.wins / stats.trades) * 100).toFixed(2)) : 0
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    grossDaily: days.map((day) => ({
      date: day.date,
      label: day.label,
      grossPnl: pnlType === "GROSS" ? day.grossPnl : day.netPnl
    })),
    cumulative: days.map((day) => ({
      date: day.date,
      label: day.label,
      cumulativeGrossPnl: day.cumulativePnl
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

function calculateTrimmedAverage(values) {
  const numericValues = values
    .map((value) => asNumber(value))
    .filter((value) => Number.isFinite(value));

  if (numericValues.length === 0) {
    return 0;
  }

  if (numericValues.length < 3) {
    return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  }

  const sortedValues = [...numericValues].sort((a, b) => a - b);
  const trimmedValues = sortedValues.slice(1, -1);

  if (trimmedValues.length === 0) {
    return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  }

  return trimmedValues.reduce((sum, value) => sum + value, 0) / trimmedValues.length;
}

function combination(n, k) {
  if (k < 0 || k > n) {
    return 0;
  }

  const safeK = Math.min(k, n - k);
  let result = 1;

  for (let i = 1; i <= safeK; i += 1) {
    result = (result * (n - safeK + i)) / i;
  }

  return result;
}

function calculateRandomChanceProbability(winningTrades, losingTrades) {
  const n = winningTrades + losingTrades;

  if (n <= 0) {
    return 0;
  }

  const threshold = Math.max(winningTrades, losingTrades);
  let probability = 0;

  for (let k = threshold; k <= n; k += 1) {
    probability += combination(n, k) / 2 ** n;
  }

  return probability * 100;
}

function calculateKellyPercentage(summary) {
  const n = summary.winningTrades + summary.losingTrades;

  if (n === 0) {
    return 0;
  }

  const averageWin = summary.averageWinningTrade;
  const averageLoss = Math.abs(summary.averageLosingTrade);

  if (averageWin <= 0 || averageLoss <= 0) {
    return 0;
  }

  const winRate = summary.winningTrades / n;
  const lossRate = 1 - winRate;
  const rewardRisk = averageWin / averageLoss;
  const kelly = winRate - lossRate / rewardRisk;

  return kelly * 100;
}

function calculateSqn(summary) {
  const n = summary.winningTrades + summary.losingTrades;

  if (n === 0 || summary.tradePnlStdDev === 0) {
    return 0;
  }

  return (Math.sqrt(n) * summary.averageTradeGainLoss) / summary.tradePnlStdDev;
}

function calculateDrawdownStats(sortedTrades, defaultCommission, defaultFees, pnlType) {
  if (sortedTrades.length === 0) {
    return {
      averageDrawdown: 0,
      biggestDrawdown: 0,
      averageDaysInDrawdown: 0,
      daysInDrawdown: 0,
      averageTradesInDrawdown: 0,
      currentDrawdown: 0,
      drawdownCurve: []
    };
  }

  const dailyMap = new Map();

  for (const trade of sortedTrades) {
    const date = new Date(trade.entryDate);
    const dayKey = getDayKey(date);
    const current = dailyMap.get(dayKey) || {
      date: startOfDay(date),
      pnl: 0,
      trades: 0
    };

    current.pnl = Number(
      (current.pnl + getTradePnlByType(trade, pnlType, defaultCommission, defaultFees)).toFixed(2)
    );
    current.trades += 1;
    dailyMap.set(dayKey, current);
  }

  const dailySeries = Array.from(dailyMap.values()).sort((a, b) => a.date - b.date);
  let runningEquity = 0;
  let peakEquity = 0;
  let currentEpisode = null;
  const episodes = [];
  const drawdownCurve = [];

  for (const day of dailySeries) {
    runningEquity = Number((runningEquity + day.pnl).toFixed(2));
    peakEquity = Math.max(peakEquity, runningEquity);
    const drawdown = Number((runningEquity - peakEquity).toFixed(2));
    drawdownCurve.push({
      date: day.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      drawdown
    });

    if (drawdown < 0) {
      if (!currentEpisode) {
        currentEpisode = {
          drawdowns: [],
          dayCount: 0,
          tradeCount: 0
        };
      }

      currentEpisode.drawdowns.push(Math.abs(drawdown));
      currentEpisode.dayCount += 1;
      currentEpisode.tradeCount += day.trades;
    } else if (currentEpisode) {
      episodes.push(currentEpisode);
      currentEpisode = null;
    }
  }

  if (currentEpisode) {
    episodes.push(currentEpisode);
  }

  if (episodes.length === 0) {
    return {
      averageDrawdown: 0,
      biggestDrawdown: 0,
      averageDaysInDrawdown: 0,
      daysInDrawdown: 0,
      averageTradesInDrawdown: 0,
      currentDrawdown: 0,
      drawdownCurve
    };
  }

  const averageDrawdown =
    episodes.reduce((sum, episode) => sum + Math.max(...episode.drawdowns), 0) / episodes.length;
  const biggestDrawdown = Math.max(...episodes.flatMap((episode) => episode.drawdowns));
  const daysInDrawdown = episodes.reduce((sum, episode) => sum + episode.dayCount, 0);
  const averageDaysInDrawdown =
    episodes.reduce((sum, episode) => sum + episode.dayCount, 0) / episodes.length;
  const averageTradesInDrawdown =
    episodes.reduce((sum, episode) => sum + episode.tradeCount, 0) / episodes.length;

  return {
    averageDrawdown,
    biggestDrawdown,
    averageDaysInDrawdown,
    daysInDrawdown,
    averageTradesInDrawdown,
    currentDrawdown: Math.abs(drawdownCurve[drawdownCurve.length - 1]?.drawdown || 0),
    drawdownCurve
  };
}

function summarizeTrades(trades, dayCountOverride, options = {}) {
  const defaultCommission = options.defaultCommission || 0;
  const defaultFees = options.defaultFees || 0;
  const pnlType = options.pnlType || "NET";
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
  const winningHoldValues = [];
  const losingHoldValues = [];
  const scratchHoldValues = [];
  let winningTrades = 0;
  let losingTrades = 0;
  let scratchTrades = 0;
  let totalPerShare = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  const pnlSeries = [];
  let explicitFees = 0;
  let effectiveCommissions = 0;

  for (const trade of sortedTrades) {
    const pnl = getTradePnlByType(trade, pnlType, defaultCommission, defaultFees);
    const quantity = Math.abs(asNumber(trade.quantity));
    const perShare = quantity > 0 ? pnl / quantity : 0;
    const holdMinutes = getHoldMinutes(trade);
    const dayKey = getDayKey(new Date(trade.entryDate));
    const day = dailyStats.get(dayKey) || { pnl: 0, volume: 0, trades: 0 };

    day.pnl = Number((day.pnl + pnl).toFixed(2));
    day.volume += quantity;
    day.trades += 1;
    dailyStats.set(dayKey, day);

    totalPnl += pnl;
    totalVolume += quantity;
    totalPerShare += perShare;
    largestGain = Math.max(largestGain, pnl);
    largestLoss = Math.min(largestLoss, pnl);
    pnlSeries.push(pnl);
    explicitFees += asNumber(trade.fees);
    effectiveCommissions += getEffectiveTradeCommission(trade, defaultCommission, defaultFees);

    if (pnl > 0) {
      totalWins += pnl;
      totalWinningPnl += pnl;
      winningHoldValues.push(holdMinutes);
      winningTrades += 1;
      currentWinStreak += 1;
      currentLossStreak = 0;
      maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
    } else if (pnl < 0) {
      totalLosses += Math.abs(pnl);
      totalLosingPnl += pnl;
      losingHoldValues.push(holdMinutes);
      losingTrades += 1;
      currentLossStreak += 1;
      currentWinStreak = 0;
      maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
    } else {
      totalScratch += 1;
      scratchHoldValues.push(holdMinutes);
      scratchTrades += 1;
      currentWinStreak = 0;
      currentLossStreak = 0;
    }
  }

  const totalTrades = sortedTrades.length;
  const totalDays = Math.max(dayCountOverride ?? dailyStats.size, 1);
  const randomChanceProbability = calculateRandomChanceProbability(winningTrades, losingTrades);
  const kellyPercentage = calculateKellyPercentage({
    winningTrades,
    losingTrades,
    averageWinningTrade: winningTrades ? totalWinningPnl / winningTrades : 0,
    averageLosingTrade: losingTrades ? totalLosingPnl / losingTrades : 0
  });
  const drawdownStats = calculateDrawdownStats(sortedTrades, defaultCommission, defaultFees, pnlType);

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
    averageScratchHold: calculateTrimmedAverage(scratchHoldValues),
    averageWinningHold: calculateTrimmedAverage(winningHoldValues),
    averageLosingHold: calculateTrimmedAverage(losingHoldValues),
    tradePnlStdDev: calculateStandardDeviation(pnlSeries),
    profitFactor: totalLosses ? totalWins / totalLosses : 0,
    largestGain: largestGain === Number.NEGATIVE_INFINITY ? 0 : largestGain,
    largestLoss: largestLoss === Number.POSITIVE_INFINITY ? 0 : largestLoss,
    winningTrades,
    losingTrades,
    scratchTrades,
    maxWinStreak,
    maxLossStreak,
    totalFees: explicitFees,
    totalCommissions: effectiveCommissions,
    sqn: calculateSqn({
      winningTrades,
      losingTrades,
      averageTradeGainLoss: totalTrades ? totalPnl / totalTrades : 0,
      tradePnlStdDev: calculateStandardDeviation(pnlSeries)
    }),
    randomChanceProbability,
    kellyPercentage,
    ...drawdownStats
  };
}

function buildDetailedStats(trades, options = {}) {
  if (trades.length === 0) {
    return [];
  }

  const summary = summarizeTrades(trades, undefined, options);

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
      { label: "System Quality Number (SQN)", value: summary.sqn.toFixed(2), tone: "text-white" },
      { label: "Probability of Random Chance", value: formatPercent(summary.randomChanceProbability), tone: "text-white" }
    ],
    [
      { label: "Kelly Percentage", value: formatPercent(summary.kellyPercentage), tone: summary.kellyPercentage >= 0 ? "text-mint" : "text-coral" },
      { label: "Profit Factor", value: summary.profitFactor ? summary.profitFactor.toFixed(2) : "0.00", tone: "text-white" },
      null
    ],
    [
      { label: "Total Commissions", value: formatCurrency(summary.totalCommissions), tone: "text-white" },
      { label: "Total Fees", value: formatCurrency(summary.totalFees), tone: "text-white" },
      null
    ]
  ];

  return rows;
}

function buildDetailedBreakdownStats(trades, timeframeMinutes, options = {}) {
  const defaultCommission = options.defaultCommission || 0;
  const defaultFees = options.defaultFees || 0;
  const pnlType = options.pnlType || "NET";

  const weekdayMap = new Map(
    WEEKDAY_ORDER.map((day) => [day, { label: day, count: 0, pnl: 0 }])
  );
  const monthMap = new Map(
    MONTH_ORDER.map((month) => [month, { label: month, count: 0, pnl: 0 }])
  );
  const hourBucketMap = new Map();
  const startMinutes = 4 * 60;
  const endMinutes = 20 * 60;

  for (let minutes = startMinutes; minutes <= endMinutes; minutes += timeframeMinutes) {
    const label = formatHourBucket(minutes);
    hourBucketMap.set(label, { label, count: 0, pnl: 0 });
  }

  for (const trade of trades) {
    const entryDate = new Date(trade.entryDate);
    const pnl = getTradePnlByType(trade, pnlType, defaultCommission, defaultFees);
    const weekday = entryDate.toLocaleDateString("en-US", { weekday: "short" });
    const month = entryDate.toLocaleDateString("en-US", { month: "short" });

    if (weekdayMap.has(weekday)) {
      const current = weekdayMap.get(weekday);
      current.count += 1;
      current.pnl = Number((current.pnl + pnl).toFixed(2));
    }

    if (monthMap.has(month)) {
      const current = monthMap.get(month);
      current.count += 1;
      current.pnl = Number((current.pnl + pnl).toFixed(2));
    }

    const totalMinutes = entryDate.getHours() * 60 + entryDate.getMinutes();
    const bucketMinutes =
      Math.floor(totalMinutes / timeframeMinutes) * timeframeMinutes;
    const bucketLabel = formatHourBucket(bucketMinutes);

    if (!hourBucketMap.has(bucketLabel)) {
      hourBucketMap.set(bucketLabel, { label: bucketLabel, count: 0, pnl: 0 });
    }

    const hourBucket = hourBucketMap.get(bucketLabel);
    hourBucket.count += 1;
    hourBucket.pnl = Number((hourBucket.pnl + pnl).toFixed(2));
  }

  return {
    weekdayDistribution: Array.from(weekdayMap.values()),
    weekdayPerformance: Array.from(weekdayMap.values()),
    hourDistribution: Array.from(hourBucketMap.values()),
    hourPerformance: Array.from(hourBucketMap.values()),
    monthDistribution: Array.from(monthMap.values()),
    monthPerformance: Array.from(monthMap.values())
  };
}

function buildBucketStats(trades, options = {}) {
  const defaultCommission = options.defaultCommission || 0;
  const defaultFees = options.defaultFees || 0;
  const pnlType = options.pnlType || "NET";

  const makeBuckets = (labels) =>
    new Map(labels.map((label) => [label, { label, count: 0, pnl: 0 }]));

  const priceBuckets = makeBuckets([
    "< $2.00",
    "$2-$4.99",
    "$5-$9.99",
    "$10-$19.99",
    "$20-$49.99",
    "$50-$99.99",
    "$100-$199.99",
    "$200-$499.99"
  ]);

  const volumeBuckets = makeBuckets([
    "20-49",
    "50-99",
    "100-499",
    "500-999",
    "1,000-1,999",
    "2,000-2,999"
  ]);

  const rangeBuckets = makeBuckets([
    "$0.00-$0.09",
    "$0.10-$0.19",
    "$0.20-$0.49",
    "$0.50-$0.99",
    "$1.00-$1.99",
    "$2.00-$4.99",
    "$5.00+"
  ]);

  function addToBucket(map, label, pnl) {
    if (!map.has(label)) {
      return;
    }
    const bucket = map.get(label);
    bucket.count += 1;
    bucket.pnl = Number((bucket.pnl + pnl).toFixed(2));
  }

  for (const trade of trades) {
    const pnl = getTradePnlByType(trade, pnlType, defaultCommission, defaultFees);
    const entryPrice = Math.abs(Number(trade.entryPrice ?? 0));
    const quantity = Math.abs(Number(trade.quantity ?? 0));
    const exitPrice = Number(trade.exitPrice ?? trade.entryPrice ?? 0);
    const perTradeRange = Math.abs(exitPrice - Number(trade.entryPrice ?? 0));

    if (entryPrice < 2) addToBucket(priceBuckets, "< $2.00", pnl);
    else if (entryPrice < 5) addToBucket(priceBuckets, "$2-$4.99", pnl);
    else if (entryPrice < 10) addToBucket(priceBuckets, "$5-$9.99", pnl);
    else if (entryPrice < 20) addToBucket(priceBuckets, "$10-$19.99", pnl);
    else if (entryPrice < 50) addToBucket(priceBuckets, "$20-$49.99", pnl);
    else if (entryPrice < 100) addToBucket(priceBuckets, "$50-$99.99", pnl);
    else if (entryPrice < 200) addToBucket(priceBuckets, "$100-$199.99", pnl);
    else addToBucket(priceBuckets, "$200-$499.99", pnl);

    if (quantity >= 20 && quantity < 50) addToBucket(volumeBuckets, "20-49", pnl);
    else if (quantity < 100) addToBucket(volumeBuckets, "50-99", pnl);
    else if (quantity < 500) addToBucket(volumeBuckets, "100-499", pnl);
    else if (quantity < 1000) addToBucket(volumeBuckets, "500-999", pnl);
    else if (quantity < 2000) addToBucket(volumeBuckets, "1,000-1,999", pnl);
    else addToBucket(volumeBuckets, "2,000-2,999", pnl);

    if (perTradeRange < 0.1) addToBucket(rangeBuckets, "$0.00-$0.09", pnl);
    else if (perTradeRange < 0.2) addToBucket(rangeBuckets, "$0.10-$0.19", pnl);
    else if (perTradeRange < 0.5) addToBucket(rangeBuckets, "$0.20-$0.49", pnl);
    else if (perTradeRange < 1) addToBucket(rangeBuckets, "$0.50-$0.99", pnl);
    else if (perTradeRange < 2) addToBucket(rangeBuckets, "$1.00-$1.99", pnl);
    else if (perTradeRange < 5) addToBucket(rangeBuckets, "$2.00-$4.99", pnl);
    else addToBucket(rangeBuckets, "$5.00+", pnl);
  }

  return {
    priceDistribution: Array.from(priceBuckets.values()),
    pricePerformance: Array.from(priceBuckets.values()),
    volumeDistribution: Array.from(volumeBuckets.values()),
    volumePerformance: Array.from(volumeBuckets.values()),
    rangeDistribution: Array.from(rangeBuckets.values()),
    rangePerformance: Array.from(rangeBuckets.values())
  };
}

function buildInstrumentStats(trades, options = {}) {
  const defaultCommission = options.defaultCommission || 0;
  const defaultFees = options.defaultFees || 0;
  const pnlType = options.pnlType || "NET";

  const symbolMap = new Map();
  const volumeBuckets = new Map(
    ["<500K", "500K-1M", "1M-2.49M", "2.5M-4.9M", "5M-9.9M", "10M-24.9M", "25M+"].map((label) => [
      label,
      { label, count: 0, pnl: 0 }
    ])
  );
  const relativeVolumeBuckets = new Map(
    ["<0.5x", "0.5x-0.99x", "1x-1.99x", "2x-2.99x", "3x-4.99x", "5x+"].map((label) => [
      label,
      { label, count: 0, pnl: 0 }
    ])
  );
  const floatBuckets = new Map(
    ["<5M", "5M-19.9M", "20M-49.9M", "50M-99.9M", "100M-249.9M", "250M+"].map((label) => [
      label,
      { label, count: 0, pnl: 0 }
    ])
  );
  const priorCloseBuckets = new Map(
    ["<-10%", "-10%- -5%", "-5%- -2%", "-2%-2%", "2%-5%", "5%-10%", ">10%"].map((label) => [
      label,
      { label, count: 0, pnl: 0 }
    ])
  );

  function addToVolumeBucket(volumeAtTrade, pnl) {
    if (!Number.isFinite(volumeAtTrade) || volumeAtTrade < 0) {
      return;
    }

    let label = "25M+";

    if (volumeAtTrade < 500_000) label = "<500K";
    else if (volumeAtTrade < 1_000_000) label = "500K-1M";
    else if (volumeAtTrade < 2_500_000) label = "1M-2.49M";
    else if (volumeAtTrade < 5_000_000) label = "2.5M-4.9M";
    else if (volumeAtTrade < 10_000_000) label = "5M-9.9M";
    else if (volumeAtTrade < 25_000_000) label = "10M-24.9M";

    const bucket = volumeBuckets.get(label);
    bucket.count += 1;
    bucket.pnl = Number((bucket.pnl + pnl).toFixed(2));
  }

  function addToRelativeVolumeBucket(relativeVolume, pnl) {
    if (!Number.isFinite(relativeVolume) || relativeVolume < 0) {
      return;
    }

    let label = "5x+";

    if (relativeVolume < 0.5) label = "<0.5x";
    else if (relativeVolume < 1) label = "0.5x-0.99x";
    else if (relativeVolume < 2) label = "1x-1.99x";
    else if (relativeVolume < 3) label = "2x-2.99x";
    else if (relativeVolume < 5) label = "3x-4.99x";

    const bucket = relativeVolumeBuckets.get(label);
    bucket.count += 1;
    bucket.pnl = Number((bucket.pnl + pnl).toFixed(2));
  }

  function addToFloatBucket(floatValue, pnl) {
    if (!Number.isFinite(floatValue) || floatValue < 0) {
      return;
    }

    let label = "250M+";

    if (floatValue < 5_000_000) label = "<5M";
    else if (floatValue < 20_000_000) label = "5M-19.9M";
    else if (floatValue < 50_000_000) label = "20M-49.9M";
    else if (floatValue < 100_000_000) label = "50M-99.9M";
    else if (floatValue < 250_000_000) label = "100M-249.9M";

    const bucket = floatBuckets.get(label);
    bucket.count += 1;
    bucket.pnl = Number((bucket.pnl + pnl).toFixed(2));
  }

  function addToPriorCloseBucket(priorCloseDiffPercent, pnl) {
    if (!Number.isFinite(priorCloseDiffPercent)) {
      return;
    }

    let label = ">10%";

    if (priorCloseDiffPercent < -10) label = "<-10%";
    else if (priorCloseDiffPercent < -5) label = "-10%- -5%";
    else if (priorCloseDiffPercent < -2) label = "-5%- -2%";
    else if (priorCloseDiffPercent < 2) label = "-2%-2%";
    else if (priorCloseDiffPercent < 5) label = "2%-5%";
    else if (priorCloseDiffPercent < 10) label = "5%-10%";

    const bucket = priorCloseBuckets.get(label);
    bucket.count += 1;
    bucket.pnl = Number((bucket.pnl + pnl).toFixed(2));
  }

  for (const trade of trades) {
    const symbol = String(trade.symbol || "").toUpperCase();
    const quantity = Math.abs(Number(trade.quantity ?? 0));
    const instrumentVolumeAtEntry = Number(trade.entryVolume);
    const relativeVolumeAtEntry = Number(trade.entryRelativeVolume);
    const instrumentFloat = Number(trade.instrumentFloat);
    const priorCloseDiffPercent = Number(trade.entryPriorCloseDiffPercent);
    const pnl = getTradePnlByType(trade, pnlType, defaultCommission, defaultFees);

    const current = symbolMap.get(symbol) || {
      label: symbol,
      pnl: 0,
      tradedVolume: 0,
      trades: 0
    };

    current.pnl = Number((current.pnl + pnl).toFixed(2));
    current.tradedVolume += quantity;
    current.trades += 1;
    symbolMap.set(symbol, current);

    addToVolumeBucket(instrumentVolumeAtEntry, pnl);
    addToRelativeVolumeBucket(relativeVolumeAtEntry, pnl);
    addToFloatBucket(instrumentFloat, pnl);
    addToPriorCloseBucket(priorCloseDiffPercent, pnl);
  }

  const symbols = Array.from(symbolMap.values());
  const top20 = [...symbols]
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 20);
  const bottom20 = [...symbols]
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 20);

  return {
    topSymbols: top20,
    bottomSymbols: bottom20,
    instrumentVolumeDistribution: Array.from(volumeBuckets.values()),
    instrumentVolumePerformance: Array.from(volumeBuckets.values()),
    relativeVolumeDistribution: Array.from(relativeVolumeBuckets.values()),
    relativeVolumePerformance: Array.from(relativeVolumeBuckets.values()),
    floatDistribution: Array.from(floatBuckets.values()),
    floatPerformance: Array.from(floatBuckets.values()),
    priorCloseDistribution: Array.from(priorCloseBuckets.values()),
    priorClosePerformance: Array.from(priorCloseBuckets.values())
  };
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
    { label: "Probability of Random Chance", value: formatPercent(summary.randomChanceProbability), tone: "text-white" },
    { label: "System Quality Number (SQN)", value: summary.sqn.toFixed(2), tone: "text-white" },
    { label: "Kelly Percentage", value: formatPercent(summary.kellyPercentage), tone: summary.kellyPercentage >= 0 ? "text-mint" : "text-coral" },
    { label: "Average Hold Time (winning trades)", value: formatMinutes(summary.averageWinningHold), tone: "text-white" },
    { label: "Average Hold Time (losing trades)", value: formatMinutes(summary.averageLosingHold), tone: "text-white" },
    { label: "Profit Factor", value: summary.profitFactor ? summary.profitFactor.toFixed(2) : "0.00", tone: "text-white" },
    { label: "Largest Gain", value: formatCurrency(summary.largestGain), tone: "text-mint" },
    { label: "Largest Loss", value: formatCurrency(summary.largestLoss), tone: "text-coral" },
    { label: "Total Commissions", value: formatCurrency(summary.totalCommissions), tone: "text-white" },
    { label: "Total Fees", value: formatCurrency(summary.totalFees), tone: "text-white" }
  ];
}

function buildWinVsLossDaysStats(trades, options = {}) {
  const defaultCommission = options.defaultCommission || 0;
  const defaultFees = options.defaultFees || 0;
  const pnlType = options.pnlType || "NET";
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

    current.pnl = Number((current.pnl + getTradePnlByType(trade, pnlType, defaultCommission, defaultFees)).toFixed(2));
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
    winningTrades,
    losingTrades,
    winningSummary: summarizeTrades(winningTrades, winningDays.length, options),
    losingSummary: summarizeTrades(losingTrades, losingDays.length, options),
    distributionByWeekday: Array.from(distributionMap.values()),
    pieData: [
      { name: "Winning Days", value: winningDays.length, fill: REPORT_GREEN, total: winningDays.length + losingDays.length },
      { name: "Losing Days", value: losingDays.length, fill: REPORT_RED, total: winningDays.length + losingDays.length }
    ]
  };
}

function mergeBreakdownSeries(leftData, rightData, leftKey, rightKey) {
  const labels = [];
  const seen = new Set();

  for (const item of [...(leftData || []), ...(rightData || [])]) {
    if (!item?.label || seen.has(item.label)) {
      continue;
    }

    seen.add(item.label);
    labels.push(item.label);
  }

  return labels.map((label) => {
    const left = (leftData || []).find((item) => item.label === label);
    const right = (rightData || []).find((item) => item.label === label);

    return {
      label,
      leftValue: Number(left?.[leftKey] || 0),
      rightValue: Number(right?.[rightKey] || 0)
    };
  });
}

function DetailedStatsTable({ rows }) {
  return (
    <Card title="STATS">
      <div className="overflow-hidden rounded-[6px] border border-[var(--line)] bg-black">
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

function HorizontalBreakdownChart({
  title,
  data,
  dataKey,
  tooltip,
  currencyAxis = false,
  positiveNegative = false,
  yAxisWidth = 88
}) {
  return (
    <Card title={title}>
      <div className="h-[320px] pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 16 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#c6cedb", fontSize: 11 }}
              tickFormatter={currencyAxis ? formatAxisCurrency : undefined}
            />
            <YAxis
              type="category"
              dataKey="label"
              axisLine={false}
              tickLine={false}
              width={yAxisWidth}
              interval={0}
              tick={{ fill: "#c6cedb", fontSize: 11 }}
            />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={tooltip} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
            <Bar dataKey={dataKey} radius={[0, 6, 6, 0]} barSize={18}>
              {data.map((entry) => (
                <Cell
                  key={`${title}-${entry.label}`}
                  fill={
                    positiveNegative
                      ? entry[dataKey] >= 0
                        ? REPORT_GREEN
                        : REPORT_RED
                      : REPORT_GREEN
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function ComparisonHorizontalBreakdownChart({
  title,
  leftTitle,
  rightTitle,
  data,
  leftColor,
  rightColor,
  tooltipMode = "count",
  currencyAxis = false,
  yAxisWidth = 88
}) {
  const tooltip =
    tooltipMode === "currency" ? <CurrencyTooltip /> : tooltipMode === "percent" ? <PercentTooltip /> : <CountTooltip />;

  return (
    <Card title={title}>
      <div className="mb-3 flex flex-wrap items-center gap-4 px-1">
        <div className="flex items-center gap-2 text-xs text-white/62">
          <span className="h-2.5 w-2.5 rounded-[6px]" style={{ backgroundColor: leftColor }} />
          {leftTitle}
        </div>
        <div className="flex items-center gap-2 text-xs text-white/62">
          <span className="h-2.5 w-2.5 rounded-[6px]" style={{ backgroundColor: rightColor }} />
          {rightTitle}
        </div>
      </div>
      <div className="h-[320px] pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 16 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#c6cedb", fontSize: 11 }}
              tickFormatter={currencyAxis ? formatAxisCurrency : undefined}
            />
            <YAxis
              type="category"
              dataKey="label"
              axisLine={false}
              tickLine={false}
              width={yAxisWidth}
              interval={0}
              tick={{ fill: "#c6cedb", fontSize: 11 }}
            />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={tooltip} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
            <Bar dataKey="leftValue" name={leftTitle} fill={leftColor} radius={[0, 6, 6, 0]} barSize={14} />
            <Bar dataKey="rightValue" name={rightTitle} fill={rightColor} radius={[0, 6, 6, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function BreakdownTabs({ activeTab, onTabChange }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {["Days/Times", "Price/Volume", "Instrument"].map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onTabChange(item)}
          className={`rounded-[6px] px-3 py-2 text-xs font-medium ${
            activeTab === item
              ? "bg-white/[0.08] text-white"
              : "border border-white/10 bg-white/[0.03] text-white/58"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function DetailedBreakdownSection({
  stats,
  bucketStats,
  instrumentStats,
  timeframeKey,
  onTimeframeChange,
  activeTab,
  onTabChange
}) {
  return (
    <div className="space-y-5">
      <BreakdownTabs activeTab={activeTab} onTabChange={onTabChange} />

      {activeTab === "Days/Times" ? (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <HorizontalBreakdownChart
              title="TRADE DISTRIBUTION BY DAY OF WEEK"
              data={stats.weekdayDistribution}
              dataKey="count"
              tooltip={<CountTooltip />}
            />
            <HorizontalBreakdownChart
              title="PERFORMANCE BY DAY OF WEEK"
              data={stats.weekdayPerformance}
              dataKey="pnl"
              tooltip={<CurrencyTooltip />}
              currencyAxis
              positiveNegative
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="ui-title text-[11px] text-white/58">TIMEFRAME</span>
            <div className="ui-segment">
              {DETAILED_TIMEFRAME_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  data-active={option.key === timeframeKey}
                  onClick={() => onTimeframeChange(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <HorizontalBreakdownChart
              title="TRADE DISTRIBUTION BY HOUR OF DAY"
              data={stats.hourDistribution}
              dataKey="count"
              tooltip={<CountTooltip />}
            />
            <HorizontalBreakdownChart
              title="PERFORMANCE BY HOUR OF DAY"
              data={stats.hourPerformance}
              dataKey="pnl"
              tooltip={<CurrencyTooltip />}
              currencyAxis
              positiveNegative
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <HorizontalBreakdownChart
              title="TRADE DISTRIBUTION BY MONTH OF YEAR"
              data={stats.monthDistribution}
              dataKey="count"
              tooltip={<CountTooltip />}
            />
            <HorizontalBreakdownChart
              title="PERFORMANCE BY MONTH OF YEAR"
              data={stats.monthPerformance}
              dataKey="pnl"
              tooltip={<CurrencyTooltip />}
              currencyAxis
              positiveNegative
            />
          </div>
        </>
      ) : activeTab === "Price/Volume" ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <HorizontalBreakdownChart
            title="TRADE DISTRIBUTION BY PRICE"
            data={bucketStats.priceDistribution}
            dataKey="count"
            tooltip={<CountTooltip />}
          />
          <HorizontalBreakdownChart
            title="PERFORMANCE BY PRICE"
            data={bucketStats.pricePerformance}
            dataKey="pnl"
            tooltip={<CurrencyTooltip />}
            currencyAxis
            positiveNegative
          />
          <HorizontalBreakdownChart
            title="DISTRIBUTION BY VOLUME TRADED"
            data={bucketStats.volumeDistribution}
            dataKey="count"
            tooltip={<CountTooltip />}
          />
          <HorizontalBreakdownChart
            title="PERFORMANCE BY VOLUME TRADED"
            data={bucketStats.volumePerformance}
            dataKey="pnl"
            tooltip={<CurrencyTooltip />}
            currencyAxis
            positiveNegative
          />
          <HorizontalBreakdownChart
            title="TRADE DISTRIBUTION BY IN-TRADE PRICE RANGE"
            data={bucketStats.rangeDistribution}
            dataKey="count"
            tooltip={<CountTooltip />}
          />
          <HorizontalBreakdownChart
            title="PERFORMANCE BY IN-TRADE PRICE RANGE"
            data={bucketStats.rangePerformance}
            dataKey="pnl"
            tooltip={<CurrencyTooltip />}
            currencyAxis
            positiveNegative
          />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <HorizontalBreakdownChart
            title="PERFORMANCE BY SYMBOL - TOP 20"
            data={instrumentStats.topSymbols}
            dataKey="pnl"
            tooltip={<CurrencyTooltip />}
            currencyAxis
            positiveNegative
            yAxisWidth={88}
          />
          <HorizontalBreakdownChart
            title="PERFORMANCE BY SYMBOL - BOTTOM 20"
            data={instrumentStats.bottomSymbols}
            dataKey="pnl"
            tooltip={<CurrencyTooltip />}
            currencyAxis
            positiveNegative
            yAxisWidth={88}
          />
          <HorizontalBreakdownChart
            title="DISTRIBUTION BY INSTRUMENT VOLUME"
            data={instrumentStats.instrumentVolumeDistribution}
            dataKey="count"
            tooltip={<CountTooltip />}
            yAxisWidth={110}
          />
          <HorizontalBreakdownChart
            title="PERFORMANCE BY INSTRUMENT VOLUME"
            data={instrumentStats.instrumentVolumePerformance}
            dataKey="pnl"
            tooltip={<CurrencyTooltip />}
            currencyAxis
            positiveNegative
            yAxisWidth={110}
          />
          <HorizontalBreakdownChart
            title="DISTRIBUTION BY RELATIVE VOLUME"
            data={instrumentStats.relativeVolumeDistribution}
            dataKey="count"
            tooltip={<CountTooltip />}
            yAxisWidth={110}
          />
          <HorizontalBreakdownChart
            title="PERFORMANCE BY RELATIVE VOLUME"
            data={instrumentStats.relativeVolumePerformance}
            dataKey="pnl"
            tooltip={<CurrencyTooltip />}
            currencyAxis
            positiveNegative
            yAxisWidth={110}
          />
          <HorizontalBreakdownChart
            title="DISTRIBUTION BY FLOAT"
            data={instrumentStats.floatDistribution}
            dataKey="count"
            tooltip={<CountTooltip />}
            yAxisWidth={120}
          />
          <HorizontalBreakdownChart
            title="PERFORMANCE BY FLOAT"
            data={instrumentStats.floatPerformance}
            dataKey="pnl"
            tooltip={<CurrencyTooltip />}
            currencyAxis
            positiveNegative
            yAxisWidth={120}
          />
          <HorizontalBreakdownChart
            title="DISTRIBUTION BY PRIOR CLOSE %"
            data={instrumentStats.priorCloseDistribution}
            dataKey="count"
            tooltip={<CountTooltip />}
            yAxisWidth={110}
          />
          <HorizontalBreakdownChart
            title="PERFORMANCE BY PRIOR CLOSE %"
            data={instrumentStats.priorClosePerformance}
            dataKey="pnl"
            tooltip={<CurrencyTooltip />}
            currencyAxis
            positiveNegative
            yAxisWidth={110}
          />
        </div>
      )}
    </div>
  );
}

function WinLossColumn({ title, count, rows, accent }) {
  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-black">
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

function WinVsLossDaysSection({
  stats,
  breakdownStats,
  bucketStats,
  instrumentStats,
  timeframeKey,
  onTimeframeChange,
  activeTab,
  onTabChange
}) {
  const weekdayDistributionData = mergeBreakdownSeries(
    breakdownStats.winning.weekdayDistribution,
    breakdownStats.losing.weekdayDistribution,
    "count",
    "count"
  );
  const weekdayPerformanceData = mergeBreakdownSeries(
    breakdownStats.winning.weekdayPerformance,
    breakdownStats.losing.weekdayPerformance,
    "pnl",
    "pnl"
  );
  const hourDistributionData = mergeBreakdownSeries(
    breakdownStats.winning.hourDistribution,
    breakdownStats.losing.hourDistribution,
    "count",
    "count"
  );
  const hourPerformanceData = mergeBreakdownSeries(
    breakdownStats.winning.hourPerformance,
    breakdownStats.losing.hourPerformance,
    "pnl",
    "pnl"
  );
  const monthDistributionData = mergeBreakdownSeries(
    breakdownStats.winning.monthDistribution,
    breakdownStats.losing.monthDistribution,
    "count",
    "count"
  );
  const monthPerformanceData = mergeBreakdownSeries(
    breakdownStats.winning.monthPerformance,
    breakdownStats.losing.monthPerformance,
    "pnl",
    "pnl"
  );

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
            accent="text-coral"
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
              <Tooltip content={<WinLossDaysPieTooltip />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-white/62">
          {stats.pieData.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.fill }}
              />
              <span>{entry.name}</span>
              <span className="text-white">{entry.value}</span>
            </div>
          ))}
        </div>

        <BreakdownTabs activeTab={activeTab} onTabChange={onTabChange} />
      </div>

      {activeTab === "Days/Times" ? (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <ComparisonHorizontalBreakdownChart
              title="TRADE DISTRIBUTION BY DAY OF WEEK"
              leftTitle="Winning Days"
              rightTitle="Losing Days"
              data={weekdayDistributionData}
              leftColor={REPORT_GREEN}
              rightColor={REPORT_RED}
              tooltipMode="count"
            />
            <ComparisonHorizontalBreakdownChart
              title="PERFORMANCE BY DAY OF WEEK"
              leftTitle="Winning Days"
              rightTitle="Losing Days"
              data={weekdayPerformanceData}
              leftColor={REPORT_GREEN}
              rightColor={REPORT_RED}
              tooltipMode="currency"
              currencyAxis
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="ui-title text-[11px] text-white/58">TIMEFRAME</span>
            <div className="ui-segment">
              {DETAILED_TIMEFRAME_OPTIONS.map((option) => (
                <button key={option.key} type="button" data-active={option.key === timeframeKey} onClick={() => onTimeframeChange(option.key)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <ComparisonHorizontalBreakdownChart title="TRADE DISTRIBUTION BY HOUR OF DAY" leftTitle="Winning Days" rightTitle="Losing Days" data={hourDistributionData} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="count" />
            <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY HOUR OF DAY" leftTitle="Winning Days" rightTitle="Losing Days" data={hourPerformanceData} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="currency" currencyAxis />
            <ComparisonHorizontalBreakdownChart title="TRADE DISTRIBUTION BY MONTH OF YEAR" leftTitle="Winning Days" rightTitle="Losing Days" data={monthDistributionData} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="count" />
            <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY MONTH OF YEAR" leftTitle="Winning Days" rightTitle="Losing Days" data={monthPerformanceData} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="currency" currencyAxis />
          </div>
        </>
      ) : activeTab === "Price/Volume" ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <ComparisonHorizontalBreakdownChart title="TRADE DISTRIBUTION BY PRICE" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(bucketStats.winning.priceDistribution, bucketStats.losing.priceDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="count" />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY PRICE" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(bucketStats.winning.pricePerformance, bucketStats.losing.pricePerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="currency" currencyAxis />
          <ComparisonHorizontalBreakdownChart title="DISTRIBUTION BY VOLUME TRADED" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(bucketStats.winning.volumeDistribution, bucketStats.losing.volumeDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="count" />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY VOLUME TRADED" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(bucketStats.winning.volumePerformance, bucketStats.losing.volumePerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="currency" currencyAxis />
          <ComparisonHorizontalBreakdownChart title="TRADE DISTRIBUTION BY IN-TRADE PRICE RANGE" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(bucketStats.winning.rangeDistribution, bucketStats.losing.rangeDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="count" />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY IN-TRADE PRICE RANGE" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(bucketStats.winning.rangePerformance, bucketStats.losing.rangePerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="currency" currencyAxis />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY SYMBOL - TOP 20" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(instrumentStats.winning.topSymbols, instrumentStats.losing.topSymbols, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="currency" currencyAxis yAxisWidth={88} />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY SYMBOL - BOTTOM 20" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(instrumentStats.winning.bottomSymbols, instrumentStats.losing.bottomSymbols, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="currency" currencyAxis yAxisWidth={88} />
          <ComparisonHorizontalBreakdownChart title="DISTRIBUTION BY INSTRUMENT VOLUME" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(instrumentStats.winning.instrumentVolumeDistribution, instrumentStats.losing.instrumentVolumeDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="count" yAxisWidth={110} />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY INSTRUMENT VOLUME" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(instrumentStats.winning.instrumentVolumePerformance, instrumentStats.losing.instrumentVolumePerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="currency" currencyAxis yAxisWidth={110} />
          <ComparisonHorizontalBreakdownChart title="DISTRIBUTION BY RELATIVE VOLUME" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(instrumentStats.winning.relativeVolumeDistribution, instrumentStats.losing.relativeVolumeDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="count" yAxisWidth={110} />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY RELATIVE VOLUME" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(instrumentStats.winning.relativeVolumePerformance, instrumentStats.losing.relativeVolumePerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="currency" currencyAxis yAxisWidth={110} />
          <ComparisonHorizontalBreakdownChart title="DISTRIBUTION BY FLOAT" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(instrumentStats.winning.floatDistribution, instrumentStats.losing.floatDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="count" yAxisWidth={120} />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY FLOAT" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(instrumentStats.winning.floatPerformance, instrumentStats.losing.floatPerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="currency" currencyAxis yAxisWidth={120} />
          <ComparisonHorizontalBreakdownChart title="DISTRIBUTION BY PRIOR CLOSE %" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(instrumentStats.winning.priorCloseDistribution, instrumentStats.losing.priorCloseDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="count" yAxisWidth={110} />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY PRIOR CLOSE %" leftTitle="Winning Days" rightTitle="Losing Days" data={mergeBreakdownSeries(instrumentStats.winning.priorClosePerformance, instrumentStats.losing.priorClosePerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_RED} tooltipMode="currency" currencyAxis yAxisWidth={110} />
        </div>
      )}
    </div>
  );
}

function DrawdownSection({ summary }) {
  const averageDrawdown = asNumber(summary?.averageDrawdown);
  const biggestDrawdown = asNumber(summary?.biggestDrawdown);
  const averageDaysInDrawdown = asNumber(summary?.averageDaysInDrawdown);
  const daysInDrawdown = asNumber(summary?.daysInDrawdown);
  const averageTradesInDrawdown = asNumber(summary?.averageTradesInDrawdown);
  const drawdownCurve = Array.isArray(summary?.drawdownCurve)
    ? summary.drawdownCurve
        .map((point) => ({
          date: point?.date ?? "",
          drawdown: asNumber(point?.drawdown)
        }))
        .filter((point) => point.date)
    : [];

  const rows = [
    [
      { label: "Average drawdown", value: formatCurrency(-Math.abs(averageDrawdown)), tone: "text-coral" },
      { label: "Biggest Drawdown", value: formatCurrency(-Math.abs(biggestDrawdown)), tone: "text-coral" }
    ],
    [
      { label: "Average number of days in Drawdown", value: averageDaysInDrawdown.toFixed(1), tone: "text-white" },
      { label: "Number of days in Drawdown", value: formatCompactNumber(daysInDrawdown), tone: "text-white" }
    ],
    [
      { label: "Average trades in Drawdown", value: averageTradesInDrawdown.toFixed(1), tone: "text-white" },
      null
    ]
  ];

  return (
    <div className="space-y-5">
      <Card title="STATISTICS">
        <div className="overflow-hidden rounded-[6px] border border-[var(--line)] bg-black">
          {rows.map((row, rowIndex) => (
            <div
              key={`drawdown-row-${rowIndex}`}
              className="grid border-b border-[#e5e7eb42] last:border-b-0 xl:grid-cols-2"
            >
              {row.map((cell, cellIndex) => (
                <div
                  key={`drawdown-cell-${rowIndex}-${cellIndex}`}
                  className={`min-h-[72px] border-r border-[#e5e7eb42] px-5 py-5 last:border-r-0 ${
                    !cell ? "hidden xl:block" : ""
                  }`}
                >
                  {cell ? (
                    <div className="flex h-full items-center justify-between gap-4">
                      <span className="text-sm font-medium text-white/70">
                        {cell.label}
                      </span>
                      <span className={`text-sm font-semibold ${cell.tone}`}>{cell.value}</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <Card title="DRAWDOWN CURVE">
        <div className="h-[280px] pb-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={drawdownCurve} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
              <defs>
                <linearGradient id="reportsDrawdownGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={REPORT_RED} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={REPORT_RED} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#c6cedb", fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#c6cedb", fontSize: 11 }}
                tickFormatter={formatAxisCurrency}
              />
              <Tooltip content={<CurrencyTooltip />} />
              <Area
                type="monotone"
                dataKey="drawdown"
                stroke={REPORT_RED}
                strokeWidth={2.5}
                fill="url(#reportsDrawdownGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function CompareStatsColumn({ title, rows, tradesMatched }) {
  const flattenedRows = rows.flat().filter(Boolean);

  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-black">
      <div className="border-b border-[#e5e7eb42] px-4 py-3">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs text-white/44">Trades matches: {tradesMatched}</p>
      </div>
      <div>
        {flattenedRows.map((cell) => (
          <div
            key={`${title}-${cell.label}`}
            className="flex items-center justify-between gap-4 border-b border-[#e5e7eb42] px-4 py-3 last:border-b-0"
          >
            <span className="text-sm font-medium text-white/52">{cell.label}</span>
            <span className={`text-sm font-semibold ${cell.tone}`}>
              {cell.locked ? "🔒" : cell.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompareGroupCard({ title, filters, onChange, tags, strategies, matchedCount }) {
  return (
    <div className="relative z-20 overflow-visible rounded-[6px] border border-[var(--line)] bg-black p-4">
      <div className="mb-4">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs text-white/44">Trades matches: {matchedCount}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="min-w-0">
          <label className="mb-2 block text-xs font-medium text-white/72">Ticker</label>
          <input
            value={filters.symbol}
            onChange={(event) => onChange("symbol", event.target.value)}
            placeholder="Ticker"
            className="ui-input min-h-[48px] max-w-full"
          />
        </div>
        <div className="min-w-0">
          <label className="mb-2 block text-xs font-medium text-white/72">Date range</label>
          <DateRangePicker
            from={filters.from}
            to={filters.to}
            onChange={({ from, to }) => {
              onChange("from", from);
              onChange("to", to);
            }}
            placeholder="From - To"
            buttonClassName="!py-3 !w-full"
          />
        </div>
        <div className="min-w-0">
          <label className="mb-2 block text-xs font-medium text-white/72">Tags</label>
          <CustomSelect
            value={filters.tag}
            onChange={(nextValue) => onChange("tag", nextValue)}
            options={[
              { label: "Select", value: "" },
              ...tags.map((tag) => ({ label: tag.name, value: tag.name }))
            ]}
            placeholder="Select"
            buttonClassName="!py-3 !w-full"
          />
        </div>
        <div className="min-w-0">
          <label className="mb-2 block text-xs font-medium text-white/72">Strategy</label>
          <CustomSelect
            value={filters.strategy}
            onChange={(nextValue) => onChange("strategy", nextValue)}
            options={[
              { label: "All", value: "" },
              ...strategies.map((strategy) => ({ label: strategy.name, value: strategy.name }))
            ]}
            placeholder="All"
            buttonClassName="!py-3 !w-full"
          />
        </div>
        <div className="min-w-0">
          <label className="mb-2 block text-xs font-medium text-white/72">Side</label>
          <CustomSelect
            value={filters.side}
            onChange={(nextValue) => onChange("side", nextValue)}
            options={[
              { label: "All", value: "" },
              { label: "Long", value: "LONG" },
              { label: "Short", value: "SHORT" }
            ]}
            placeholder="All"
            buttonClassName="!py-3 !w-full"
          />
        </div>
        <div className="min-w-0">
          <label className="mb-2 block text-xs font-medium text-white/72">Trade P&L</label>
          <CustomSelect
            value={filters.tradePnl}
            onChange={(nextValue) => onChange("tradePnl", nextValue)}
            options={[
              { label: "All", value: "" },
              { label: "Winners", value: "WINNERS" },
              { label: "Losers", value: "LOSERS" },
              { label: "Scratch", value: "SCRATCH" }
            ]}
            placeholder="All"
            buttonClassName="!py-3 !w-full"
          />
        </div>
      </div>
    </div>
  );
}

function CompareSection({
  tags,
  strategies,
  groupAFilters,
  groupBFilters,
  onGroupAChange,
  onGroupBChange,
  groupATrades,
  groupBTrades,
  pnlType,
  defaultCommission,
  defaultFees,
  timeframeKey,
  onTimeframeChange,
  activeTab,
  onTabChange
}) {
  const groupADetailed = buildDetailedStats(groupATrades, { pnlType, defaultCommission, defaultFees });
  const groupBDetailed = buildDetailedStats(groupBTrades, { pnlType, defaultCommission, defaultFees });
  const timeframeMinutes =
    DETAILED_TIMEFRAME_OPTIONS.find((option) => option.key === timeframeKey)?.minutes || 60;
  const groupABreakdown = buildDetailedBreakdownStats(groupATrades, timeframeMinutes, {
    pnlType,
    defaultCommission,
    defaultFees
  });
  const groupBBreakdown = buildDetailedBreakdownStats(groupBTrades, timeframeMinutes, {
    pnlType,
    defaultCommission,
    defaultFees
  });
  const groupABuckets = buildBucketStats(groupATrades, { pnlType, defaultCommission, defaultFees });
  const groupBBuckets = buildBucketStats(groupBTrades, { pnlType, defaultCommission, defaultFees });
  const groupAInstrument = buildInstrumentStats(groupATrades, { pnlType, defaultCommission, defaultFees });
  const groupBInstrument = buildInstrumentStats(groupBTrades, { pnlType, defaultCommission, defaultFees });

  return (
    <div className="space-y-5">
      <Card title="QUICK REPORT" className="relative z-20 overflow-visible" bodyClassName="overflow-visible">
        <div className="grid gap-5 xl:grid-cols-2">
          <CompareGroupCard
            title="Group A"
            filters={groupAFilters}
            onChange={onGroupAChange}
            tags={tags}
            strategies={strategies}
            matchedCount={groupATrades.length}
          />
          <CompareGroupCard
            title="Group B"
            filters={groupBFilters}
            onChange={onGroupBChange}
            tags={tags}
            strategies={strategies}
            matchedCount={groupBTrades.length}
          />
        </div>
      </Card>

      <Card title="STATISTICS">
        <div className="grid gap-5 xl:grid-cols-2">
          <CompareStatsColumn title="Group A" rows={groupADetailed} tradesMatched={groupATrades.length} />
          <CompareStatsColumn title="Group B" rows={groupBDetailed} tradesMatched={groupBTrades.length} />
        </div>
      </Card>

      <BreakdownTabs activeTab={activeTab} onTabChange={onTabChange} />

      {activeTab === "Days/Times" ? (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <ComparisonHorizontalBreakdownChart title="TRADE DISTRIBUTION BY DAY OF WEEK" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupABreakdown.weekdayDistribution, groupBBreakdown.weekdayDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="count" />
            <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY DAY OF WEEK" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupABreakdown.weekdayPerformance, groupBBreakdown.weekdayPerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="currency" currencyAxis />
          </div>

          <div className="flex items-center gap-3">
            <span className="ui-title text-[11px] text-white/58">TIMEFRAME</span>
            <div className="ui-segment">
              {DETAILED_TIMEFRAME_OPTIONS.map((option) => (
                <button key={option.key} type="button" data-active={option.key === timeframeKey} onClick={() => onTimeframeChange(option.key)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <ComparisonHorizontalBreakdownChart title="TRADE DISTRIBUTION BY HOUR OF DAY" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupABreakdown.hourDistribution, groupBBreakdown.hourDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="count" />
            <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY HOUR OF DAY" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupABreakdown.hourPerformance, groupBBreakdown.hourPerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="currency" currencyAxis />
            <ComparisonHorizontalBreakdownChart title="TRADE DISTRIBUTION BY MONTH OF YEAR" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupABreakdown.monthDistribution, groupBBreakdown.monthDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="count" />
            <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY MONTH OF YEAR" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupABreakdown.monthPerformance, groupBBreakdown.monthPerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="currency" currencyAxis />
          </div>
        </>
      ) : activeTab === "Price/Volume" ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <ComparisonHorizontalBreakdownChart title="TRADE DISTRIBUTION BY PRICE" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupABuckets.priceDistribution, groupBBuckets.priceDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="count" />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY PRICE" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupABuckets.pricePerformance, groupBBuckets.pricePerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="currency" currencyAxis />
          <ComparisonHorizontalBreakdownChart title="DISTRIBUTION BY VOLUME TRADED" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupABuckets.volumeDistribution, groupBBuckets.volumeDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="count" />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY VOLUME TRADED" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupABuckets.volumePerformance, groupBBuckets.volumePerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="currency" currencyAxis />
          <ComparisonHorizontalBreakdownChart title="TRADE DISTRIBUTION BY IN-TRADE PRICE RANGE" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupABuckets.rangeDistribution, groupBBuckets.rangeDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="count" />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY IN-TRADE PRICE RANGE" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupABuckets.rangePerformance, groupBBuckets.rangePerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="currency" currencyAxis />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY SYMBOL - TOP 20" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupAInstrument.topSymbols, groupBInstrument.topSymbols, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="currency" currencyAxis yAxisWidth={88} />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY SYMBOL - BOTTOM 20" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupAInstrument.bottomSymbols, groupBInstrument.bottomSymbols, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="currency" currencyAxis yAxisWidth={88} />
          <ComparisonHorizontalBreakdownChart title="DISTRIBUTION BY INSTRUMENT VOLUME" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupAInstrument.instrumentVolumeDistribution, groupBInstrument.instrumentVolumeDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="count" yAxisWidth={110} />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY INSTRUMENT VOLUME" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupAInstrument.instrumentVolumePerformance, groupBInstrument.instrumentVolumePerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="currency" currencyAxis yAxisWidth={110} />
          <ComparisonHorizontalBreakdownChart title="DISTRIBUTION BY RELATIVE VOLUME" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupAInstrument.relativeVolumeDistribution, groupBInstrument.relativeVolumeDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="count" yAxisWidth={110} />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY RELATIVE VOLUME" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupAInstrument.relativeVolumePerformance, groupBInstrument.relativeVolumePerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="currency" currencyAxis yAxisWidth={110} />
          <ComparisonHorizontalBreakdownChart title="DISTRIBUTION BY FLOAT" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupAInstrument.floatDistribution, groupBInstrument.floatDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="count" yAxisWidth={120} />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY FLOAT" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupAInstrument.floatPerformance, groupBInstrument.floatPerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="currency" currencyAxis yAxisWidth={120} />
          <ComparisonHorizontalBreakdownChart title="DISTRIBUTION BY PRIOR CLOSE %" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupAInstrument.priorCloseDistribution, groupBInstrument.priorCloseDistribution, "count", "count")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="count" yAxisWidth={110} />
          <ComparisonHorizontalBreakdownChart title="PERFORMANCE BY PRIOR CLOSE %" leftTitle="Group A" rightTitle="Group B" data={mergeBreakdownSeries(groupAInstrument.priorClosePerformance, groupBInstrument.priorClosePerformance, "pnl", "pnl")} leftColor={REPORT_GREEN} rightColor={REPORT_YELLOW} tooltipMode="currency" currencyAxis yAxisWidth={110} />
        </div>
      )}
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

  if (filters.strategy) {
    nextTrades = nextTrades.filter(
      (trade) => String(trade.strategy || "").toLowerCase() === filters.strategy.toLowerCase()
    );
  }

  if (filters.side) {
    nextTrades = nextTrades.filter((trade) => trade.side === filters.side);
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

function applyCompareGroupFilters(trades, filters, options = {}) {
  const defaultCommission = options.defaultCommission || 0;
  const defaultFees = options.defaultFees || 0;
  const pnlType = options.pnlType || "NET";
  let nextTrades = [...trades];

  if (filters.symbol) {
    const query = filters.symbol.trim().toLowerCase();
    nextTrades = nextTrades.filter((trade) => String(trade.symbol || "").toLowerCase().includes(query));
  }

  if (filters.tag) {
    nextTrades = nextTrades.filter((trade) =>
      normalizeTagList(trade.tags).some((tag) => tag.toLowerCase() === filters.tag.toLowerCase())
    );
  }

  if (filters.strategy) {
    nextTrades = nextTrades.filter(
      (trade) => String(trade.strategy || "").toLowerCase() === filters.strategy.toLowerCase()
    );
  }

  if (filters.side) {
    nextTrades = nextTrades.filter((trade) => trade.side === filters.side);
  }

  if (filters.tradePnl === "WINNERS") {
    nextTrades = nextTrades.filter(
      (trade) => getTradePnlByType(trade, pnlType, defaultCommission, defaultFees) > 0
    );
  } else if (filters.tradePnl === "LOSERS") {
    nextTrades = nextTrades.filter(
      (trade) => getTradePnlByType(trade, pnlType, defaultCommission, defaultFees) < 0
    );
  } else if (filters.tradePnl === "SCRATCH") {
    nextTrades = nextTrades.filter(
      (trade) => getTradePnlByType(trade, pnlType, defaultCommission, defaultFees) === 0
    );
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
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("Overview");
  const [rangeKey, setRangeKey] = useState("ALL");
  const [filters, setFilters] = useState(REPORT_FILTERS);
  const [groupAFilters, setGroupAFilters] = useState(COMPARE_GROUP_FILTERS);
  const [groupBFilters, setGroupBFilters] = useState(COMPARE_GROUP_FILTERS);
  const [pnlType, setPnlType] = useState("GROSS");
  const [detailedTimeframeKey, setDetailedTimeframeKey] = useState("60");
  const [detailedBreakdownTab, setDetailedBreakdownTab] = useState("Days/Times");
  const [winLossBreakdownTab, setWinLossBreakdownTab] = useState("Days/Times");
  const [compareBreakdownTab, setCompareBreakdownTab] = useState("Days/Times");
  const {
    data: trades,
    loading,
    error
  } = useCachedAsyncResource({
    peek: () => tradeService.peekTrades(),
    load: () => tradeService.getTrades(),
    initialValue: [],
    deps: [user?.activeAccountScope]
  });
  const { data: tags = [] } = useCachedAsyncResource({
    peek: () => tagService.peekTags(),
    load: () => tagService.getTags(),
    initialValue: [],
    deps: []
  });
  const { data: strategies = [] } = useCachedAsyncResource({
    peek: () => strategyService.peekStrategies(),
    load: () => strategyService.getStrategies(),
    initialValue: [],
    deps: []
  });

  const activeRange = RANGE_OPTIONS.find((item) => item.key === rangeKey) || RANGE_OPTIONS[0];
  const filteredTrades = useMemo(
    () => applyReportFilters(trades, filters, activeRange.days),
    [trades, filters, activeRange.days]
  );
  const reportSeries = useMemo(
    () => buildOverviewSeries(filteredTrades, activeRange.days, {
      defaultCommission: user?.defaultCommission ?? 0,
      defaultFees: user?.defaultFees ?? 0,
      pnlType
    }),
    [filteredTrades, activeRange.days, user?.defaultCommission, user?.defaultFees, pnlType]
  );
  const reportSummary = useMemo(
    () =>
      summarizeTrades(filteredTrades, undefined, {
        defaultCommission: user?.defaultCommission ?? 0,
        defaultFees: user?.defaultFees ?? 0,
        pnlType
      }),
    [filteredTrades, user?.defaultCommission, user?.defaultFees, pnlType]
  );
  const detailedStats = useMemo(
    () => buildDetailedStats(filteredTrades, {
      defaultCommission: user?.defaultCommission ?? 0,
      defaultFees: user?.defaultFees ?? 0,
      pnlType
    }),
    [filteredTrades, user?.defaultCommission, user?.defaultFees, pnlType]
  );
  const detailedBreakdownStats = useMemo(() => {
    const timeframe =
      DETAILED_TIMEFRAME_OPTIONS.find((option) => option.key === detailedTimeframeKey)?.minutes || 60;

    return buildDetailedBreakdownStats(filteredTrades, timeframe, {
      defaultCommission: user?.defaultCommission ?? 0,
      defaultFees: user?.defaultFees ?? 0,
      pnlType
    });
  }, [filteredTrades, detailedTimeframeKey, user?.defaultCommission, user?.defaultFees, pnlType]);
  const detailedBucketStats = useMemo(
    () =>
      buildBucketStats(filteredTrades, {
        defaultCommission: user?.defaultCommission ?? 0,
        defaultFees: user?.defaultFees ?? 0,
        pnlType
      }),
    [filteredTrades, user?.defaultCommission, user?.defaultFees, pnlType]
  );
  const detailedInstrumentStats = useMemo(
    () =>
      buildInstrumentStats(filteredTrades, {
        defaultCommission: user?.defaultCommission ?? 0,
        defaultFees: user?.defaultFees ?? 0,
        pnlType
      }),
    [filteredTrades, user?.defaultCommission, user?.defaultFees, pnlType]
  );
  const winVsLossDayStats = useMemo(
    () => buildWinVsLossDaysStats(filteredTrades, {
      defaultCommission: user?.defaultCommission ?? 0,
      defaultFees: user?.defaultFees ?? 0,
      pnlType
    }),
    [filteredTrades, user?.defaultCommission, user?.defaultFees, pnlType]
  );
  const winLossBreakdownStats = useMemo(() => {
    const timeframe =
      DETAILED_TIMEFRAME_OPTIONS.find((option) => option.key === detailedTimeframeKey)?.minutes || 60;

    return {
      winning: buildDetailedBreakdownStats(winVsLossDayStats.winningTrades, timeframe, {
        defaultCommission: user?.defaultCommission ?? 0,
        defaultFees: user?.defaultFees ?? 0,
        pnlType
      }),
      losing: buildDetailedBreakdownStats(winVsLossDayStats.losingTrades, timeframe, {
        defaultCommission: user?.defaultCommission ?? 0,
        defaultFees: user?.defaultFees ?? 0,
        pnlType
      })
    };
  }, [winVsLossDayStats, detailedTimeframeKey, user?.defaultCommission, user?.defaultFees, pnlType]);
  const winLossBucketStats = useMemo(
    () => ({
      winning: buildBucketStats(winVsLossDayStats.winningTrades, {
        defaultCommission: user?.defaultCommission ?? 0,
        defaultFees: user?.defaultFees ?? 0,
        pnlType
      }),
      losing: buildBucketStats(winVsLossDayStats.losingTrades, {
        defaultCommission: user?.defaultCommission ?? 0,
        defaultFees: user?.defaultFees ?? 0,
        pnlType
      })
    }),
    [winVsLossDayStats, user?.defaultCommission, user?.defaultFees, pnlType]
  );
  const winLossInstrumentStats = useMemo(
    () => ({
      winning: buildInstrumentStats(winVsLossDayStats.winningTrades, {
        defaultCommission: user?.defaultCommission ?? 0,
        defaultFees: user?.defaultFees ?? 0,
        pnlType
      }),
      losing: buildInstrumentStats(winVsLossDayStats.losingTrades, {
        defaultCommission: user?.defaultCommission ?? 0,
        defaultFees: user?.defaultFees ?? 0,
        pnlType
      })
    }),
    [winVsLossDayStats, user?.defaultCommission, user?.defaultFees, pnlType]
  );
  const groupATrades = useMemo(
    () => applyCompareGroupFilters(filteredTrades, groupAFilters, {
      defaultCommission: user?.defaultCommission ?? 0,
      defaultFees: user?.defaultFees ?? 0,
      pnlType
    }),
    [filteredTrades, groupAFilters, user?.defaultCommission, user?.defaultFees, pnlType]
  );
  const groupBTrades = useMemo(
    () => applyCompareGroupFilters(filteredTrades, groupBFilters, {
      defaultCommission: user?.defaultCommission ?? 0,
      defaultFees: user?.defaultFees ?? 0,
      pnlType
    }),
    [filteredTrades, groupBFilters, user?.defaultCommission, user?.defaultFees, pnlType]
  );

  function updateFilter(key, value) {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  function resetFilters() {
    setFilters(REPORT_FILTERS);
  }

  function updateGroupFilters(group, key, value) {
    const setter = group === "A" ? setGroupAFilters : setGroupBFilters;
    setter((current) => ({
      ...current,
      [key]: value
    }));
  }

  function handleTabChange(nextTab) {
    setActiveTab(nextTab);
    if (nextTab === "Detailed") {
      setDetailedBreakdownTab("Days/Times");
    } else if (nextTab === "Win vs Loss Days") {
      setWinLossBreakdownTab("Days/Times");
    } else if (nextTab === "Compare") {
      setCompareBreakdownTab("Days/Times");
    }
  }

  if (loading) {
    return <LoadingState label="Loading reports..." panel />;
  }

  if (error) {
    return <div className="ui-notice border-coral/20 bg-[#1b1012] text-coral">{error}</div>;
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
  const pnlLabel = pnlType === "GROSS" ? "GROSS" : "NET";

  return (
    <div className="space-y-5">
      <Card className="relative z-20 overflow-visible">
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_160px_160px_160px_180px_auto] xl:items-end xl:justify-start">
            <div className="min-w-0 xl:w-[180px]">
              <label className="mb-2 block text-xs font-medium text-white/72">Ticker</label>
              <input
                value={filters.symbol}
                onChange={(event) => updateFilter("symbol", event.target.value)}
                placeholder="Ticker"
                className="ui-input min-h-[48px]"
              />
            </div>
            <div className="min-w-0 xl:w-[160px]">
              <label className="mb-2 block text-xs font-medium text-white/72">Tags</label>
              <CustomSelect
                value={filters.tag}
                onChange={(nextValue) => updateFilter("tag", nextValue)}
                options={[
                  { label: "Select", value: "" },
                  ...tags.map((tag) => ({ label: tag.name, value: tag.name }))
                ]}
                placeholder="Select"
                buttonClassName="!py-3"
              />
            </div>
            <div className="min-w-0 xl:w-[160px]">
              <label className="mb-2 block text-xs font-medium text-white/72">Strategy</label>
              <CustomSelect
                value={filters.strategy}
                onChange={(nextValue) => updateFilter("strategy", nextValue)}
                options={[
                  { label: "All", value: "" },
                  ...strategies.map((strategy) => ({ label: strategy.name, value: strategy.name }))
                ]}
                placeholder="All"
                buttonClassName="!py-3"
              />
            </div>
            <div className="min-w-0 xl:w-[160px]">
              <label className="mb-2 block text-xs font-medium text-white/72">Side</label>
              <CustomSelect
                value={filters.side}
                onChange={(nextValue) => updateFilter("side", nextValue)}
                options={[
                  { label: "All", value: "" },
                  { label: "Long", value: "LONG" },
                  { label: "Short", value: "SHORT" }
                ]}
                placeholder="All"
                buttonClassName="!py-3"
              />
            </div>
            <div className="min-w-0 xl:w-[180px]">
              <label className="mb-2 block text-xs font-medium text-white/72">Date range</label>
              <DateRangePicker
                from={filters.from}
                to={filters.to}
                onChange={({ from, to }) => {
                  updateFilter("from", from);
                  updateFilter("to", to);
                }}
                placeholder="From - To"
                buttonClassName="!py-3"
              />
            </div>
            <div className="flex items-end justify-end gap-2">
              <button type="button" onClick={resetFilters} className="ui-button min-h-[46px] px-4 py-3 text-sm">
                Reset
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-center gap-5">
              {TAB_ITEMS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleTabChange(tab)}
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
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-3">
          <CustomSelect
            value={pnlType}
            onChange={(nextValue) => setPnlType(nextValue)}
            options={[
              { label: "Gross", value: "GROSS" },
              { label: "Net", value: "NET" }
            ]}
            className="max-w-[150px]"
            buttonClassName="max-w-[150px]"
          />
        </div>

        <div className="ui-segment">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              data-active={option.key === rangeKey}
              onClick={() => setRangeKey(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {filteredTrades.length === 0 ? (
        <EmptyState
          title="No trades match these filters"
          description="Try expanding the date range or clearing one of the report filters."
        />
      ) : activeTab === "Detailed" ? (
        <div className="space-y-5">
          <DetailedStatsTable rows={detailedStats} />
          <DetailedBreakdownSection
            stats={detailedBreakdownStats}
            bucketStats={detailedBucketStats}
            instrumentStats={detailedInstrumentStats}
            timeframeKey={detailedTimeframeKey}
            onTimeframeChange={setDetailedTimeframeKey}
            activeTab={detailedBreakdownTab}
            onTabChange={setDetailedBreakdownTab}
          />
        </div>
      ) : activeTab === "Win vs Loss Days" ? (
        <WinVsLossDaysSection
          stats={winVsLossDayStats}
          breakdownStats={winLossBreakdownStats}
          bucketStats={winLossBucketStats}
          instrumentStats={winLossInstrumentStats}
          timeframeKey={detailedTimeframeKey}
          onTimeframeChange={setDetailedTimeframeKey}
          activeTab={winLossBreakdownTab}
          onTabChange={setWinLossBreakdownTab}
        />
      ) : activeTab === "Drawdown" ? (
        <DrawdownSection summary={reportSummary} />
      ) : activeTab === "Compare" ? (
        <CompareSection
          tags={tags}
          strategies={strategies}
          groupAFilters={groupAFilters}
          groupBFilters={groupBFilters}
          onGroupAChange={(key, value) => updateGroupFilters("A", key, value)}
          onGroupBChange={(key, value) => updateGroupFilters("B", key, value)}
          groupATrades={groupATrades}
          groupBTrades={groupBTrades}
          pnlType={pnlType}
          defaultCommission={user?.defaultCommission ?? 0}
          defaultFees={user?.defaultFees ?? 0}
          timeframeKey={detailedTimeframeKey}
          onTimeframeChange={setDetailedTimeframeKey}
          activeTab={compareBreakdownTab}
          onTabChange={setCompareBreakdownTab}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card title={`${pnlLabel} DAILY P&L ${suffix.toUpperCase()}`}>
            <div className="h-[320px] pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportSeries.grossDaily} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} minTickGap={18} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CurrencyTooltip />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
                  <Bar dataKey="grossPnl" barSize={20}>
                    {reportSeries.grossDaily.map((entry) => (
                      <Cell key={entry.date} fill={entry.grossPnl >= 0 ? REPORT_GREEN : REPORT_RED} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title={`${pnlLabel} CUMULATIVE P&L ${suffix.toUpperCase()}`}>
            <div className="h-[320px] pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reportSeries.cumulative} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} minTickGap={18} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                  <Tooltip content={<CurrencyTooltip />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
                  <Line type="monotone" dataKey="cumulativeGrossPnl" stroke={REPORT_GREEN} strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title={`DAILY VOLUME ${suffix.toUpperCase()}`}>
            <div className="h-[320px] pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportSeries.dailyVolume} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} minTickGap={18} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<VolumeTooltip />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
                  <Bar dataKey="volume" barSize={20} fill={REPORT_GREEN} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title={`WIN % ${suffix.toUpperCase()}`}>
            <div className="h-[320px] pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportSeries.winRate} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} minTickGap={18} />
                  <YAxis axisLine={false} tickLine={false} domain={[0, 100]} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<PercentTooltip />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
                  <Bar dataKey="winRate" barSize={20} fill={REPORT_GREEN} />
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
