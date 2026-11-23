import { calculateEmaSeries, calculateMacdSeries, calculateVwapSeries } from "./priceIndicators.mjs";

function asNumber(value) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

const BUY_MARKER_GREEN = "#39ff14";
const SELL_MARKER_RED = "#ff1f3d";

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

function buildExecutionMarkers(trade) {
  const executions = Array.isArray(trade.executions) ? trade.executions : [];
  const fallbackExecutions = [];

  if (executions.length === 0 && trade.entryDate && trade.entryPrice != null) {
    fallbackExecutions.push({
      id: `${trade.id}-entry`,
      occurredAt: trade.entryDate,
      quantity: trade.quantity,
      price: trade.entryPrice,
      action: trade.side === "SHORT" ? "SELL" : "BUY",
      markerLabel: "Entry"
    });

    if (trade.exitDate && trade.exitPrice != null) {
      fallbackExecutions.push({
        id: `${trade.id}-exit`,
        occurredAt: trade.exitDate,
        quantity: trade.quantity,
        price: trade.exitPrice,
        action: trade.side === "SHORT" ? "BUY" : "SELL",
        markerLabel: "Exit"
      });
    }
  }

  const markerExecutions = executions.length > 0 ? executions : fallbackExecutions;

  return markerExecutions
    .map((execution, index) => {
      const timestamp = toChartUnixSeconds(execution.occurredAt);

      if (timestamp == null) {
        return null;
      }

      const executionTime = parseEasternLocalTimestamp(execution.occurredAt);
      const timeLabel = executionTime
        ? new Intl.DateTimeFormat("en-US", {
            timeZone: "America/New_York",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23"
          }).format(executionTime)
        : null;

      const isEntryMarker = index === 0;
      const isExitMarker = index === markerExecutions.length - 1 && markerExecutions.length > 1;
      const markerLabel = execution.markerLabel || (isEntryMarker ? "Entry" : isExitMarker ? "Exit" : "Fill");
      const markerColor = execution.action === "BUY" ? BUY_MARKER_GREEN : SELL_MARKER_RED;
      const actionLabel = execution.action === "BUY" ? "Buy" : "Sell";
      const fillLabel = `${markerLabel} · ${actionLabel}${execution.quantity == null ? "" : ` ${asNumber(execution.quantity)}`} @ ${asNumber(execution.price).toFixed(2)}`;

      return {
        time: Math.floor(timestamp / 60) * 60,
        rawTime: timestamp,
        price: asNumber(execution.price),
        position: execution.action === "BUY" ? "belowBar" : "aboveBar",
        color: markerColor,
        shape: execution.action === "BUY" ? "arrowUp" : "arrowDown",
        text: fillLabel,
        detailText: `${fillLabel}${timeLabel ? ` · ${timeLabel}` : ""}`,
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
