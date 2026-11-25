export function uniqueLabels(values) {
  const names = new Map();
  for (const value of values) {
    const name = String(value ?? "").trim();
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  return Array.from(names.values());
}

export function tradeSetups(trade) {
  return uniqueLabels([trade?.setup ?? trade?.strategy, ...(trade?.additionalSetups ?? [])]);
}

export function tradeTags(trade) {
  return uniqueLabels(String(trade?.tags ?? "").split(","));
}

export function hasTradeSetup(trade, name) {
  return tradeSetups(trade).some((setup) => setup.toLowerCase() === name.toLowerCase());
}
