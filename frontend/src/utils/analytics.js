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

function parseDayKey(dayKey) {
  const match = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function shiftDayKey(dayKey, offset) {
  const parts = parseDayKey(dayKey);

  if (!parts) {
    return dayKey;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offset));
  return date.toISOString().slice(0, 10);
}

function formatDayKeyLabel(dayKey, options) {
  const parts = parseDayKey(dayKey);

  if (!parts) {
    return dayKey;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...options
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)));
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

function getTrimmedAverage(values) {
  const numericValues = values
    .map((value) => asNumber(value))
    .filter((value) => Number.isFinite(value));

  if (numericValues.length === 0) {
    return 0;
  }

  if (numericValues.length < 3) {
    return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  }

  const sortedValues = [...numericValues].sort((a, b) => a - b);
  const trimmedValues = sortedValues.slice(1, -1);

  if (trimmedValues.length === 0) {
    return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  }

  return trimmedValues.reduce((sum, value) => sum + value, 0) / trimmedValues.length;
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

function buildLastThirtyDayPnl(processedTrades, endDayKey) {
  const dailyMap = new Map();

  for (const item of processedTrades) {
    const dayKey = getLocalDayKey(item.entryDate);
    dailyMap.set(dayKey, Number(((dailyMap.get(dayKey) || 0) + item.pnl).toFixed(2)));
  }

  return Array.from({ length: 30 }, (_, index) => {
    const dayKey = shiftDayKey(endDayKey, index - 29);

    return {
      date: dayKey,
      label: formatDayKeyLabel(dayKey, { month: "short", day: "numeric" }),
      grossPnl: Number((dailyMap.get(dayKey) || 0).toFixed(2))
    };
  });
}

function buildPriceBuckets(processedTrades) {
  const bucketDefinitions = [
    { label: "< $2.00", min: -Infinity, max: 2 },
    { label: "$2 - $4.99", min: 2, max: 5 },
    { label: "$5 - $7.99", min: 5, max: 8 },
    { label: "$8 - $10.99", min: 8, max: 11 },
    { label: "$11 - $13.99", min: 11, max: 14 },
    { label: "$14 - $17.99", min: 14, max: 18 },
    { label: "> $18.00", min: 18, max: Infinity }
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
  const allHoldMinutes = [];
  const winningHoldMinutes = [];
  const losingHoldMinutes = [];
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

    allHoldMinutes.push(holdMinutes);

    if (pnl > 0) {
      wins += 1;
      totalWin += pnl;
      totalPositivePerShare += perSharePnl;
      largestWin = Math.max(largestWin, pnl);
      winningHoldMinutes.push(holdMinutes);
      currentWinStreak += 1;
      currentLossStreak = 0;
      longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
    } else if (pnl < 0) {
      losses += 1;
      totalLoss += Math.abs(pnl);
      totalNegativePerShare += Math.abs(perSharePnl);
      largestLoss = Math.min(largestLoss, pnl);
      losingHoldMinutes.push(holdMinutes);
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
  const profitFactor = totalLoss ? totalWin / totalLoss : totalWin > 0 ? totalWin : 0;
  const averageGainPerShare = wins ? totalPositivePerShare / wins : 0;
  const averageLossPerShare = losses ? totalNegativePerShare / losses : 0;
  const averageHoldMinutes = getTrimmedAverage(allHoldMinutes);
  const averageWinningHoldMinutes = getTrimmedAverage(winningHoldMinutes);
  const averageLosingHoldMinutes = getTrimmedAverage(losingHoldMinutes);

  const currentMarketDayKey = getLocalDayKey(new Date());
  const currentDayStart = startOfDay(new Date());
  const currentDayEnd = endOfDay(new Date());
  const currentWeekStart = startOfWeek(new Date());
  const currentMonthStart = startOfMonth(new Date());

  const totalMonthPnl = processedTrades.reduce(
    (sum, item) =>
      item.entryDate >= currentMonthStart && item.entryDate <= currentDayEnd ? sum + item.pnl : sum,
    0
  );
  const totalWeekPnl = processedTrades.reduce(
    (sum, item) =>
      item.entryDate >= currentWeekStart && item.entryDate <= currentDayEnd ? sum + item.pnl : sum,
    0
  );
  const totalTodayPnl = processedTrades.reduce(
    (sum, item) =>
      getLocalDayKey(item.entryDate) === currentMarketDayKey ? sum + item.pnl : sum,
    0
  );

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const dayKey = shiftDayKey(currentMarketDayKey, index - 6);
    const stats = dailyMap.get(dayKey);

    return {
      date: dayKey,
      label: formatDayKeyLabel(dayKey, { month: "short", day: "numeric" }),
      weekday: formatDayKeyLabel(dayKey, { weekday: "short" }),
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
    const dayKey = shiftDayKey(currentMarketDayKey, index - 29);
    const stats = dailyMap.get(dayKey);
    const trades = stats?.trades || 0;
    const winsForDay = stats?.wins || 0;

    return {
      date: dayKey,
      label: formatDayKeyLabel(dayKey, { month: "short", day: "numeric" }),
      winRate: trades ? Number(((winsForDay / trades) * 100).toFixed(2)) : 0
    };
  });

  const dailyVolumeThirtyDays = Array.from({ length: 30 }, (_, index) => {
    const dayKey = shiftDayKey(currentMarketDayKey, index - 29);
    const stats = dailyMap.get(dayKey);

    return {
      date: dayKey,
      label: formatDayKeyLabel(dayKey, { month: "short", day: "numeric" }),
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
      profitFactor,
      largestWin,
      largestLoss,
      averageHoldMinutes,
      averageWinningHoldMinutes,
      averageLosingHoldMinutes,
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
    grossDailyThirtyDays: buildLastThirtyDayPnl(processedTrades, currentMarketDayKey),
    winRateThirtyDays,
    dailyVolumeThirtyDays,
    pnlType,
    latestDateLabel: currentDayStart.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    })
  };
}
