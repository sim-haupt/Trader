import { Fragment, useMemo, useState } from "react";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tradeService from "../services/tradeService";
import { formatCurrency } from "../utils/formatters";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDayKey(date) {
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
    return "bg-white/[0.01] text-slate-400";
  }

  if (stats.pnl > 0) {
    return "border border-mint/45 bg-[linear-gradient(180deg,rgba(24,200,122,0.12),rgba(24,200,122,0.04))] text-mint";
  }

  if (stats.pnl < 0) {
    return "border border-coral/45 bg-[linear-gradient(180deg,rgba(255,93,87,0.12),rgba(255,93,87,0.04))] text-coral";
  }

  return "border border-[#e5e7eb42] bg-white/[0.03] text-phosphor";
}

function getDayBorderStyle(stats, isCurrentMonth) {
  if (!isCurrentMonth) {
    return undefined;
  }

  if (!stats) {
    return { borderColor: "transparent" };
  }

  if (stats.pnl > 0) {
    return { borderColor: "rgba(45, 212, 143, 0.55)" };
  }

  if (stats.pnl < 0) {
    return { borderColor: "rgba(255, 107, 107, 0.55)" };
  }

  return { borderColor: "rgba(229, 231, 235, 0.26)" };
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
            className={`rounded-[10px] px-2 py-3 text-lg font-medium transition ${getDayTone(
              day.stats,
              day.isCurrentMonth
            )}`}
          >
            {day.dayNumber}
          </div>
        ))}
      </div>
    </Card>
  );
}

function MonthDetailSection({ month, onClose }) {
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
                ? "border-mint/25 bg-mint/10 text-mint"
                : month.monthPnl < 0
                  ? "border-coral/25 bg-[#2a1111] text-coral"
                  : "border-black/30 bg-white/5 text-mist"
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
      <div className="grid grid-cols-8 gap-0 overflow-hidden rounded-[12px] border border-black/30 bg-white/[0.015]">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="ui-title border-b border-r border-black/30 px-3 py-3 text-center text-xs text-white/78"
          >
            {label}
          </div>
        ))}
        <div className="ui-title border-b border-black/30 px-3 py-3 text-center text-xs text-white/78">
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
                <div
                  key={day.dayKey}
                  className={`min-h-[118px] border-b border-r px-3 py-3 text-left transition ${getDayTone(
                    day.stats,
                    day.isCurrentMonth
                  )}`}
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
                </div>
              ))}

              <div className="min-h-[118px] border-b border-black/30 px-3 py-3 bg-white/[0.02]">
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
    return <div className="text-sm text-mist">Loading calendar...</div>;
  }

  if (error) {
    return <div className="ui-notice border-coral/30 bg-[#2a1111] text-coral">{error}</div>;
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
        <MonthDetailSection month={selectedMonth} onClose={() => setSelectedMonthIndex(null)} />
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
