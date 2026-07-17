import {
  getEffectiveTradeCosts,
  getTradeGrossPnl,
  getTradeNetPnl
} from "./tradePnl.js";

export const MARKET_TIME_ZONE = "America/New_York";

const HOLDING_BUCKETS = [
  { label: "Under 30 seconds", minSeconds: 0, maxSeconds: 30 },
  { label: "30-60 seconds", minSeconds: 30, maxSeconds: 60 },
  { label: "1-2 minutes", minSeconds: 60, maxSeconds: 120 },
  { label: "2-5 minutes", minSeconds: 120, maxSeconds: 300 },
  { label: "5-15 minutes", minSeconds: 300, maxSeconds: 900 },
  { label: "More than 15 minutes", minSeconds: 900, maxSeconds: Infinity }
];

const TRADE_NUMBER_BUCKETS = [
  { label: "Trades 1-3", min: 1, max: 3 },
  { label: "Trades 4-6", min: 4, max: 6 },
  { label: "Trades 7-10", min: 7, max: 10 },
  { label: "Trades 11+", min: 11, max: Infinity }
];

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  return finiteNumber(value) ?? 0;
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function getField(trade, keys) {
  for (const key of keys) {
    if (trade?.[key] !== undefined && trade?.[key] !== null && trade?.[key] !== "") {
      return trade[key];
    }
  }

  return null;
}

function getDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getMarketParts(date, timeZone = MARKET_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  });

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

export function getMarketDayKey(date, timeZone = MARKET_TIME_ZONE) {
  const parts = getMarketParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getWeekStartDate(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function getDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function getPeriodKey(date, mode) {
  const parts = getMarketParts(date, MARKET_TIME_ZONE);
  const marketDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12));

  if (mode === "weekly") {
    return getDateKey(getWeekStartDate(marketDate));
  }

  if (mode === "monthly") {
    return `${parts.year}-${parts.month}`;
  }

  return "ALL";
}

function getPeriodRange(mode, periodKey, sortedTrades) {
  if (mode === "weekly") {
    const start = new Date(`${periodKey}T00:00:00`);
    return { start, end: addDays(start, 7), previousStart: addDays(start, -7), previousEnd: start };
  }

  if (mode === "monthly") {
    const [year, month] = String(periodKey).split("-").map(Number);
    const start = new Date(year, month - 1, 1);
    const end = addMonths(start, 1);
    const previousStart = addMonths(start, -1);
    return { start, end, previousStart, previousEnd: start };
  }

  const first = sortedTrades[0]?.entryDate || new Date();
  const last = sortedTrades[sortedTrades.length - 1]?.entryDate || first;
  return { start: first, end: addDays(last, 1), previousStart: null, previousEnd: null };
}

function getPreviousPeriodKey(mode, periodKey) {
  if (mode === "weekly") {
    const start = new Date(`${periodKey}T12:00:00Z`);
    return getDateKey(addDays(start, -7));
  }

  if (mode === "monthly") {
    const [year, month] = String(periodKey).split("-").map(Number);
    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;
    return `${previousYear}-${String(previousMonth).padStart(2, "0")}`;
  }

  return null;
}

function inRange(item, start, end) {
  return item.entryDate >= start && item.entryDate < end;
}

function getRMultiple(trade, netPnl) {
  const risk = finiteNumber(
    getField(trade, ["plannedInitialRisk", "plannedRisk", "initialRisk", "riskAmount"])
  );

  if (!risk || risk <= 0) {
    return null;
  }

  return netPnl / risk;
}

function getExcursion(trade, kind) {
  const keys =
    kind === "mfe"
      ? ["mfe", "maxFavorableExcursion", "maximumFavorableExcursion", "mfeAmount"]
      : ["mae", "maxAdverseExcursion", "maximumAdverseExcursion", "maeAmount"];

  const value = finiteNumber(getField(trade, keys));
  return value === null ? null : Math.abs(value);
}

