import api from "./api";

let journalDayCache = null;

function clearJournalDayCache() {
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
  }
};

export default journalService;
