import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { formatError } from "@/lib/api";
import { GraduationCap } from "lucide-react";

export default function Register() {
  const nav = useNavigate();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await register(email, password, name); nav("/today"); }
    catch (e) { setErr(formatError(e)); } finally { setBusy(false); }
  };
  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/today";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground grid place-items-center p-4">
      <form onSubmit={submit} className="card p-8 w-full max-w-sm space-y-4 fade-in" data-testid="register-form">
        <div className="text-center mb-2">
          <div className="w-10 h-10 mx-auto rounded-lg bg-primary text-primary-foreground grid place-items-center"><GraduationCap className="w-5 h-5" /></div>
          <h1 className="font-serif text-2xl mt-3">Make it yours</h1>
          <p className="text-muted-foreground text-sm mt-1">A quiet space to study. Just for you.</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Name</label>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required data-testid="register-name" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Email</label>
          <input className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required data-testid="register-email" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Password</label>
          <input className="input mt-1" value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={6} required data-testid="register-password" />
        </div>
        {err && <div className="text-destructive text-sm">{err}</div>}
        <button className="btn btn-primary w-full" disabled={busy} data-testid="register-submit">
          {busy ? "Creating" : "Create account"}
        </button>
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center"><span className="bg-card px-2 text-xs text-muted-foreground">or</span></div>
        </div>
        <button type="button" className="btn btn-outline w-full" onClick={googleLogin} data-testid="register-google">
          Continue with Google
        </button>
        <div className="text-center text-sm text-muted-foreground">
          Already have an account? <Link to="/login" className="text-foreground underline" data-testid="link-login">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
