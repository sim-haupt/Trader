function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? fallback : numericValue;
}

function readField(trade, camelKey, snakeKey) {
  if (trade[camelKey] !== undefined) {
    return trade[camelKey];
  }

  return trade[snakeKey];
}

function normalizeSide(side) {
  return String(side || "LONG").trim().toUpperCase();
}

function getTradePnl(trade) {
  const entryPrice = toNumber(readField(trade, "entryPrice", "entry_price"), 0);
  const exitPrice = toNumber(readField(trade, "exitPrice", "exit_price"), 0);
  const quantity = toNumber(trade.quantity, 0);
  const fees = toNumber(trade.fees, 0);
  const side = normalizeSide(trade.side);
  const multiplier = side === "SHORT" ? -1 : 1;

  const grossPnl = (exitPrice - entryPrice) * quantity * multiplier;
  const pnl = grossPnl - fees;

  return Number(pnl.toFixed(4));
}

function createAnnotatedTrade(trade, index, runningEquity) {
  const pnl = getTradePnl(trade);
  const equity = Number((runningEquity + pnl).toFixed(4));

  return {
    ...trade,
    index,
    pnl,
    equity
  };
}

function calculateTradePnlSeries(trades) {
  const annotatedTrades = new Array(trades.length);
  let runningEquity = 0;

  for (let index = 0; index < trades.length; index += 1) {
    const annotatedTrade = createAnnotatedTrade(trades[index], index, runningEquity);
    runningEquity = annotatedTrade.equity;
    annotatedTrades[index] = annotatedTrade;
  }

  return annotatedTrades;
}

function calculateTotalPnl(trades) {
  let totalPnl = 0;

  for (let index = 0; index < trades.length; index += 1) {
    totalPnl += getTradePnl(trades[index]);
  }

  return Number(totalPnl.toFixed(4));
}

function calculateWinRate(trades) {
  if (trades.length === 0) {
    return 0;
  }

  let winCount = 0;

  for (let index = 0; index < trades.length; index += 1) {
    if (getTradePnl(trades[index]) > 0) {
      winCount += 1;
    }
  }

  return winCount / trades.length;
}

function calculateAverageWin(trades) {
  let totalWins = 0;
  let winCount = 0;

  for (let index = 0; index < trades.length; index += 1) {
    const pnl = getTradePnl(trades[index]);

    if (pnl > 0) {
      totalWins += pnl;
      winCount += 1;
    }
  }

  if (winCount === 0) {
    return 0;
  }

  return Number((totalWins / winCount).toFixed(4));
}

function calculateAverageLoss(trades) {
  let totalLosses = 0;
  let lossCount = 0;

  for (let index = 0; index < trades.length; index += 1) {
    const pnl = getTradePnl(trades[index]);

    if (pnl < 0) {
      totalLosses += Math.abs(pnl);
      lossCount += 1;
    }
  }

  if (lossCount === 0) {
    return 0;
  }

  return Number((totalLosses / lossCount).toFixed(4));
}

function calculateExpectancy(trades) {
  if (trades.length === 0) {
    return 0;
  }

  let winCount = 0;
  let lossCount = 0;
  let totalWins = 0;
  let totalLosses = 0;

  for (let index = 0; index < trades.length; index += 1) {
    const pnl = getTradePnl(trades[index]);

    if (pnl > 0) {
      winCount += 1;
      totalWins += pnl;
    } else if (pnl < 0) {
      lossCount += 1;
      totalLosses += Math.abs(pnl);
    }
  }

  const winRate = winCount / trades.length;
  const lossRate = lossCount / trades.length;
  const averageWin = winCount > 0 ? totalWins / winCount : 0;
  const averageLoss = lossCount > 0 ? totalLosses / lossCount : 0;
  const expectancy = winRate * averageWin - lossRate * averageLoss;

  return Number(expectancy.toFixed(4));
}

function calculateEquityCurve(trades) {
  const equityCurve = new Array(trades.length);
  let runningEquity = 0;

  for (let index = 0; index < trades.length; index += 1) {
    runningEquity += getTradePnl(trades[index]);
    equityCurve[index] = Number(runningEquity.toFixed(4));
  }

  return equityCurve;
}

function calculateMaxDrawdown(trades) {
  let runningEquity = 0;
  let peakEquity = 0;
  let maxDrawdown = 0;

  for (let index = 0; index < trades.length; index += 1) {
    runningEquity += getTradePnl(trades[index]);

    if (runningEquity > peakEquity) {
      peakEquity = runningEquity;
    }

    const drawdown = peakEquity - runningEquity;

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return Number(maxDrawdown.toFixed(4));
}

function calculateAnalytics(trades) {
  const annotatedTrades = new Array(trades.length);
  const equityCurve = new Array(trades.length);

  let runningEquity = 0;
  let peakEquity = 0;
  let maxDrawdown = 0;
  let totalPnl = 0;
  let winCount = 0;
  let lossCount = 0;
  let totalWins = 0;
  let totalLosses = 0;

  for (let index = 0; index < trades.length; index += 1) {
    const trade = trades[index];
    const pnl = getTradePnl(trade);

    totalPnl += pnl;
    runningEquity += pnl;

    if (runningEquity > peakEquity) {
      peakEquity = runningEquity;
    }

    const drawdown = peakEquity - runningEquity;

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }

    if (pnl > 0) {
      winCount += 1;
      totalWins += pnl;
    } else if (pnl < 0) {
      lossCount += 1;
      totalLosses += Math.abs(pnl);
    }

    equityCurve[index] = Number(runningEquity.toFixed(4));
    annotatedTrades[index] = {
      ...trade,
      index,
      pnl: Number(pnl.toFixed(4)),
      equity: equityCurve[index]
    };
  }

  const tradeCount = trades.length;
  const winRate = tradeCount > 0 ? winCount / tradeCount : 0;
  const lossRate = tradeCount > 0 ? lossCount / tradeCount : 0;
  const averageWin = winCount > 0 ? totalWins / winCount : 0;
  const averageLoss = lossCount > 0 ? totalLosses / lossCount : 0;
  const expectancy = winRate * averageWin - lossRate * averageLoss;

  return {
    trades: annotatedTrades,
    summary: {
      tradeCount,
      totalPnl: Number(totalPnl.toFixed(4)),
      winRate: Number(winRate.toFixed(4)),
      lossRate: Number(lossRate.toFixed(4)),
      averageWin: Number(averageWin.toFixed(4)),
      averageLoss: Number(averageLoss.toFixed(4)),
      expectancy: Number(expectancy.toFixed(4)),
      maxDrawdown: Number(maxDrawdown.toFixed(4))
    },
    equityCurve
  };
}

module.exports = {
  getTradePnl,
  calculateTradePnlSeries,
  calculateTotalPnl,
  calculateWinRate,
  calculateAverageWin,
  calculateAverageLoss,
  calculateExpectancy,
  calculateEquityCurve,
  calculateMaxDrawdown,
  calculateAnalytics
};
