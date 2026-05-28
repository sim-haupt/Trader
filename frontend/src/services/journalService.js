import api from "./api";

let journalDayCache = null;
const fxRateCache = new Map();

export function clearJournalDayCache() {
  journalDayCache = null;
}

const journalService = {
  peekJournalDays() {
    return journalDayCache;
  },

  async getJournalDays(options = {}) {
    if (journalDayCache && !options.forceRefresh) {
      return journalDayCache;
    }

    const response = await api.get("/journal-days");
    journalDayCache = response.data.data ?? [];
    return journalDayCache;
  },

  async updateJournalDay(dayKey, payload) {
    const response = await api.patch(`/journal-days/${dayKey}`, payload);
    clearJournalDayCache();
    return response.data.data;
  },

  async getUsdEurRates(dayKeys = []) {
    const uniqueDayKeys = [...new Set(dayKeys.filter(Boolean))];
    const missingDayKeys = uniqueDayKeys.filter((dayKey) => !fxRateCache.has(dayKey));

    if (missingDayKeys.length > 0) {
      const response = await api.get("/journal-days/fx-rates", {
        params: {
          days: missingDayKeys.join(",")
        }
      });
      const rates = response.data.data ?? {};

      for (const dayKey of missingDayKeys) {
        fxRateCache.set(dayKey, rates[dayKey] ?? { dayKey, rate: null, rateDate: null, error: "Missing rate" });
      }
    }

    return uniqueDayKeys.reduce((result, dayKey) => {
      result[dayKey] = fxRateCache.get(dayKey);
      return result;
    }, {});
  }
};

export default journalService;
