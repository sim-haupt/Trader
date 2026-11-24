const MINUTE = 60_000;
const OFFSETS = [-30, -15, -5, -1, 1, 5, 15, 30];
const EPSILON = 1e-7;
const finite = (value) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const timeOf = (value) => value == null ? NaN : new Date(value).getTime();

function exitTimingPlan(trade) {
  const entryTime = timeOf(trade.entryDate);
  const exitTime = timeOf(trade.exitDate);
  if (!(exitTime > entryTime)) return { reason: "A closed trade with valid entry and exit times is required." };

  const entryAction = trade.side === "SHORT" ? "SELL" : "BUY";
  const exitAction = entryAction === "BUY" ? "SELL" : "BUY";
  const observed = trade.executions?.filter(({ source }) => source === "IMPORTED") ?? [];
  const approximate = observed.length === 0;
  const validCount = approximate ? 2 : observed.length;
  if (trade.reportedExecutionCount > validCount || (!approximate && observed.length !== trade.executions.length)) {
    return { reason: "This trade is missing some of its recorded fills." };
  }

  const quantity = finite(trade.quantity);
  const reportedFills = [
    { occurredAt: entryTime, action: entryAction, price: trade.entryPrice, quantity },
    { occurredAt: exitTime, action: exitAction, price: trade.exitPrice, quantity }
  ];
  const fills = (approximate ? reportedFills : observed).map((fill) => ({
    time: timeOf(fill.occurredAt),
    shares: finite(fill.quantity) > 0 ? Number(fill.quantity) * (fill.action === "BUY" ? 1 : -1) : 0,
    price: finite(fill.price),
    validAction: fill.action === "BUY" || fill.action === "SELL"
  })).sort((a, b) => a.time - b.time);

  const direction = entryAction === "BUY" ? 1 : -1;
  let position = 0;
  let actualGross = 0;
  for (const [index, fill] of fills.entries()) {
    if (!fill.validAction || !Number.isFinite(fill.time) || !(fill.price > 0) || !fill.shares) {
      return { reason: "The trade has incomplete execution prices or quantities." };
    }
    position += fill.shares;
    actualGross -= fill.shares * fill.price;
    if (index < fills.length - 1 && position * direction <= EPSILON) {
      return { reason: "This record does not have one continuous position." };
    }
  }

  const entry = fills[0]?.time;
  const exit = fills.at(-1)?.time;
  if (Math.abs(position) > EPSILON || !(exit > entry)) {
    return { reason: "The entry and exit fills do not form a closed position." };
  }
  const costs = (finite(trade.commissions) ?? 0) + (finite(trade.fees) ?? 0);
  const reportedGross = finite(trade.grossPnl);
  const actualNet = reportedGross === null ? finite(trade.netPnl) ?? (actualGross - costs) : reportedGross - costs;
  const finalFills = fills.filter((fill) => fill.time === exit && fill.shares * direction < 0);
  const finalShares = finalFills.reduce((sum, fill) => sum + Math.abs(fill.shares), 0);
  const exitPrice = finalFills.reduce((sum, fill) => sum + Math.abs(fill.shares) * fill.price, 0) / finalShares;
  return { fills, entry, exit, actualGross, actualNet, approximate, direction, exitPrice, finalShares };
}

function positionBefore(plan, time) {
  let position = 0;
  let cash = 0;
  let lastEntry = plan.entry;
  for (const fill of plan.fills) {
    if (fill.time >= Math.min(time, plan.exit)) break;
    if (Math.sign(fill.shares) === plan.direction) lastEntry = fill.time;
    position += fill.shares;
    cash -= fill.shares * fill.price;
  }
  return { position, cash, lastEntry };
}

function compareExitTiming(plan, bars, now = Date.now()) {
  const prices = new Map(bars.filter(({ time, close }) => Number.isFinite(time) && close > 0)
    .map(({ time, close }) => [(time + 60) * 1000, close]));

  return OFFSETS.map((minutes) => {
    const time = plan.exit + minutes * MINUTE;
    const row = { minutes, time };
    if (time <= plan.entry) return { ...row, reason: "Before the entry" };
    if (time > now) return { ...row, reason: "Time has not occurred yet" };

    const { position, cash, lastEntry } = positionBefore(plan, time);
    const barEnd = Math.floor(time / MINUTE) * MINUTE;
    const price = prices.get(barEnd);
    if (!(barEnd > lastEntry) || !price) return { ...row, reason: "No completed candle near this time" };
    if (Math.abs(position) <= EPSILON) return { ...row, reason: "No open position at this time" };
    const delta = cash + position * price - plan.actualGross;
    return { ...row, barEnd, price, delta, net: plan.actualNet + delta };
  });
}

module.exports = { exitTimingPlan, compareExitTiming, positionBefore, MINUTE, OFFSETS };
