function asNumber(value) {
  const numericValue = Number(value || 0);
  return Number.isNaN(numericValue) ? 0 : numericValue;
}

export function getDefaultCommissionValue(defaultCommission) {
  return Math.max(0, asNumber(defaultCommission));
}

export function getEffectiveTradeCommission(trade, defaultCommission = 0) {
  const fees = asNumber(trade?.fees);
  return fees > 0 ? fees : getDefaultCommissionValue(defaultCommission);
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

export function getTradeNetPnl(trade, defaultCommission = 0) {
  const grossPnl = getTradeGrossPnl(trade);
  const effectiveCommission = getEffectiveTradeCommission(trade, defaultCommission);

  if (trade?.grossPnl !== undefined && trade?.grossPnl !== null && trade.grossPnl !== "") {
    return Number((grossPnl - effectiveCommission).toFixed(4));
  }

  if (trade?.netPnl !== undefined && trade?.netPnl !== null && trade.netPnl !== "") {
    const netPnl = asNumber(trade.netPnl);
    return Number((netPnl - (asNumber(trade?.fees) > 0 ? 0 : effectiveCommission)).toFixed(4));
  }

  return Number((0 - effectiveCommission).toFixed(4));
}

export function getTradePnlByType(trade, pnlType = "NET", defaultCommission = 0) {
  return pnlType === "GROSS"
    ? getTradeGrossPnl(trade)
    : getTradeNetPnl(trade, defaultCommission);
}

export function getTradeFeeDisplayValue(trade, defaultCommission = 0) {
  return getEffectiveTradeCommission(trade, defaultCommission);
}
