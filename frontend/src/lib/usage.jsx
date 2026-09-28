import React, { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "./api";
import { useAuth } from "./auth";
import { queryKeys } from "./queryKeys";

const UsageCtx = createContext(null);

export function UsageProvider({ children }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.usage,
    queryFn: async () => (await http.get("/billing/usage")).data,
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const usage = user ? (query.data ?? null) : null;

  const refresh = async () => {
    if (!user) return null;
    return (await query.refetch()).data ?? null;
  };

  const setRemaining = (n) => {
    client.setQueryData(queryKeys.usage, (current) => (
      current ? { ...current, credits_remaining: n } : current
    ));
  };

  return <UsageCtx.Provider value={{ usage, refresh, setRemaining }}>{children}</UsageCtx.Provider>;
}

export function useUsage() {
  return useContext(UsageCtx);
}
