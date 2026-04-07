function asNumber(value) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function parseTimezoneOffsetMs(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );

  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}

function parseEasternLocalTimestamp(value) {
  if (!value) {
    return null;
  }

  const stringValue = String(value).trim();

  if (!stringValue) {
    return null;
  }

  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(stringValue)) {
    const parsed = new Date(stringValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const match = stringValue.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );

  if (!match) {
    const parsed = new Date(stringValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const [, year, month, day, hour, minute, second = "00"] = match;
  const baseUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  let timestamp = baseUtc;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const offsetMs = parseTimezoneOffsetMs(new Date(timestamp), "America/New_York");
    const corrected = baseUtc - offsetMs;

    if (corrected === timestamp) {
      break;
    }

    timestamp = corrected;
  }

  return new Date(timestamp);
}

function toChartUnixSeconds(value) {
  const parsed = parseEasternLocalTimestamp(value);
  return parsed ? Math.floor(parsed.getTime() / 1000) : null;
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
  return (trade.executions || [])
    .map((execution, index) => {
      const timestamp = toChartUnixSeconds(execution.occurredAt);

      if (timestamp == null) {
        return null;
      }

      return {
        time: Math.floor(timestamp / 60) * 60,
        rawTime: timestamp,
        price: asNumber(execution.price),
        position: execution.action === "BUY" ? "belowBar" : "aboveBar",
        color: execution.action === "BUY" ? "#6ef0c3" : "#ff7e6b",
        shape: execution.action === "BUY" ? "arrowUp" : "arrowDown",
        text: `${execution.action === "BUY" ? "B" : "S"} ${asNumber(execution.quantity)} @ ${asNumber(
          execution.price
        ).toFixed(2)}`,
        id: execution.id || `${trade.id}-${index + 1}`
      };
    })
    .filter(Boolean);
}

export {
  buildExecutionMarkers,
  calculateEmaSeries,
  calculateMacdSeries,
  calculateVwapSeries,
  toChartUnixSeconds
};
