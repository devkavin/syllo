import React, { createContext, useContext, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { http, offlineNotes } from "./api";
import { queryKeys } from "./queryKeys";
import { browserTimezone } from "./studyTime";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: async ({ signal }) => {
      try {
        const data = (await http.get("/auth/me", { signal })).data;
        if (signal.aborted) return null;
        await offlineNotes.rememberProfile(data);
        return data;
      } catch (error) {
        if (signal.aborted) return null;
        if (!error.response && navigator.onLine === false) return offlineNotes.offlineProfile();
        if ([401, 403].includes(error.response?.status)) offlineNotes.clearOwner();
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
  const user = profile.isPending ? undefined : (profile.data ?? null);
  useEffect(() => {
    const changedAccount = event => {
      if (event.key !== offlineNotes.accountPointer) return;
      offlineNotes.setOwner(null);
      if (event.newValue === null) {
        void client.cancelQueries({ queryKey: queryKeys.profile });
        client.setQueryData(queryKeys.profile, null);
        client.removeQueries({ predicate: query => query.queryKey[0] !== queryKeys.profile[0] });
        return;
      }
      client.removeQueries({ predicate: query => query.queryKey[0] !== queryKeys.profile[0] });
      void client.resetQueries({ queryKey: queryKeys.profile });
    };
    window.addEventListener("storage", changedAccount);
    return () => window.removeEventListener("storage", changedAccount);
  }, [client]);
  const timezoneAttempt = useRef(null);
  useEffect(() => {
    if (!user || user.timezone || timezoneAttempt.current === user.user_id) return;
    const id = user.user_id; timezoneAttempt.current = id;
    http.post("/auth/timezone", { timezone: browserTimezone() }).then(({ data }) => {
      client.setQueryData(queryKeys.profile, current => current?.user_id === id && !current.timezone ? data : current);
    }).catch(() => { /* Legacy offset remains usable; Settings exposes retry/change. */ });
  }, [user, client]);

  const storeUser = (data) => {
    offlineNotes.setOwner(data?.user_id);
    void offlineNotes.rememberProfile(data);
    client.setQueryData(queryKeys.profile, data);
    return data;
  };

  const login = async (email, password) => {
    const { data } = await http.post("/auth/login", { email, password });
    await client.cancelQueries({ queryKey: queryKeys.profile });
    client.removeQueries({ predicate: query => query.queryKey[0] !== queryKeys.profile[0] });
    return storeUser(data);
  };
  const register = async (email, password, name, referral_code) => {
    const { data } = await http.post("/auth/register", { email, password, name, referral_code });
    await client.cancelQueries({ queryKey: queryKeys.profile });
    client.removeQueries({ predicate: query => query.queryKey[0] !== queryKeys.profile[0] });
    return storeUser(data);
  };
  const logout = async () => {
    await client.cancelQueries();
    void offlineNotes.logout();
    client.removeQueries({ predicate: query => query.queryKey[0] !== queryKeys.profile[0] });
    client.setQueryData(queryKeys.profile, null);
    try { await http.post("/auth/logout"); } catch {}
  };
  const refreshMe = async () => {
    try {
      const data = await client.fetchQuery({
        queryKey: queryKeys.profile,
        queryFn: async () => (await http.get("/auth/me")).data,
        staleTime: 0,
      });
      await offlineNotes.rememberProfile(data);
      return data;
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
