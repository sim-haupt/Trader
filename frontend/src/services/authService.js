import api from "./api";

const authService = {
  async login(payload) {
    const response = await api.post("/auth/login", payload);
    return response.data.data;
  },

  async register(payload) {
    const response = await api.post("/auth/register", payload);
    return response.data.data;
  },

  async getSettings() {
    const response = await api.get("/auth/settings");
    return response.data.data;
  },

  async getMeta() {
    const response = await api.get("/auth/meta");
    return response.data.data;
  },

  async updateSettings(payload) {
    const response = await api.patch("/auth/settings", payload);
    return response.data.data;
  }
};

export default authService;
