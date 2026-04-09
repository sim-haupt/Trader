import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import authService from "../services/authService";
import api from "../services/api";
import { clearStoredAuth, readStoredAuth, writeStoredAuth } from "../utils/authStorage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [auth, setAuth] = useState(readStoredAuth);

  useEffect(() => {
    if (auth?.token) {
      api.defaults.headers.common.Authorization = `Bearer ${auth.token}`;
      writeStoredAuth(auth);
      return;
    }

    delete api.defaults.headers.common.Authorization;
    clearStoredAuth();
  }, [auth]);

  useEffect(() => {
    function handleUnauthorized() {
      setAuth({ token: null, user: null });
      navigate("/login", { replace: true });
    }

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, [navigate]);

  const login = useCallback(async (credentials) => {
    const data = await authService.login(credentials);
    api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    writeStoredAuth(data);
    setAuth(data);
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await authService.register(payload);
    api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    writeStoredAuth(data);
    setAuth(data);
    return data;
  }, []);

  const refreshSettings = useCallback(async () => {
    const user = await authService.getSettings();
    setAuth((current) => {
      const next = {
        ...(current || {}),
        user
      };
      writeStoredAuth(next);
      return next;
    });
    return user;
  }, []);

  const updateSettings = useCallback(async (payload) => {
    const user = await authService.updateSettings(payload);
    setAuth((current) => {
      const next = {
        ...(current || {}),
        user
      };
      writeStoredAuth(next);
      return next;
    });
    return user;
  }, []);

  const logout = useCallback(() => {
    setAuth({ token: null, user: null });
    navigate("/login", { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({
      token: auth?.token ?? null,
      user: auth?.user ?? null,
      isAuthenticated: Boolean(auth?.token),
      login,
      register,
      refreshSettings,
      updateSettings,
      logout
    }),
    [auth, login, logout, refreshSettings, register, updateSettings]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
