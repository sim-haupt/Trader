function firstFill(trade) {
  const execution = trade.executions?.[0];

  const approximate = !execution || execution.source === "SYNTHETIC";
  const averaged = approximate && trade.reportedExecutionCount > 2;

  return {
    time: execution?.occurredAt ?? trade.entryDate,
    price: averaged ? null : Number(execution?.price ?? trade.entryPrice),
    quantity: approximate ? null : Number(execution.quantity),
    action: execution?.action ?? (trade.side === "SHORT" ? "SELL" : "BUY"),
    approximate
  };
}

function calculateEntryOutcome(trade, fill, bars, intendedPrice, options = {}) {
  const direction = trade.side === "SHORT" ? -1 : 1;
  const entryMs = fill.time.getTime();

  // Pick a recent completed close at each horizon without using a later print.
  const checkpoints = [1, 5, 15].map((minutes) => {
    const target = entryMs + minutes * 60_000;
    const bar = bars.findLast(({ time }) => {
      const closeTime = (time + 60) * 1000;
      return closeTime > entryMs && closeTime <= target && target - closeTime < 60_000;
    });
    return {
      minutes,
      movePercent: bar && fill.price > 0 ? direction * (bar.close / fill.price - 1) * 100 : null
    };
  });

  let mfe = null;
  let mae = null;
  let mfePoint = null;
  let maePoint = null;
  const executions = trade.executions || [];
  const hasCompleteFills = executions.length >= (options.replay ? 1 : 2) && trade.exitDate &&
    !(executions.some(({ source }) => source === "SYNTHETIC") && trade.reportedExecutionCount > executions.length);

  if (hasCompleteFills) {
    let shares = 0;
    let cash = 0;
    let index = 0;

    for (const bar of bars) {
      const start = bar.time * 1000;
      const end = start + 60_000;
      if (start < entryMs || end > trade.exitDate.getTime()) continue;

      while (index < executions.length && executions[index].occurredAt.getTime() <= start) {
        const execution = executions[index++];
        const quantity = Number(execution.quantity) * (execution.action === "BUY" ? 1 : -1);
        shares += quantity;
        cash -= quantity * Number(execution.price);
      }

      if (!shares || (index < executions.length && executions[index].occurredAt.getTime() < end)) continue;

      const low = cash + shares * bar.low;
      const high = cash + shares * bar.high;
      const favorable = Math.max(0, low, high);
      const adverse = Math.max(0, -low, -high);
      if (favorable > (mfe ?? 0)) mfePoint = { time: bar.time, price: shares > 0 ? bar.high : bar.low };
      if (adverse > (mae ?? 0)) maePoint = { time: bar.time, price: shares > 0 ? bar.low : bar.high };
      mfe = Math.max(mfe ?? 0, favorable);
      mae = Math.max(mae ?? 0, adverse);
    }
  }

  return {
    checkpoints,
    mfe,
    mae,
    mfePoint,
    maePoint,
    slippagePerShare: fill.approximate || intendedPrice == null ? null : direction * (fill.price - Number(intendedPrice))
  };
}

module.exports = { firstFill, calculateEntryOutcome };
