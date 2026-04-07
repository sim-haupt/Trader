import api from "./api";

function extractTrades(response) {
  return response.data.data ?? [];
}

const tradeService = {
  async getTrades(filters = {}) {
    const response = await api.get("/trades", { params: filters });
    return extractTrades(response);
  },

  async getAllTrades(filters = {}) {
    const response = await api.get("/trades", {
      params: {
        ...filters,
        scope: "all"
      }
    });
    return extractTrades(response);
  },

  async createTrade(payload) {
    const response = await api.post("/trades", payload);
    return response.data.data;
  },

  async updateTrade(id, payload) {
    const response = await api.put(`/trades/${id}`, payload);
    return response.data.data;
  },

  async deleteTrade(id) {
    const response = await api.delete(`/trades/${id}`);
    return response.data.data;
  },

  async bulkDeleteTrades(tradeIds) {
    const response = await api.post("/trades/bulk-delete", { tradeIds });
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

    return response.data.data;
  },

  async importTradesFromText(text) {
    const response = await api.post("/trades/import-text", { text });
    return response.data.data;
  }
};

export default tradeService;
