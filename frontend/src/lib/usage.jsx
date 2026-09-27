import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { http } from "./api";
import { useAuth } from "./auth";

const UsageCtx = createContext(null);

export function UsageProvider({ children }) {
  const { user } = useAuth();
  const [usage, setUsage] = useState(null);

  const refresh = useCallback(async () => {
    if (!user) { setUsage(null); return; }
    try {
      const { data } = await http.get("/billing/usage");
      setUsage(data);
    } catch { setUsage(null); }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const setRemaining = (n) => {
    setUsage((u) => u ? { ...u, credits_remaining: n } : u);
  };

  return <UsageCtx.Provider value={{ usage, refresh, setRemaining }}>{children}</UsageCtx.Provider>;
}

export function useUsage() {
  return useContext(UsageCtx);
}
