import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { formatError } from "@/lib/api";
import { GraduationCap, Gift } from "lucide-react";

export default function Register() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referral, setReferral] = useState(sp.get("ref") || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await register(email, password, name, referral || undefined);
      nav("/today");
    } catch (e) { setErr(formatError(e)); } finally { setBusy(false); }
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
          <input className="input mt-1" value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} required data-testid="register-password" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground inline-flex items-center gap-1"><Gift className="w-3 h-3" /> Friend code (optional)</label>
          <input
            className="input mt-1 !uppercase"
            value={referral}
            onChange={(e) => setReferral(e.target.value)}
            placeholder="8 characters"
            maxLength={12}
            data-testid="register-referral"
          />
          {referral && <div className="text-xs text-muted-foreground mt-1">You and your friend will both get a small welcome bonus.</div>}
        </div>
        {err && <div className="text-destructive text-sm">{err}</div>}
        <p className="text-[11px] leading-relaxed text-muted-foreground text-center">
          By creating an account or continuing with Google, you agree to the <Link to="/terms" className="text-foreground underline">Terms of Service</Link> and <Link to="/privacy" className="text-foreground underline">Privacy Policy</Link>. If you are under 16, you confirm that you have permission from a parent or legal guardian.
        </p>
        <button className="btn btn-primary w-full" disabled={busy} data-testid="register-submit">
          {busy ? "Creating" : "Create account"}
        </button>
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center"><span className="bg-card px-2 text-xs text-muted-foreground">or</span></div>
        </div>
        <a href="/api/auth/google/start?client=web&return_to=%2Ftoday" className="btn btn-outline w-full" data-testid="register-google">
          Continue with Google
        </a>
        <div className="text-center text-sm text-muted-foreground">
          Already have an account? <Link to="/login" className="text-foreground underline" data-testid="link-login">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
