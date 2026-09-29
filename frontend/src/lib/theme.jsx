import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth";

const ThemeCtx = createContext(null);
const THEME_KEY = "syllo-theme";
const PENDING_KEY = "syllo-theme-pending";
const validTheme = (value) => value === "dark" || value === "light";

export function ThemeProvider({ children }) {
  const { user, updateMe } = useAuth();
  const [theme, setThemeState] = useState(() => {
    const cached = localStorage.getItem(THEME_KEY);
    return validTheme(cached) ? cached : "light";
  });
  const [error, setError] = useState("");
  const appliedUser = useRef(null);
  const syncingUser = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (user === undefined) return;
    if (!user) {
      appliedUser.current = null;
      syncingUser.current = null;
      return;
    }
    if (appliedUser.current === user.user_id || syncingUser.current === user.user_id) return;

    const pending = sessionStorage.getItem(PENDING_KEY);
    if (validTheme(pending)) {
      syncingUser.current = user.user_id;
      updateMe({ theme: pending }).then(() => {
        sessionStorage.removeItem(PENDING_KEY);
        appliedUser.current = user.user_id;
      }).catch(() => {
        sessionStorage.removeItem(PENDING_KEY);
        setThemeState(validTheme(user.theme) ? user.theme : "light");
        setError("Couldn't save your appearance. Please try again.");
      }).finally(() => { syncingUser.current = null; });
      return;
    }
    appliedUser.current = user.user_id;
    setThemeState(validTheme(user.theme) ? user.theme : "light");
  }, [user, updateMe]);

  const setTheme = async (next) => {
    if (!validTheme(next) || next === theme) return;
    const previous = theme;
    setError("");
    setThemeState(next);
    if (!user) {
      sessionStorage.setItem(PENDING_KEY, next);
      return;
    }
    try {
      await updateMe({ theme: next });
    } catch {
      setThemeState(previous);
      setError("Couldn't save your appearance. Please try again.");
    }
  };
  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");
  return <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>
    {children}
    {error && <div role="alert" className="fixed bottom-4 right-4 z-50 rounded-lg border border-destructive/30 bg-background px-4 py-3 text-sm text-destructive shadow-lg">{error}</div>}
  </ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
