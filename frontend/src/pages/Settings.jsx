import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useUsage } from "@/lib/usage";
import { http, formatError } from "@/lib/api";
import { Loader2, ExternalLink } from "lucide-react";

export default function Settings() {
  const { user, updateMe } = useAuth();
  const { theme, setTheme } = useTheme();
  const { usage } = useUsage();
  const [name, setName] = useState(user?.name || "");
  const [goal, setGoal] = useState(user?.daily_goal_minutes || 60);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);

  const save = async () => {
    setMsg(""); setErr("");
    try {
      await updateMe({ name, theme, daily_goal_minutes: Number(goal) || 60 });
      setMsg("Saved.");
    } catch (e) { setErr(formatError(e)); }
  };

  const seed = async () => {
    setMsg(""); setErr("");
    try { await http.post("/seed"); setMsg("Sample data added if your workspace was empty."); }
    catch (e) { setErr(formatError(e)); }
  };

  const openPortal = async () => {
    setPortalBusy(true); setErr(""); setMsg("");
    try {
      const { data } = await http.post("/billing/portal", { origin_url: window.location.origin });
      window.location.href = data.url;
    } catch (e) { setErr(formatError(e)); setPortalBusy(false); }
  };

  const currentPlan = usage?.plan;
  const isPaid = currentPlan && currentPlan.price_cents > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-8" data-testid="settings-page">
      <div className="hero-glow relative rise">
        <div className="section-title mb-2">Your preferences</div>
        <h1 className="font-serif text-4xl tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Small preferences that make Syllo yours.</p>
      </div>

      <section className="card p-5 space-y-3">
        <h2 className="font-serif text-xl">Profile</h2>
        <label className="text-xs text-muted-foreground">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} data-testid="settings-name" />
        <label className="text-xs text-muted-foreground">Email</label>
        <input className="input" value={user?.email || ""} disabled />
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-serif text-xl">Appearance</h2>
        <div className="flex gap-2">
          {["light", "dark"].map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              data-testid={`theme-${t}`}
              className={`btn ${theme === t ? "btn-primary" : "btn-outline"}`}
            >{t === "light" ? "Light" : "Dark"}</button>
          ))}
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-serif text-xl">Daily goal</h2>
        <p className="text-sm text-muted-foreground">A time you can meet on most days.</p>
        <div className="flex items-center gap-3">
          <input
            type="range" min={15} max={240} step={15}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="flex-1"
            data-testid="settings-goal-slider"
          />
          <div className="font-mono w-16 text-right">{goal}m</div>
        </div>
      </section>

      <section className="card p-5 space-y-3" data-testid="settings-billing">
        <h2 className="font-serif text-xl">Billing</h2>
        <p className="text-sm text-muted-foreground">
          You're on <span className="text-foreground font-medium">{currentPlan?.name || "Freshman"}</span>.
          {isPaid ? " Manage payment, invoices, or cancel anytime through the Stripe portal." : " Upgrade for more AI helps."}
        </p>
        <div className="flex gap-2 flex-wrap">
          <a href="/upgrade" className="btn btn-outline" data-testid="settings-upgrade-link">
            {isPaid ? "Change plan" : "See plans"}
          </a>
          {isPaid && (
            <button className="btn btn-outline" onClick={openPortal} disabled={portalBusy} data-testid="settings-cancel-plan">
              {portalBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              Manage or cancel plan
            </button>
          )}
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-serif text-xl">Data</h2>
        <p className="text-sm text-muted-foreground">Add a small set of sample subjects and tasks to your workspace if it's empty.</p>
        <button className="btn btn-outline" onClick={seed} data-testid="settings-seed">Add sample data</button>
      </section>

      {msg && <div className="text-primary text-sm" data-testid="settings-msg">{msg}</div>}
      {err && <div className="text-destructive text-sm">{err}</div>}
      <button className="btn btn-primary" onClick={save} data-testid="settings-save">Save changes</button>
    </div>
  );
}
