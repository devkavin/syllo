import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { http, formatError } from "@/lib/api";
import { SUBJECT_COLORS, SUBJECT_COLOR_IDS } from "@/lib/palette";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";

const STARTER_SUBJECTS = [
  { name: "Mathematics", color: "dusty_blue" },
  { name: "Literature", color: "ochre" },
  { name: "Biology", color: "sage" },
  { name: "History", color: "rosewood" },
  { name: "Chemistry", color: "terracotta" },
  { name: "Physics", color: "lavender" },
  { name: "Computer Science", color: "muted_olive" },
  { name: "Art", color: "rosewood" },
];

export default function Onboarding() {
  const nav = useNavigate();
  const { user, updateMe, refreshMe } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(user?.name || "");
  const [picked, setPicked] = useState({});
  const [goal, setGoal] = useState(60);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const togglePick = (idx) => setPicked((p) => ({ ...p, [idx]: p[idx] ? undefined : STARTER_SUBJECTS[idx] }));
  const pickedList = Object.values(picked).filter(Boolean);

  const finish = async () => {
    setBusy(true); setErr("");
    try {
      // Create picked subjects (only ones the user hasn't already added is OK - we skip check for simplicity)
      for (const s of pickedList) {
        try { await http.post("/subjects", { name: s.name, color: s.color }); } catch {}
      }
      await updateMe({ name: name.trim() || (user?.name || "Student"), daily_goal_minutes: Number(goal) || 60, onboarded: true });
      await refreshMe();
      nav("/today");
    } catch (e) { setErr(formatError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground grid place-items-center p-4">
      <div className="w-full max-w-lg space-y-6 fade-in" data-testid="onboarding-page">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {[0,1,2].map((i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-accent"}`} />
          ))}
        </div>

        {step === 0 && (
          <div className="card p-8">
            <h1 className="font-serif text-3xl tracking-tight mb-2">Welcome to Syllo</h1>
            <p className="text-muted-foreground mb-6">A quiet place to study. Let's set up in a minute.</p>
            <label className="text-xs text-muted-foreground">Your name</label>
            <input
              className="input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call you?"
              autoFocus
              data-testid="onboarding-name"
            />
            <div className="mt-6 flex justify-end">
              <button className="btn btn-primary" onClick={() => setStep(1)} disabled={!name.trim()} data-testid="onboarding-next-1">
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="card p-8">
            <h2 className="font-serif text-2xl tracking-tight mb-1">Pick a few subjects</h2>
            <p className="text-muted-foreground text-sm mb-4">You can always add more later.</p>
            <div className="grid grid-cols-2 gap-2">
              {STARTER_SUBJECTS.map((s, i) => {
                const on = !!picked[i];
                return (
                  <button
                    key={s.name}
                    onClick={() => togglePick(i)}
                    data-testid={`onboarding-subject-${i}`}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-left text-sm transition-colors ${on ? "border-ring bg-accent" : "border-border hover:bg-accent/60"}`}
                  >
                    <span className="subject-dot" style={{ background: SUBJECT_COLORS[s.color].dot }} />
                    <span className="flex-1">{s.name}</span>
                    {on && <Check className="w-4 h-4" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-between">
              <button className="btn btn-ghost" onClick={() => setStep(0)} data-testid="onboarding-back-1"><ArrowLeft className="w-4 h-4" /> Back</button>
              <button className="btn btn-primary" onClick={() => setStep(2)} data-testid="onboarding-next-2">Next <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="card p-8">
            <h2 className="font-serif text-2xl tracking-tight mb-1">A gentle daily goal</h2>
            <p className="text-muted-foreground text-sm mb-4">A time you can meet on most days. Small is fine.</p>
            <div className="flex items-center gap-3">
              <input
                type="range" min={15} max={240} step={15}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="flex-1"
                data-testid="onboarding-goal-slider"
              />
              <div className="font-mono text-xl w-24 text-right">{goal}m</div>
            </div>
            <div className="mt-6 flex justify-between">
              <button className="btn btn-ghost" onClick={() => setStep(1)} data-testid="onboarding-back-2"><ArrowLeft className="w-4 h-4" /> Back</button>
              <button className="btn btn-primary" onClick={finish} disabled={busy} data-testid="onboarding-finish">
                {busy ? "Setting up" : "Enter Syllo"}
              </button>
            </div>
            {err && <div className="text-destructive text-sm mt-3">{err}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
