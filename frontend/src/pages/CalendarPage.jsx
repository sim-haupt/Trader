import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tradeService from "../services/tradeService";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, formatDateTimeLocal } from "../utils/formatters";
import { getTradeGrossPnl, getTradePerSharePnl } from "../utils/tradePnl";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CALENDAR_VALUE_MODES = [
  { key: "DOLLARS", label: "$" },
  { key: "PER_SHARE", label: "/sh" }
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

function buildDailyStats(trades) {
  const dailyMap = new Map();

  for (const trade of trades) {
    const date = new Date(trade.entryDate);
    const dayKey = getDayKey(date);
    const pnl = getTradeGrossPnl(trade);
    const quantity = Math.abs(Number(trade.quantity || 0));
    const perSharePnl = getTradePerSharePnl(trade, pnl);
    const existing = dailyMap.get(dayKey) || {
      date: dayKey,
      pnl: 0,
      volume: 0,
      perShareTotal: 0,
      averagePerShare: 0,
      trades: 0,
      wins: 0,
      losses: 0
    };

    existing.pnl = Number((existing.pnl + pnl).toFixed(2));
    existing.volume = Number((existing.volume + quantity).toFixed(2));
    existing.perShareTotal = Number((existing.perShareTotal + perSharePnl).toFixed(4));
    existing.trades += 1;

    if (pnl > 0) {
      existing.wins += 1;
    } else if (pnl < 0) {
      existing.losses += 1;
    }

    existing.averagePerShare = Number(existing.perShareTotal.toFixed(4));

    dailyMap.set(dayKey, existing);
  }

  return dailyMap;
}

function getDisplayValue(stats, mode) {
  if (!stats) {
    return 0;
  }

  return mode === "PER_SHARE" ? Number(stats.averagePerShare || 0) : Number(stats.pnl || 0);
}

function getDisplayTone(value) {
  if (value > 0) {
    return "text-mint";
  }

  if (value < 0) {
    return "text-coral";
  }

  return "text-mist";
}

function createMonthGrid(year, monthIndex, dailyStats) {
  const firstDay = new Date(year, monthIndex, 1);
  const startDay = new Date(firstDay);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  startDay.setDate(1 - firstWeekday);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const endDay = new Date(lastDay);
  const lastWeekday = (lastDay.getDay() + 6) % 7;
  endDay.setDate(lastDay.getDate() + (6 - lastWeekday));

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

function getDayTone(stats, isCurrentMonth) {
  if (!isCurrentMonth) {
    return "bg-transparent text-mist";
  }

  if (!stats) {
    return "bg-white/[0.03] text-mist";
  }

  if (stats.pnl > 0) {
    return "bg-[linear-gradient(180deg,rgba(52,224,161,0.18),rgba(52,224,161,0.06))] text-mint";
  }

  if (stats.pnl < 0) {
    return "bg-[linear-gradient(180deg,rgba(255,95,122,0.16),rgba(255,95,122,0.05))] text-coral";
  }

  return "bg-white/[0.03] text-mist";
}

function getDayBorderStyle(stats, isCurrentMonth) {
  if (!isCurrentMonth) {
    return undefined;
  }

  if (!stats) {
    return undefined;
  }

  if (stats.pnl > 0) {
    return { borderColor: "rgba(52, 224, 161, 0.34)" };
  }

  if (stats.pnl < 0) {
    return { borderColor: "rgba(251, 113, 133, 0.28)" };
  }

  return { borderColor: "rgba(229, 231, 235, 0.22)" };
}

function MonthCard({ month, onOpen }) {
  return (
    <Card
      title={month.label}
      headerInnerClassName="md:items-center"
      className="calendar-panel ui-surface-subtle shadow-none"
      action={
        <button
          type="button"
          onClick={() => onOpen(month)}
          className="ui-button self-center px-4 py-2 text-[11px]"
        >
          Open
        </button>
      }
    >
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdayLabels.map((label) => (
          <div key={label} className="ui-title pb-2 text-xs text-mist">
            {label}
          </div>
        ))}

        {month.weeks.flat().map((day) => (
          <div
            key={day.dayKey}
            className={
              day.isCurrentMonth
                ? `aspect-square rounded-[6px] border border-transparent px-2 py-4 text-lg font-[200] transition ${getDayTone(
                    day.stats,
                    day.isCurrentMonth
                  )}`
                : "aspect-square invisible"
            }
            style={day.isCurrentMonth ? getDayBorderStyle(day.stats, day.isCurrentMonth) : undefined}
          >
            <div className="flex h-full items-center justify-center">{day.dayNumber}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MonthDetailSection({ month, displayMode, onDisplayModeChange, onClose, onSelectDay }) {
  const monthPerShareTone = getDisplayTone(month.monthAveragePerShare);
  const monthDollarTone = getDisplayTone(month.monthPnl);

  return (
    <Card
      title={month.label.toUpperCase()}
      className="calendar-panel dashboard-page-widget shadow-none"
      action={
        <div className="flex items-center gap-3">
          <div
            className={`border px-4 py-2 text-sm font-semibold ${
              monthPerShareTone === "text-mint"
                ? "border-mint/35 bg-mint/10 text-mint"
                : monthPerShareTone === "text-coral"
                  ? "border-coral/35 bg-coral/10 text-coral"
                  : "border-[var(--line)] bg-white/[0.03] text-mist"
            }`}
          >
            /sh {formatCurrency(month.monthAveragePerShare)}
          </div>
          <div
            className={`border px-4 py-2 text-sm font-semibold ${
              monthDollarTone === "text-mint"
                ? "border-mint/35 bg-mint/10 text-mint"
                : monthDollarTone === "text-coral"
                  ? "border-coral/35 bg-coral/10 text-coral"
                  : "border-[var(--line)] bg-white/[0.03] text-mist"
            }`}
          >
            {formatCurrency(month.monthPnl)}
          </div>
          <div className="ui-chip normal-case tracking-[0.08em] text-sm text-white">
            {month.monthTrades} trade{month.monthTrades === 1 ? "" : "s"}
          </div>
          <div className="ui-segment">
            {CALENDAR_VALUE_MODES.map((option) => (
              <button
                key={option.key}
                type="button"
                data-active={displayMode === option.key}
                onClick={() => onDisplayModeChange(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="ui-button text-sm">
            Close
          </button>
        </div>
      }
    >
      <div className="ui-surface-subtle grid grid-cols-8 gap-0 overflow-hidden">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="ui-widget-heading-bg ui-title border-b border-r border-[var(--line)] px-3 py-3 text-center text-xs text-white/78"
          >
            {label}
          </div>
        ))}
        <div className="ui-widget-heading-bg ui-title border-b border-[var(--line)] px-3 py-3 text-center text-xs text-white/78">
          Total
        </div>

        {month.weeks.map((week, index) => {
          const weekStats = week.reduce(
            (sum, day) => {
              if (!day.isCurrentMonth || !day.stats) {
                return sum;
              }

              return {
                pnl: Number((sum.pnl + day.stats.pnl).toFixed(2)),
                volume: Number((sum.volume + (day.stats.volume || 0)).toFixed(2)),
                perShareTotal: Number((sum.perShareTotal + (day.stats.perShareTotal || 0)).toFixed(4)),
                trades: sum.trades + day.stats.trades
              };
            },
            { pnl: 0, volume: 0, perShareTotal: 0, trades: 0 }
          );
          const weekAveragePerShare = Number(weekStats.perShareTotal.toFixed(4));
          const weekDisplayTone = getDisplayTone(weekAveragePerShare);
          const weekDollarTone = getDisplayTone(weekStats.pnl);

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
                  className={`min-h-[118px] border-b border-r border-[var(--line)] px-3 py-3 text-left transition ${
                    day.isCurrentMonth && day.stats ? "cursor-pointer hover:brightness-110" : "cursor-default"
                  } ${getDayTone(day.stats, day.isCurrentMonth)}`}
                  style={getDayBorderStyle(day.stats, day.isCurrentMonth)}
                >
                  <div className="text-lg font-semibold">{day.dayNumber}</div>
                  {day.isCurrentMonth && (
                    <>
                      <div
                        className={`mt-4 text-base font-semibold ${
                          !day.stats ? "text-mist" : getDisplayTone(getDisplayValue(day.stats, displayMode))
                        }`}
                      >
                        {formatCurrency(getDisplayValue(day.stats, displayMode))}
                      </div>
                      <div className="mt-1 text-xs opacity-80">
                        {displayMode === "PER_SHARE"
                          ? `${day.stats?.trades ?? 0} trade${day.stats?.trades === 1 ? "" : "s"}`
                          : `${day.stats?.trades ?? 0} trade${day.stats?.trades === 1 ? "" : "s"}`}
                      </div>
                    </>
                  )}
                </button>
              ))}

              <div className="min-h-[118px] border-b border-[var(--line)] bg-white/[0.03] px-3 py-3">
                <div className="ui-title text-sm text-white">Week {index + 1}</div>
                <div className={`mt-4 text-base font-semibold ${weekDollarTone}`}>
                  {formatCurrency(weekStats.pnl)}
                </div>
                <div
                  className={`mt-2 text-xs font-medium ${
                    weekDisplayTone
                  }`}
                >
                  /sh {formatCurrency(weekAveragePerShare)}
                </div>
                <div className="mt-2 text-xs text-mist">
                  {weekStats.trades} trade{weekStats.trades === 1 ? "" : "s"}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </Card>
  );
}

function CalendarPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(null);
  const [calendarDisplayMode, setCalendarDisplayMode] = useState("DOLLARS");
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
    const targetYear = tradeDates.length > 0
      ? Math.max(...tradeDates.map((date) => date.getFullYear()))
      : new Date().getFullYear();

    const months = Array.from({ length: 12 }, (_, monthIndex) => {
      const monthDate = new Date(targetYear, monthIndex, 1);
      const weeks = createMonthGrid(targetYear, monthIndex, dailyStats);
      const monthDays = weeks.flat().filter((day) => day.isCurrentMonth && day.stats);
      const monthPnl = monthDays.reduce((sum, day) => sum + day.stats.pnl, 0);
      const monthVolume = monthDays.reduce((sum, day) => sum + (day.stats.volume || 0), 0);
      const monthPerShareTotal = monthDays.reduce(
        (sum, day) => sum + (day.stats.perShareTotal || 0),
        0
      );
      const monthTrades = monthDays.reduce((sum, day) => sum + day.stats.trades, 0);

      return {
        monthIndex,
        label: monthDate.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric"
        }),
        weeks,
        monthPnl: Number(monthPnl.toFixed(2)),
        monthAveragePerShare: Number(monthPerShareTotal.toFixed(4)),
        monthTrades
      };
    });

    return {
      year: targetYear,
      months
    };
  }, [trades]);

  const selectedMonth =
    selectedMonthIndex === null ? null : calendarData.months[selectedMonthIndex] ?? null;

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
      {selectedMonth && (
        <MonthDetailSection
          month={selectedMonth}
          displayMode={calendarDisplayMode}
          onDisplayModeChange={setCalendarDisplayMode}
          onClose={() => setSelectedMonthIndex(null)}
          onSelectDay={(dayKey) => navigate(`/journal?day=${dayKey}`)}
        />
      )}
      <Card
        title="CALENDAR OVERVIEW"
        className="calendar-panel dashboard-page-widget"
        action={
          <div className="ui-chip text-base">
            {calendarData.year}
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-3">
          {calendarData.months.map((month) => (
            <MonthCard key={month.label} month={month} onOpen={() => setSelectedMonthIndex(month.monthIndex)} />
          ))}
        </div>
      </Card>
    </div>
  );
}

export default CalendarPage;
