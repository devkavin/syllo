import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { http, offlineNotes } from "./api";
import { queryKeys } from "./queryKeys";
import { browserTimezone } from "./studyTime";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const client = useQueryClient();
  const [checkingSession, setCheckingSession] = useState(false);
  const authEpoch = useRef(0);
  const rechecking = useRef(null);
  const clearSession = useCallback(() => {
    authEpoch.current++;
    void client.cancelQueries();
    offlineNotes.clearOwner();
    client.removeQueries({ predicate: query => query.queryKey[0] !== queryKeys.profile[0] });
    client.setQueryData(queryKeys.profile, null);
    setCheckingSession(false);
  }, [client]);
  const readProfile = useCallback(async ({ signal }) => {
    try {
      const data = (await http.get("/auth/me", { signal })).data;
      if (signal.aborted) return null;
      await offlineNotes.rememberProfile(data);
      return signal.aborted ? null : data;
    } catch (error) {
      if (signal.aborted) return null;
      if (!error.response && navigator.onLine === false) return offlineNotes.offlineProfile();
      if ([401, 403].includes(error.response?.status)) clearSession();
      return null;
    }
  }, [clearSession]);
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: readProfile,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const user = profile.isPending || checkingSession ? undefined : (profile.data ?? null);
  useEffect(() => {
    const requestId = http.interceptors.request.use(config => ({ ...config, authEpoch: authEpoch.current }));
    const responseId = http.interceptors.response.use(response => response, error => {
      // A delayed rejection from an earlier account must not sign out a new login.
      const config = error.config;
      if (error.response?.status === 401 && config?.authEpoch === authEpoch.current &&
          !["/auth/login", "/auth/register", "/auth/logout"].includes(config.url)) clearSession();
      return Promise.reject(error);
    });
    return () => {
      http.interceptors.request.eject(requestId);
      http.interceptors.response.eject(responseId);
    };
  }, [clearSession]);
  useEffect(() => {
    const changedAccount = event => {
      if (event.key !== offlineNotes.accountPointer) return;
      offlineNotes.setOwner(null);
      if (event.newValue === null) {
        clearSession();
        return;
      }
      authEpoch.current++;
      client.removeQueries({ predicate: query => query.queryKey[0] !== queryKeys.profile[0] });
      void client.resetQueries({ queryKey: queryKeys.profile });
    };
    window.addEventListener("storage", changedAccount);
    return () => window.removeEventListener("storage", changedAccount);
  }, [client, clearSession]);
  const timezoneAttempt = useRef(null);
  useEffect(() => {
    if (!user || user.timezone || timezoneAttempt.current === user.user_id) return;
    const id = user.user_id; timezoneAttempt.current = id;
    http.post("/auth/timezone", { timezone: browserTimezone() }).then(({ data }) => {
      client.setQueryData(queryKeys.profile, current => current?.user_id === id && !current.timezone ? data : current);
    }).catch(() => { /* Legacy offset remains usable; Settings exposes retry/change. */ });
  }, [user, client]);

  const storeUser = (data) => {
    authEpoch.current++;
    setCheckingSession(false);
    offlineNotes.setOwner(data?.user_id);
    void offlineNotes.rememberProfile(data);
    client.setQueryData(queryKeys.profile, data);
    return data;
  };

  const login = async (email, password) => {
    const { data } = await http.post("/auth/login", { email, password });
    await client.cancelQueries();
    client.removeQueries({ predicate: query => query.queryKey[0] !== queryKeys.profile[0] });
    return storeUser(data);
  };
  const register = async (email, password, name, referral_code) => {
    const { data } = await http.post("/auth/register", { email, password, name, referral_code });
    await client.cancelQueries();
    client.removeQueries({ predicate: query => query.queryKey[0] !== queryKeys.profile[0] });
    return storeUser(data);
  };
  const logout = async () => {
    // Capture the owner before clearing it so the offline logout can remove its saved rows.
    void offlineNotes.logout();
    clearSession();
    try { await http.post("/auth/logout"); } catch {}
  };
  const refreshMe = useCallback(async () => {
    try {
      return await client.fetchQuery({
        queryKey: queryKeys.profile,
        queryFn: readProfile,
        staleTime: 0,
      });
    } catch { return null; }
  }, [client, readProfile]);
  useEffect(() => {
    let mounted = true;
    const revalidate = () => {
      if (rechecking.current) return;
      setCheckingSession(true);
      const check = refreshMe();
      rechecking.current = check;
      void check.finally(() => {
        if (rechecking.current === check) {
          rechecking.current = null;
          if (mounted) setCheckingSession(false);
        }
      });
    };
    // Hide private DOM before the browser stores a back/forward-cache snapshot.
    const hidePage = () => {
      rechecking.current = null;
      void client.cancelQueries({ queryKey: queryKeys.profile });
      flushSync(() => setCheckingSession(true));
    };
    const restorePage = event => { if (event.persisted) revalidate(); };
    window.addEventListener("pagehide", hidePage);
    window.addEventListener("pageshow", restorePage);
    window.addEventListener("popstate", revalidate);
    return () => {
      mounted = false;
      window.removeEventListener("pagehide", hidePage);
      window.removeEventListener("pageshow", restorePage);
      window.removeEventListener("popstate", revalidate);
    };
  }, [client, refreshMe]);
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
