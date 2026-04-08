import api from "./api";

const MARKET_DATA_TTL_MS = 5 * 60_000;
const marketDataCache = new Map();

function buildBarsKey({ symbol, resolution, from, to, includeExtended }) {
  return JSON.stringify({
    symbol,
    resolution,
    from,
    to,
    includeExtended: Boolean(includeExtended)
  });
}

function readCache(key) {
  const entry = marketDataCache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.createdAt > MARKET_DATA_TTL_MS) {
    marketDataCache.delete(key);
    return null;
  }

  return entry.data;
}

function normalizeMarketDataError(error) {
  const message = error?.message || "Market data request failed.";

  if (/not_authorized/i.test(message) || /not entitled/i.test(message) || /forbidden/i.test(message)) {
    return new Error(
      "1-minute chart data is unavailable on the current Alpaca market data plan. The chart is hidden, but the execution table remains available."
    );
  }

  if (/too many requests/i.test(message) || /rate limit/i.test(message) || /429/.test(message)) {
    return new Error(
      "The Alpaca market data rate limit was reached. Please try again in a moment."
    );
  }

  return new Error(message);
}

const marketDataService = {
  peekBars(params) {
    return readCache(buildBarsKey(params));
  },

  async getBars({ symbol, resolution, from, to, includeExtended = true }, options = {}) {
    const key = buildBarsKey({ symbol, resolution, from, to, includeExtended });
    const cached = readCache(key);

    if (cached && !options.forceRefresh) {
      return cached;
    }

    try {
      const response = await api.get("/market-data/bars", {
        params: {
          symbol,
          resolution,
          from,
          to,
          includeExtended: includeExtended ? "true" : "false"
        }
      });

      const data = response.data.data;
      marketDataCache.set(key, {
        data,
        createdAt: Date.now()
      });
      return data;
    } catch (error) {
      throw normalizeMarketDataError(error);
    }
  }
};

export default marketDataService;
