import api from "./api";
import {
  clearPersistentCacheGroup,
  readPersistentCache,
  removePersistentCache,
  writePersistentCache
} from "../utils/persistentCache";

function extractTrades(response) {
  return response.data.data ?? [];
}

const TRADE_LIST_TTL_MS = 5 * 60_000;
const TRADE_DETAIL_TTL_MS = 60_000;
const TRADE_TAGS_TTL_MS = 60_000;
const tradeListCache = new Map();
const tradeDetailCache = new Map();
const tradeListRequests = new Map();
const tradeDetailRequests = new Map();
let tradeTagsCache = null;
let tradeTagsCreatedAt = 0;
let tradeTagsRequest = null;

function buildCacheKey(prefix, filters = {}) {
  const normalized = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right));

  return `${prefix}:${JSON.stringify(normalized)}`;
}

function readCache(cache, key, ttlMs) {
  const entry = cache.get(key);

  if (entry) {
    if (Date.now() - entry.createdAt <= ttlMs) {
      return entry.data;
    }

    cache.delete(key);
  }

  return readPersistentCache(`trade:${key}`, ttlMs);
}

function writeCache(cache, key, data) {
  cache.set(key, {
    data,
    createdAt: Date.now()
  });

  return writePersistentCache(`trade:${key}`, data);
}

export function clearTradeCaches() {
  tradeListCache.clear();
  tradeDetailCache.clear();
  tradeListRequests.clear();
  tradeDetailRequests.clear();
  tradeTagsCache = null;
  tradeTagsCreatedAt = 0;
  tradeTagsRequest = null;
  clearPersistentCacheGroup("trade");
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
    if (tradeTagsCache) {
      if (Date.now() - tradeTagsCreatedAt <= TRADE_TAGS_TTL_MS) {
        return tradeTagsCache;
      }

      tradeTagsCache = null;
      tradeTagsCreatedAt = 0;
    }

    const persisted = readPersistentCache("trade:tags", TRADE_TAGS_TTL_MS);

    if (persisted) {
      tradeTagsCache = persisted;
      tradeTagsCreatedAt = Date.now();
      return tradeTagsCache;
    }

    return null;
  },

  async getTrades(filters = {}, options = {}) {
    const cacheKey = buildCacheKey("trades", filters);
    const cached = readCache(tradeListCache, cacheKey, TRADE_LIST_TTL_MS);

    if (cached && !options.forceRefresh) {
      return cached;
    }

    if (!options.forceRefresh && tradeListRequests.has(cacheKey)) {
      return tradeListRequests.get(cacheKey);
    }

    if (options.forceRefresh) {
      removePersistentCache(`trade:${cacheKey}`);
    }

    const request = api
      .get("/trades", { params: filters })
      .then((response) => writeCache(tradeListCache, cacheKey, extractTrades(response)))
      .finally(() => tradeListRequests.delete(cacheKey));

    tradeListRequests.set(cacheKey, request);
    return request;
  },

  async getAllTrades(filters = {}, options = {}) {
    const cacheKey = buildCacheKey("all-trades", filters);
    const cached = readCache(tradeListCache, cacheKey, TRADE_LIST_TTL_MS);

    if (cached && !options.forceRefresh) {
      return cached;
    }

    if (!options.forceRefresh && tradeListRequests.has(cacheKey)) {
      return tradeListRequests.get(cacheKey);
    }

    if (options.forceRefresh) {
      removePersistentCache(`trade:${cacheKey}`);
    }

    const request = api
      .get("/trades", {
        params: {
          ...filters,
          scope: "all"
        }
      })
      .then((response) => writeCache(tradeListCache, cacheKey, extractTrades(response)))
      .finally(() => tradeListRequests.delete(cacheKey));

    tradeListRequests.set(cacheKey, request);
    return request;
  },

  async getTrade(id, options = {}) {
    const cacheKey = String(id);
    const cached = readCache(tradeDetailCache, cacheKey, TRADE_DETAIL_TTL_MS);

    if (cached && !options.forceRefresh) {
      return cached;
    }

    if (!options.forceRefresh && tradeDetailRequests.has(cacheKey)) {
      return tradeDetailRequests.get(cacheKey);
    }

    if (options.forceRefresh) {
      removePersistentCache(`trade:${cacheKey}`);
    }

    const request = api
      .get(`/trades/${id}`)
      .then((response) => writeCache(tradeDetailCache, cacheKey, response.data.data))
      .finally(() => tradeDetailRequests.delete(cacheKey));

    tradeDetailRequests.set(cacheKey, request);
    return request;
  },

  async getTradeTags(options = {}) {
    const cached = this.peekTradeTags();

    if (cached && !options.forceRefresh) {
      return cached;
    }

    if (!options.forceRefresh && tradeTagsRequest) {
      return tradeTagsRequest;
    }

    if (options.forceRefresh) {
      removePersistentCache("trade:tags");
    }

    tradeTagsRequest = api
      .get("/trades/tags")
      .then((response) => {
        tradeTagsCache = response.data.data ?? [];
        tradeTagsCreatedAt = Date.now();
        writePersistentCache("trade:tags", tradeTagsCache);
        return tradeTagsCache;
      })
      .finally(() => {
        tradeTagsRequest = null;
      });

    return tradeTagsRequest;
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

  async importTrades(file, csvFormat = "das") {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("csvFormat", csvFormat);

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
