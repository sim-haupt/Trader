import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
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

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VIEW_MODES = [
  { key: "MONTH", label: "Month" },
  { key: "YEAR", label: "Year" }
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

function formatMetricMinutes(value) {
  const minutes = Number(value || 0);

  if (!minutes) {
    return "0m";
  }

  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
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
    const commission = getEffectiveTradeCommission(trade);
    const fees = getTradeFeeDisplayValue(trade);
    const existing = dailyMap.get(dayKey) || {
      date: dayKey,
      pnl: 0,
      netPnl: 0,
      volume: 0,
      perShareTotal: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      commissions: 0,
      fees: 0,
      holdMinutes: 0,
      winningHoldMinutes: 0,
      losingHoldMinutes: 0,
      largestWin: 0,
      largestLoss: 0
    };

    existing.pnl = Number((existing.pnl + grossPnl).toFixed(2));
    existing.netPnl = Number((existing.netPnl + netPnl).toFixed(2));
    existing.volume = Number((existing.volume + quantity).toFixed(2));
    existing.perShareTotal = Number((existing.perShareTotal + perSharePnl).toFixed(4));
    existing.trades += 1;
    existing.commissions = Number((existing.commissions + commission).toFixed(4));
    existing.fees = Number((existing.fees + fees).toFixed(4));
    existing.holdMinutes += getHoldMinutes(trade, date);
    existing.largestWin = Math.max(existing.largestWin, grossPnl);
    existing.largestLoss = Math.min(existing.largestLoss, grossPnl);

    if (grossPnl > 0) {
      existing.wins += 1;
      existing.winningHoldMinutes += getHoldMinutes(trade, date);
    } else if (grossPnl < 0) {
      existing.losses += 1;
      existing.losingHoldMinutes += getHoldMinutes(trade, date);
    }

    dailyMap.set(dayKey, existing);
  }

  return dailyMap;
}

function createMonthGrid(year, monthIndex, dailyStats) {
  const firstDay = new Date(year, monthIndex, 1);
  const startDay = new Date(firstDay);
  startDay.setDate(1 - firstDay.getDay());
  const lastDay = new Date(year, monthIndex + 1, 0);
  const endDay = new Date(lastDay);
  endDay.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

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
        stats: dailyStats.get(dayKey) || null
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push(week);
  }

  return weeks;
}

function calculateSummary(monthDays) {
  const activeDays = monthDays.filter((day) => day.stats);
  const totals = activeDays.reduce(
    (sum, day) => {
      const stats = day.stats;

      return {
        pnl: sum.pnl + stats.pnl,
        netPnl: sum.netPnl + stats.netPnl,
        volume: sum.volume + stats.volume,
        perShareTotal: sum.perShareTotal + stats.perShareTotal,
        trades: sum.trades + stats.trades,
        wins: sum.wins + stats.wins,
        losses: sum.losses + stats.losses,
        commissions: sum.commissions + stats.commissions,
        fees: sum.fees + stats.fees,
        holdMinutes: sum.holdMinutes + stats.holdMinutes,
        winningHoldMinutes: sum.winningHoldMinutes + stats.winningHoldMinutes,
        losingHoldMinutes: sum.losingHoldMinutes + stats.losingHoldMinutes,
        largestWin: Math.max(sum.largestWin, stats.largestWin),
        largestLoss: Math.min(sum.largestLoss, stats.largestLoss)
      };
    },
    {
      pnl: 0,
      netPnl: 0,
      volume: 0,
      perShareTotal: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      commissions: 0,
      fees: 0,
      holdMinutes: 0,
      winningHoldMinutes: 0,
      losingHoldMinutes: 0,
      largestWin: 0,
      largestLoss: 0
    }
  );

  const winningDays = activeDays.filter((day) => day.stats.pnl > 0);
  const losingDays = activeDays.filter((day) => day.stats.pnl < 0);
  const dailyWins = winningDays.reduce((sum, day) => sum + day.stats.pnl, 0);
  const dailyLosses = losingDays.reduce((sum, day) => sum + Math.abs(day.stats.pnl), 0);
  const avgWin = totals.wins ? dailyWins / Math.max(winningDays.length, 1) : 0;
  const avgLoss = losingDays.length ? dailyLosses / losingDays.length : 0;
  let runningPnl = 0;
  let peakPnl = 0;
  let maxDrawdown = 0;

  for (const day of activeDays.sort((left, right) => left.dayKey.localeCompare(right.dayKey))) {
    runningPnl += day.stats.pnl;
    peakPnl = Math.max(peakPnl, runningPnl);
    maxDrawdown = Math.min(maxDrawdown, runningPnl - peakPnl);
  }

  return {
    ...totals,
    pnl: Number(totals.pnl.toFixed(2)),
    netPnl: Number(totals.netPnl.toFixed(2)),
    volume: Number(totals.volume.toFixed(2)),
    perShareTotal: Number(totals.perShareTotal.toFixed(4)),
    commissions: Number(totals.commissions.toFixed(2)),
    fees: Number(totals.fees.toFixed(2)),
    sessions: activeDays.length,
    winRate: totals.trades ? (totals.wins / totals.trades) * 100 : 0,
    dayWinRate: activeDays.length ? (winningDays.length / activeDays.length) * 100 : 0,
    avgWin: Number(avgWin.toFixed(2)),
    avgLoss: Number(avgLoss.toFixed(2)),
    avgTrade: totals.trades ? Number((totals.pnl / totals.trades).toFixed(2)) : 0,
    avgSharesPerDay: activeDays.length ? Number((totals.volume / activeDays.length).toFixed(0)) : 0,
    expectancy: totals.trades ? Number((totals.pnl / totals.trades).toFixed(2)) : 0,
    expectancyPerShare: totals.volume ? Number((totals.pnl / totals.volume).toFixed(4)) : 0,
    profitFactor: dailyLosses ? Number((dailyWins / dailyLosses).toFixed(2)) : dailyWins > 0 ? dailyWins : 0,
    averageHoldMinutes: totals.trades ? totals.holdMinutes / totals.trades : 0,
    averageWinningHoldMinutes: totals.wins ? totals.winningHoldMinutes / totals.wins : 0,
    averageLosingHoldMinutes: totals.losses ? totals.losingHoldMinutes / totals.losses : 0,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    biggestDay: activeDays.reduce((best, day) => (!best || day.stats.pnl > best.stats.pnl ? day : best), null),
    worstDay: activeDays.reduce((worst, day) => (!worst || day.stats.pnl < worst.stats.pnl ? day : worst), null)
  };
}

