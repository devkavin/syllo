import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { createCheckout } from "@/lib/billing";
import { useUsage } from "@/lib/usage";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

const PLANNED_PRICING = {
  scholar: { price_cents: 899, intro_offer: { price_cents: 699, months: 3 } },
  deans_list: { price_cents: 1399, intro_offer: { price_cents: 1199, months: 3 } },
};

export default function Upgrade() {
  const [plans, setPlans] = useState([]);
  const [checkoutAvailable, setCheckoutAvailable] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const { usage, refresh } = useUsage();
  const nav = useNavigate();

  useEffect(() => {
    const previousTitle = document.title;
    const existingDescription = document.querySelector('meta[name="description"]');
    const description = existingDescription || document.createElement("meta");
    const previousDescription = existingDescription?.content;
    if (!existingDescription) {
      description.name = "description";
      document.head.appendChild(description);
    }
    document.title = "Syllo Plans & Pricing | Study Planner for Students";
    description.content = "Compare Syllo study plans for subjects, notes, timetables, tasks, focus sessions, and progress. Start free and choose the study help that fits your routine.";
    return () => {
      document.title = previousTitle;
      if (existingDescription) description.content = previousDescription;
      else description.remove();
    };
  }, []);

  useEffect(() => {
    http.get("/billing/plans").then((r) => {
      setPlans(r.data.plans);
      setCheckoutAvailable(Boolean(r.data.checkout_available));
      setSandbox(Boolean(r.data.sandbox));
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
      <div className="space-y-2">
        <button onClick={() => nav(-1)} className="btn btn-ghost px-2! py-1! -ml-2 mb-2 text-xs" data-testid="upgrade-back"><ArrowLeft className="w-3.5 h-3.5" /> Back</button>
        <div className="section-title mb-2">Your plan</div>
        <h1 className="page-title">Study plans that fit your routine</h1>
        <p className="text-muted-foreground mt-2 max-w-lg">
          Every plan includes subjects, notes, a timetable, tasks, focus sessions, and progress.
        </p>
        <p className="text-muted-foreground mt-2 max-w-lg">
          {checkoutAvailable
            ? "Start free. Upgrade when you want more study helps. Cancel anytime."
            : "Freshman is available now. Paid plans are coming soon."}
        </p>
      </div>

      {err && <div className="text-destructive text-sm">{err}</div>}
      {sandbox && <p className="text-sm border border-border p-3" role="status">Paddle sandbox · Admin tests only. No real payments. <a className="action-link" href="/checkout">Resume unfinished checkout</a> · <button className="action-link" onClick={async () => { try { window.location.href = (await http.post("/billing/portal", {})).data.url; } catch (e) { setErr(formatError(e)); } }}>Manage test subscription</button></p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {plans.map((p) => {
          const active = currentPlan === p.id;
          const isFree = p.price_cents === 0;
          const pricing = !checkoutAvailable && PLANNED_PRICING[p.id] ? PLANNED_PRICING[p.id] : p;
          const shownPrice = pricing.intro_offer?.price_cents ?? pricing.price_cents;
          const freshmanAllowance = isFree && active ? (usage?.monthly_allowance ?? p.credits) : p.credits;
          const benefits = isFree
            ? [
                "Subjects, notes, tasks and timetable",
                "Focus sessions and study progress",
                freshmanAllowance >= (usage?.free_milestone_max ?? 40)
                  ? `${freshmanAllowance} study helps monthly, unlocked through free study milestones`
                  : `${freshmanAllowance} study helps monthly; unlock ${usage?.free_milestone_max ?? 40} monthly through free study milestones`,
              ]
            : p.id === "scholar"
              ? ["Everything in Freshman", `${p.credits} study helps monthly`]
              : ["Everything in Scholar", `${p.credits} study helps monthly instead of 250`];
          return (
            <div
              key={p.id}
              className={`card-elevated p-6 relative flex flex-col ${p.id === "scholar" ? "ring-1 ring-ring/40" : ""}`}
              data-testid={`plan-${p.id}`}
            >
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
              <ul className="mt-5 space-y-2 flex-1">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{benefit}</span>
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
          Secure recurring checkout. You can cancel anytime from your account. Applicable tax is shown before payment.
        </div>
      )}
      {!checkoutAvailable && <div className="text-xs text-muted-foreground text-center">Planned pricing preview. Subscriptions are not available yet.</div>}
    </div>
  );
}
