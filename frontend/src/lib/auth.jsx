import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { http } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out, object = logged in

  const checkAuth = useCallback(async () => {
    // Skip /me if we're returning from Google OAuth (AuthCallback handles it)
    if (window.location.hash?.includes("session_id=")) {
      setUser(null);
      return;
    }
    try {
      const { data } = await http.get("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const { data } = await http.post("/auth/login", { email, password });
    setUser(data);
    return data;
  };
  const register = async (email, password, name, referral_code) => {
    const { data } = await http.post("/auth/register", { email, password, name, referral_code });
    setUser(data);
    return data;
  };
  const logout = async () => {
    try { await http.post("/auth/logout"); } catch {}
    setUser(null);
  };
  const refreshMe = async () => {
    try {
      const { data } = await http.get("/auth/me");
      setUser(data);
      return data;
    } catch { return null; }
  };
  const updateMe = async (patch) => {
    const { data } = await http.patch("/auth/me", patch);
    setUser(data);
    return data;
  };

  return (
    <AuthCtx.Provider value={{ user, login, register, logout, refreshMe, updateMe }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
