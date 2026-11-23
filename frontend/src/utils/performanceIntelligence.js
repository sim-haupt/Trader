export const MARKET_FACTORS = [
  ["gap", "Entry vs prior close", "%"],
  ["premarketGap", "Premarket gap at entry", "%"],
  ["price", "Share price", "$"],
  ["premarketVolume", "Premarket shares", "shares"],
  ["relativeVolume", "Same-time relative volume", "×"],
  ["float", "Historical float", "shares"],
  ["spread", "Entry bid/ask spread", "$/share"],
  ["rangePercent", "Session price range", "%"],
  ["atrPercent", "14-session ATR", "%"],
  ["vwapDistance", "Distance from VWAP", "%"],
  ["ema9Distance", "Distance from EMA 9", "%"],
  ["ema20Distance", "Distance from EMA 20", "%"],
  ["rsi", "1-minute RSI (14)", ""],
  ["macd", "1-minute MACD", ""],
  ["benchmarkReturn", "SPY vs prior close", "%"],
  ["benchmarkRangePercent", "SPY recent true range", "%"]
];

const finite = (value) => value != null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const available = (values) => values.filter(Number.isFinite);
const difference = (price, reference, sign) => price !== null && reference !== null ? (price - reference) * sign : null;

export function getExecutionFacts(trade) {
  const direction = trade.side === "SHORT" ? -1 : 1;
  const enteredAction = direction > 0 ? "BUY" : "SELL";
  const fills = (trade.executions || []).filter((fill) => fill.source === "IMPORTED");
  const entryFills = fills.filter(({ action }) => action === enteredAction);
  const exitFills = fills.filter(({ action }) => action !== enteredAction);
  const first = entryFills[0];
  const last = exitFills.at(-1);
  const review = trade.entryReview;
  const analysis = trade.analysis;
  const execution = analysis?.execution;
  const quote = execution?.quote ?? review?.outcome?.quote;
  const midpoint = (row) => row && row.bid > 0 && row.ask >= row.bid ? (Number(row.bid) + Number(row.ask)) / 2 : null;
  const stopFill = exitFills.find(({ id }) => id === analysis?.stopExecutionId);
  const plannedStop = finite(review?.plannedStop);

  return {
    first, last, stopFill, entryFills, exitFills,
    reportedFills: finite(trade.reportedExecutionCount),
    hasImportedFills: Boolean(fills.length), plannedStop,
    entrySlippage: difference(finite(first?.price), finite(review?.intendedPrice), direction),
    exitSlippage: difference(finite(last?.price), finite(analysis?.intendedExit), -direction),
    stopSlippage: difference(finite(stopFill?.price), plannedStop, -direction),
    entryVsMidpoint: difference(finite(first?.price), midpoint(quote), direction),
    exitVsMidpoint: difference(finite(last?.price), midpoint(execution?.exitQuote), -direction),
    entryEfficiency: finite(execution?.entryEfficiency),
    exitEfficiency: finite(execution?.exitEfficiency),
    grossMfe: finite(execution?.mfe ?? review?.outcome?.mfe ?? trade.mfe),
    grossMae: finite(execution?.mae ?? review?.outcome?.mae ?? trade.mae)
  };
}

function normalTail(z) {
  const t = 1 / (1 + 0.2316419 * z);
  return 0.3989422804014327 * Math.exp(-z * z / 2) * t *
    (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
}

function pearson(points) {
  const averageX = mean(points.map(([x]) => x));
  const averageY = mean(points.map(([, y]) => y));
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const [x, y] of points) {
    xx += (x - averageX) ** 2;
    yy += (y - averageY) ** 2;
    xy += (x - averageX) * (y - averageY);
  }
  return xx > 0 && yy > 0 ? Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) : null;
}

