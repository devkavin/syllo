import axios, { AxiosError } from "axios";
import { store, STORAGE_KEYS } from "./storage";

const baseURL = process.env.EXPO_PUBLIC_API_BASE;

if (!baseURL) {
  // Fail loud in dev if env is missing.
  // eslint-disable-next-line no-console
  console.warn(
    "[syllo] EXPO_PUBLIC_API_BASE is missing. Set it in mobile/.env and restart the bundler.",
  );
}

export const api = axios.create({
  baseURL,
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  const token = await store.get(STORAGE_KEYS.accessToken);
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 for a non-auth call: clear tokens so the app kicks back to login.
// Backend has no refresh endpoint yet, so we keep this dumb and honest.
api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const url = error.config?.url ?? "";
    if (status === 401 && !url.includes("/auth/")) {
      await store.del(STORAGE_KEYS.accessToken);
      await store.del(STORAGE_KEYS.refreshToken);
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(e: unknown): string {
  const err = e as AxiosError<{ detail?: string; message?: string }>;
  if (err?.response?.data) {
    const d = err.response.data;
    if (typeof d === "string") return d;
    if (d.detail) return d.detail;
    if (d.message) return d.message;
  }
  if (err?.message) return err.message;
  return "Something went wrong. Try again.";
}
