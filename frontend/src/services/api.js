import axios from "axios";
import { readStoredAuth } from "../utils/authStorage";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api"
});

api.interceptors.request.use((config) => {
  const auth = readStoredAuth();

  if (auth?.token) {
    config.headers.Authorization = `Bearer ${auth.token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || "";
    const isAuthRequest =
      requestUrl.includes("/auth/login") || requestUrl.includes("/auth/register");

    // Bubble a single auth event so session cleanup stays centralized in the auth context.
    if (error.response?.status === 401 && !isAuthRequest) {
      window.dispatchEvent(new Event("auth:unauthorized"));
    }

    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Request failed";

    return Promise.reject(new Error(message));
  }
);

export default api;
