import React from "react";

export function refillLabel(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(date);
}

export default function HelpUsage({ usage, className = "", compact = false }) {
  if (!usage) return null;
  const refill = refillLabel(usage.next_refill_at);
  const allowance = Math.max(1, usage.cycle_allowance ?? usage.plan?.credits ?? 1);
  const remaining = usage.credits_remaining ?? 0;
  const isLow = remaining > 0 && remaining / allowance <= 0.25;
  return (
    <section className={`text-xs text-muted-foreground space-y-1.5 ${className}`} aria-label="Study Companion usage">
      <div className="flex justify-between gap-3">
        <span>This week: {usage.used_this_week ?? 0} used</span>
        <span>{remaining} left this month</span>
      </div>
      {!compact && <div>Today: {usage.used_today ?? 0} used</div>}
      <div className="h-1.5 rounded-full bg-accent overflow-hidden" role="progressbar" aria-label="Monthly helps remaining" aria-valuenow={remaining} aria-valuemin={0} aria-valuemax={allowance}>
        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, Math.max(0, remaining / allowance * 100))}%` }} />
      </div>
      <div className="flex justify-between gap-3">
        <span>Typical pace: about {Math.round(usage.weekly_pace ?? 0)} / week</span>
        {refill && <span>Monthly refill {refill}</span>}
      </div>
      {!compact && isLow && <p>You have {remaining} helps left. Your other study tools remain available.</p>}
      {!compact && remaining === 0 && refill && <p>Helps refill on {refill}; this is a monthly allowance, not a weekly reset.</p>}
    </section>
  );
}
