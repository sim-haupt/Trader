function asNumber(value) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function calculateEmaSeries(bars, period) {
  const multiplier = 2 / (period + 1);
  let previousEma = null;

  return bars.map((bar, index) => {
    const close = asNumber(bar.close);
    previousEma = previousEma === null ? close : close * multiplier + previousEma * (1 - multiplier);

    return {
      time: bar.time,
      value: Number(previousEma.toFixed(4)),
      index
    };
  });
}

function calculateVwapSeries(bars) {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  return bars.map((bar) => {
    const typicalPrice = (asNumber(bar.high) + asNumber(bar.low) + asNumber(bar.close)) / 3;
    const volume = asNumber(bar.volume);
    cumulativePriceVolume += typicalPrice * volume;
    cumulativeVolume += volume;

    return {
      time: bar.time,
      value: Number((cumulativeVolume ? cumulativePriceVolume / cumulativeVolume : typicalPrice).toFixed(4))
    };
  });
}

function calculateMacdSeries(bars) {
  const ema12 = calculateEmaSeries(bars, 12);
  const ema26 = calculateEmaSeries(bars, 26);

  const macdLine = bars.map((bar, index) => ({
    time: bar.time,
    value: Number((ema12[index].value - ema26[index].value).toFixed(4))
  }));

  const signalLine = [];
  const multiplier = 2 / (9 + 1);
  let previousSignal = null;

  for (const point of macdLine) {
    previousSignal =
      previousSignal === null
        ? point.value
        : point.value * multiplier + previousSignal * (1 - multiplier);

    signalLine.push({
      time: point.time,
      value: Number(previousSignal.toFixed(4))
    });
  }

  const histogram = macdLine.map((point, index) => {
    const value = Number((point.value - signalLine[index].value).toFixed(4));
    return {
      time: point.time,
      value,
      color: value >= 0 ? "rgba(110, 240, 195, 0.55)" : "rgba(255, 126, 107, 0.6)"
    };
  });

  return {
    macdLine,
    signalLine,
    histogram
  };
}

function buildExecutionMarkers(trade) {
  return (trade.executions || []).map((execution, index) => ({
    time: Math.floor(new Date(execution.occurredAt).getTime() / 1000),
    price: asNumber(execution.price),
    position: execution.action === "BUY" ? "belowBar" : "aboveBar",
    color: execution.action === "BUY" ? "#6ef0c3" : "#ff7e6b",
    shape: execution.action === "BUY" ? "arrowUp" : "arrowDown",
    text: `${execution.action === "BUY" ? "B" : "S"} ${asNumber(execution.quantity)} @ ${asNumber(
      execution.price
    ).toFixed(2)}`,
    id: execution.id || `${trade.id}-${index + 1}`
  }));
}

export {
  buildExecutionMarkers,
  calculateEmaSeries,
  calculateMacdSeries,
  calculateVwapSeries
};
