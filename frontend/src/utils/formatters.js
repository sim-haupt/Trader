const MARKET_TIME_ZONE = "America/New_York";

function getPartsInTimeZone(value, timeZone = MARKET_TIME_ZONE) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

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

  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
}

function parseTimezoneOffsetMs(date, timeZone = MARKET_TIME_ZONE) {
  const values = getPartsInTimeZone(date, timeZone);

  if (!values) {
    return 0;
  }

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

function parseMarketDateTimeInput(value, timeZone = MARKET_TIME_ZONE) {
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
    const offsetMs = parseTimezoneOffsetMs(new Date(timestamp), timeZone);
    const corrected = baseUtc - offsetMs;

    if (corrected === timestamp) {
      break;
    }

    timestamp = corrected;
  }

  return new Date(timestamp);
}

export function formatCurrency(value) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function formatDate(value) {
  const parts = getPartsInTimeZone(value);

  if (!parts) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

export function formatDateTimeLocal(value) {
  const parts = getPartsInTimeZone(value);

  if (!parts) {
    return "";
  }

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function toMarketISOString(value) {
  const parsed = parseMarketDateTimeInput(value);
  return parsed ? parsed.toISOString() : null;
}
