import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tradeService from "../services/tradeService";
import { formatCurrency, formatDateTimeLocal } from "../utils/formatters";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDayKey(date) {
  const formatted = formatDateTimeLocal(date);
  return formatted ? formatted.slice(0, 10) : "";
}

function buildDailyStats(trades) {
  const dailyMap = new Map();

  for (const trade of trades) {
    const date = new Date(trade.entryDate);
    const dayKey = getDayKey(date);
    const pnl = Number(trade.netPnl ?? trade.grossPnl ?? 0);
    const existing = dailyMap.get(dayKey) || {
      date: dayKey,
      pnl: 0,
      trades: 0,
      wins: 0,
      losses: 0
    };

    existing.pnl = Number((existing.pnl + pnl).toFixed(2));
    existing.trades += 1;

    if (pnl > 0) {
      existing.wins += 1;
    } else if (pnl < 0) {
      existing.losses += 1;
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
      const dayKey = getDayKey(currentDate);

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
    return "bg-transparent text-slate-600";
  }

  if (!stats) {
    return "bg-white/[0.015] text-slate-400";
  }

  if (stats.pnl > 0) {
    return "bg-[linear-gradient(180deg,rgba(24,200,122,0.12),rgba(24,200,122,0.04))] text-mint";
  }

  if (stats.pnl < 0) {
    return "bg-[linear-gradient(180deg,rgba(255,93,87,0.12),rgba(255,93,87,0.04))] text-coral";
  }

  return "bg-white/[0.03] text-phosphor";
}

function getDayBorderStyle(stats, isCurrentMonth) {
  if (!isCurrentMonth) {
    return undefined;
  }

  if (!stats) {
    return undefined;
  }

  if (stats.pnl > 0) {
    return { boxShadow: "inset 0 0 0 1px rgba(45, 212, 143, 0.34)" };
  }

  if (stats.pnl < 0) {
    return { boxShadow: "inset 0 0 0 1px rgba(255, 107, 107, 0.34)" };
  }

  return { boxShadow: "inset 0 0 0 1px rgba(229, 231, 235, 0.16)" };
}

function MonthCard({ month, onOpen }) {
  return (
    <Card
      title={month.label}
      action={
        <button
          type="button"
          onClick={() => onOpen(month)}
          className="ui-button px-4 py-2 text-[11px]"
        >
          Open
        </button>
      }
      className="p-6 shadow-none"
    >
      <div className="grid grid-cols-7 gap-3 text-center">
        {weekdayLabels.map((label) => (
          <div key={label} className="ui-title pb-2 text-xs text-mist">
            {label}
          </div>
        ))}

        {month.weeks.flat().map((day) => (
          <div
            key={day.dayKey}
            className={`aspect-square rounded-[12px] border border-transparent px-2 py-4 text-lg font-medium transition ${getDayTone(
              day.stats,
              day.isCurrentMonth
            )}`}
            style={getDayBorderStyle(day.stats, day.isCurrentMonth)}
          >
            <div className="flex h-full items-center justify-center">{day.dayNumber}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MonthDetailSection({ month, onClose, onSelectDay }) {
  return (
    <Card
      title={month.label.toUpperCase()}
      action={
        <div className="flex items-center gap-3">
          <div className="ui-chip normal-case tracking-[0.08em] text-sm text-white">
            {month.monthTrades} trade{month.monthTrades === 1 ? "" : "s"}
          </div>
          <div
            className={`border px-4 py-2 text-sm font-semibold ${
              month.monthPnl > 0
                ? "border-mint/18 bg-mint/8 text-mint"
                : month.monthPnl < 0
                  ? "border-coral/18 bg-[#1b1012] text-coral"
                  : "border-[#e5e7eb42] bg-white/5 text-mist"
            }`}
          >
            {formatCurrency(month.monthPnl)}
          </div>
          <button type="button" onClick={onClose} className="ui-button text-sm">
            Close
          </button>
        </div>
      }
      className="p-6 shadow-none"
    >
      <div className="grid grid-cols-8 gap-0 overflow-hidden rounded-[18px] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.022),rgba(255,255,255,0.01))]">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="ui-title border-b border-r border-[var(--line)] px-3 py-3 text-center text-xs text-white/78"
          >
            {label}
          </div>
        ))}
        <div className="ui-title border-b border-[var(--line)] px-3 py-3 text-center text-xs text-white/78">
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
                trades: sum.trades + day.stats.trades
              };
            },
            { pnl: 0, trades: 0 }
          );

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
                          !day.stats
                            ? "text-slate-400"
                            : day.stats.pnl > 0
                              ? "text-mint"
                              : day.stats.pnl < 0
                                ? "text-coral"
                                : "text-mist"
                        }`}
                      >
                        {formatCurrency(day.stats?.pnl ?? 0)}
                      </div>
                      <div className="mt-1 text-xs opacity-80">
                        {day.stats?.trades ?? 0} trade{day.stats?.trades === 1 ? "" : "s"}
                      </div>
                    </>
                  )}
                </button>
              ))}

              <div className="min-h-[118px] border-b border-[var(--line)] px-3 py-3 bg-white/[0.02]">
                <div className="ui-title text-sm text-white">Week {index + 1}</div>
                <div
                  className={`mt-4 text-base font-semibold ${
                    weekStats.pnl > 0 ? "text-mint" : weekStats.pnl < 0 ? "text-coral" : "text-slate-400"
                  }`}
                >
                  {formatCurrency(weekStats.pnl)}
                </div>
                <div className="mt-1 text-xs text-mist">
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
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(null);
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
      const monthTrades = monthDays.reduce((sum, day) => sum + day.stats.trades, 0);

      return {
        monthIndex,
        label: monthDate.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric"
        }),
        weeks,
        monthPnl: Number(monthPnl.toFixed(2)),
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
    return <LoadingState label="Loading calendar..." panel />;
  }

  if (error) {
    return <div className="ui-notice border-coral/20 bg-[#1b1012] text-coral">{error}</div>;
  }

  if (trades.length === 0) {
    return (
      <EmptyState
        title="No trades yet"
        description="Import or add trades and the calendar will mark green and red days automatically."
      />
    );
  }

  return (
    <div className="space-y-6">
      {selectedMonth && (
        <MonthDetailSection
          month={selectedMonth}
          onClose={() => setSelectedMonthIndex(null)}
          onSelectDay={(dayKey) => navigate(`/journal?day=${dayKey}`)}
        />
      )}
      <Card
        title="CALENDAR OVERVIEW"
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
