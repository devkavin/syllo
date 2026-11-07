import React, { useId, useState } from "react";
import { Link } from "react-router-dom";
import { CircleHelp, X } from "lucide-react";

export default function StudyGuidance({ accountId, context, children, defaultOpen = false, firstSessionLink = true }) {
  const key = accountId ? `syllo.guidance.${encodeURIComponent(accountId)}.${context}` : null;
  const panelId = useId();
  const initialOpen = () => {
    try { const saved = key && localStorage.getItem(key); return saved === "open" || (saved !== "closed" && defaultOpen); }
    catch { return defaultOpen; }
  };
  const [state, setState] = useState(() => ({ key, open: initialOpen() }));
  const open = state.key === key ? state.open : initialOpen();
  const change = value => {
    setState({ key, open: value });
    try { if (key) localStorage.setItem(key, value ? "open" : "closed"); } catch { /* Guidance still works without browser storage. */ }
  };
  return <div className="text-sm">
    <button type="button" className="btn btn-ghost text-xs" aria-expanded={open} aria-controls={panelId} onClick={() => change(!open)}><CircleHelp className="h-4 w-4" />Study guide</button>
    {open && <section id={panelId} aria-label="Study guidance" className="relative mt-2 rounded-lg border border-border bg-accent/30 p-4 pr-14 text-sm leading-relaxed text-muted-foreground">
      <button type="button" aria-label="Dismiss guidance" className="btn btn-ghost btn-icon absolute right-1 top-1" onClick={() => change(false)}><X className="h-4 w-4" /></button>
      {children}
      {firstSessionLink && <Link className="action-link inline-flex mt-2" to="/onboarding?guide=1">Try a guided first session</Link>}
    </section>}
  </div>;
}
