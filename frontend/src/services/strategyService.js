import api from "./api";
import {
  clearPersistentCacheGroup,
  readPersistentCache,
  removePersistentCache,
  writePersistentCache
} from "../utils/persistentCache";

let strategyCache = null;
let strategyRequest = null;
const STRATEGY_TTL_MS = 5 * 60_000;

export function clearStrategyCache() {
  strategyCache = null;
  strategyRequest = null;
  clearPersistentCacheGroup("strategy");
}

const strategyService = {
  peekStrategies() {
    if (strategyCache) {
      return strategyCache;
    }

    strategyCache = readPersistentCache("strategy:list", STRATEGY_TTL_MS);
    return strategyCache;
  },

  async getStrategies(options = {}) {
    const cached = this.peekStrategies();

    if (cached && !options.forceRefresh) {
      return cached;
    }

    if (!options.forceRefresh && strategyRequest) {
      return strategyRequest;
    }

    if (options.forceRefresh) {
      removePersistentCache("strategy:list");
    }

    strategyRequest = api
      .get("/strategies")
      .then((response) => {
        strategyCache = response.data.data ?? [];
        writePersistentCache("strategy:list", strategyCache);
        return strategyCache;
      })
      .finally(() => {
        strategyRequest = null;
      });

    return strategyRequest;
  },

  async createStrategy(name) {
    const response = await api.post("/strategies", { name });
    clearStrategyCache();
    return response.data.data;
  },

  async deleteStrategy(id) {
    const response = await api.delete(`/strategies/${id}`);
    clearStrategyCache();
    return response.data.data;
  },

  async deleteStrategies(ids) {
    await Promise.all(ids.map((id) => api.delete(`/strategies/${id}`)));
    clearStrategyCache();
  }
};

export default strategyService;
