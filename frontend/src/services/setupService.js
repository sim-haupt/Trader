import strategyService, { clearStrategyCache } from "./strategyService";

export function clearSetupCache() {
  clearStrategyCache();
}

const setupService = {
  peekSetups() {
    return strategyService.peekStrategies();
  },

  getSetups(options = {}) {
    return strategyService.getStrategies(options);
  },

  createSetup(name) {
    return strategyService.createStrategy(name);
  },

  deleteSetup(id) {
    return strategyService.deleteStrategy(id);
  },

  deleteSetups(ids) {
    return strategyService.deleteStrategies(ids);
  }
};

export default setupService;
