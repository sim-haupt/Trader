import api from "./api";
import {
  clearPersistentCacheGroup,
  readPersistentCache,
  removePersistentCache,
  writePersistentCache
} from "../utils/persistentCache";

let journalDayCache = null;
let journalDayRequest = null;
const fxRateCache = new Map();
const JOURNAL_DAY_TTL_MS = 5 * 60_000;

export function clearJournalDayCache() {
  journalDayCache = null;
  journalDayRequest = null;
  clearPersistentCacheGroup("journal");
}

const journalService = {
  peekJournalDays() {
    if (journalDayCache) {
      return journalDayCache;
    }

    journalDayCache = readPersistentCache("journal:days", JOURNAL_DAY_TTL_MS);
    return journalDayCache;
  },

  async getJournalDays(options = {}) {
    const cached = this.peekJournalDays();

    if (cached && !options.forceRefresh) {
      return cached;
    }

    if (!options.forceRefresh && journalDayRequest) {
      return journalDayRequest;
    }

    if (options.forceRefresh) {
      removePersistentCache("journal:days");
    }

    journalDayRequest = api
      .get("/journal-days")
      .then((response) => {
        journalDayCache = response.data.data ?? [];
        writePersistentCache("journal:days", journalDayCache);
        return journalDayCache;
      })
      .finally(() => {
        journalDayRequest = null;
      });

    return journalDayRequest;
  },

  async updateJournalDay(dayKey, payload) {
    const response = await api.patch(`/journal-days/${dayKey}`, payload);
    clearJournalDayCache();
    return response.data.data;
  },

  async importCommissionFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await api.post("/journal-days/import-commissions", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });
    clearJournalDayCache();
    return response.data.data ?? [];
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