export function normalizeAdvancedTrades(trades, options = {}) {
  const defaultCommission = options.defaultCommission ?? 0;
  const defaultFees = options.defaultFees ?? 0;

  return (Array.isArray(trades) ? trades : [])
    .map((trade, sourceIndex) => {
      const entryDate = getDate(trade?.entryDate);
      if (!entryDate) {
        return null;
      }

      const exitDate = getDate(trade?.exitDate) || entryDate;
      const grossPnl = getTradeGrossPnl(trade);
      const netPnl = getTradeNetPnl(trade, defaultCommission, defaultFees);
      const costs = getEffectiveTradeCosts(trade, defaultCommission, defaultFees);
      const rMultiple = getRMultiple(trade, netPnl);
      const setup = String(trade?.setup || trade?.strategy || "Unclassified").trim() || "Unclassified";
      const symbol = String(trade?.symbol || "Unknown").toUpperCase();
      const side = String(trade?.side || "Unclassified").toUpperCase();
      const quantity = Math.abs(numberOrZero(trade?.quantity));
      const holdSeconds = Math.max(0, (exitDate.getTime() - entryDate.getTime()) / 1000);
      const dayKey = getMarketDayKey(entryDate, options.timeZone || MARKET_TIME_ZONE);
      const parts = getMarketParts(entryDate, options.timeZone || MARKET_TIME_ZONE);
      const mfe = getExcursion(trade, "mfe");
      const mae = getExcursion(trade, "mae");

      return {
        id: trade?.id || `trade-${sourceIndex}`,
        source: trade,
        sourceIndex,
        entryDate,
        exitDate,
        dayKey,
        weekday: parts.weekday,
        minutesFromMidnight: Number(parts.hour) * 60 + Number(parts.minute),
        grossPnl,
        netPnl,
        costs,
        rMultiple,
        setup,
        symbol,
        side,
        quantity,
        holdSeconds,
        mfe,
        mae,
        tags: String(trade?.tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        exitReason: String(getField(trade, ["exitReason", "exit_reason"]) || "Unclassified"),
        entryReason: String(getField(trade, ["entryReason", "entry_reason"]) || "Unclassified"),
        orderType: String(getField(trade, ["orderType", "order_type"]) || "Unclassified"),
        marketCondition: String(getField(trade, ["marketCondition", "market_condition"]) || "Unclassified"),
        ruleCompliance: String(getField(trade, ["ruleCompliance", "complianceCategory"]) || "Unclassified"),
        relativeVolume: finiteNumber(getField(trade, ["entryRelativeVolume", "relativeVolume"])),
        gapPercent: finiteNumber(getField(trade, ["entryPriorCloseDiffPercent", "gapPercent"]))
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.entryDate - right.entryDate || left.sourceIndex - right.sourceIndex);
}

export function average(values) {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (!numericValues.length) {
    return null;
  }
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

export function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) {
    return null;
  }

  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function nearestRankPercentile(values, percentile) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) {
    return null;
  }

  const index = Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarizeItems(items) {
  const wins = items.filter((item) => item.netPnl > 0);
  const losses = items.filter((item) => item.netPnl < 0);
  const scratches = items.filter((item) => item.netPnl === 0);
  const grossProfit = wins.reduce((sum, item) => sum + item.netPnl, 0);
  const grossLoss = losses.reduce((sum, item) => sum + item.netPnl, 0);
  const totalNetPnl = items.reduce((sum, item) => sum + item.netPnl, 0);
  const totalGrossPnl = items.reduce((sum, item) => sum + item.grossPnl, 0);
  const totalCosts = items.reduce((sum, item) => sum + item.costs, 0);
  const rValues = items.map((item) => item.rMultiple).filter((value) => value !== null);
  const winningRValues = items.filter((item) => item.rMultiple !== null && item.rMultiple > 0).map((item) => item.rMultiple);
  const losingRValues = items.filter((item) => item.rMultiple !== null && item.rMultiple < 0).map((item) => Math.abs(item.rMultiple));
  const averageWin = average(wins.map((item) => item.netPnl)) ?? 0;
  const averageLoss = average(losses.map((item) => Math.abs(item.netPnl))) ?? 0;
  const winRate = items.length ? wins.length / items.length : 0;
  const lossRate = items.length ? losses.length / items.length : 0;
  const expectancy = winRate * averageWin - lossRate * averageLoss;
  const averageWinningR = average(winningRValues) ?? 0;
  const averageLosingR = average(losingRValues) ?? 0;
  const winRateR = rValues.length ? winningRValues.length / rValues.length : 0;
  const lossRateR = rValues.length ? losingRValues.length / rValues.length : 0;

  return {
    tradeCount: items.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    breakevenTrades: scratches.length,
    totalNetPnl: round(totalNetPnl),
    totalGrossPnl: round(totalGrossPnl),
    totalCosts: round(totalCosts),
    grossProfit: round(grossProfit),
    grossLoss: round(grossLoss),
    totalNetR: rValues.length ? round(rValues.reduce((sum, value) => sum + value, 0)) : null,
    winRate: round(winRate * 100, 2),
    averageWinner: round(averageWin),
    averageLoser: round(-averageLoss),
    averageNetPnl: round(average(items.map((item) => item.netPnl)) ?? 0),
    medianNetPnl: round(median(items.map((item) => item.netPnl)) ?? 0),
    averageNetR: rValues.length ? round(average(rValues), 4) : null,
    medianNetR: rValues.length ? round(median(rValues), 4) : null,
    expectancy: round(expectancy),
    expectancyR: rValues.length ? round(winRateR * averageWinningR - lossRateR * averageLosingR, 4) : null,
    profitFactor: Math.abs(grossLoss) > 0 ? round(grossProfit / Math.abs(grossLoss), 4) : null,
    payoffRatio: averageLoss > 0 && averageWin > 0 ? round(averageWin / averageLoss, 4) : null,
    payoffRatioR: averageLosingR > 0 && averageWinningR > 0 ? round(averageWinningR / averageLosingR, 4) : null,
    costPerTrade: items.length ? round(totalCosts / items.length) : null
  };
}

function summarizeGroup(label, items) {
  return {
    label,
    ...summarizeItems(items),
    averagePnl: round(average(items.map((item) => item.netPnl)) ?? 0),
    averageR: items.some((item) => item.rMultiple !== null)
      ? round(average(items.map((item) => item.rMultiple).filter((value) => value !== null)) ?? 0, 4)
      : null,
    averageMfe: items.some((item) => item.mfe !== null)
      ? round(average(items.map((item) => item.mfe).filter((value) => value !== null)) ?? 0)
      : null,
    averageMae: items.some((item) => item.mae !== null)
      ? round(average(items.map((item) => item.mae).filter((value) => value !== null)) ?? 0)
      : null,
    mfeCapture: calculateMfeCapture(items).averageCapture
  };
}

function groupBy(items, getKey) {
  const map = new Map();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const key = getKey(item) || "Unclassified";
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  }
  return map;
}

function buildGroupedRows(items, getKey, sortKey = "expectancy") {
  return Array.from(groupBy(items, getKey).entries())
    .map(([label, groupItems]) => summarizeGroup(label, groupItems))
    .sort((left, right) => numberOrZero(right[sortKey]) - numberOrZero(left[sortKey]));
}

function getTimeOfDayBucket(item) {
  const minutes = item.minutesFromMidnight;
  const open = 9 * 60 + 30;
  const close = 16 * 60;

  if (minutes >= open && minutes < open + 5) return "Market open to +5m";
  if (minutes >= open + 5 && minutes < open + 15) return "+5m to +15m";
  if (minutes >= open + 15 && minutes < open + 30) return "+15m to +30m";
  if (minutes >= open + 30 && minutes < open + 60) return "+30m to +60m";
  if (minutes >= 11 * 60 && minutes < 15 * 60) return "Midday";
  if (minutes >= close - 60 && minutes < close) return "Final trading hour";
  return "Outside regular session";
}

function getHoldingBucket(item) {
  return HOLDING_BUCKETS.find((bucket) => item.holdSeconds >= bucket.minSeconds && item.holdSeconds < bucket.maxSeconds)?.label || "Unknown";
}

function getPositionSizeBucket(item) {
  if (item.quantity < 100) return "Under 100";
  if (item.quantity < 500) return "100-499";
  if (item.quantity < 1000) return "500-999";
  if (item.quantity < 2000) return "1,000-1,999";
  return "2,000+";
}

function getRelativeVolumeBucket(item) {
  if (item.relativeVolume === null) return "Unclassified";
  if (item.relativeVolume < 0.5) return "<0.5x";
  if (item.relativeVolume < 1) return "0.5x-0.99x";
  if (item.relativeVolume < 2) return "1x-1.99x";
  if (item.relativeVolume < 3) return "2x-2.99x";
  if (item.relativeVolume < 5) return "3x-4.99x";
  return "5x+";
}

function getGapSizeBucket(item) {
  if (item.gapPercent === null) return "Unclassified";
  const value = item.gapPercent;
  if (value < -10) return "<-10%";
  if (value < -5) return "-10% to -5%";
  if (value < -2) return "-5% to -2%";
  if (value < 2) return "-2% to 2%";
  if (value < 5) return "2% to 5%";
  if (value < 10) return "5% to 10%";
  return ">10%";
}

function getRollingExpectancy(items, windowSize) {
  if (items.length < windowSize) {
    return [];
  }

  const rows = [];
  for (let index = windowSize - 1; index < items.length; index += 1) {
    const windowItems = items.slice(index - windowSize + 1, index + 1);
    const summary = summarizeItems(windowItems);
    rows.push({
      tradeNumber: index + 1,
      label: `#${index + 1}`,
      currency: summary.expectancy,
      rMultiple: summary.expectancyR,
      sampleSize: windowSize
    });
  }
  return rows;
}

function buildHistogram(values, bucketCount = 8) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) {
    return [];
  }

  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  if (min === max) {
    return [{ label: String(round(min, 2)), count: numeric.length, min, max }];
  }

  const width = (max - min) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    min: min + width * index,
    max: index === bucketCount - 1 ? max : min + width * (index + 1),
    count: 0
  }));

  for (const value of numeric) {
    const index = Math.min(bucketCount - 1, Math.floor((value - min) / width));
    buckets[index].count += 1;
  }

  return buckets.map((bucket) => ({
    ...bucket,
    label: `${round(bucket.min, 2)} to ${round(bucket.max, 2)}`
  }));
}

