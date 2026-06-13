function asNumber(value) {
  const numericValue = Number(value || 0);
  return Number.isNaN(numericValue) ? 0 : numericValue;
}

export function getDefaultCommissionValue(defaultCommission) {
  return 0;
}

export function getDefaultFeeValue(defaultFees) {
  return 0;
}

export function getDefaultTradeCosts(defaultCommission = 0, defaultFees = 0) {
  return getDefaultTradeCostsForQuantity(1, defaultCommission, defaultFees);
}

export function getDefaultTradeCostsForQuantity(quantity = 0, defaultCommission = 0, defaultFees = 0) {
  return 0;
}

export function getEffectiveTradeCosts(trade, defaultCommission = 0, defaultFees = 0) {
  const commissions = asNumber(trade?.commissions);
  const fees = asNumber(trade?.fees);
  return Number((commissions + fees).toFixed(4));
}

export function getEffectiveTradeCommission(trade, defaultCommission = 0, defaultFees = 0) {
  return asNumber(trade?.commissions);
}

export function getTradeFeeDisplayValue(trade, defaultCommission = 0, defaultFees = 0) {
  return asNumber(trade?.fees);
}

export function getTradeTotalCostDisplayValue(trade, defaultCommission = 0, defaultFees = 0) {
  return getEffectiveTradeCosts(trade, defaultCommission, defaultFees);
}

export function getTradeGrossPnl(trade) {
  if (trade?.grossPnl !== undefined && trade?.grossPnl !== null && trade.grossPnl !== "") {
    return asNumber(trade.grossPnl);
  }

  if (trade?.netPnl !== undefined && trade?.netPnl !== null && trade.netPnl !== "") {
    return asNumber(trade.netPnl);
  }

  return 0;
}

export function getTradeNetPnl(trade, defaultCommission = 0, defaultFees = 0) {
  const grossPnl = getTradeGrossPnl(trade);
  const effectiveCosts = getEffectiveTradeCosts(trade, defaultCommission, defaultFees);

  if (trade?.grossPnl !== undefined && trade?.grossPnl !== null && trade.grossPnl !== "") {
    return Number((grossPnl - effectiveCosts).toFixed(4));
  }

  if (trade?.netPnl !== undefined && trade?.netPnl !== null && trade.netPnl !== "") {
    return asNumber(trade.netPnl);
  }

  return Number((0 - effectiveCosts).toFixed(4));
}

export function getTradePnlByType(trade, pnlType = "GROSS", defaultCommission = 0, defaultFees = 0) {
  return pnlType === "GROSS"
    ? getTradeGrossPnl(trade)
    : getTradeNetPnl(trade, defaultCommission, defaultFees);
}
