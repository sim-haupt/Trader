import api from "./api";

function extractTrades(response) {
  return response.data.data ?? [];
}

const TRADE_LIST_TTL_MS = 60_000;
const TRADE_DETAIL_TTL_MS = 60_000;
const TRADE_TAGS_TTL_MS = 60_000;
const tradeListCache = new Map();
const tradeDetailCache = new Map();
let tradeTagsCache = null;
let tradeTagsCreatedAt = 0;

function buildCacheKey(prefix, filters = {}) {
  const normalized = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right));

  return `${prefix}:${JSON.stringify(normalized)}`;
}

function readCache(cache, key, ttlMs) {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.createdAt > ttlMs) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

function writeCache(cache, key, data) {
  cache.set(key, {
    data,
    createdAt: Date.now()
  });

  return data;
}

function clearTradeCaches() {
  tradeListCache.clear();
  tradeDetailCache.clear();
  tradeTagsCache = null;
  tradeTagsCreatedAt = 0;
}

const tradeService = {
  peekTrades(filters = {}) {
    return readCache(tradeListCache, buildCacheKey("trades", filters), TRADE_LIST_TTL_MS);
  },

  peekAllTrades(filters = {}) {
    return readCache(tradeListCache, buildCacheKey("all-trades", filters), TRADE_LIST_TTL_MS);
  },

  peekTrade(id) {
    return readCache(tradeDetailCache, String(id), TRADE_DETAIL_TTL_MS);
  },

  peekTradeTags() {
    if (!tradeTagsCache) {
      return null;
    }

    if (Date.now() - tradeTagsCreatedAt > TRADE_TAGS_TTL_MS) {
      tradeTagsCache = null;
      tradeTagsCreatedAt = 0;
      return null;
    }

    return tradeTagsCache;
  },

  async getTrades(filters = {}, options = {}) {
    const cacheKey = buildCacheKey("trades", filters);
    const cached = readCache(tradeListCache, cacheKey, TRADE_LIST_TTL_MS);

    if (cached && !options.forceRefresh) {
      return cached;
    }

    const response = await api.get("/trades", { params: filters });
    return writeCache(tradeListCache, cacheKey, extractTrades(response));
  },

  async getAllTrades(filters = {}, options = {}) {
    const cacheKey = buildCacheKey("all-trades", filters);
    const cached = readCache(tradeListCache, cacheKey, TRADE_LIST_TTL_MS);

    if (cached && !options.forceRefresh) {
      return cached;
    }

    const response = await api.get("/trades", {
      params: {
        ...filters,
        scope: "all"
      }
    });
    return writeCache(tradeListCache, cacheKey, extractTrades(response));
  },

  async getTrade(id, options = {}) {
    const cacheKey = String(id);
    const cached = readCache(tradeDetailCache, cacheKey, TRADE_DETAIL_TTL_MS);

    if (cached && !options.forceRefresh) {
      return cached;
    }

    const response = await api.get(`/trades/${id}`);
    return writeCache(tradeDetailCache, cacheKey, response.data.data);
  },

  async getTradeTags(options = {}) {
    const cached = this.peekTradeTags();

    if (cached && !options.forceRefresh) {
      return cached;
    }

    const response = await api.get("/trades/tags");
    tradeTagsCache = response.data.data ?? [];
    tradeTagsCreatedAt = Date.now();
    return tradeTagsCache;
  },

  async createTrade(payload) {
    const response = await api.post("/trades", payload);
    clearTradeCaches();
    return response.data.data;
  },

  async updateTrade(id, payload) {
    const response = await api.put(`/trades/${id}`, payload);
    clearTradeCaches();
    return response.data.data;
  },

  async updateTradeMeta(id, payload) {
    const response = await api.patch(`/trades/${id}/meta`, payload);
    clearTradeCaches();
    return response.data.data;
  },

  async deleteTrade(id) {
    const response = await api.delete(`/trades/${id}`);
    clearTradeCaches();
    return response.data.data;
  },

  async bulkDeleteTrades(tradeIds) {
    const response = await api.post("/trades/bulk-delete", { tradeIds });
    clearTradeCaches();
    return response.data.data;
  },

  async bulkUpdateTrades(payload) {
    const response = await api.post("/trades/bulk-update", payload);
    clearTradeCaches();
    return response.data.data;
  },

  async deleteAllTrades(scope) {
    const response = await api.post("/trades/delete-all", scope ? { scope } : {});
    clearTradeCaches();
    return response.data.data;
  },

  async importTrades(file) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await api.post("/trades/import", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });

    clearTradeCaches();
    return response.data.data;
  },

  async importTradesFromText(text) {
    const response = await api.post("/trades/import-text", { text });
    clearTradeCaches();
    return response.data.data;
  }
};

export default tradeService;