function calculateMfeCapture(items) {
  const captures = items
    .filter((item) => item.netPnl > 0 && item.mfe && item.mfe > 0)
    .map((item) => ({
      item,
      value: item.netPnl / item.mfe,
      extreme: item.netPnl / item.mfe > 1.5
    }));

  return {
    sampleSize: captures.length,
    averageCapture: captures.length ? round((average(captures.map((entry) => Math.min(entry.value, 1.5))) ?? 0) * 100, 2) : null,
    medianCapture: captures.length ? round((median(captures.map((entry) => Math.min(entry.value, 1.5))) ?? 0) * 100, 2) : null,
    extremeCount: captures.filter((entry) => entry.extreme).length
  };
}

function calculateGiveback(items) {
  const rows = items
    .filter((item) => item.mfe && item.mfe > 0)
    .map((item) => ({
      giveback: item.mfe - item.netPnl,
      percent: (item.mfe - item.netPnl) / item.mfe
    }));

  return {
    sampleSize: rows.length,
    averageGiveback: rows.length ? round(average(rows.map((row) => row.giveback)) ?? 0) : null,
    medianGiveback: rows.length ? round(median(rows.map((row) => row.giveback)) ?? 0) : null,
    averageGivebackPercent: rows.length ? round((average(rows.map((row) => row.percent)) ?? 0) * 100, 2) : null
  };
}

