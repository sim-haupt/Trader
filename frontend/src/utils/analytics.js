import { getTradeGrossPnl, getTradePnlByType } from "./tradePnl";

const MARKET_TIME_ZONE = "America/New_York";

function getMarketDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  });

  const parts = formatter.formatToParts(date);

  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
}

function asNumber(value) {
  const numericValue = Number(value || 0);
  return Number.isNaN(numericValue) ? 0 : numericValue;
}

function getLocalDayKey(date) {
  const parts = getMarketDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
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

function getHoldMinutes(trade, entryDate) {
  const exitDate = trade.exitDate ? new Date(trade.exitDate) : entryDate;
  return Math.max(0, (exitDate.getTime() - entryDate.getTime()) / 60000);
}

function getTimeBucket(date) {
  const hours = Number(getMarketDateParts(date).hour);

  if (hours < 9) {
    return "PREMARKET";
  }

  if (hours < 11) {
    return "OPEN";
  }

  if (hours < 14) {
    return "MIDDAY";
  }

  if (hours < 16) {
    return "POWER HOUR";
  }

  return "AFTER HOURS";
}

function buildHourlyPerformance(processedTrades) {
  const hourlyMap = new Map();

  for (let hour = 4; hour <= 20; hour += 1) {
    const label = `${hour}:00`;
    hourlyMap.set(hour, {
      hour,
      label,
      pnl: 0
    });
  }

  for (const item of processedTrades) {
    const hour = Number(getMarketDateParts(item.entryDate).hour);

    if (!hourlyMap.has(hour)) {
      continue;
    }

    const current = hourlyMap.get(hour);
    current.pnl = Number((current.pnl + item.pnl).toFixed(2));
  }

  return Array.from(hourlyMap.values());
}

function buildLastThirtyDayPnl(processedTrades, latestDayStart) {
  const dailyMap = new Map();

  for (const item of processedTrades) {
    const dayKey = getLocalDayKey(item.entryDate);
    dailyMap.set(dayKey, Number(((dailyMap.get(dayKey) || 0) + item.pnl).toFixed(2)));
  }

  return Array.from({ length: 30 }, (_, index) => {
    const day = new Date(latestDayStart);
    day.setDate(latestDayStart.getDate() - (29 - index));
    const dayKey = getLocalDayKey(day);

    return {
      date: dayKey,
      label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      grossPnl: Number((dailyMap.get(dayKey) || 0).toFixed(2))
    };
  });
}

function buildPriceBuckets(processedTrades) {
  const bucketDefinitions = [
    { label: "< $2.00", min: -Infinity, max: 2 },
    { label: "$2 - $3.99", min: 2, max: 4 },
    { label: "$4 - $5.99", min: 4, max: 6 },
    { label: "$6 - $7.99", min: 6, max: 8 },
    { label: "$8 - $9.99", min: 8, max: 10 },
    { label: "$10 - $11.99", min: 10, max: 12 },
    { label: "$12 - $13.99", min: 12, max: 14 },
    { label: "$14 - $15.99", min: 14, max: 16 },
    { label: "$16 - $17.99", min: 16, max: 18 },
    { label: "$18 - $19.99", min: 18, max: 20 },
    { label: "> $20.00", min: 20, max: Infinity }
  ];

  const buckets = bucketDefinitions.map((bucket) => ({
    ...bucket,
    pnl: 0
  }));

  for (const item of processedTrades) {
    const price = asNumber(item.trade.entryPrice);
    const bucket = buckets.find((candidate) => price >= candidate.min && price < candidate.max);

    if (!bucket) {
      continue;
    }

    bucket.pnl = Number((bucket.pnl + item.pnl).toFixed(2));
  }

  const totalAbsolute = buckets.reduce((sum, bucket) => sum + Math.abs(bucket.pnl), 0);

  return buckets.map((bucket) => ({
    label: bucket.label,
    pnl: bucket.pnl,
    percentage: totalAbsolute ? (Math.abs(bucket.pnl) / totalAbsolute) * 100 : 0
  }));
}

function buildTimeOfDaySummary(performanceByTimeOfDay) {
  const totalAbsolute = performanceByTimeOfDay.reduce(
    (sum, entry) => sum + Math.abs(entry.pnl),
    0
  );

  return performanceByTimeOfDay.map((entry) => ({
    ...entry,
    percentage: totalAbsolute ? (Math.abs(entry.pnl) / totalAbsolute) * 100 : 0
  }));
}

function buildWeekdaySummary(weekdayMap) {
  const entries = Array.from(weekdayMap.entries()).map(([day, pnl]) => ({
    day,
    pnl
  }));
  const totalAbsolute = entries.reduce((sum, entry) => sum + Math.abs(entry.pnl), 0);

  return entries.map((entry) => ({
    ...entry,
    percentage: totalAbsolute ? (Math.abs(entry.pnl) / totalAbsolute) * 100 : 0
  }));
}

export function buildAnalytics(trades, options = {}) {
  const defaultCommission = options.defaultCommission || 0;
  const defaultFees = options.defaultFees || 0;
  const pnlType = options.pnlType || "NET";
  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
  );

  const dailyMap = new Map();
  const weekdayMap = new Map([
    ["Mon", 0],
    ["Tue", 0],
    ["Wed", 0],
    ["Thu", 0],
    ["Fri", 0]
  ]);
  const timeBucketMap = new Map([
    ["PREMARKET", { label: "Premarket", pnl: 0, trades: 0 }],
    ["OPEN", { label: "Open", pnl: 0, trades: 0 }],
    ["MIDDAY", { label: "Midday", pnl: 0, trades: 0 }],
    ["POWER HOUR", { label: "Power Hour", pnl: 0, trades: 0 }],
    ["AFTER HOURS", { label: "After Hours", pnl: 0, trades: 0 }]
  ]);

  let runningEquity = 0;
  let peakEquity = 0;
  let maxDrawdown = 0;
  let wins = 0;
  let losses = 0;
  let totalWin = 0;
  let totalLoss = 0;
  let totalPositivePerShare = 0;
  let totalNegativePerShare = 0;
  let largestWin = 0;
  let largestLoss = 0;
  let winningHoldMinutesTotal = 0;
  let losingHoldMinutesTotal = 0;
  let winningHoldCount = 0;
  let losingHoldCount = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;

  const processedTrades = sortedTrades.map((trade) => {
    const entryDate = new Date(trade.entryDate);
    const pnl = getTradePnlByType(trade, pnlType, defaultCommission, defaultFees);
    const quantity = Math.abs(asNumber(trade.quantity));
    const holdMinutes = getHoldMinutes(trade, entryDate);
    const perSharePnl = quantity > 0 ? pnl / quantity : 0;
    const dayKey = getLocalDayKey(entryDate);
    const weekday = getMarketDateParts(entryDate).weekday;
    const timeBucket = getTimeBucket(entryDate);

    if (pnl > 0) {
      wins += 1;
      totalWin += pnl;
      totalPositivePerShare += perSharePnl;
      largestWin = Math.max(largestWin, pnl);
      winningHoldMinutesTotal += holdMinutes;
      winningHoldCount += 1;
      currentWinStreak += 1;
      currentLossStreak = 0;
      longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
    } else if (pnl < 0) {
      losses += 1;
      totalLoss += Math.abs(pnl);
      totalNegativePerShare += Math.abs(perSharePnl);
      largestLoss = Math.min(largestLoss, pnl);
      losingHoldMinutesTotal += holdMinutes;
      losingHoldCount += 1;
      currentLossStreak += 1;
      currentWinStreak = 0;
      longestLossStreak = Math.max(longestLossStreak, currentLossStreak);
    } else {
      currentWinStreak = 0;
      currentLossStreak = 0;
    }

    runningEquity += pnl;
    peakEquity = Math.max(peakEquity, runningEquity);
    maxDrawdown = Math.min(maxDrawdown, runningEquity - peakEquity);

    dailyMap.set(dayKey, {
      date: dayKey,
      label: entryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weekday: entryDate.toLocaleDateString("en-US", { weekday: "short" }),
      pnl: Number(((dailyMap.get(dayKey)?.pnl || 0) + pnl).toFixed(2)),
      trades: (dailyMap.get(dayKey)?.trades || 0) + 1,
      wins: (dailyMap.get(dayKey)?.wins || 0) + (pnl > 0 ? 1 : 0),
      volume: (dailyMap.get(dayKey)?.volume || 0) + quantity
    });

    if (weekdayMap.has(weekday)) {
      weekdayMap.set(weekday, Number((weekdayMap.get(weekday) + pnl).toFixed(2)));
    }

    const bucketStats = timeBucketMap.get(timeBucket);
    timeBucketMap.set(timeBucket, {
      ...bucketStats,
      pnl: Number((bucketStats.pnl + pnl).toFixed(2)),
      trades: bucketStats.trades + 1
    });

    return {
      trade,
      pnl,
      quantity,
      entryDate,
      holdMinutes,
      perSharePnl,
      equity: Number(runningEquity.toFixed(2)),
      drawdown: Number((runningEquity - peakEquity).toFixed(2))
    };
  });

  const tradeCount = processedTrades.length;
  const averageWin = wins ? totalWin / wins : 0;
  const averageLoss = losses ? totalLoss / losses : 0;
  const totalPnl = processedTrades.reduce((sum, item) => sum + item.pnl, 0);
  const averageTradePnl = tradeCount ? totalPnl / tradeCount : 0;
  const expectancyPerTrade = tradeCount
    ? (wins / tradeCount) * averageWin - (losses / tradeCount) * averageLoss
    : 0;
  const riskRewardRatio = averageLoss ? averageWin / averageLoss : 0;
  const averageGainPerShare = wins ? totalPositivePerShare / wins : 0;
  const averageLossPerShare = losses ? totalNegativePerShare / losses : 0;

  const latestTradeDate = processedTrades.length
    ? new Date(processedTrades[processedTrades.length - 1].entryDate)
    : new Date();
  const latestDayStart = startOfDay(latestTradeDate);
  const latestDayEnd = endOfDay(latestTradeDate);
  const latestWeekStart = startOfWeek(latestTradeDate);
  const latestMonthStart = startOfMonth(latestTradeDate);

  const totalMonthPnl = processedTrades.reduce(
    (sum, item) =>
      item.entryDate >= latestMonthStart && item.entryDate <= latestDayEnd ? sum + item.pnl : sum,
    0
  );
  const totalWeekPnl = processedTrades.reduce(
    (sum, item) =>
      item.entryDate >= latestWeekStart && item.entryDate <= latestDayEnd ? sum + item.pnl : sum,
    0
  );
  const totalTodayPnl = processedTrades.reduce(
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

  const equityCurve = processedTrades.map((item) => ({
    date: item.entryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    equity: item.equity
  }));

  const drawdownCurve = processedTrades.map((item) => ({
    date: item.entryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    drawdown: item.drawdown
  }));

  const winRateThirtyDays = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(latestDayStart);
    day.setDate(latestDayStart.getDate() - (29 - index));
    const dayKey = getLocalDayKey(day);
    const stats = dailyMap.get(dayKey);
    const trades = stats?.trades || 0;
    const winsForDay = stats?.wins || 0;

    return {
      date: dayKey,
      label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      winRate: trades ? Number(((winsForDay / trades) * 100).toFixed(2)) : 0
    };
  });

  const dailyVolumeThirtyDays = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(latestDayStart);
    day.setDate(latestDayStart.getDate() - (29 - index));
    const dayKey = getLocalDayKey(day);
    const stats = dailyMap.get(dayKey);

    return {
      date: dayKey,
      label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      volume: stats?.volume || 0
    };
  });

  const currentDrawdown = processedTrades.length
    ? processedTrades[processedTrades.length - 1].drawdown
    : 0;

  return {
    summary: {
      tradeCount,
      totalPnl,
      totalMonthPnl,
      totalWeekPnl,
      totalTodayPnl,
      winRate: tradeCount ? (wins / tradeCount) * 100 : 0,
      wins,
      losses,
      averageWin,
      averageLoss,
      averageTradePnl,
      expectancyPerTrade,
      largestWin,
      largestLoss,
      averageWinningHoldMinutes: winningHoldCount ? winningHoldMinutesTotal / winningHoldCount : 0,
      averageLosingHoldMinutes: losingHoldCount ? losingHoldMinutesTotal / losingHoldCount : 0,
      averageGainPerShare,
      averageLossPerShare,
      maxDrawdown,
      currentDrawdown,
      riskRewardRatio,
      longestWinStreak,
      longestLossStreak
    },
    equityCurve,
    drawdownCurve,
    lastSevenDays,
    performanceByWeekday: buildWeekdaySummary(weekdayMap),
    performanceByTimeOfDay: Array.from(timeBucketMap.values()),
    performanceByTimeOfDaySummary: buildTimeOfDaySummary(Array.from(timeBucketMap.values())),
    hourlyPerformance: buildHourlyPerformance(processedTrades),
    performanceByPrice: buildPriceBuckets(processedTrades),
    grossDailyThirtyDays: buildLastThirtyDayPnl(processedTrades, latestDayStart),
    winRateThirtyDays,
    dailyVolumeThirtyDays,
    pnlType,
    latestDateLabel: latestTradeDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    })
  };
}
