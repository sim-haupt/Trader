import api from "./api";

let strategyCache = null;

function clearStrategyCache() {
  strategyCache = null;
}

const strategyService = {
  peekStrategies() {
    return strategyCache;
  },

  async getStrategies(options = {}) {
    if (strategyCache && !options.forceRefresh) {
      return strategyCache;
    }

    const response = await api.get("/strategies");
    strategyCache = response.data.data ?? [];
    return strategyCache;
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
  }
};

export default strategyService;