export function buildMarketAssociations(trades, groupBy) {
  const rows = MARKET_FACTORS.map(([key, label, unit]) => {
    const availableTrades = trades.filter((trade) => Number.isFinite(trade.factors[key]));
    const pairs = Array.from(groupBy(availableTrades, (trade) => trade.dayKey).values()).map((session) => [
      mean(session.map((trade) => trade.factors[key])),
      mean(session.map((trade) => trade.netPnl))
    ]);
    const correlation = pairs.length >= 20 ? pearson(pairs) : null;
    const p = correlation === null ? null : Math.min(1, 2 * normalTail(Math.abs(Math.atanh(correlation)) * Math.sqrt(pairs.length - 3)));
    return { key, label, unit, count: availableTrades.length, sessions: pairs.length, correlation, p, adjustedP: null };
  });
  let previous = 0;
  const tested = rows.filter((row) => row.p !== null).sort((a, b) => a.p - b.p);
  tested.forEach((row, index) => {
    previous = Math.max(previous, Math.min(1, row.p * (tested.length - index)));
    row.adjustedP = previous;
  });
  return rows;
}

export function getMarketFactors(trade, spread) {
  const snapshot = trade.analysis?.snapshot;
  return {
    ...snapshot,
    gap: finite(trade.entryPriorCloseDiffPercent ?? trade.gapPercent),
    price: finite(snapshot ? snapshot.price : trade.entryPrice),
    float: finite(trade.instrumentFloat),
    spread
  };
}

export function buildTimeCells(trades, interval, groupBy, summarize) {
  const groups = groupBy(trades, (trade) => `${trade.weekday}:${Math.floor((trade.minutesFromMidnight - 570) / interval) * interval + 570}`);
  return Array.from(groups, ([key, items]) => {
    const [weekday, minute] = key.split(":");
    const summary = summarize(key, items);
    return { ...summary, weekday, minute: Number(minute), trades: items.map(({ id, symbol, netPnl }) => ({ id, symbol, netPnl })) };
  }).sort((a, b) => a.minute - b.minute);
}

export function calculateConsistency(items, groupBy, closeDayKey) {
  const sessions = Array.from(groupBy(items, closeDayKey).values()).map((rows) =>
    rows.reduce((sum, row) => sum + row.netPnl, 0)
  );
  const avgSession = mean(sessions);
  const std = sessions.length >= 2
    ? Math.sqrt(sessions.reduce((sum, value) => sum + (value - avgSession) ** 2, 0) / (sessions.length - 1))
    : null;
  const downside = sessions.length >= 2 && sessions.some((value) => value < 0)
    ? Math.sqrt(mean(sessions.map((value) => Math.min(value, 0) ** 2))) : null;
  return {
    sessions: sessions.length,
    profitableSessionRate: sessions.length ? sessions.filter((value) => value > 0).length / sessions.length * 100 : null,
    sessionVolatility: std,
    sessionProfitToVolatility: std > 0 ? avgSession / std : null,
    sessionProfitToDownside: downside > 0 ? avgSession / downside : null
  };
}

export function summarizeExecution(items) {
  const keys = ["entrySlippage", "exitSlippage", "stopSlippage", "entryVsMidpoint", "exitVsMidpoint", "entryEfficiency", "exitEfficiency"];
  const summary = Object.fromEntries(keys.map((key) => {
    const samples = available(items.map((item) => item.executionFacts[key]));
    return [key, { value: mean(samples), count: samples.length }];
  }));
  const fills = items.filter((item) => item.executionFacts.hasImportedFills);
  return {
    ...summary,
    fillCoverage: fills.length,
    combinedFillCount: fills.reduce((sum, item) => sum + item.executionFacts.entryFills.length + item.executionFacts.exitFills.length, 0),
    multipleFills: fills.filter((item) => item.executionFacts.entryFills.length > 1 || item.executionFacts.exitFills.length > 1).length,
    commissions: items.reduce((sum, item) => sum + (finite(item.source.commissions) ?? 0), 0),
    fees: items.reduce((sum, item) => sum + (finite(item.source.fees) ?? 0), 0)
  };
}
