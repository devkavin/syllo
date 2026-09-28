import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { formatError } from "@/lib/api";
import { GraduationCap } from "lucide-react";

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await login(email, password); nav("/today"); }
    catch (e) { setErr(formatError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground grid place-items-center p-4">
      <form onSubmit={submit} className="card p-8 w-full max-w-sm space-y-4 fade-in" data-testid="login-form">
        <div className="text-center mb-2">
          <div className="w-10 h-10 mx-auto rounded-lg bg-primary text-primary-foreground grid place-items-center"><GraduationCap className="w-5 h-5" /></div>
          <h1 className="font-serif text-2xl mt-3">Welcome back</h1>
          <p className="text-muted-foreground text-sm mt-1">Sign in to your study space.</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Email</label>
          <input className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required data-testid="login-email" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Password</label>
          <input className="input mt-1" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required data-testid="login-password" />
        </div>
        {err && <div className="text-destructive text-sm">{err}</div>}
        <button className="btn btn-primary w-full" disabled={busy} data-testid="login-submit">
          {busy ? "Signing in" : "Sign in"}
        </button>
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center"><span className="bg-card px-2 text-xs text-muted-foreground">or</span></div>
        </div>
        <a href="/api/auth/google/start?client=web&return_to=%2Ftoday" className="btn btn-outline w-full" data-testid="login-google">
          Continue with Google
        </a>
        <div className="text-center text-sm text-muted-foreground">
          New here? <Link to="/register" className="text-foreground underline" data-testid="link-register">Create an account</Link>
        </div>
        <div className="text-center text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground underline">Privacy</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/terms" className="hover:text-foreground underline">Terms</Link>
        </div>
      </form>
    </div>
  );
}