function getDayTone(stats, isCurrentMonth) {
  if (!isCurrentMonth || !stats) {
    return "bg-white/[0.025] text-mist";
  }

  if (stats.pnl > 0) {
    return "bg-[linear-gradient(180deg,rgba(52,224,161,0.26),rgba(52,224,161,0.11))] text-mint";
  }

  if (stats.pnl < 0) {
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

function getAlpha(value, maxMagnitude) {
  if (!value || !maxMagnitude) {
    return 0;
  }

  return Math.min(0.9, 0.22 + (Math.abs(value) / maxMagnitude) * 0.56);
}

function getDayStyle(stats, maxMagnitude) {
  if (!stats) {
    return undefined;
  }

  const alpha = getAlpha(stats.pnl, maxMagnitude);

  if (stats.pnl > 0) {
    return {
      background: `linear-gradient(180deg, rgba(52,224,161,${alpha}), rgba(52,224,161,${alpha * 0.42}))`,
      borderColor: "rgba(52, 224, 161, 0.24)"
    };
  }

  if (stats.pnl < 0) {
    return {
      background: `linear-gradient(180deg, rgba(255,95,122,${alpha}), rgba(255,95,122,${alpha * 0.4}))`,
      borderColor: "rgba(255, 95, 122, 0.24)"
    };
  }

  return undefined;
}

function getWeekStats(week) {
  return week.reduce(
    (sum, day) => {
      if (!day.isCurrentMonth || !day.stats) {
        return sum;
      }

      return {
        pnl: Number((sum.pnl + day.stats.pnl).toFixed(2)),
        trades: sum.trades + day.stats.trades
      };
    },
    { pnl: 0, trades: 0 }
  );
}

function CalendarToolbar({ calendarData, selectedMonthIndex, viewMode, onSelectedMonthChange, onViewModeChange }) {
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
  );
}

function MonthCalendar({ month, compact = false, onSelectDay }) {
  const maxMagnitude = Math.max(
    1,
    ...month.weeks.flat().map((day) => (day.isCurrentMonth && day.stats ? Math.abs(day.stats.pnl) : 0))
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
        const weekStats = getWeekStats(week);

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
                  day.isCurrentMonth ? getDayTone(day.stats, true) : "opacity-40"
                }`}
                style={day.isCurrentMonth ? getDayStyle(day.stats, maxMagnitude) : undefined}
              >
                <div className="text-xs font-semibold text-white/80">{day.dayNumber}</div>
                {day.isCurrentMonth && day.stats ? (
                  <div className={compact ? "mt-2" : "mt-3"}>
                    <div className={compact ? "text-xs text-white/72" : "text-sm text-white/72"}>
                      {day.stats.trades} trade{day.stats.trades === 1 ? "" : "s"}
                    </div>
                    <div className={`mt-1 font-semibold ${compact ? "text-base" : "text-lg"} ${getSummaryTone(day.stats.pnl)}`}>
                      {formatCurrency(day.stats.pnl)}
                    </div>
                  </div>
                ) : day.isCurrentMonth ? (
                  <div className="mt-2 text-[10px] italic text-white/32">no data</div>
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

function MonthSummary({ month, compact = false }) {
  const summary = month.summary;
  const range = `${month.rangeStart} -> ${month.rangeEnd}`;

  return (
    <div className="ui-surface-subtle h-full p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Summary</h3>
          <p className="mt-1 text-sm text-white/58">
            {summary.trades.toLocaleString("en-US")} trades · {summary.sessions} sessions · {range}
          </p>
        </div>
        <div className="text-right">
          <div className="ui-title text-[10px] text-white/44">P&L</div>
          <div className={`mt-1 text-xl font-semibold ${getSummaryTone(summary.pnl)}`}>
            {formatCurrency(summary.pnl)}
          </div>
          <div className="mt-1 text-[11px] text-white/44">gross</div>
        </div>
      </div>

      <div className={`mt-4 grid gap-x-7 ${compact ? "grid-cols-1" : "md:grid-cols-2"}`}>
        <div>
          <MetricRow label="Win rate" value={formatPercent(summary.winRate)} tone={getSummaryTone(summary.winRate - 50)} />
          <MetricRow label="Day win rate" value={formatPercent(summary.dayWinRate)} tone={getSummaryTone(summary.dayWinRate - 50)} />
          <MetricRow label="Avg win/day" value={formatCurrency(summary.avgWin)} tone="text-mint" />
          <MetricRow label="Avg loss/day" value={formatCurrency(-summary.avgLoss)} tone={summary.avgLoss ? "text-coral" : "text-white"} />
          <MetricRow label="Biggest day" value={summary.biggestDay ? formatCurrency(summary.biggestDay.stats.pnl) : "$0.00"} tone="text-mint" />
          <MetricRow label="Worst day" value={summary.worstDay ? formatCurrency(summary.worstDay.stats.pnl) : "$0.00"} tone={summary.worstDay?.stats.pnl < 0 ? "text-coral" : "text-white"} />
          <MetricRow label="Max drawdown" value={formatCurrency(summary.maxDrawdown)} tone={summary.maxDrawdown < 0 ? "text-coral" : "text-white"} />
          <MetricRow label="Profit factor" value={summary.profitFactor.toFixed(2)} />
        </div>
        <div>
          <MetricRow label="Avg trade" value={formatCurrency(summary.avgTrade)} tone={getSummaryTone(summary.avgTrade)} />
          <MetricRow label="Expectancy" value={formatCurrency(summary.expectancy)} tone={getSummaryTone(summary.expectancy)} />
          <MetricRow label="Expectancy / share" value={formatCurrency(summary.expectancyPerShare)} tone={getSummaryTone(summary.expectancyPerShare)} />
          <MetricRow label="Total shares" value={Math.round(summary.volume).toLocaleString("en-US")} />
          <MetricRow label="Avg shares/day" value={summary.avgSharesPerDay.toLocaleString("en-US")} />
          <MetricRow label="Avg hold" value={formatMetricMinutes(summary.averageHoldMinutes)} />
          <MetricRow label="Fees" value={formatCurrency(summary.commissions + summary.fees)} tone={summary.commissions + summary.fees ? "text-coral" : "text-white"} />
        </div>
      </div>
    </div>
  );
}

function MonthPanel({ month, onSelectDay, compact = false }) {
  return (
    <Card
      title={`${month.label} · P&L by day`}
      subtitle="Color is scaled to the largest day in this month."
      className="calendar-panel dashboard-page-widget shadow-none"
      bodyClassName="gap-5"
    >
      <div className={compact ? "grid gap-4" : "grid gap-5 2xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]"}>
        <MonthCalendar month={month} compact={compact} onSelectDay={onSelectDay} />
        <MonthSummary month={month} compact={compact} />
      </div>
    </Card>
  );
}

function CalendarPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentMonthIndex = new Date().getMonth();
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(currentMonthIndex);
  const [viewMode, setViewMode] = useState("MONTH");
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
      const summary = calculateSummary(monthDays);

      return {
        monthIndex,
        label: monthDate.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric"
        }),
        rangeStart: getCalendarGridKey(monthDate),
        rangeEnd: getCalendarGridKey(lastDate),
        weeks,
        summary
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
          onSelectedMonthChange={(monthIndex) => {
            setSelectedMonthIndex(monthIndex);
            setViewMode("MONTH");
          }}
          onViewModeChange={setViewMode}
        />
      </Card>

      {viewMode === "MONTH" ? (
        <MonthPanel month={selectedMonth} onSelectDay={(dayKey) => navigate(`/journal?day=${dayKey}`)} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {calendarData.months.map((month) => (
            <MonthPanel
              key={month.label}
              month={month}
              compact
              onSelectDay={(dayKey) => navigate(`/journal?day=${dayKey}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default CalendarPage;