function calculateExcursions(items) {
  const mfeValues = items.map((item) => item.mfe).filter((value) => value !== null);
  const maeValues = items.map((item) => item.mae).filter((value) => value !== null);
  const winnerMaeValues = items
    .filter((item) => item.netPnl > 0 && item.mae !== null)
    .map((item) => item.mae);
  const mfeCapture = calculateMfeCapture(items);
  const giveback = calculateGiveback(items);
  const averageMfe = average(mfeValues);
  const averageMae = average(maeValues);

  return {
    available: mfeValues.length > 0 || maeValues.length > 0,
    mfeSampleSize: mfeValues.length,
    maeSampleSize: maeValues.length,
    averageMfe: averageMfe === null ? null : round(averageMfe),
    medianMfe: round(median(mfeValues) ?? NaN),
    averageMae: averageMae === null ? null : round(averageMae),
    medianMae: round(median(maeValues) ?? NaN),
    edgeRatio: averageMfe !== null && averageMae ? round(averageMfe / Math.abs(averageMae), 4) : null,
    mfeHistogram: buildHistogram(mfeValues),
    maeHistogram: buildHistogram(maeValues),
    mfeScatter: items.filter((item) => item.mfe !== null).map((item) => ({ x: round(item.mfe), y: item.netPnl, symbol: item.symbol })),
    maeScatter: items.filter((item) => item.mae !== null).map((item) => ({ x: round(item.mae), y: item.netPnl, symbol: item.symbol })),
    mfeCapture,
    captureBySetup: buildGroupedRows(items.filter((item) => item.mfe !== null), (item) => item.setup, "mfeCapture"),
    captureByExitReason: buildGroupedRows(items.filter((item) => item.mfe !== null), (item) => item.exitReason, "mfeCapture"),
    captureByHoldingTime: buildGroupedRows(items.filter((item) => item.mfe !== null), getHoldingBucket, "mfeCapture"),
    giveback,
    givebackBySetup: buildGroupedRows(items.filter((item) => item.mfe !== null), (item) => item.setup, "averagePnl"),
    givebackByExitReason: buildGroupedRows(items.filter((item) => item.mfe !== null), (item) => item.exitReason, "averagePnl"),
    winnerMae: {
      sampleSize: winnerMaeValues.length,
      median: round(median(winnerMaeValues) ?? NaN),
      p75: round(nearestRankPercentile(winnerMaeValues, 75) ?? NaN),
      p90: round(nearestRankPercentile(winnerMaeValues, 90) ?? NaN),
      max: winnerMaeValues.length ? round(Math.max(...winnerMaeValues)) : null,
      histogram: buildHistogram(winnerMaeValues)
    }
  };
}

function calculateTradingCostDrag(items) {
  const grossProfit = items.filter((item) => item.grossPnl > 0).reduce((sum, item) => sum + item.grossPnl, 0);
  const totalCosts = items.reduce((sum, item) => sum + item.costs, 0);
  const grossSummary = summarizeItems(items.map((item) => ({ ...item, netPnl: item.grossPnl })));
  const netSummary = summarizeItems(items);

  return {
    grossProfit: round(grossProfit),
    totalCosts: round(totalCosts),
    costPerTrade: items.length ? round(totalCosts / items.length) : null,
    costDragPercent: grossProfit > 0 ? round((totalCosts / grossProfit) * 100, 2) : null,
    costsAsGrossPnlPercent: grossSummary.totalGrossPnl > 0 ? round((totalCosts / grossSummary.totalGrossPnl) * 100, 2) : null,
    grossExpectancy: grossSummary.expectancy,
    netExpectancy: netSummary.expectancy,
    expectancyDifference: round((grossSummary.expectancy || 0) - (netSummary.expectancy || 0)),
    percentageMeaningful: grossProfit > 0
  };
}

