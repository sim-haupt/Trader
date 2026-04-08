const env = require("../config/env");
const ApiError = require("../utils/ApiError");

const ALPACA_BASE_URL = String(env.alpacaDataUrl || "https://data.alpaca.markets").replace(/\/$/, "");
const minuteBarsCache = new Map();
const dailyBarsCache = new Map();
const SIP_DELAY_MS = 15 * 60 * 1000;

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase().replace(/^NASDAQ:|^NYSE:|^AMEX:/, "");
}

function toRoundedNumber(value, decimals = 4) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(decimals));
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function floorToMinuteTimestampSeconds(value) {
  const timestampMs = new Date(value).getTime();
  return Math.floor(timestampMs / 60000) * 60;
}

async function alpacaFetch(path, params = {}) {
  if (!env.alpacaApiKeyId || !env.alpacaSecretKey) {
    throw new ApiError(
      503,
      "Market data provider is not configured. Add APCA_API_KEY_ID and APCA_API_SECRET_KEY to enable charts."
    );
  }

  const searchParams = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)])
  );

  const response = await fetch(`${ALPACA_BASE_URL}${path}?${searchParams.toString()}`, {
    headers: {
      "APCA-API-KEY-ID": env.alpacaApiKeyId,
      "APCA-API-SECRET-KEY": env.alpacaSecretKey
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(
      response.status,
      `Market data request failed${text ? `: ${text.slice(0, 160)}` : ""}`
    );
  }

  return response.json();
}

function shouldUseSip(endTime) {
  const timestamp = new Date(endTime).getTime();

  if (Number.isNaN(timestamp)) {
    return false;
  }

  return timestamp <= Date.now() - SIP_DELAY_MS;
}

function getPreferredFeed(endTime) {
  return shouldUseSip(endTime) ? "sip" : env.alpacaFeed;
}

function normalizeBarPayload(bar) {
  const timestamp = new Date(bar.t).getTime();

  return {
    time: Math.floor(timestamp / 1000),
    open: Number(bar.o),
    high: Number(bar.h),
    low: Number(bar.l),
    close: Number(bar.c),
    volume: Number(bar.v || 0)
  };
}

async function fetchBars(symbol, timeframe, from, to, cache) {
  const preferredFeed = getPreferredFeed(to);
  const cacheKey = `${symbol}:${timeframe}:${new Date(from).toISOString()}:${new Date(to).toISOString()}:${preferredFeed}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  async function fetchBarsWithFeed(feed) {
    let pageToken;
    const bars = [];

    do {
      const data = await alpacaFetch(`/v2/stocks/${encodeURIComponent(symbol)}/bars`, {
        timeframe,
        start: new Date(from).toISOString(),
        end: new Date(to).toISOString(),
        adjustment: "raw",
        sort: "asc",
        limit: "10000",
        feed,
        page_token: pageToken
      });

      const pageBars = Array.isArray(data?.bars) ? data.bars.map(normalizeBarPayload) : [];
      bars.push(...pageBars);
      pageToken = data?.next_page_token || null;
    } while (pageToken);

    return bars;
  }

  let bars;

  try {
    bars = await fetchBarsWithFeed(preferredFeed);
  } catch (error) {
    const canFallbackToIex =
      preferredFeed === "sip" &&
      env.alpacaFeed !== "sip" &&
      [401, 402, 403, 422, 429].includes(error?.statusCode);

    if (!canFallbackToIex) {
      throw error;
    }

    bars = await fetchBarsWithFeed(env.alpacaFeed);
  }

  cache.set(cacheKey, bars);
  return bars;
}

async function fetchMinuteBars(symbol, from, to) {
  return fetchBars(symbol, "1Min", from, to, minuteBarsCache);
}

async function fetchDailyBars(symbol, from, to) {
  return fetchBars(symbol, "1Day", from, to, dailyBarsCache);
}

function calculateEntryVolume(minuteBars, entryDate) {
  if (!Array.isArray(minuteBars) || minuteBars.length === 0) {
    return null;
  }

  const entryMinute = floorToMinuteTimestampSeconds(entryDate);
  let cumulativeVolume = 0;
  let foundMatchingWindow = false;

  for (const bar of minuteBars) {
    if (!Number.isFinite(bar.time) || !Number.isFinite(bar.volume)) {
      continue;
    }

    if (bar.time > entryMinute) {
      break;
    }

    cumulativeVolume += bar.volume;
    foundMatchingWindow = true;
  }

  return foundMatchingWindow ? cumulativeVolume : null;
}

function getPriorSessionBars(dailyBars, entryDate) {
  const entryDayStart = startOfDay(entryDate).getTime();

  return (dailyBars || [])
    .filter((bar) => bar.time * 1000 < entryDayStart)
    .sort((left, right) => left.time - right.time);
}

function calculateRelativeVolume(entryVolume, priorDailyBars) {
  if (!Number.isFinite(entryVolume) || !Array.isArray(priorDailyBars) || priorDailyBars.length === 0) {
    return null;
  }

  const volumes = priorDailyBars
    .map((bar) => Number(bar.volume || 0))
    .filter((volume) => Number.isFinite(volume) && volume > 0);

  if (volumes.length === 0) {
    return null;
  }

  const averageVolume = volumes.reduce((sum, volume) => sum + volume, 0) / volumes.length;

  if (!Number.isFinite(averageVolume) || averageVolume <= 0) {
    return null;
  }

  return entryVolume / averageVolume;
}

function calculatePriorCloseDiffPercent(entryPrice, priorDailyBars) {
  if (!Number.isFinite(entryPrice) || !Array.isArray(priorDailyBars) || priorDailyBars.length === 0) {
    return null;
  }

  const priorClose = Number(priorDailyBars[priorDailyBars.length - 1]?.close || 0);

  if (!Number.isFinite(priorClose) || priorClose <= 0) {
    return null;
  }

  return ((entryPrice - priorClose) / priorClose) * 100;
}

async function getTradeImportContext({ symbol, entryDate, entryPrice }) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const parsedEntryDate = new Date(entryDate);
  const parsedEntryPrice = Number(entryPrice);

  if (!normalizedSymbol || Number.isNaN(parsedEntryDate.getTime())) {
    return null;
  }

  const dayStart = startOfDay(parsedEntryDate);
  const dayEnd = endOfDay(parsedEntryDate);
  const dailyHistoryStart = addDays(dayStart, -45);
  const priorSessionLimit = 20;

  try {
    const [minuteBars, dailyBars] = await Promise.all([
      fetchMinuteBars(normalizedSymbol, dayStart, dayEnd),
      fetchDailyBars(normalizedSymbol, dailyHistoryStart, dayEnd)
    ]);

    const priorDailyBars = getPriorSessionBars(dailyBars, parsedEntryDate).slice(-priorSessionLimit);
    const entryVolume = calculateEntryVolume(minuteBars, parsedEntryDate);
    const entryRelativeVolume = calculateRelativeVolume(entryVolume, priorDailyBars);
    const entryPriorCloseDiffPercent = calculatePriorCloseDiffPercent(parsedEntryPrice, priorDailyBars);

    return {
      entryVolume: toRoundedNumber(entryVolume),
      entryRelativeVolume: toRoundedNumber(entryRelativeVolume),
      instrumentFloat: null,
      entryPriorCloseDiffPercent: toRoundedNumber(entryPriorCloseDiffPercent)
    };
  } catch (error) {
    return {
      entryVolume: null,
      entryRelativeVolume: null,
      instrumentFloat: null,
      entryPriorCloseDiffPercent: null
    };
  }
}

async function getBars({ symbol, resolution, from, to, includeExtended }) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (resolution !== "1m") {
    throw new ApiError(400, "The Alpaca market data integration currently supports 1-minute bars only.");
  }

  const bars = await fetchMinuteBars(normalizedSymbol, fromDate, toDate);

  return {
    symbol: normalizedSymbol,
    resolution,
    includeExtended,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    bars
  };
}

module.exports = {
  getBars,
  getTradeImportContext
};
