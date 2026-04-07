import { useEffect, useMemo, useState } from "react";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
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

  const weeks = [];

  // Render a fixed 6-week grid so each month card remains visually consistent.
  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const week = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const currentDate = new Date(startDay);
      currentDate.setDate(startDay.getDate() + weekIndex * 7 + dayIndex);
      const dayKey = getDayKey(currentDate);

      week.push({
        date: currentDate,
        dayKey,
        dayNumber: currentDate.getDate(),
        isCurrentMonth: currentDate.getMonth() === monthIndex,
        stats: dailyStats.get(dayKey) || null
      });
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
    return "bg-mint/10 text-mint";
  }

  if (stats.pnl < 0) {
    return "bg-coral/10 text-coral";
  }

  return "bg-white/5 text-white";
}

function MonthCard({ month, onOpen }) {
  return (
    <Card
      title={month.label}
      action={
        <button
          type="button"
          onClick={() => onOpen(month)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
        >
          Open
        </button>
      }
      className="rounded-none border-white/8 bg-white/[0.03] p-6 shadow-none"
    >
      <div className="grid grid-cols-7 gap-3 text-center">
        {weekdayLabels.map((label) => (
          <div key={label} className="pb-2 text-sm font-semibold text-slate-200">
            {label}
          </div>
        ))}

        {month.weeks.flat().map((day) => (
          <div
            key={day.dayKey}
            className={`rounded-2xl px-2 py-3 text-lg font-medium transition ${getDayTone(
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

function CalendarPage() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadTrades() {
      try {
        const data = await tradeService.getTrades();

        if (active) {
          setTrades(data);
        }
      } catch (err) {
        if (active) {
          setError(err.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadTrades();

    return () => {
      active = false;
    };
  }, []);

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

  useEffect(() => {
    const currentMonth = new Date().getMonth();
    const bestMonthIndex =
      calendarData.months.findLastIndex((month) => month.monthTrades > 0) >= 0
        ? calendarData.months.findLastIndex((month) => month.monthTrades > 0)
        : currentMonth;

    setSelectedMonthIndex(bestMonthIndex);
  }, [calendarData]);

  const selectedMonth = calendarData.months[selectedMonthIndex];
  const monthTradeDays = selectedMonth
    ? selectedMonth.weeks
        .flat()
        .filter((day) => day.isCurrentMonth && day.stats)
        .sort((left, right) => left.dayKey.localeCompare(right.dayKey))
    : [];

  if (loading) {
    return <div className="text-sm text-mist">Loading calendar...</div>;
  }

  if (error) {
    return <div className="rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</div>;
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
      <Card
        title="Calendar Overview"
        subtitle="A year-level view of green and red trading days. Open any month to drill down into the details."
        action={
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xl font-semibold text-white">
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

      {selectedMonth && (
        <Card
          title={`${selectedMonth.label} Details`}
          subtitle="A more detailed view for the selected month."
          action={
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/5 px-4 py-2 text-sm text-mist">
                {selectedMonth.monthTrades} trade{selectedMonth.monthTrades === 1 ? "" : "s"}
              </div>
              <div
                className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
                  selectedMonth.monthPnl >= 0
                    ? "bg-mint/10 text-mint"
                    : "bg-coral/10 text-coral"
                }`}
              >
                {formatCurrency(selectedMonth.monthPnl)}
              </div>
            </div>
          }
        >
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-white/8 bg-slate-950/25 p-5">
              <div className="mb-5 grid grid-cols-7 gap-3 text-center">
                {weekdayLabels.map((label) => (
                  <div key={label} className="pb-2 text-sm font-semibold text-slate-200">
                    {label}
                  </div>
                ))}

                {selectedMonth.weeks.flat().map((day) => (
                  <div
                    key={day.dayKey}
                    className={`min-h-[74px] rounded-2xl px-2 py-3 text-left transition ${getDayTone(
                      day.stats,
                      day.isCurrentMonth
                    )}`}
                  >
                    <div className="text-base font-semibold">{day.dayNumber}</div>
                    {day.isCurrentMonth && day.stats && (
                      <>
                        <div className="mt-3 text-sm font-semibold">
                          {formatCurrency(day.stats.pnl)}
                        </div>
                        <div className="mt-1 text-xs opacity-80">
                          {day.stats.trades} trade{day.stats.trades === 1 ? "" : "s"}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/8 bg-slate-950/25 p-5">
              <h3 className="text-lg font-semibold text-white">Daily Breakdown</h3>
              <div className="mt-5 space-y-3">
                {monthTradeDays.length === 0 ? (
                  <p className="text-sm text-mist">No trades in this month.</p>
                ) : (
                  monthTradeDays.map((day) => (
                    <div
                      key={day.dayKey}
                      className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4"
                    >
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
                        <div
                          className={`text-lg font-semibold ${
                            day.stats.pnl >= 0 ? "text-mint" : "text-coral"
                          }`}
                        >
                          {formatCurrency(day.stats.pnl)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default CalendarPage;
