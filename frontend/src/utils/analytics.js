function asNumber(value) {
  const numericValue = Number(value || 0);
  return Number.isNaN(numericValue) ? 0 : numericValue;
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

  const equityCurve = sortedTrades.map((trade) => {
    const pnl = asNumber(trade.netPnl ?? trade.grossPnl);
    const entryDate = new Date(trade.entryDate);
    const exitDate = trade.exitDate ? new Date(trade.exitDate) : entryDate;
    const holdMinutes = Math.max(0, (exitDate.getTime() - entryDate.getTime()) / 60000);
    const dayKey = entryDate.toISOString().slice(0, 10);
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
  const expectancy = tradeCount
    ? (wins / tradeCount) * averageWin - (lossCount / tradeCount) * averageLoss
    : 0;
  const totalPnl = sortedTrades.reduce(
    (sum, trade) => sum + asNumber(trade.netPnl ?? trade.grossPnl),
    0
  );

  return {
    summary: {
      tradeCount,
      totalPnl,
      winRate,
      lossRate: tradeCount ? (lossCount / tradeCount) * 100 : 0,
      wins,
      losses: lossCount,
      averageWin,
      averageLoss,
      expectancy,
      largestWin,
      largestLoss,
      averageWinningHoldMinutes: winningHoldCount ? totalWinningHoldMinutes / winningHoldCount : 0,
      averageLosingHoldMinutes: losingHoldCount ? totalLosingHoldMinutes / losingHoldCount : 0
    },
    equityCurve,
    recentDays: Array.from(dailyMap.values()).slice(-7),
    performanceByWeekday: Array.from(weekdayMap.entries()).map(([day, pnl]) => ({
      day,
      pnl
    }))
  };
}
