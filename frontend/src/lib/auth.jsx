import React, { createContext, useContext, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "./api";
import { queryKeys } from "./queryKeys";
import { browserTimezone } from "./studyTime";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: async () => {
      try {
        return (await http.get("/auth/me")).data;
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
  const user = profile.isPending ? undefined : (profile.data ?? null);
  const timezoneAttempt = useRef(null);
  useEffect(() => {
    if (!user || user.timezone || timezoneAttempt.current === user.user_id) return;
    const id = user.user_id; timezoneAttempt.current = id;
    http.post("/auth/timezone", { timezone: browserTimezone() }).then(({ data }) => {
      client.setQueryData(queryKeys.profile, current => current?.user_id === id && !current.timezone ? data : current);
    }).catch(() => { /* Legacy offset remains usable; Settings exposes retry/change. */ });
  }, [user, client]);

  const storeUser = (data) => {
    client.setQueryData(queryKeys.profile, data);
    return data;
  };

  const login = async (email, password) => {
    const { data } = await http.post("/auth/login", { email, password });
    return storeUser(data);
  };
  const register = async (email, password, name, referral_code) => {
    const { data } = await http.post("/auth/register", { email, password, name, referral_code });
    return storeUser(data);
  };
  const logout = async () => {
    try { await http.post("/auth/logout"); } catch {}
    client.setQueryData(queryKeys.profile, null);
    client.removeQueries({ queryKey: queryKeys.usage });
  };
  const refreshMe = async () => {
    try {
      return await client.fetchQuery({
        queryKey: queryKeys.profile,
        queryFn: async () => (await http.get("/auth/me")).data,
        staleTime: 0,
      });
    } catch { return null; }
  };
  const updateMe = async (patch) => {
    const { data } = await http.patch("/auth/me", patch);
    return storeUser(data);
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
