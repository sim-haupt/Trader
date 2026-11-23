const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const prisma = require("../config/prisma");
const { marketDayKey, marketTime, shiftDay, completedBars } = require("../utils/marketSession");

const ALPACA_BASE_URL = String(env.alpacaDataUrl || "https://data.alpaca.markets").replace(/\/$/, "");
const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v1";
const minuteBarsCache = new Map();
const dailyBarsCache = new Map();
const fxRatesCache = new Map();
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
    signal: AbortSignal.timeout(20000),
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

async function frankfurterFetch(path, params = {}) {
  const searchParams = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)])
  );
  const url = `${FRANKFURTER_BASE_URL}${path}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(
      response.status,
      `FX data request failed${text ? `: ${text.slice(0, 160)}` : ""}`
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

async function fetchDailyBars(symbol, from, to) {
  return (await fetchDailyBarsWithMeta(symbol, from, to)).bars;
}

async function getUsdEurFxRates({ from, to }) {
  const cacheKey = `${from}:${to}:USD:EUR`;

  if (fxRatesCache.has(cacheKey)) {
    return fxRatesCache.get(cacheKey);
  }

  const payload = await frankfurterFetch(`/${from}..${to}`, {
    base: "USD",
    symbols: "EUR"
  });

  const result = {
    base: "USD",
    quote: "EUR",
    from,
    to,
    rates: Object.fromEntries(
      Object.entries(payload?.rates || {}).map(([date, rateSet]) => [
        date,
        Number(Number(rateSet?.EUR || 0).toFixed(6))
      ])
    )
  };

  fxRatesCache.set(cacheKey, result);
  return result;
}

function calculateEntryVolume(minuteBars, entryDate) {
  const bars = completedBars(minuteBars, entryDate).filter((bar) => Number.isFinite(bar.volume));
  return bars.length ? bars.reduce((total, bar) => total + bar.volume, 0) : null;
}

function getPriorSessionBars(dailyBars, entryDate) {
  const dayStart = marketTime(marketDayKey(entryDate), "00:00").getTime();
  return dailyBars.filter((bar) => bar.time * 1000 < dayStart).sort((a, b) => a.time - b.time);
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

  const dayKey = marketDayKey(parsedEntryDate);
  const dayStart = marketTime(dayKey, "04:00");
  const marketDayEnd = marketTime(dayKey, "20:00");
  const priorDayEnd = new Date(marketTime(dayKey, "00:00").getTime() - 1);
  const dailyHistoryStart = marketTime(shiftDay(dayKey, -45), "00:00");
  const priorSessionLimit = 20;

  try {
    const [minuteBarsResult, dailyBarsResult] = await Promise.all([
      fetchMinuteBarsWithMeta(normalizedSymbol, dayStart, marketDayEnd),
      fetchDailyBarsWithMeta(normalizedSymbol, dailyHistoryStart, priorDayEnd)
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

  const { bars, feed } = await fetchMinuteBarsWithMeta(normalizedSymbol, fromDate, toDate);

  return {
    symbol: normalizedSymbol,
    resolution,
    includeExtended,
    feed,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    bars
  };
}

async function fetchScanBars(symbols, timeframe, start, end, feed, asof, adjustment = "split") {
  const grouped = new Map();
  let pageToken;

  do {
    const data = await alpacaFetch("/v2/stocks/bars", {
      symbols: symbols.join(","),
      timeframe,
      start: start.toISOString(),
      end: end.toISOString(),
      adjustment,
      asof,
      sort: "asc",
      limit: 10000,
      feed,
      page_token: pageToken
    });
    for (const [symbol, bars] of Object.entries(data.bars || {})) {
      const existing = grouped.get(symbol) || [];
      for (const bar of bars) {
        existing.push({ ...normalizeBarPayload(bar), vwap: Number(bar.vw) || null });
      }
      grouped.set(symbol, existing);
    }
    pageToken = data.next_page_token;
  } while (pageToken);

  return grouped;
}

async function getEntryQuote(symbol, entryTime) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const data = await alpacaFetch("/v2/stocks/quotes", {
    symbols: normalizedSymbol,
    asof: marketDayKey(entryTime),
    start: new Date(entryTime.getTime() - 60_000).toISOString(),
    end: entryTime.toISOString(),
    sort: "desc",
    limit: 20,
    feed: "sip"
  });
  const quote = data.quotes?.[normalizedSymbol]?.find((item) => new Date(item.t) < entryTime && item.bp > 0 && item.ap >= item.bp);
  return quote ? { bid: quote.bp, ask: quote.ap, time: quote.t, feed: "sip" } : null;
}

async function getHistoricalNews(symbol, start, end) {
  const data = await alpacaFetch("/v1beta1/news", {
    symbols: normalizeSymbol(symbol), start: start.toISOString(), end: end.toISOString(),
    limit: 50, include_content: false
  });
  return (data.news || []).filter((item) => new Date(item.created_at) < end && new Date(item.updated_at ?? item.created_at) < end)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
    .map((item) => ({ headline: item.headline, publishedAt: item.created_at, source: item.source }));
}

module.exports = {
  getBars,
  fetchScanBars,
  getHistoricalNews,
  getEntryQuote,
  getUsdEurFxRates,
  getTradeImportContext,
  refreshTradeImportContext,
  scheduleTradeImportContextBackfill
};