function calculateSessionGiveback(items) {
  const sessions = Array.from(groupBy(items, (item) => item.dayKey).entries()).map(([dayKey, trades]) => {
    let running = 0;
    let peak = 0;
    for (const trade of trades) {
      running += trade.netPnl;
      peak = Math.max(peak, running);
    }
    const finalPnl = running;
    const giveback = Math.max(0, peak - finalPnl);
    return {
      dayKey,
      tradeCount: trades.length,
      peakPnl: round(peak),
      closingPnl: round(finalPnl),
      giveback: round(giveback),
      givebackPercent: peak > 0 ? round((giveback / peak) * 100, 2) : null
    };
  });

  return {
    averageGiveback: round(average(sessions.map((session) => session.giveback)) ?? 0),
    medianGiveback: round(median(sessions.map((session) => session.giveback)) ?? 0),
    largestGiveback: sessions.length ? round(Math.max(...sessions.map((session) => session.giveback))) : 0,
    averageGivebackPercent: round(average(sessions.map((session) => session.givebackPercent).filter((value) => value !== null)) ?? 0, 2),
    chart: sessions.map((session) => ({ label: session.dayKey, peakPnl: session.peakPnl, closingPnl: session.closingPnl })),
    largestSessions: [...sessions].sort((left, right) => right.giveback - left.giveback).slice(0, 8)
  };
}

function calculateTradeNumberPerformance(items) {
  const rows = [];
  for (const [, sessionTrades] of groupBy(items, (item) => item.dayKey)) {
    sessionTrades.forEach((trade, index) => {
      const sequence = index + 1;
      const bucket = TRADE_NUMBER_BUCKETS.find((candidate) => sequence >= candidate.min && sequence <= candidate.max);
      rows.push({ ...trade, sequenceBucket: bucket?.label || "Unknown" });
    });
  }

  return buildGroupedRows(rows, (item) => item.sequenceBucket, "tradeCount");
}

function calculateAfterLosses(items) {
  const rows = [];
  for (const [, sessionTrades] of groupBy(items, (item) => item.dayKey)) {
    let lossStreak = 0;
    let largestLoss = Math.min(0, ...sessionTrades.map((item) => item.netPnl));
    let afterLargestLoss = false;

    for (const trade of sessionTrades) {
      let label = null;
      if (afterLargestLoss) label = "After largest loss of session";
      else if (lossStreak >= 3) label = "After 3+ consecutive losses";
      else if (lossStreak === 2) label = "After 2 consecutive losses";
      else if (lossStreak === 1) label = "After 1 losing trade";

      if (label) {
        rows.push({ ...trade, afterLossBucket: label });
      }

      afterLargestLoss = trade.netPnl === largestLoss && largestLoss < 0;
      if (trade.netPnl < 0) lossStreak += 1;
      else lossStreak = 0;
    }
  }

  return buildGroupedRows(rows, (item) => item.afterLossBucket, "tradeCount").map((row) => ({
    ...row,
    averagePositionSize: round(average(rows.filter((item) => item.afterLossBucket === row.label).map((item) => item.quantity)) ?? 0),
    averageLoss: row.averageLoser
  }));
}

function calculateDrawdown(items) {
  let running = 0;
  let peak = 0;
  let currentDrawdownStart = null;
  let maxDrawdown = 0;
  let maxDrawdownR = 0;
  let maxDurationTrades = 0;
  let maxDurationDays = 0;
  let longestRecoveryTrades = 0;
  const curve = [];
  let currentDurationTrades = 0;
  let currentRecoveryTrades = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    running += item.netPnl;
    if (running >= peak) {
      peak = running;
      if (currentDrawdownStart) {
        longestRecoveryTrades = Math.max(longestRecoveryTrades, currentRecoveryTrades);
      }
      currentDrawdownStart = null;
      currentDurationTrades = 0;
      currentRecoveryTrades = 0;
    } else {
      if (!currentDrawdownStart) {
        currentDrawdownStart = item.entryDate;
        currentDurationTrades = 0;
        currentRecoveryTrades = 0;
      }
      currentDurationTrades += 1;
      currentRecoveryTrades += 1;
      const durationDays = Math.max(0, (item.entryDate - currentDrawdownStart) / 86400000);
      maxDurationTrades = Math.max(maxDurationTrades, currentDurationTrades);
      maxDurationDays = Math.max(maxDurationDays, durationDays);
    }

    const drawdown = Math.max(0, peak - running);
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      const rAtPoint = item.rMultiple === null ? null : Math.abs(item.rMultiple);
      maxDrawdownR = rAtPoint || maxDrawdownR;
    }

    curve.push({
      label: `${index + 1}`,
      tradeNumber: index + 1,
      equity: round(running),
      drawdown: round(-drawdown)
    });
  }

  const currentDrawdown = curve.length ? Math.abs(curve[curve.length - 1].drawdown || 0) : 0;
  return {
    currentDrawdown: round(currentDrawdown),
    maxDrawdown: round(maxDrawdown),
    maxDrawdownR: maxDrawdownR ? round(maxDrawdownR, 4) : null,
    drawdownDurationTrades: maxDurationTrades,
    drawdownDurationDays: round(maxDurationDays, 1),
    longestRecoveryPeriod: longestRecoveryTrades,
    tradesRequiredToRecover: longestRecoveryTrades,
    underwaterCurve: curve
  };
}

