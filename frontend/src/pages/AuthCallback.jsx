import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { http } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AuthCallback() {
  const location = useLocation();
  const nav = useNavigate();
  const { refreshMe } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const hash = location.hash || window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    const sessionId = m && m[1];
    if (!sessionId) { nav("/login"); return; }
    (async () => {
      try {
        await http.post("/auth/google/callback", { session_id: sessionId });
        await refreshMe();
        window.history.replaceState({}, "", "/today");
        nav("/today");
      } catch {
        nav("/login");
      }
    })();
  }, [location.hash, nav, refreshMe]);

  return (
    <div className="min-h-screen grid place-items-center text-muted-foreground text-sm" data-testid="auth-callback">
      Signing you in.
    </div>
  );
}
