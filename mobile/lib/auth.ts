import { create } from "zustand";
import { api, apiErrorMessage } from "./api";
import { store, STORAGE_KEYS } from "./storage";
import type { AuthResponse, User } from "./types";
import { exchangeGoogleCode } from "./google-auth";

interface AuthState {
  user: User | null;
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, referralCode?: string) => Promise<void>;
  googleExchange: (code: string) => Promise<void>;
  hydrate: () => Promise<void>;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

async function persistTokens(res: AuthResponse) {
  if (res.access_token) await store.set(STORAGE_KEYS.accessToken, res.access_token);
  if (res.refresh_token) await store.set(STORAGE_KEYS.refreshToken, res.refresh_token);
}

function stripTokens(res: AuthResponse): User {
  const { access_token, refresh_token, ...user } = res;
  void access_token;
  void refresh_token;
  return user as User;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  hydrated: false,
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<AuthResponse>("/auth/login", { email, password });
      await persistTokens(res.data);
      set({ user: stripTokens(res.data), loading: false });
    } catch (e) {
      set({ loading: false, error: apiErrorMessage(e) });
      throw e;
    }
  },

  register: async (name, email, password, referralCode) => {
    set({ loading: true, error: null });
    try {
      const payload: Record<string, unknown> = { name, email, password };
      if (referralCode && referralCode.trim()) payload.referral_code = referralCode.trim();
      const res = await api.post<AuthResponse>("/auth/register", payload);
      await persistTokens(res.data);
      set({ user: stripTokens(res.data), loading: false });
    } catch (e) {
      set({ loading: false, error: apiErrorMessage(e) });
      throw e;
    }
  },

  googleExchange: async (code) => {
    set({ loading: true, error: null });
    try {
      const result = await exchangeGoogleCode(code);
      await persistTokens(result);
      set({ user: stripTokens(result), loading: false });
    } catch (e) {
      set({ loading: false, error: apiErrorMessage(e) });
      throw e;
    }
  },

  hydrate: async () => {
    if (get().hydrated) return;
    const token = await store.get(STORAGE_KEYS.accessToken);
    if (!token) {
      set({ hydrated: true });
      return;
    }
    try {
      const res = await api.get<User>("/auth/me");
      set({ user: res.data, hydrated: true });
    } catch {
      await store.del(STORAGE_KEYS.accessToken);
      await store.del(STORAGE_KEYS.refreshToken);
      set({ user: null, hydrated: true });
    }
  },

  refreshMe: async () => {
    try {
      const res = await api.get<User>("/auth/me");
      set({ user: res.data });
    } catch {
      // stay silent, interceptor already cleared tokens on 401
    }
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore, still clear locally
    }
    await store.del(STORAGE_KEYS.accessToken);
    await store.del(STORAGE_KEYS.refreshToken);
    set({ user: null });
  },
}));
