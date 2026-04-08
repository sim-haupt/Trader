const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const prisma = require("../config/prisma");

const ALPACA_BASE_URL = String(env.alpacaDataUrl || "https://data.alpaca.markets").replace(/\/$/, "");
const minuteBarsCache = new Map();
const dailyBarsCache = new Map();
const SIP_DELAY_MS = 15 * 60 * 1000;
const backfillTimers = new Map();

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

function canFallbackToNextFeed(error) {
  return [401, 402, 403, 422, 429].includes(error?.statusCode);
}

function clampEndToNow(value) {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return new Date(value);
  }

  return new Date(Math.min(timestamp, Date.now()));
}

function mergeBars(...barSets) {
  const barMap = new Map();

  for (const bars of barSets) {
    for (const bar of bars || []) {
      if (Number.isFinite(bar?.time)) {
        barMap.set(bar.time, bar);
      }
    }
  }

  return [...barMap.values()].sort((left, right) => left.time - right.time);
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
  const startDate = new Date(from);
  const endDate = clampEndToNow(to);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return { bars: [], feed: null };
  }

  async function fetchBarsWithFeed(feed, rangeStart = startDate, rangeEnd = endDate) {
    const cacheKey = `${symbol}:${timeframe}:${rangeStart.toISOString()}:${rangeEnd.toISOString()}:${feed}`;

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    let pageToken;
    const bars = [];

    do {
      const data = await alpacaFetch(`/v2/stocks/${encodeURIComponent(symbol)}/bars`, {
        timeframe,
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
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

    cache.set(cacheKey, bars);
    return bars;
  }

  async function fetchRangeWithPreferredFeed(preferredFeed, fallbackFeed, rangeStart = startDate, rangeEnd = endDate) {
    try {
      const bars = await fetchBarsWithFeed(preferredFeed, rangeStart, rangeEnd);
      return {
        bars,
        feed: preferredFeed
      };
    } catch (error) {
      if (!fallbackFeed || !canFallbackToNextFeed(error)) {
        throw error;
      }

      const bars = await fetchBarsWithFeed(fallbackFeed, rangeStart, rangeEnd);
      return {
        bars,
        feed: fallbackFeed
      };
    }
  }

  if (!env.alpacaFeed || env.alpacaFeed === "sip") {
    return fetchRangeWithPreferredFeed("sip", null);
  }

  const delayedCutoff = new Date(Date.now() - SIP_DELAY_MS);
  const hasHistoricalSlice = startDate < delayedCutoff;
  const hasRecentSlice = endDate > delayedCutoff;

  if (hasHistoricalSlice && hasRecentSlice) {
    try {
      const [historicalBars, recentBars] = await Promise.all([
        fetchRangeWithPreferredFeed("sip", env.alpacaFeed, startDate, delayedCutoff),
        fetchRangeWithPreferredFeed(env.alpacaFeed, null, delayedCutoff, endDate)
      ]);

      return {
        bars: mergeBars(historicalBars.bars, recentBars.bars),
        feed:
          historicalBars.feed === recentBars.feed
            ? historicalBars.feed
            : `${historicalBars.feed || "unknown"}+${recentBars.feed || "unknown"}`
      };
    } catch (error) {
      if (!canFallbackToNextFeed(error)) {
        throw error;
      }

      return fetchRangeWithPreferredFeed(env.alpacaFeed, null);
    }
  }

  if (hasHistoricalSlice) {
    return fetchRangeWithPreferredFeed("sip", env.alpacaFeed);
  }

  return fetchRangeWithPreferredFeed(env.alpacaFeed, null);
}

async function fetchMinuteBarsWithMeta(symbol, from, to) {
  return fetchBars(symbol, "1Min", from, to, minuteBarsCache);
}

async function fetchDailyBarsWithMeta(symbol, from, to) {
  return fetchBars(symbol, "1Day", from, to, dailyBarsCache);
}

async function fetchMinuteBars(symbol, from, to) {
  return (await fetchMinuteBarsWithMeta(symbol, from, to)).bars;
}

async function fetchDailyBars(symbol, from, to) {
  return (await fetchDailyBarsWithMeta(symbol, from, to)).bars;
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
    const [minuteBarsResult, dailyBarsResult] = await Promise.all([
      fetchMinuteBarsWithMeta(normalizedSymbol, dayStart, dayEnd),
      fetchDailyBarsWithMeta(normalizedSymbol, dailyHistoryStart, dayEnd)
    ]);

    const minuteFeed = minuteBarsResult.feed || null;
    const dailyFeed = dailyBarsResult.feed || null;
    const minuteBars = minuteBarsResult.bars || [];
    const dailyBars = dailyBarsResult.bars || [];
    const priorDailyBars = getPriorSessionBars(dailyBars, parsedEntryDate).slice(-priorSessionLimit);
    const entryVolume = calculateEntryVolume(minuteBars, parsedEntryDate);
    const entryRelativeVolume = calculateRelativeVolume(entryVolume, priorDailyBars);
    const entryPriorCloseDiffPercent = calculatePriorCloseDiffPercent(parsedEntryPrice, priorDailyBars);
    const resolvedFeed = minuteFeed === dailyFeed ? minuteFeed : minuteFeed || dailyFeed;
    const marketDataNeedsBackfill = resolvedFeed !== "sip";

    return {
      entryVolume: toRoundedNumber(entryVolume),
      entryRelativeVolume: toRoundedNumber(entryRelativeVolume),
      instrumentFloat: null,
      entryPriorCloseDiffPercent: toRoundedNumber(entryPriorCloseDiffPercent),
      marketDataFeed: resolvedFeed,
      marketDataNeedsBackfill
    };
  } catch (error) {
    return {
      entryVolume: null,
      entryRelativeVolume: null,
      instrumentFloat: null,
      entryPriorCloseDiffPercent: null,
      marketDataFeed: null,
      marketDataNeedsBackfill: true
    };
  }
}

function shouldAttemptBackfill(trade) {
  if (!trade?.marketDataNeedsBackfill || !trade?.entryDate) {
    return false;
  }

  const timestamp = new Date(trade.entryDate).getTime();

  if (Number.isNaN(timestamp)) {
    return false;
  }

  return timestamp <= Date.now() - SIP_DELAY_MS;
}

async function refreshTradeImportContext(trade) {
  if (!trade?.id || !shouldAttemptBackfill(trade)) {
    return trade;
  }

  const nextContext = await getTradeImportContext({
    symbol: trade.symbol,
    entryDate: trade.entryDate,
    entryPrice: trade.entryPrice
  });

  const updatedTrade = await prisma.trade.update({
    where: { id: trade.id },
    data: {
      entryVolume: nextContext.entryVolume,
      entryRelativeVolume: nextContext.entryRelativeVolume,
      instrumentFloat: nextContext.instrumentFloat,
      entryPriorCloseDiffPercent: nextContext.entryPriorCloseDiffPercent,
      marketDataFeed: nextContext.marketDataFeed,
      marketDataNeedsBackfill: nextContext.marketDataNeedsBackfill
    }
  });

  return updatedTrade;
}

function scheduleTradeImportContextBackfill(trade) {
  if (!trade?.id || !trade.marketDataNeedsBackfill) {
    return;
  }

  const existingTimer = backfillTimers.get(trade.id);

  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(async () => {
    backfillTimers.delete(trade.id);

    try {
      await refreshTradeImportContext(trade);
    } catch (error) {
      scheduleTradeImportContextBackfill(trade);
    }
  }, env.tradeMarketBackfillDelayMs);

  backfillTimers.set(trade.id, timer);
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
  getTradeImportContext,
  refreshTradeImportContext,
  scheduleTradeImportContextBackfill
};
