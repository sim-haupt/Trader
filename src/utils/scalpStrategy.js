function simulateScalpExit(plan, market, settings) {
  const { events, resolution } = market;
  const tick = resolution === "tick";
  const minute = resolution === "minute";
  const deadline = plan.entry + settings.holdSeconds * 1000;
  const fillTolerance = minute ? 60_000 : 5000;
  const signalTolerance = tick ? 15_000 : minute ? 60_000 : 2000;
  if (minute && settings.holdSeconds < 60) return { reason: "This strategy needs sub-minute market data." };

  const fills = plan.fills.filter((fill) => fill.time < plan.exit);
  let position = 0;
  let cash = 0;
  let basis = 0;
  let index = 0;
  let peak = null;
  let ema = null;
  let emaCount = 0;
  let emaSecond = null;
  let activated = false;
  let tookPartial = false;
  let pending = null;
  let previousEnd = plan.entry;
  const orders = [];
  const direction = plan.direction;
  const reason = (message) => ({ reason: message });

  function applyRecorded(through) {
    while (!tookPartial && fills[index]?.time <= through && fills[index].time < deadline) {
      const fill = fills[index++];
      if (Math.sign(fill.shares) === direction) {
        basis = (Math.abs(position) * basis + Math.abs(fill.shares) * fill.price) /
          (Math.abs(position) + Math.abs(fill.shares));
        peak = null;
        activated = false;
      }
      cash -= fill.shares * fill.price;
      position += fill.shares;
    }
  }

  function fillOrder(event, fraction, trigger) {
    if (!position) return;
    const qty = Math.abs(position) * fraction;
    cash += qty * direction * event.open;
    position -= qty * direction;
    const time = event.stamp ?? event.time;
    orders.push({ time, price: event.open, quantity: qty, trigger });
    if (fraction < 1) {
      tookPartial = true;
      return;
    }
    const delta = cash - plan.actualGross - orders.length * settings.addedCost;
    return { net: plan.actualNet + delta, delta, orders, feed: market.feed, resolution };
  }

  for (const event of events) {
    if (event.end <= plan.entry) continue;
    if (event.time > deadline + fillTolerance) break;

    if (pending) {
      if (event.time < pending.time || (tick && event.time === pending.time)) continue;
      if (event.time - pending.time > fillTolerance) return reason("No recent price after the strategy signal.");
      const result = fillOrder(event, pending.fraction, pending.trigger);
      pending = null;
      if (result) return result;
    }

    if (event.time >= deadline) {
      applyRecorded(deadline - 0.001);
      if (event.time - deadline <= fillTolerance && position) return fillOrder(event, 1, "Time limit");
      break;
    }

    applyRecorded(event.time);
    if (!position || event.time <= plan.entry || event.end > deadline || settings.type === "time") continue;
    if (event.time - previousEnd > signalTolerance) return reason("Missing price observations during the hold.");
    previousEnd = event.end;
    const fillInside = !tick && fills[index]?.time < event.end && !tookPartial;
    const favorable = direction * ((direction > 0 ? event.high : event.low) - basis) / basis * 100;
    const adverse = direction * ((direction > 0 ? event.low : event.high) - basis) / basis * 100;
    const close = direction * (event.close - basis) / basis * 100;
    const target = favorable >= settings.threshold;
    const stop = adverse <= -settings.stop;
    let trigger;
    let fraction = 1;

    if (settings.type === "target" && target) trigger = "Profit target";
    if (settings.type === "stop" && stop) trigger = "Stop loss";
    if (settings.type === "partial") {
      if (target && stop && !tookPartial) return reason("A candle touched the partial target and stop in unknown order.");
      if (stop) trigger = "Stop loss";
      else if (target && !tookPartial) {
        trigger = "Partial target";
        fraction = settings.partial / 100;
      }
    }
    if (settings.type === "trail") {
      const previous = peak ?? basis;
      const favorablePrice = direction > 0 ? event.high : event.low;
      const adversePrice = direction > 0 ? event.low : event.high;
      peak = direction > 0 ? Math.max(favorablePrice, previous) : Math.min(favorablePrice, previous);
      const touched = (reference) => direction * (adversePrice - reference * (1 - direction * settings.threshold / 100)) <= 0;
      if (touched(peak)) {
        if (!tick && peak !== previous && !touched(previous)) {
          return reason("A candle raised the trailing stop and touched it in unknown order.");
        }
        trigger = "Trailing stop";
      }
    }
    if (settings.type === "breakEven") {
      if (activated && adverse <= 0) trigger = "Return to entry";
      else if (target) {
        if (!tick && adverse <= 0) return reason("A candle both armed and touched the break-even stop.");
        activated = true;
      }
    }
    if (settings.type === "ema") {
      const second = Math.floor(event.end / 1000);
      if (second !== emaSecond) {
        ema = ema == null ? event.close : ema + 0.2 * (event.close - ema);
        emaSecond = second;
        emaCount += 1;
        if (emaCount >= 9 && direction * (event.close - ema) < 0) trigger = "EMA cross";
      }
    }
    if (fillInside) {
      return reason("A recorded fill and a strategy condition share a candle.");
    }
    if (trigger) pending = { time: event.end, trigger, fraction };
  }

  return reason("No supported exit before the end of the historical path.");
}

module.exports = { simulateScalpExit };
