function asNumber(value) {
  const numericValue = Number(value || 0);
  return Number.isNaN(numericValue) ? 0 : numericValue;
}

export function getDefaultCommissionValue(defaultCommission) {
  return Math.max(0, asNumber(defaultCommission));
}

export function getDefaultFeeValue(defaultFees) {
  return Math.max(0, asNumber(defaultFees));
}

export function getDefaultTradeCosts(defaultCommission = 0, defaultFees = 0) {
  return Number(
    (getDefaultCommissionValue(defaultCommission) + getDefaultFeeValue(defaultFees)).toFixed(4)
  );
}

export function getEffectiveTradeCosts(trade, defaultCommission = 0, defaultFees = 0) {
  const fees = asNumber(trade?.fees);
  return fees > 0 ? fees : getDefaultTradeCosts(defaultCommission, defaultFees);
}

export function getEffectiveTradeCommission(trade, defaultCommission = 0, defaultFees = 0) {
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
    const netPnl = asNumber(trade.netPnl);
    return Number((netPnl - (asNumber(trade?.fees) > 0 ? 0 : effectiveCosts)).toFixed(4));
  }

  return Number((0 - effectiveCosts).toFixed(4));
}

export function getTradePnlByType(trade, pnlType = "NET", defaultCommission = 0, defaultFees = 0) {
  return pnlType === "GROSS"
    ? getTradeGrossPnl(trade)
    : getTradeNetPnl(trade, defaultCommission, defaultFees);
}

export function getTradeFeeDisplayValue(trade, defaultCommission = 0, defaultFees = 0) {
  return getEffectiveTradeCosts(trade, defaultCommission, defaultFees);
}
