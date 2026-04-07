import api from "./api";

const marketDataService = {
  async getBars({ symbol, resolution, from, to, includeExtended = true }) {
    const response = await api.get("/market-data/bars", {
      params: {
        symbol,
        resolution,
        from,
        to,
        includeExtended: includeExtended ? "true" : "false"
      }
    });

    return response.data.data;
  }
};

export default marketDataService;
