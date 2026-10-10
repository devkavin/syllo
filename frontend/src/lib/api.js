import axios from "axios";

export function resolveApiBase(value) {
  return value?.replace(/\/$/, "") || "/api";
}

export const API = resolveApiBase(import.meta.env.VITE_API_BASE_URL);

export const http = axios.create({
  baseURL: API,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export function formatError(err) {
  const d = err?.response?.data?.detail;
  if (!d) return err?.message || "Something went wrong.";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  if (d?.msg) return d.msg;
  if (d?.message) return d.message;
  return String(d);
}
