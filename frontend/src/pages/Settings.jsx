import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useUsage } from "@/lib/usage";
import { http, formatError } from "@/lib/api";
import { createBillingPortal } from "@/lib/billing";
import { Loader2, ExternalLink, Gift, Copy, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { browserTimezone } from "@/lib/studyTime";
import AvailabilitySettings from "@/components/AvailabilitySettings";

export default function Settings() {
  const { user, updateMe } = useAuth();
  const { theme, setTheme } = useTheme();
  const { usage } = useUsage();
  const [name, setName] = useState(user?.name || "");
  const [goal, setGoal] = useState(user?.daily_goal_minutes || 60);
  const [timezone, setTimezone] = useState(user?.timezone || browserTimezone());
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);

  const save = async () => {
    setMsg(""); setErr("");
    try {
      await updateMe({ name, daily_goal_minutes: Number(goal) || 60, timezone });
      setMsg("Saved.");
    } catch (e) { setErr(formatError(e)); }
  };

  const openPortal = async () => {
    setPortalBusy(true); setErr(""); setMsg("");
    try {
      const data = await createBillingPortal();
      window.location.href = data.url;
    } catch (e) { setErr(formatError(e)); setPortalBusy(false); }
  };

  const currentPlan = usage?.plan;
  const isPaid = currentPlan && currentPlan.price_cents > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-8" data-testid="settings-page">
      <div className="page-header">
        <div>
        <div className="section-title mb-2">Your preferences</div>
        <h1 className="page-title">Settings</h1>
        <p className="text-muted-foreground mt-2">Small preferences that make Syllo yours.</p>
        </div>
        <button className="btn btn-primary" onClick={save} data-testid="settings-save">Save changes</button>
      </div>

      <section className="card p-5 space-y-3">
        <h2 className="font-serif text-xl">Profile</h2>
        <label className="text-xs text-muted-foreground" htmlFor="settings-field-1">Name</label>
        <input id="settings-field-1" className="input" value={name} onChange={(e) => setName(e.target.value)} data-testid="settings-name" />
        <label className="text-xs text-muted-foreground" htmlFor="settings-field-2">Email</label>
        <input id="settings-field-2" className="input" value={user?.email || ""} disabled />
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-serif text-xl">Appearance</h2>
        <p className="text-sm text-muted-foreground">Saved automatically and synced across devices.</p>
        <div className="flex gap-2">
          {["light", "dark"].map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              aria-pressed={theme === t}
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
            aria-label="Daily study goal in minutes"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="flex-1"
            data-testid="settings-goal-slider"
          />
          <div className="font-mono w-16 text-right">{goal}m</div>
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-serif text-xl">Timezone</h2>
        <p className="text-sm text-muted-foreground">Classes, dates and reviews use this timezone across devices.</p>
        <label className="text-sm">Timezone<input className="input mt-1" list="study-timezones" value={timezone} onChange={e => setTimezone(e.target.value)} /></label>
        <datalist id="study-timezones">{[browserTimezone(), "Asia/Colombo", "Europe/London", "America/New_York", "Asia/Kolkata", "UTC"].filter((v, i, a) => a.indexOf(v) === i).map(v => <option key={v} value={v} />)}</datalist>
      </section>
      <section className="card p-5 space-y-3" data-testid="settings-billing">
        <h2 className="font-serif text-xl">Billing</h2>
        <p className="text-sm text-muted-foreground">
          You're on <span className="text-foreground font-medium">{currentPlan?.name || "Freshman"}</span>.
          {isPaid
            ? (usage?.billing_enabled ? " Manage payments, invoices, or cancellation from your billing portal." : " Your current plan remains active.")
            : (usage?.billing_enabled ? " Upgrade for more AI helps." : " Paid plans are coming soon.")}
        </p>
        <div className="flex gap-2 flex-wrap">
          <a href="/upgrade" className="btn btn-outline" data-testid="settings-upgrade-link">
            {isPaid ? "Change plan" : "See plans"}
          </a>
          {isPaid && usage?.billing_enabled && (
            <button className="btn btn-outline" onClick={openPortal} disabled={portalBusy} data-testid="settings-cancel-plan">
              {portalBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              Manage or cancel plan
            </button>
          )}
        </div>
      </section>

      <InviteCard />
      <AvailabilitySettings timezone={user?.timezone || browserTimezone()} />

      <section className="card p-5 space-y-3" data-testid="settings-legal">
        <h2 className="font-serif text-xl">Legal and privacy</h2>
        <p className="text-sm text-muted-foreground">Read how Syllo handles your information and the rules that apply to the service.</p>
        <div className="flex gap-4 text-sm">
          <Link to="/privacy" className="text-foreground action-link">Privacy Policy</Link>
          <Link to="/terms" className="text-foreground action-link">Terms of Service</Link>
        </div>
      </section>

      {msg && <div role="status" className="notice text-primary" data-testid="settings-msg">{msg}</div>}
      {err && <div role="alert" className="notice text-destructive">{err}</div>}
    </div>
  );
}

function InviteCard() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState("");
  useEffect(() => { http.get("/me/referrals").then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return null;
  const link = `${window.location.origin}/register?ref=${data.referral_code}`;

  const copy = async (val, tag) => {
    try { await navigator.clipboard.writeText(val); setCopied(tag); setTimeout(() => setCopied(""), 1500); } catch {}
  };

  return (
    <section className="card p-5 space-y-3" data-testid="settings-invite">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-md grid place-items-center bg-secondary text-primary">
          <Gift className="w-4 h-4" />
        </div>
        <h2 className="font-serif text-xl !mb-0">Study with a friend</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Share Syllo. When a new student signs up with your code, you both get {data.per_signup_credits} extra helps. You can earn rewards from up to {data.monthly_reward_limit} new signups each month; the new student receives their signup bonus once.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Your code</label>
          <div className="flex gap-2 mt-1">
            <input className="input font-mono uppercase" readOnly value={data.referral_code} data-testid="invite-code" />
            <button aria-label="Copy friend code" className="btn btn-outline btn-icon" onClick={() => copy(data.referral_code, "code")} data-testid="invite-copy-code">
              {copied === "code" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Or share the link</label>
          <div className="flex gap-2 mt-1">
            <input className="input text-xs" readOnly value={link} data-testid="invite-link" />
            <button aria-label="Copy invite link" className="btn btn-outline btn-icon" onClick={() => copy(link, "link")} data-testid="invite-copy-link">
              {copied === "link" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-3 pt-1">
        <span><span className="font-mono text-foreground">{data.count}</span> friend{data.count === 1 ? "" : "s"} joined</span>
        <span><span className="font-mono text-foreground">{data.credits_earned}</span> extra helps earned</span>
        <span>{data.monthly_rewarded_count} / {data.monthly_reward_limit} rewarded this month</span>
      </div>
    </section>
  );
}
