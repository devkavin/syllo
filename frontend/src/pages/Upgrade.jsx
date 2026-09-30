import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { createCheckout } from "@/lib/billing";
import { useUsage } from "@/lib/usage";
import { Check, Sparkles, ArrowLeft, Loader2 } from "lucide-react";

const PLANNED_PRICING = {
  scholar: { price_cents: 899, intro_offer: { price_cents: 699, months: 3 } },
  deans_list: { price_cents: 1399, intro_offer: { price_cents: 1099, months: 3 } },
};

export default function Upgrade() {
  const [plans, setPlans] = useState([]);
  const [checkoutAvailable, setCheckoutAvailable] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const { usage, refresh } = useUsage();
  const nav = useNavigate();

  useEffect(() => {
    http.get("/billing/plans").then((r) => {
      setPlans(r.data.plans);
      setCheckoutAvailable(Boolean(r.data.checkout_available));
    }).catch((e) => setErr(formatError(e)));
    refresh();
  }, [refresh]);

  const upgrade = async (planId) => {
    setBusy(planId); setErr("");
    try {
      const data = await createCheckout(planId);
      window.location.href = data.url;
    } catch (e) { setErr(formatError(e)); setBusy(null); }
  };

  const currentPlan = usage?.plan?.id || "freshman";

  return (
    <div className="space-y-8" data-testid="upgrade-page">
      <div className="hero-glow relative rise">
        <button onClick={() => nav(-1)} className="btn btn-ghost !px-2 !py-1 -ml-2 mb-2 text-xs" data-testid="upgrade-back"><ArrowLeft className="w-3.5 h-3.5" /> Back</button>
        <div className="section-title mb-2">Your plan</div>
        <h1 className="font-serif text-4xl tracking-tight">Pick your rhythm</h1>
        <p className="text-muted-foreground mt-2 max-w-lg">
          {checkoutAvailable
            ? "Start free. Upgrade when you want more study helps. Cancel anytime."
            : "Freshman is available now. Paid plans are coming soon."}
        </p>
      </div>

      {err && <div className="text-destructive text-sm">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {plans.map((p) => {
          const active = currentPlan === p.id;
          const isFree = p.price_cents === 0;
          const pricing = !checkoutAvailable && PLANNED_PRICING[p.id] ? PLANNED_PRICING[p.id] : p;
          const shownPrice = pricing.intro_offer?.price_cents ?? pricing.price_cents;
          return (
            <div
              key={p.id}
              className={`card-elevated p-6 relative flex flex-col ${p.id === "scholar" ? "ring-1 ring-ring/40" : ""}`}
              data-testid={`plan-${p.id}`}
            >
              {p.id === "scholar" && (
                <div className="badge absolute -top-2.5 left-1/2 -translate-x-1/2" style={{ background: "hsl(30 60% 92%)", color: "hsl(30 60% 32%)", borderColor: "hsl(30 40% 78%)" }}>
                  <Sparkles className="w-3 h-3" /> Most popular
                </div>
              )}
              <div className="section-title mb-2">{p.name}</div>
              <div className="flex items-baseline gap-1">
                <span className="font-serif text-4xl">${(shownPrice / 100).toFixed(2)}</span>
                {!isFree && <span className="text-sm text-muted-foreground">/ month</span>}
              </div>
              {pricing.intro_offer && (
                <div className="mt-1 text-sm">
                  <div className="text-foreground">for your first {pricing.intro_offer.months} months</div>
                  <div className="text-muted-foreground">Then ${(pricing.price_cents / 100).toFixed(2)} / month</div>
                </div>
              )}
              <div className="mt-2 text-sm text-muted-foreground">{isFree && active ? (usage?.monthly_allowance ?? p.credits) : p.credits} study helps per month</div>
              {isFree && usage?.free_max && (
                <div className="mt-1 text-sm text-muted-foreground">
                  Start with {usage.free_start} study helps each month. Complete the starter steps to unlock {usage.free_milestone_max} helps each month, for good. Earn 10 extra helps when a new student joins through your invite, for up to five rewarded signups per month. Your total help balance is capped at {usage.free_max}.
                </div>
              )}
              <ul className="mt-5 space-y-2 flex-1">
                {p.features.map((f, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {active ? (
                  <button className="btn btn-outline w-full" disabled data-testid={`plan-current-${p.id}`}>Your current plan</button>
                ) : isFree ? (
                  <button className="btn btn-outline w-full" disabled>Free forever</button>
                ) : !checkoutAvailable ? (
                  <button
                    className="btn btn-outline w-full"
                    disabled
                    data-testid={`plan-upgrade-${p.id}`}
                  >
                    Coming soon
                  </button>
                ) : (
                  <button
                    className={`btn w-full ${p.id === "scholar" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => upgrade(p.id)}
                    disabled={busy === p.id}
                    data-testid={`plan-upgrade-${p.id}`}
                  >
                    {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : `Upgrade to ${p.name}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {checkoutAvailable && (
        <div className="text-xs text-muted-foreground text-center">
          Secure recurring checkout. You can cancel anytime from your account.
        </div>
      )}
      {!checkoutAvailable && <div className="text-xs text-muted-foreground text-center">Planned pricing preview. Subscriptions are not available yet.</div>}
    </div>
  );
}
