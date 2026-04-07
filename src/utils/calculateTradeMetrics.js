function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);

  return Number.isNaN(numericValue) ? null : numericValue;
}

function calculateTradeMetrics(input) {
  const entryPrice = toNumber(input.entryPrice);
  const exitPrice = toNumber(input.exitPrice);
  const quantity = toNumber(input.quantity);
  const fees = toNumber(input.fees) ?? 0;

  if (entryPrice === null || quantity === null || exitPrice === null) {
    return {
      grossPnl: null,
      netPnl: null
    };
  }

  const direction = input.side === "SHORT" ? -1 : 1;
  const grossPnl = (exitPrice - entryPrice) * quantity * direction;
  const netPnl = grossPnl - fees;

  return {
    grossPnl: Number(grossPnl.toFixed(4)),
    netPnl: Number(netPnl.toFixed(4))
  };
}

module.exports = calculateTradeMetrics;
