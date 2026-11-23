const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

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
      color: value >= 0 ? "rgba(8, 153, 129, 0.55)" : "rgba(242, 54, 69, 0.6)"
    };
  });

  return {
    macdLine,
    signalLine,
    histogram
  };
}

export { calculateEmaSeries, calculateVwapSeries, calculateMacdSeries };
