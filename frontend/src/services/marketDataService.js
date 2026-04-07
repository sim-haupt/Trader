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
  }
};

export default marketDataService;