function calculateLosingStreaks(items) {
  const lengths = [];
  const afterStreakRows = [];
  let current = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.netPnl < 0) {
      current += 1;
    } else {
      if (current > 0) {
        lengths.push(current);
        if (item) {
          afterStreakRows.push({ ...item, streakLength: current >= 3 ? "After 3+ loss streak" : `After ${current} loss streak` });
        }
      }
      current = 0;
    }
  }
  if (current > 0) lengths.push(current);

  let currentLosingStreak = 0;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].netPnl < 0) {
      currentLosingStreak += 1;
    } else {
      break;
    }
  }
  const distributionMap = new Map();
  lengths.forEach((length) => distributionMap.set(String(length), (distributionMap.get(String(length)) || 0) + 1));

  return {
    currentLosingStreak,
    longestLosingStreak: lengths.length ? Math.max(...lengths) : 0,
    averageLosingStreak: round(average(lengths) ?? 0, 2),
    distribution: Array.from(distributionMap.entries()).map(([label, count]) => ({ label, count })),
    afterStreakPerformance: buildGroupedRows(afterStreakRows, (item) => item.streakLength, "tradeCount")
  };
}

function calculateTailLoss(items) {
  const losses = items.filter((item) => item.netPnl < 0).map((item) => item.netPnl).sort((a, b) => a - b);
  const absoluteLosses = losses.map(Math.abs).sort((a, b) => a - b);
  const fiveLargest = losses.slice(0, 5);
  const totalLosses = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  const rLosses = items.filter((item) => item.rMultiple !== null && item.rMultiple < 0).map((item) => item.rMultiple);

  return {
    largestLoss: losses.length ? round(losses[0]) : null,
    medianLosingTrade: round(median(losses) ?? NaN),
    p90LosingTrade: absoluteLosses.length ? round(-nearestRankPercentile(absoluteLosses, 90)) : null,
    p95LosingTrade: absoluteLosses.length ? round(-nearestRankPercentile(absoluteLosses, 95)) : null,
    averageFiveLargestLosses: fiveLargest.length ? round(average(fiveLargest) ?? 0) : null,
    topFiveLossSharePercent: totalLosses > 0 ? round((Math.abs(fiveLargest.reduce((sum, value) => sum + value, 0)) / totalLosses) * 100, 2) : null,
    losingMoreThanOneRPercent: rLosses.length ? round((rLosses.filter((value) => value < -1).length / rLosses.length) * 100, 2) : null,
    exceedingPlannedRiskPercent: rLosses.length ? round((rLosses.filter((value) => value < -1).length / rLosses.length) * 100, 2) : null,
    percentileMethod: "Nearest-rank percentile on absolute losing-trade magnitudes."
  };
}

function calculateSetupContribution(items) {
  return Array.from(groupBy(items, (item) => item.setup).entries())
    .map(([label, groupItems]) => {
      const summary = summarizeItems(groupItems);
      return {
        label,
        totalNetPnl: summary.totalNetPnl,
        totalGrossProfit: summary.grossProfit,
        totalGrossLoss: summary.grossLoss,
        totalNetR: summary.totalNetR,
        tradeCount: summary.tradeCount
      };
    })
    .sort((left, right) => Math.abs(right.totalNetPnl || 0) - Math.abs(left.totalNetPnl || 0));
}

