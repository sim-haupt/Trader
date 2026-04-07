import api from "./api";

const authService = {
  async login(payload) {
    const response = await api.post("/auth/login", payload);
    return response.data.data;
  },

  async register(payload) {
    const response = await api.post("/auth/register", payload);
    return response.data.data;
  }
};

export default authService;
