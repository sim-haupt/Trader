import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import PnlBarCumulativeChart from "../components/PnlBarCumulativeChart";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tradeService from "../services/tradeService";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, formatDateTimeLocal, formatPercent } from "../utils/formatters";
import {
  getEffectiveTradeCommission,
  getTradeFeeDisplayValue,
  getTradeGrossPnl,
  getTradeNetPnl,
  getTradePerSharePnl
} from "../utils/tradePnl";
import { isUsMarketDay } from "../utils/marketCalendar";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VIEW_MODES = [
  { key: "MONTH", label: "Month" },
  { key: "YEAR", label: "Year" }
];
const PNL_MODES = [
  { key: "GROSS", label: "Gross" },
  { key: "NET", label: "Net" }
];

function getDayKey(date) {
  const formatted = formatDateTimeLocal(date);
  return formatted ? formatted.slice(0, 10) : "";
}

function getCalendarGridKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function asNumber(value) {
  const numericValue = Number(value || 0);
  return Number.isNaN(numericValue) ? 0 : numericValue;
}

function formatMetricSeconds(value) {
  const seconds = Number(value || 0);

  if (!seconds) {
    return "0s";
  }

  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes < 60) {
    return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function getHoldMinutes(trade, entryDate) {
  const exitDate = trade.exitDate ? new Date(trade.exitDate) : null;

  if (!exitDate || Number.isNaN(exitDate.getTime()) || Number.isNaN(entryDate.getTime())) {
    return 0;
  }

  return Math.max(0, (exitDate.getTime() - entryDate.getTime()) / 60000);
}

function buildDailyStats(trades) {
  const dailyMap = new Map();

  for (const trade of trades) {
    const date = new Date(trade.entryDate);
    const dayKey = getDayKey(date);
    const grossPnl = getTradeGrossPnl(trade);
    const netPnl = getTradeNetPnl(trade);
    const quantity = Math.abs(asNumber(trade.quantity));
    const perSharePnl = getTradePerSharePnl(trade, grossPnl);
    const netPerSharePnl = getTradePerSharePnl(trade, netPnl);
    const commission = getEffectiveTradeCommission(trade);
    const fees = getTradeFeeDisplayValue(trade);
    const existing = dailyMap.get(dayKey) || {
      date: dayKey,
      pnl: 0,
      netPnl: 0,
      volume: 0,
      perShareTotal: 0,
      netPerShareTotal: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      commissions: 0,
      fees: 0,
      holdMinutes: 0,
      winningHoldMinutes: 0,
      losingHoldMinutes: 0,
      winningPnl: 0,
      losingPnl: 0,
      largestWin: 0,
      largestLoss: 0
    };

    existing.pnl = Number((existing.pnl + grossPnl).toFixed(2));
    existing.netPnl = Number((existing.netPnl + netPnl).toFixed(2));
    existing.volume = Number((existing.volume + quantity).toFixed(2));
    existing.perShareTotal = Number((existing.perShareTotal + perSharePnl).toFixed(4));
    existing.netPerShareTotal = Number((existing.netPerShareTotal + netPerSharePnl).toFixed(4));
    existing.trades += 1;
    existing.commissions = Number((existing.commissions + commission).toFixed(4));
    existing.fees = Number((existing.fees + fees).toFixed(4));
    existing.holdMinutes += getHoldMinutes(trade, date);
    existing.largestWin = Math.max(existing.largestWin, grossPnl);
    existing.largestLoss = Math.min(existing.largestLoss, grossPnl);

    if (grossPnl > 0) {
      existing.wins += 1;
      existing.winningPnl = Number((existing.winningPnl + grossPnl).toFixed(2));
      existing.winningHoldMinutes += getHoldMinutes(trade, date);
    } else if (grossPnl < 0) {
      existing.losses += 1;
      existing.losingPnl = Number((existing.losingPnl + grossPnl).toFixed(2));
      existing.losingHoldMinutes += getHoldMinutes(trade, date);
    }

    dailyMap.set(dayKey, existing);
  }

  return dailyMap;
}

function createMonthGrid(year, monthIndex, dailyStats) {
  const firstDay = new Date(year, monthIndex, 1);
  const startDay = new Date(firstDay);
  const firstDayMondayOffset = (firstDay.getDay() + 6) % 7;
  startDay.setDate(1 - firstDayMondayOffset);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const endDay = new Date(lastDay);
  const lastDayMondayOffset = (lastDay.getDay() + 6) % 7;
  endDay.setDate(lastDay.getDate() + (6 - lastDayMondayOffset));

  const weeks = [];
  let cursor = new Date(startDay);

  while (cursor <= endDay) {
    const week = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const currentDate = new Date(cursor);
      const dayKey = getCalendarGridKey(currentDate);

      week.push({
        date: currentDate,
        dayKey,
        dayNumber: currentDate.getDate(),
        isCurrentMonth: currentDate.getMonth() === monthIndex,
        isMarketDay: isUsMarketDay(dayKey),
        stats: dailyStats.get(dayKey) || null
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push(week);
  }

  return weeks;
}

function getStatsPnl(stats, pnlMode) {
  if (!stats) {
    return 0;
  }

  return pnlMode === "NET" ? Number(stats.netPnl || 0) : Number(stats.pnl || 0);
}

function calculateSummary(monthDays, pnlMode) {
  const activeDays = monthDays.filter((day) => day.stats);
  const totals = activeDays.reduce(
    (sum, day) => {
      const stats = day.stats;
      const pnl = getStatsPnl(stats, pnlMode);

      return {
        pnl: sum.pnl + pnl,
        netPnl: sum.netPnl + stats.netPnl,
        volume: sum.volume + stats.volume,
        perShareTotal: sum.perShareTotal + stats.perShareTotal,
        netPerShareTotal: sum.netPerShareTotal + stats.netPerShareTotal,
        trades: sum.trades + stats.trades,
        wins: sum.wins + stats.wins,
        losses: sum.losses + stats.losses,
        commissions: sum.commissions + stats.commissions,
        fees: sum.fees + stats.fees,
        holdMinutes: sum.holdMinutes + stats.holdMinutes,
        winningHoldMinutes: sum.winningHoldMinutes + stats.winningHoldMinutes,
        losingHoldMinutes: sum.losingHoldMinutes + stats.losingHoldMinutes,
        winningPnl: sum.winningPnl + stats.winningPnl,
        losingPnl: sum.losingPnl + stats.losingPnl,
        largestWin: Math.max(sum.largestWin, stats.largestWin),
        largestLoss: Math.min(sum.largestLoss, stats.largestLoss)
      };
    },
    {
      pnl: 0,
      netPnl: 0,
      volume: 0,
      perShareTotal: 0,
      netPerShareTotal: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      commissions: 0,
      fees: 0,
      holdMinutes: 0,
      winningHoldMinutes: 0,
      losingHoldMinutes: 0,
      winningPnl: 0,
      losingPnl: 0,
      largestWin: 0,
      largestLoss: 0
    }
  );

  const winningDays = activeDays.filter((day) => getStatsPnl(day.stats, pnlMode) > 0);
  const losingDays = activeDays.filter((day) => getStatsPnl(day.stats, pnlMode) < 0);
  const dailyWins = winningDays.reduce((sum, day) => sum + getStatsPnl(day.stats, pnlMode), 0);
  const dailyLosses = losingDays.reduce((sum, day) => sum + Math.abs(getStatsPnl(day.stats, pnlMode)), 0);
  const avgWinningDay = winningDays.length ? dailyWins / winningDays.length : 0;
  const avgLosingDay = losingDays.length ? dailyLosses / losingDays.length : 0;
  const avgWinner = totals.wins ? totals.winningPnl / totals.wins : 0;
  const avgLoser = totals.losses ? totals.losingPnl / totals.losses : 0;
  let runningPnl = 0;
  let peakPnl = 0;
  let maxDrawdown = 0;

  for (const day of activeDays.sort((left, right) => left.dayKey.localeCompare(right.dayKey))) {
    runningPnl += getStatsPnl(day.stats, pnlMode);
    peakPnl = Math.max(peakPnl, runningPnl);
    maxDrawdown = Math.min(maxDrawdown, runningPnl - peakPnl);
  }

  return {
    ...totals,
    pnl: Number(totals.pnl.toFixed(2)),
    netPnl: Number(totals.netPnl.toFixed(2)),
    volume: Number(totals.volume.toFixed(2)),
    perShareTotal: Number(totals.perShareTotal.toFixed(4)),
    netPerShareTotal: Number(totals.netPerShareTotal.toFixed(4)),
    commissions: Number(totals.commissions.toFixed(2)),
    fees: Number(totals.fees.toFixed(2)),
    totalFees: Number((totals.commissions + totals.fees).toFixed(2)),
    winningPnl: Number(totals.winningPnl.toFixed(2)),
    losingPnl: Number(totals.losingPnl.toFixed(2)),
    sessions: activeDays.length,
    winRate: totals.trades ? (totals.wins / totals.trades) * 100 : 0,
    dayWinRate: activeDays.length ? (winningDays.length / activeDays.length) * 100 : 0,
    greenDays: winningDays.length,
    redDays: losingDays.length,
    avgWinner: Number(avgWinner.toFixed(2)),
    avgLoser: Number(avgLoser.toFixed(2)),
    avgWinningDay: Number(avgWinningDay.toFixed(2)),
    avgLosingDay: Number(avgLosingDay.toFixed(2)),
    avgTrade: totals.trades ? Number((totals.pnl / totals.trades).toFixed(2)) : 0,
    avgPnlPerSession: activeDays.length ? Number((totals.pnl / activeDays.length).toFixed(2)) : 0,
    avgTradesPerSession: activeDays.length ? Number((totals.trades / activeDays.length).toFixed(1)) : 0,
    avgSharesPerDay: activeDays.length ? Number((totals.volume / activeDays.length).toFixed(0)) : 0,
    expectancy: totals.trades ? Number((totals.pnl / totals.trades).toFixed(2)) : 0,
    expectancyPerShare: totals.volume ? Number((totals.pnl / totals.volume).toFixed(4)) : 0,
    profitFactor: Math.abs(totals.losingPnl) ? Number((totals.winningPnl / Math.abs(totals.losingPnl)).toFixed(2)) : totals.winningPnl > 0 ? totals.winningPnl : 0,
    averageHoldMinutes: totals.trades ? totals.holdMinutes / totals.trades : 0,
    averageHoldSeconds: totals.trades ? (totals.holdMinutes * 60) / totals.trades : 0,
    feesPerTrade: totals.trades ? Number(((totals.commissions + totals.fees) / totals.trades).toFixed(2)) : 0,
    averageWinningHoldMinutes: totals.wins ? totals.winningHoldMinutes / totals.wins : 0,
    averageLosingHoldMinutes: totals.losses ? totals.losingHoldMinutes / totals.losses : 0,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    biggestDay: activeDays.reduce((best, day) => (!best || getStatsPnl(day.stats, pnlMode) > getStatsPnl(best.stats, pnlMode) ? day : best), null),
    worstDay: activeDays.reduce((worst, day) => (!worst || getStatsPnl(day.stats, pnlMode) < getStatsPnl(worst.stats, pnlMode) ? day : worst), null)
  };
}

function getDayTone(stats, isCurrentMonth, pnlMode) {
  if (!isCurrentMonth || !stats) {
    return "bg-white/[0.025] text-mist";
  }

  const pnl = getStatsPnl(stats, pnlMode);

  if (pnl > 0) {
    return "bg-[linear-gradient(180deg,rgba(52,224,161,0.26),rgba(52,224,161,0.11))] text-mint";
  }

  if (pnl < 0) {
    return "bg-[linear-gradient(180deg,rgba(255,95,122,0.24),rgba(255,95,122,0.1))] text-coral";
  }

  return "bg-white/[0.04] text-mist";
}

function getSummaryTone(value) {
  if (value > 0) {
    return "text-mint";
  }

  if (value < 0) {
    return "text-coral";
  }

  return "text-white";
}

function getAlpha(value, maxValue) {
  if (!value || !maxValue) {
    return 0;
  }

  return Math.min(0.58, 0.1 + (Math.abs(value) / maxValue) * 0.34);
}

function getDayStyle(stats, monthScale, pnlMode) {
  if (!stats) {
    return undefined;
  }

  const pnl = getStatsPnl(stats, pnlMode);

  if (pnl > 0) {
    const alpha = getAlpha(pnl, monthScale.maxWin);

    return {
      background: `linear-gradient(180deg, rgba(52,224,161,${alpha}), rgba(52,224,161,${alpha * 0.34}))`,
      borderColor: `rgba(52, 224, 161, ${Math.min(0.36, 0.12 + alpha * 0.3)})`
    };
  }

  if (pnl < 0) {
    const alpha = getAlpha(pnl, monthScale.maxLoss);

    return {
      background: `linear-gradient(180deg, rgba(255,95,122,${alpha}), rgba(255,95,122,${alpha * 0.32}))`,
      borderColor: `rgba(255, 95, 122, ${Math.min(0.36, 0.12 + alpha * 0.3)})`
    };
  }

  return undefined;
}

function getWeekStats(week, pnlMode) {
  return week.reduce(
    (sum, day) => {
      if (!day.isCurrentMonth || !day.stats) {
        return sum;
      }

      return {
        pnl: Number((sum.pnl + getStatsPnl(day.stats, pnlMode)).toFixed(2)),
        trades: sum.trades + day.stats.trades
      };
    },
    { pnl: 0, trades: 0 }
  );
}

function getStatsPerShare(stats, pnlMode) {
  if (!stats) {
    return 0;
  }

  return pnlMode === "NET"
    ? Number(stats.netPerShareTotal || 0)
    : Number(stats.perShareTotal || 0);
}

function buildMonthChartSeries(month, pnlMode) {
  let cumulativePnl = 0;

  return month.weeks
    .flat()
    .filter((day) => day.isCurrentMonth && day.stats)
    .sort((left, right) => left.dayKey.localeCompare(right.dayKey))
    .map((day) => {
      const dailyPnl = getStatsPnl(day.stats, pnlMode);
      cumulativePnl = Number((cumulativePnl + dailyPnl).toFixed(2));

      return {
        dayKey: day.dayKey,
        label: String(day.dayNumber),
        dailyPnl,
        cumulativePnl,
        perSharePnl: Number(getStatsPerShare(day.stats, pnlMode).toFixed(4)),
        trades: day.stats.trades
      };
    });
}

function CalendarChartTooltip({ active, payload, label, mode = "currency" }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  const value = Number(payload[0]?.value ?? 0);
  const tone = value > 0 ? "text-mint" : value < 0 ? "text-coral" : "text-white";
  const formattedValue = mode === "perShare" ? formatCurrency(value) : formatCurrency(value);

  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-[#050505] px-3 py-2 text-xs text-phosphor shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="font-semibold text-white">{point?.dayKey || label}</div>
      <div className={`mt-1 font-semibold ${tone}`}>{formattedValue}</div>
      <div className="mt-1 text-white/48">
        {point?.trades || 0} trade{point?.trades === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function CalendarToolbar({
  calendarData,
  selectedMonthIndex,
  viewMode,
  pnlMode,
  onSelectedMonthChange,
  onViewModeChange,
  onPnlModeChange
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedMonthIndex}
          onChange={(event) => onSelectedMonthChange(Number(event.target.value))}
          className="ui-input min-h-[38px] w-[210px] py-2 text-sm"
          aria-label="Select month"
        >
          {calendarData.months.map((month) => (
            <option key={month.label} value={month.monthIndex}>
              {month.label}
            </option>
          ))}
        </select>
        <div className="ui-chip text-sm">{calendarData.year}</div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="ui-segment">
          {PNL_MODES.map((option) => (
            <button
              key={option.key}
              type="button"
              data-active={pnlMode === option.key}
              onClick={() => onPnlModeChange(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="ui-segment">
          {VIEW_MODES.map((option) => (
            <button
              key={option.key}
              type="button"
              data-active={viewMode === option.key}
              onClick={() => onViewModeChange(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthCalendar({ month, compact = false, pnlMode, onSelectDay }) {
  const monthScale = month.weeks.flat().reduce(
    (scale, day) => {
      if (!day.isCurrentMonth || !day.stats) {
        return scale;
      }

      const pnl = getStatsPnl(day.stats, pnlMode);

      return {
        maxWin: Math.max(scale.maxWin, pnl > 0 ? pnl : 0),
        maxLoss: Math.max(scale.maxLoss, pnl < 0 ? Math.abs(pnl) : 0)
      };
    },
    { maxWin: 1, maxLoss: 1 }
  );

  return (
    <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(70px,0.72fr)] gap-1">
      {weekdayLabels.map((label) => (
        <div key={label} className="ui-title px-1 pb-2 text-center text-[10px] text-white/48">
          {label}
        </div>
      ))}
      <div className="ui-title px-1 pb-2 text-center text-[10px] text-white/48">WK</div>

      {month.weeks.map((week, index) => {
        const weekStats = getWeekStats(week, pnlMode);

        return (
          <Fragment key={`${month.label}-week-${index}`}>
            {week.map((day) => (
              <button
                type="button"
                key={day.dayKey}
                onClick={() => {
                  if (day.isCurrentMonth && day.stats) {
                    onSelectDay(day.dayKey);
                  }
                }}
                disabled={!day.isCurrentMonth || !day.stats}
                className={`min-h-[86px] rounded-[5px] border border-[var(--line)] p-2 text-left transition ${
                  compact ? "min-h-[62px]" : "sm:min-h-[104px]"
                } ${day.isCurrentMonth && day.stats ? "cursor-pointer hover:brightness-110" : "cursor-default"} ${
                  day.isCurrentMonth ? getDayTone(day.stats, true, pnlMode) : "opacity-40"
                }`}
                style={day.isCurrentMonth ? getDayStyle(day.stats, monthScale, pnlMode) : undefined}
              >
                <div className="text-xs font-semibold text-white/80">{day.dayNumber}</div>
                {day.isCurrentMonth && day.stats ? (
                  <div className={compact ? "mt-2" : "mt-3"}>
                    <div className={compact ? "text-xs text-white/72" : "text-sm text-white/72"}>
                      {day.stats.trades} trade{day.stats.trades === 1 ? "" : "s"}
                    </div>
                    <div className={`mt-1 font-semibold ${compact ? "text-base" : "text-lg"} ${getSummaryTone(getStatsPnl(day.stats, pnlMode))}`}>
                      {formatCurrency(getStatsPnl(day.stats, pnlMode))}
                    </div>
                  </div>
                ) : day.isCurrentMonth ? (
                  <div className="mt-2 text-[10px] font-medium text-white/34">
                    {day.isMarketDay ? "No trades" : "Market closed"}
                  </div>
                ) : null}
              </button>
            ))}

            <div className="flex min-h-[86px] flex-col justify-center rounded-[5px] border border-[var(--line)] bg-white/[0.025] p-2 text-center sm:min-h-[104px]">
              <div className="ui-title text-[9px] text-mint">WK {index + 1}</div>
              <div className={`mt-1 text-sm font-semibold ${getSummaryTone(weekStats.pnl)}`}>
                {formatCurrency(weekStats.pnl)}
              </div>
              {!compact && (
                <div className="mt-1 text-[10px] text-white/44">
                  {weekStats.trades} trade{weekStats.trades === 1 ? "" : "s"}
                </div>
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function MetricRow({ label, value, tone = "text-white" }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] py-2 text-sm">
      <span className="text-white/54">{label}</span>
      <span className={`text-right font-semibold ${tone}`}>{value}</span>
    </div>
  );
}

function MonthSummary({ month, compact = false, pnlMode }) {
  const summary = month.grossSummary;
  const netSummary = month.netSummary;
  const range = `${month.rangeStart} -> ${month.rangeEnd}`;
  const fees = summary.totalFees;

  return (
    <div className="ui-surface-subtle h-full p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Summary</h3>
          <p className="mt-1 text-sm text-white/58">
            {summary.trades.toLocaleString("en-US")} trades · {summary.sessions} sessions
          </p>
          <p className="mt-1 text-xs text-white/38">{range}</p>
        </div>
        <div className="text-right">
          <div className="ui-title text-[10px] text-white/44">Net P&L</div>
          <div className={`mt-1 text-xl font-semibold ${getSummaryTone(netSummary.netPnl)}`}>
            {formatCurrency(netSummary.netPnl)}
          </div>
          <div className="mt-1 text-[11px] text-white/44">Gross {formatCurrency(summary.pnl)}</div>
        </div>
      </div>

      <div className={`mt-5 grid gap-5 ${compact ? "grid-cols-1" : "md:grid-cols-2"}`}>
        <div>
          <div className="ui-title mb-2 text-[10px] text-white/42">RESULTS</div>
          <MetricRow label="Gross P&L" value={formatCurrency(summary.pnl)} tone={getSummaryTone(summary.pnl)} />
          <MetricRow label="Fees" value={formatCurrency(-Math.abs(fees))} tone={fees ? "text-coral" : "text-white"} />
          <MetricRow label="Net P&L" value={formatCurrency(netSummary.netPnl)} tone={getSummaryTone(netSummary.netPnl)} />
          <MetricRow label="Avg P&L/session" value={formatCurrency(summary.avgPnlPerSession)} tone={getSummaryTone(summary.avgPnlPerSession)} />
          <MetricRow label="Avg trade" value={formatCurrency(summary.avgTrade)} tone={getSummaryTone(summary.avgTrade)} />
          <MetricRow label="Profit factor" value={summary.profitFactor.toFixed(2)} />
        </div>

        <div>
          <div className="ui-title mb-2 text-[10px] text-white/42">TRADES</div>
          <MetricRow label="Win rate" value={formatPercent(summary.winRate)} tone={getSummaryTone(summary.winRate - 50)} />
          <MetricRow label="Winning trades" value={summary.wins.toLocaleString("en-US")} tone="text-mint" />
          <MetricRow label="Losing trades" value={summary.losses.toLocaleString("en-US")} tone="text-coral" />
          <MetricRow label="Avg winner" value={formatCurrency(summary.avgWinner)} tone={summary.avgWinner ? "text-mint" : "text-white"} />
          <MetricRow label="Avg loser" value={formatCurrency(summary.avgLoser)} tone={summary.avgLoser ? "text-coral" : "text-white"} />
          <MetricRow label="Best trade" value={formatCurrency(summary.largestWin)} tone={summary.largestWin > 0 ? "text-mint" : "text-white"} />
          <MetricRow label="Worst trade" value={formatCurrency(summary.largestLoss)} tone={summary.largestLoss < 0 ? "text-coral" : "text-white"} />
        </div>

        <div>
          <div className="ui-title mb-2 text-[10px] text-white/42">SESSIONS</div>
          <MetricRow label="Day win rate" value={formatPercent(summary.dayWinRate)} tone={getSummaryTone(summary.dayWinRate - 50)} />
          <MetricRow label="Green / red days" value={`${summary.greenDays} / ${summary.redDays}`} />
          <MetricRow label="Avg winning day" value={formatCurrency(summary.avgWinningDay)} tone={summary.avgWinningDay ? "text-mint" : "text-white"} />
          <MetricRow label="Avg losing day" value={formatCurrency(-summary.avgLosingDay)} tone={summary.avgLosingDay ? "text-coral" : "text-white"} />
          <MetricRow label="Best day" value={summary.biggestDay ? formatCurrency(getStatsPnl(summary.biggestDay.stats, "GROSS")) : "$0.00"} tone="text-mint" />
          <MetricRow label="Worst day" value={summary.worstDay ? formatCurrency(getStatsPnl(summary.worstDay.stats, "GROSS")) : "$0.00"} tone={getStatsPnl(summary.worstDay?.stats, "GROSS") < 0 ? "text-coral" : "text-white"} />
          <MetricRow label="Max drawdown" value={formatCurrency(summary.maxDrawdown)} tone={summary.maxDrawdown < 0 ? "text-coral" : "text-white"} />
        </div>

        <div>
          <div className="ui-title mb-2 text-[10px] text-white/42">ACTIVITY</div>
          <MetricRow label="Avg trades/session" value={summary.avgTradesPerSession.toFixed(1)} />
          <MetricRow label="Total shares" value={Math.round(summary.volume).toLocaleString("en-US")} />
          <MetricRow label="Avg shares/session" value={summary.avgSharesPerDay.toLocaleString("en-US")} />
          <MetricRow label="Avg hold" value={formatMetricSeconds(summary.averageHoldSeconds)} />
          <MetricRow label="Fees/trade" value={formatCurrency(-Math.abs(summary.feesPerTrade))} tone={summary.feesPerTrade ? "text-coral" : "text-white"} />
        </div>
      </div>
    </div>
  );
}

function MonthCharts({ month, pnlMode }) {
  const chartData = useMemo(() => buildMonthChartSeries(month, pnlMode), [month, pnlMode]);

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="ui-surface-subtle overflow-hidden">
        <div className="ui-widget-heading-bg border-b border-[var(--line)] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="ui-title text-[10px] text-white/72">Monthly Cumulative P&amp;L</div>
              <p className="mt-1 text-xs text-white/44">Running {pnlMode.toLowerCase()} P&amp;L by trading day.</p>
            </div>
          </div>
        </div>
        <div className="h-[290px] pb-4">
          <PnlBarCumulativeChart
            data={chartData}
            dailyKey="dailyPnl"
            cumulativeKey="cumulativePnl"
            labelKey="label"
            dailyLabel="Day"
            cumulativeLabel="Month"
            labelFormatter={(point) => point?.dayKey || point?.label}
          />
        </div>
      </div>

      <div className="ui-surface-subtle overflow-hidden">
        <div className="ui-widget-heading-bg border-b border-[var(--line)] px-4 py-4">
          <div>
            <div className="ui-title text-[10px] text-white/72">Daily P&amp;L / Share</div>
            <p className="mt-1 text-xs text-white/44">Same per-share aggregation shown on Journal day cards.</p>
          </div>
        </div>
        <div className="h-[290px] pb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#c6cedb", fontSize: 11 }}
                minTickGap={18}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#c6cedb", fontSize: 11 }}
                tickFormatter={(value) => `$${Number(value || 0).toFixed(2)}`}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                content={<CalendarChartTooltip mode="perShare" />}
                offset={14}
                allowEscapeViewBox={{ x: true, y: true }}
              />
              <Bar dataKey="perSharePnl" barSize={20} isAnimationActive={false}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.dayKey}
                    fill={entry.perSharePnl >= 0 ? "#34e0a1" : "#ff5f7a"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function MonthPanel({ month, onSelectDay, compact = false, pnlMode, onOpen }) {
  return (
    <Card
      title={`${month.label} · P&L by day`}
      subtitle="Color is scaled to the largest day in this month."
      className="calendar-panel dashboard-page-widget shadow-none"
      bodyClassName="gap-5"
      action={
        compact ? (
          <button type="button" className="ui-button px-4 py-2 text-sm" onClick={onOpen}>
            Open
          </button>
        ) : null
      }
    >
      <div className={compact ? "grid gap-4" : "grid gap-5 2xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]"}>
        <MonthCalendar month={month} compact={compact} pnlMode={pnlMode} onSelectDay={onSelectDay} />
        {!compact && <MonthSummary month={month} compact={compact} pnlMode={pnlMode} />}
      </div>
      {!compact && <MonthCharts month={month} pnlMode={pnlMode} />}
    </Card>
  );
}

function CalendarPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentMonthIndex = new Date().getMonth();
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(currentMonthIndex);
  const [viewMode, setViewMode] = useState("MONTH");
  const [pnlMode, setPnlMode] = useState("GROSS");
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

  const calendarData = useMemo(() => {
    const dailyStats = buildDailyStats(trades);
    const tradeDates = trades.map((trade) => new Date(trade.entryDate));
    const currentYear = new Date().getFullYear();
    const tradeYears = tradeDates.filter((date) => !Number.isNaN(date.getTime())).map((date) => date.getFullYear());
    const targetYear = tradeYears.includes(currentYear)
      ? currentYear
      : tradeYears.length > 0
        ? Math.max(...tradeYears)
        : currentYear;

    const months = Array.from({ length: 12 }, (_, monthIndex) => {
      const monthDate = new Date(targetYear, monthIndex, 1);
      const lastDate = new Date(targetYear, monthIndex + 1, 0);
      const weeks = createMonthGrid(targetYear, monthIndex, dailyStats);
      const monthDays = weeks.flat().filter((day) => day.isCurrentMonth);
      const grossSummary = calculateSummary(monthDays, "GROSS");
      const netSummary = calculateSummary(monthDays, "NET");

      return {
        monthIndex,
        label: monthDate.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric"
        }),
        rangeStart: getCalendarGridKey(monthDate),
        rangeEnd: getCalendarGridKey(lastDate),
        weeks,
        grossSummary,
        netSummary
      };
    });

    return {
      year: targetYear,
      months
    };
  }, [trades]);

  const selectedMonth = calendarData.months[selectedMonthIndex] ?? calendarData.months[currentMonthIndex] ?? calendarData.months[0];

  if (loading) {
    return (
      <div className="calendar-page">
        <LoadingState label="Loading calendar..." panel />
      </div>
    );
  }

  if (error) {
    return <div className="calendar-page ui-notice border-coral/20 bg-coral/10 text-coral">{error}</div>;
  }

  if (trades.length === 0) {
    return (
      <div className="calendar-page">
        <EmptyState
          title="No trades yet"
          description="Import or add trades and the calendar will mark green and red days automatically."
        />
      </div>
    );
  }

  return (
    <div className="calendar-page space-y-6">
      <Card title="CALENDAR" className="calendar-panel dashboard-page-widget" bodyClassName="gap-5">
        <CalendarToolbar
          calendarData={calendarData}
          selectedMonthIndex={selectedMonth?.monthIndex ?? 0}
          viewMode={viewMode}
          pnlMode={pnlMode}
          onSelectedMonthChange={(monthIndex) => {
            setSelectedMonthIndex(monthIndex);
            setViewMode("MONTH");
          }}
          onViewModeChange={setViewMode}
          onPnlModeChange={setPnlMode}
        />
      </Card>

      {viewMode === "MONTH" ? (
        <MonthPanel month={selectedMonth} pnlMode={pnlMode} onSelectDay={(dayKey) => navigate(`/journal?day=${dayKey}`)} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {calendarData.months.map((month) => (
            <MonthPanel
              key={month.label}
              month={month}
              compact
              pnlMode={pnlMode}
              onOpen={() => {
                setSelectedMonthIndex(month.monthIndex);
                setViewMode("MONTH");
              }}
              onSelectDay={(dayKey) => navigate(`/journal?day=${dayKey}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default CalendarPage;