function calculateConcentration(items) {
  const winners = items.filter((item) => item.netPnl > 0).sort((a, b) => b.netPnl - a.netPnl);
  const losses = items.filter((item) => item.netPnl < 0).sort((a, b) => a.netPnl - b.netPnl);
  const totalProfit = winners.reduce((sum, item) => sum + item.netPnl, 0);
  const totalLoss = Math.abs(losses.reduce((sum, item) => sum + item.netPnl, 0));
  const setupRows = buildGroupedRows(items, (item) => item.setup, "totalNetPnl");
  const symbolRows = buildGroupedRows(items, (item) => item.symbol, "totalNetPnl");
  const volumeBySymbol = Array.from(groupBy(items, (item) => item.symbol).entries()).map(([label, rows]) => ({
    label,
    volume: rows.reduce((sum, item) => sum + item.quantity, 0)
  }));
  const totalVolume = volumeBySymbol.reduce((sum, row) => sum + row.volume, 0);
  const bestSetup = setupRows.reduce((best, row) => (Math.abs(row.totalNetPnl || 0) > Math.abs(best?.totalNetPnl || 0) ? row : best), null);
  const bestSymbol = symbolRows.reduce((best, row) => (Math.abs(row.totalNetPnl || 0) > Math.abs(best?.totalNetPnl || 0) ? row : best), null);
  const topVolumeSymbol = volumeBySymbol.sort((a, b) => b.volume - a.volume)[0];
  const totalNetPnlAbs = Math.abs(items.reduce((sum, item) => sum + item.netPnl, 0));

  return {
    topFiveWinningTradeProfitPercent: totalProfit > 0 ? round((winners.slice(0, 5).reduce((sum, item) => sum + item.netPnl, 0) / totalProfit) * 100, 2) : null,
    topFiveLosingTradeLossPercent: totalLoss > 0 ? round((Math.abs(losses.slice(0, 5).reduce((sum, item) => sum + item.netPnl, 0)) / totalLoss) * 100, 2) : null,
    bestSetupPnlPercent: totalNetPnlAbs > 0 && bestSetup ? round((Math.abs(bestSetup.totalNetPnl || 0) / totalNetPnlAbs) * 100, 2) : null,
    bestSetup: bestSetup?.label || null,
    bestSymbolPnlPercent: totalNetPnlAbs > 0 && bestSymbol ? round((Math.abs(bestSymbol.totalNetPnl || 0) / totalNetPnlAbs) * 100, 2) : null,
    bestSymbol: bestSymbol?.label || null,
    mostTradedSymbolVolumePercent: totalVolume > 0 && topVolumeSymbol ? round((topVolumeSymbol.volume / totalVolume) * 100, 2) : null,
    mostTradedSymbol: topVolumeSymbol?.label || null
  };
}

export const CONDITIONAL_DIMENSIONS = [
  { key: "setup", label: "Setup", getKey: (item) => item.setup },
  { key: "symbol", label: "Symbol", getKey: (item) => item.symbol },
  { key: "direction", label: "Direction", getKey: (item) => item.side },
  { key: "timeOfDay", label: "Time of day", getKey: getTimeOfDayBucket },
  { key: "dayOfWeek", label: "Day of week", getKey: (item) => item.weekday },
  { key: "holdingTime", label: "Holding-time bucket", getKey: getHoldingBucket },
  { key: "positionSize", label: "Position-size bucket", getKey: getPositionSizeBucket },
  { key: "exitReason", label: "Exit reason", getKey: (item) => item.exitReason },
  { key: "entryReason", label: "Entry reason", getKey: (item) => item.entryReason },
  { key: "orderType", label: "Order type", getKey: (item) => item.orderType },
  { key: "marketCondition", label: "Market condition", getKey: (item) => item.marketCondition },
  { key: "relativeVolume", label: "Relative-volume bucket", getKey: getRelativeVolumeBucket },
  { key: "gapSize", label: "Gap-size bucket", getKey: getGapSizeBucket },
  { key: "longShort", label: "Long versus short", getKey: (item) => item.side },
  { key: "ruleCompliance", label: "Rule-compliance category", getKey: (item) => item.ruleCompliance },
  { key: "tag", label: "Trade tag", getKey: (item) => item.tags[0] || "Unclassified" }
];

function calculateConditionalExplorer(items, dimensionKey, minimumSample = 10) {
  const dimension = CONDITIONAL_DIMENSIONS.find((entry) => entry.key === dimensionKey) || CONDITIONAL_DIMENSIONS[0];
  const rows =
    dimension.key === "tag"
      ? Array.from(
          items.reduce((map, item) => {
            const tags = item.tags.length ? item.tags : ["Unclassified"];
            tags.forEach((tag) => {
              if (!map.has(tag)) map.set(tag, []);
              map.get(tag).push(item);
            });
            return map;
          }, new Map())
        ).map(([label, groupItems]) => summarizeGroup(label, groupItems))
      : Array.from(groupBy(items, dimension.getKey).entries()).map(([label, groupItems]) => summarizeGroup(label, groupItems));

  return rows
    .filter((row) => row.tradeCount >= minimumSample)
    .sort((left, right) => (right.expectancy || 0) - (left.expectancy || 0));
}

function calculateAvailablePeriods(items, mode) {
  if (mode === "total") return [{ key: "ALL", label: "All time" }];
  const keys = [...new Set(items.map((item) => getPeriodKey(item.entryDate, mode)))].sort();
  return keys.map((key) => ({ key, label: mode === "weekly" ? `Week of ${key}` : key }));
}

