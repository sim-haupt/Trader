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
  let totalWin = 0;
  let totalLoss = 0;

  const equityCurve = sortedTrades.map((trade) => {
    const pnl = asNumber(trade.netPnl ?? trade.grossPnl);

    if (pnl > 0) {
      wins += 1;
      totalWin += pnl;
    } else if (pnl < 0) {
      totalLoss += Math.abs(pnl);
    }

    runningEquity += pnl;

    return {
      date: new Date(trade.entryDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      }),
      equity: Number(runningEquity.toFixed(2)),
      pnl: Number(pnl.toFixed(2))
    };
  });

  const tradeCount = sortedTrades.length;
  const lossCount = tradeCount - wins;
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
      averageWin,
      averageLoss,
      expectancy
    },
    equityCurve
  };
}
