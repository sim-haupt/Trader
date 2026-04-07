const calculateTradeMetrics = require("./calculateTradeMetrics");

function buildTradePayload(data, userId) {
  const metrics = calculateTradeMetrics(data);

  return {
    userId,
    symbol: data.symbol.toUpperCase(),
    side: data.side,
    quantity: data.quantity,
    entryPrice: data.entryPrice,
    exitPrice: data.exitPrice ?? null,
    entryDate: new Date(data.entryDate),
    exitDate: data.exitDate ? new Date(data.exitDate) : null,
    fees: data.fees ?? 0,
    strategy: data.strategy ?? null,
    notes: data.notes ?? null,
    grossPnl: metrics.grossPnl,
    netPnl: metrics.netPnl
  };
}

module.exports = buildTradePayload;