function calculateTrailingPeriodAverage(items, mode, selectedKey, count) {
  if (mode === "total") return null;
  const selectedRange = getPeriodRange(mode, selectedKey, items);
  const periodSummaries = [];
  for (let offset = 1; offset <= count; offset += 1) {
    const start = mode === "weekly" ? addDays(selectedRange.start, -7 * offset) : addMonths(selectedRange.start, -offset);
    const end = mode === "weekly" ? addDays(start, 7) : addMonths(start, 1);
    const rows = items.filter((item) => inRange(item, start, end));
    if (rows.length) {
      periodSummaries.push(summarizeItems(rows).expectancy);
    }
  }
  return periodSummaries.length ? round(average(periodSummaries) ?? 0) : null;
}

export function buildAdvancedAnalytics(rawTrades, options = {}) {
  const allItems = normalizeAdvancedTrades(rawTrades, options);
  const mode = options.mode || "total";
  const availablePeriods = calculateAvailablePeriods(allItems, mode);
  const selectedPeriodKey =
    mode === "total" ? "ALL" : options.periodKey || availablePeriods[availablePeriods.length - 1]?.key || "";
  const range = getPeriodRange(mode, selectedPeriodKey, allItems);
  const previousPeriodKey = getPreviousPeriodKey(mode, selectedPeriodKey);
  const currentItems =
    mode === "total"
      ? allItems
      : allItems.filter((item) => getPeriodKey(item.entryDate, mode) === selectedPeriodKey);
  const previousItems =
    mode === "total" || !previousPeriodKey
      ? []
      : allItems.filter((item) => getPeriodKey(item.entryDate, mode) === previousPeriodKey);
  const summary = summarizeItems(currentItems);
  const previousSummary = summarizeItems(previousItems);
  const excursions = calculateExcursions(currentItems);
  const missing = [];

  if (!currentItems.some((item) => item.rMultiple !== null)) missing.push("Planned initial risk is not recorded, so R-multiple metrics are unavailable.");
  if (!excursions.available) missing.push("MFE and MAE are not recorded for these trades.");
  if (!currentItems.some((item) => item.source?.intendedEntryPrice || item.source?.signalPrice || item.source?.decisionPrice)) {
    missing.push("Reference prices for entry and exit slippage are not recorded.");
  }
  if (!currentItems.some((item) => item.ruleCompliance && item.ruleCompliance !== "Unclassified")) {
    missing.push("Rule-compliance classifications are not recorded.");
  }

  return {
    mode,
    selectedPeriodKey,
    availablePeriods,
    timeZone: options.timeZone || MARKET_TIME_ZONE,
    allTradeCount: allItems.length,
    trades: currentItems,
    previousTrades: previousItems,
    summary,
    previousSummary,
    comparisons: {
      expectancyChange: previousSummary.tradeCount ? round((summary.expectancy || 0) - (previousSummary.expectancy || 0)) : null,
      expectancyPercentChange:
        previousSummary.tradeCount && previousSummary.expectancy
          ? round((((summary.expectancy || 0) - previousSummary.expectancy) / Math.abs(previousSummary.expectancy)) * 100, 2)
          : null,
      trailingFourWeekExpectancy: mode === "weekly" ? calculateTrailingPeriodAverage(allItems, mode, selectedPeriodKey, 4) : null,
      trailingThreeMonthExpectancy: mode === "monthly" ? calculateTrailingPeriodAverage(allItems, mode, selectedPeriodKey, 3) : null,
      trailingSixMonthExpectancy: mode === "monthly" ? calculateTrailingPeriodAverage(allItems, mode, selectedPeriodKey, 6) : null
    },
    rollingExpectancy: {
      20: getRollingExpectancy(currentItems, 20),
      50: getRollingExpectancy(currentItems, 50),
      100: getRollingExpectancy(currentItems, 100)
    },
    expectancyBySetup: buildGroupedRows(currentItems, (item) => item.setup, "expectancy"),
    expectancyByTimeOfDay: buildGroupedRows(currentItems, getTimeOfDayBucket, "expectancy"),
    holdingTimePerformance: buildGroupedRows(currentItems, getHoldingBucket, "tradeCount"),
    tradingCostDrag: calculateTradingCostDrag(currentItems),
    excursions,
    sessionGiveback: calculateSessionGiveback(currentItems),
    tradeNumberPerformance: calculateTradeNumberPerformance(currentItems),
    performanceAfterLosses: calculateAfterLosses(currentItems),
    tailLoss: calculateTailLoss(currentItems),
    drawdown: calculateDrawdown(currentItems),
    losingStreaks: calculateLosingStreaks(currentItems),
    setupContribution: calculateSetupContribution(currentItems),
    concentration: calculateConcentration(currentItems),
    conditionalExplorer: calculateConditionalExplorer(
      currentItems,
      options.conditionalDimension || "setup",
      options.minimumSample ?? 10
    ),
    dataQualityNotices: missing
  };
}

export const __advancedAnalyticsInternals = {
  summarizeItems,
  getTimeOfDayBucket,
  getHoldingBucket,
  calculateDrawdown,
  calculateTailLoss
};
