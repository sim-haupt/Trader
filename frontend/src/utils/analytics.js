function asNumber(value) {
  const numericValue = Number(value || 0);
  return Number.isNaN(numericValue) ? 0 : numericValue;
}

function getLocalDayKey(date) {
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

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function buildAnalytics(trades) {
  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
  );

  let runningEquity = 0;
  let wins = 0;
  let losses = 0;
  let totalWin = 0;
  let totalLoss = 0;
  let largestWin = 0;
  let largestLoss = 0;
  let totalWinningHoldMinutes = 0;
  let totalLosingHoldMinutes = 0;
  let winningHoldCount = 0;
  let losingHoldCount = 0;
  const dailyMap = new Map();
  const weekdayMap = new Map([
    ["Sun", 0],
    ["Mon", 0],
    ["Tue", 0],
    ["Wed", 0],
    ["Thu", 0],
    ["Fri", 0],
    ["Sat", 0]
  ]);
  const datedTrades = sortedTrades.map((trade) => ({
    trade,
    pnl: asNumber(trade.netPnl ?? trade.grossPnl),
    entryDate: new Date(trade.entryDate)
  }));

  const equityCurve = datedTrades.map(({ trade, pnl, entryDate }) => {
    const exitDate = trade.exitDate ? new Date(trade.exitDate) : entryDate;
    const holdMinutes = Math.max(0, (exitDate.getTime() - entryDate.getTime()) / 60000);
    const dayKey = getLocalDayKey(entryDate);
    const weekday = entryDate.toLocaleDateString("en-US", { weekday: "short" });

    if (pnl > 0) {
      wins += 1;
      totalWin += pnl;
      totalWinningHoldMinutes += holdMinutes;
      winningHoldCount += 1;
      largestWin = Math.max(largestWin, pnl);
    } else if (pnl < 0) {
      losses += 1;
      totalLoss += Math.abs(pnl);
      totalLosingHoldMinutes += holdMinutes;
      losingHoldCount += 1;
      largestLoss = Math.min(largestLoss, pnl);
    }

    runningEquity += pnl;
    dailyMap.set(dayKey, {
      date: dayKey,
      label: entryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weekday: entryDate.toLocaleDateString("en-US", { weekday: "short" }),
      pnl: Number(((dailyMap.get(dayKey)?.pnl || 0) + pnl).toFixed(2)),
      trades: (dailyMap.get(dayKey)?.trades || 0) + 1
    });
    weekdayMap.set(weekday, Number((weekdayMap.get(weekday) + pnl).toFixed(2)));

    return {
      date: entryDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      }),
      equity: Number(runningEquity.toFixed(2)),
      pnl: Number(pnl.toFixed(2))
    };
  });

  const tradeCount = sortedTrades.length;
  const lossCount = losses;
  const winRate = tradeCount ? (wins / tradeCount) * 100 : 0;
  const averageWin = wins ? totalWin / wins : 0;
  const averageLoss = lossCount ? totalLoss / lossCount : 0;
  const totalPnl = datedTrades.reduce(
    (sum, item) => sum + item.pnl,
    0
  );
  const averageTradePnl = tradeCount ? totalPnl / tradeCount : 0;
  const expectancy = tradeCount
    ? (wins / tradeCount) * averageWin - (lossCount / tradeCount) * averageLoss
    : 0;
  const latestTradeDate = datedTrades.length
    ? new Date(datedTrades[datedTrades.length - 1].entryDate)
    : new Date();
  const latestDayStart = startOfDay(latestTradeDate);
  const latestDayEnd = endOfDay(latestTradeDate);
  const latestWeekStart = startOfWeek(latestTradeDate);
  const latestMonthStart = startOfMonth(latestTradeDate);

  const totalMonthPnl = datedTrades.reduce(
    (sum, item) =>
      item.entryDate >= latestMonthStart && item.entryDate <= latestDayEnd ? sum + item.pnl : sum,
    0
  );
  const totalWeekPnl = datedTrades.reduce(
    (sum, item) =>
      item.entryDate >= latestWeekStart && item.entryDate <= latestDayEnd ? sum + item.pnl : sum,
    0
  );
  const totalTodayPnl = datedTrades.reduce(
    (sum, item) =>
      item.entryDate >= latestDayStart && item.entryDate <= latestDayEnd ? sum + item.pnl : sum,
    0
  );

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(latestDayStart);
    day.setDate(latestDayStart.getDate() - (6 - index));
    const dayKey = getLocalDayKey(day);
    const stats = dailyMap.get(dayKey);

    return {
      date: dayKey,
      label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weekday: day.toLocaleDateString("en-US", { weekday: "short" }),
      pnl: Number((stats?.pnl || 0).toFixed(2)),
      trades: stats?.trades || 0
    };
  });

  return {
    summary: {
      tradeCount,
      totalPnl,
      totalMonthPnl,
      totalWeekPnl,
      totalTodayPnl,
      winRate,
      lossRate: tradeCount ? (lossCount / tradeCount) * 100 : 0,
      wins,
      losses: lossCount,
      averageWin,
      averageLoss,
      averageTradePnl,
      expectancy,
      largestWin,
      largestLoss,
      averageWinningHoldMinutes: winningHoldCount ? totalWinningHoldMinutes / winningHoldCount : 0,
      averageLosingHoldMinutes: losingHoldCount ? totalLosingHoldMinutes / losingHoldCount : 0
    },
    equityCurve,
    lastSevenDays,
    performanceByWeekday: Array.from(weekdayMap.entries()).map(([day, pnl]) => ({
      day,
      pnl
    })),
    latestDateLabel: latestTradeDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    })
  };
}
