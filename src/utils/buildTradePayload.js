const calculateTradeMetrics = require("./calculateTradeMetrics");
const parseNewYorkLocalDateTime = require("./parseMarketDateTime");

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? null : numericValue;
}

function buildTradePayload(data, userId) {
  const metrics = calculateTradeMetrics(data);
  const fees = toNumber(data.fees) ?? 0;
  const providedGrossPnl = toNumber(data.grossPnl);
  const providedNetPnl = toNumber(data.netPnl);
  const grossPnl = providedGrossPnl ?? metrics.grossPnl;
  const netPnl =
    providedNetPnl ??
    (grossPnl !== null ? Number((grossPnl - fees).toFixed(4)) : metrics.netPnl);
  const reportedExecutionCount = toNumber(data.reportedExecutionCount);
  const entryVolume = toNumber(data.entryVolume);
  const entryRelativeVolume = toNumber(data.entryRelativeVolume);
  const instrumentFloat = toNumber(data.instrumentFloat);
  const entryPriorCloseDiffPercent = toNumber(data.entryPriorCloseDiffPercent);

  return {
    userId,
    symbol: data.symbol.toUpperCase(),
    side: data.side,
    quantity: data.quantity,
    entryPrice: data.entryPrice,
    exitPrice: data.exitPrice ?? null,
    entryDate: parseNewYorkLocalDateTime(data.entryDate),
    exitDate: data.exitDate ? parseNewYorkLocalDateTime(data.exitDate) : null,
    fees,
    strategy: typeof data.strategy === "string" ? data.strategy.trim() || null : data.strategy ?? null,
    tags: data.tags ?? null,
    notes: data.notes ?? null,
    grossPnl,
    netPnl,
    entryVolume,
    entryRelativeVolume,
    instrumentFloat,
    entryPriorCloseDiffPercent,
    reportedExecutionCount:
      reportedExecutionCount === null ? null : Math.max(0, Math.round(reportedExecutionCount))
  };
}

module.exports = buildTradePayload;
