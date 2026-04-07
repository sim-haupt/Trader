import { useMemo, useState } from "react";
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
    return "bg-transparent text-slate-400";
  }

  if (stats.pnl > 0) {
    return "border border-mint/20 bg-mint/10 text-mint";
  }

  if (stats.pnl < 0) {
    return "border border-coral/20 bg-coral/10 text-coral";
  }

  return "border border-white/10 bg-white/5 text-phosphor";
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
      className="bg-[linear-gradient(180deg,rgba(28,24,37,0.98),rgba(16,13,23,0.96))] p-6 shadow-none"
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
            className={`px-2 py-3 text-lg font-medium transition ${getDayTone(
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

function MonthDetailModal({ month, onClose }) {
  const monthTradeDays = month.weeks
    .flat()
    .filter((day) => day.isCurrentMonth && day.stats)
    .sort((left, right) => left.dayKey.localeCompare(right.dayKey));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur">
      <div className="w-full max-w-6xl border-2 border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(10,10,10,0.98))] shadow-crt">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b-2 border-[#2a2240] bg-[linear-gradient(90deg,rgba(56,56,66,0.72),rgba(34,34,41,0.42),rgba(18,18,22,0.18))] px-6 py-5">
          <div>
            <p className="ui-title text-xs text-mist">Calendar</p>
            <h2 className="ui-title mt-3 text-2xl text-white">{month.label}</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="ui-chip normal-case tracking-[0.08em] text-sm text-white">
              {month.monthTrades} trade{month.monthTrades === 1 ? "" : "s"}
            </div>
            <div
              className={`border px-4 py-2 text-sm font-semibold ${
                month.monthPnl >= 0 ? "border-mint/25 bg-mint/10 text-mint" : "border-coral/25 bg-[#2a1111] text-coral"
              }`}
            >
              {formatCurrency(month.monthPnl)}
            </div>
            <button type="button" onClick={onClose} className="ui-button text-sm">
              Close
            </button>
          </div>
        </div>

        <div className="grid gap-6 p-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="ui-panel bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(10,10,10,0.98))] p-5">
            <div className="mb-5 grid grid-cols-7 gap-3 text-center">
              {weekdayLabels.map((label) => (
                <div key={label} className="ui-title pb-2 text-xs text-mist">
                  {label}
                </div>
              ))}

              {month.weeks.flat().map((day) => (
                <div
                  key={day.dayKey}
                  className={`min-h-[74px] px-2 py-3 text-left transition ${getDayTone(
                    day.stats,
                    day.isCurrentMonth
                  )}`}
                >
                  <div className="text-base font-semibold">{day.dayNumber}</div>
                  {day.isCurrentMonth && day.stats && (
                    <>
                      <div className="mt-3 text-sm font-semibold">{formatCurrency(day.stats.pnl)}</div>
                      <div className="mt-1 text-xs opacity-80">
                        {day.stats.trades} trade{day.stats.trades === 1 ? "" : "s"}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="ui-panel bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(10,10,10,0.98))] p-5">
            <h3 className="ui-title text-lg text-white">Daily Breakdown</h3>
            <div className="mt-5 space-y-3">
              {monthTradeDays.length === 0 ? (
                <p className="text-sm text-mist">No trades in this month.</p>
              ) : (
                monthTradeDays.map((day) => (
                  <div key={day.dayKey} className="ui-panel px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-white">
                          {new Date(day.dayKey).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric"
                          })}
                        </p>
                        <p className="mt-1 text-sm text-mist">
                          {day.stats.trades} trade{day.stats.trades === 1 ? "" : "s"} · {day.stats.wins} win
                          {day.stats.wins === 1 ? "" : "s"} · {day.stats.losses} loss
                          {day.stats.losses === 1 ? "" : "es"}
                        </p>
                      </div>
                      <div className={`text-lg font-semibold ${day.stats.pnl >= 0 ? "text-mint" : "text-coral"}`}>
                        {formatCurrency(day.stats.pnl)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarPage() {
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(null);
  const {
    data: trades,
    loading,
    error,
    refreshing
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
      {refreshing && <div className="ui-chip text-xs">Refreshing Calendar</div>}
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

      {selectedMonth && <MonthDetailModal month={selectedMonth} onClose={() => setSelectedMonthIndex(null)} />}
    </div>
  );
}

export default CalendarPage;
