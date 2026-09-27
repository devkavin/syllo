import React, { useEffect, useState } from "react";
import { http, formatError } from "@/lib/api";
import { formatSeconds, subjectClasses } from "@/lib/palette";
import { useTheme } from "@/lib/theme";
import { Flame, Clock, Calendar } from "lucide-react";

export default function Analytics() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const { theme } = useTheme();
  const isDark = theme === "dark";

  useEffect(() => {
    http.get("/analytics").then((r) => setData(r.data)).catch((e) => setErr(formatError(e)));
  }, []);

  if (err) return <div className="text-destructive">{err}</div>;
  if (!data) return <div className="animate-pulse h-96 bg-muted rounded-xl" data-testid="analytics-loading" />;

  const maxDay = Math.max(1, ...data.daily.map((d) => d.seconds));
  const totalSubject = Math.max(1, data.by_subject.reduce((a, s) => a + s.seconds, 0));

  return (
    <div className="space-y-8" data-testid="analytics-page">
      <div className="hero-glow relative rise">
        <div className="section-title mb-2">Your rhythm</div>
        <h1 className="font-serif text-4xl tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-2">A calm look at how you've been studying.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Stat icon={Clock} label="Total study time" value={formatSeconds(data.total_seconds)} />
        <Stat icon={Flame} label="Current streak" value={`${data.streak.current} day${data.streak.current === 1 ? "" : "s"}`} />
        <Stat icon={Calendar} label="Longest streak" value={`${data.streak.longest} day${data.streak.longest === 1 ? "" : "s"}`} />
      </div>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl">Last 14 days</h2>
        </div>
        <div className="flex items-end gap-2 h-40" data-testid="daily-bars">
          {data.daily.map((d) => {
            const h = Math.max(3, Math.round((d.seconds / maxDay) * 100));
            return (
              <div key={d.day} className="flex-1 h-full flex flex-col items-center justify-end gap-1" title={`${d.day}: ${formatSeconds(d.seconds)}`}>
                <div className="w-full rounded-t-md" style={{ height: `${h}%`, background: "hsl(var(--primary) / 0.75)" }} />
                <div className="text-[10px] text-muted-foreground">{d.day.slice(5)}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-serif text-xl mb-4">By subject</h2>
        {data.by_subject.length === 0 ? (
          <div className="text-sm text-muted-foreground">No sessions yet. Try a focus block to see this fill in.</div>
        ) : (
          <div className="space-y-3">
            {data.by_subject.map((s) => {
              const c = subjectClasses(s.color, isDark);
              const pct = Math.round((s.seconds / totalSubject) * 100);
              return (
                <div key={s.subject_id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="inline-flex items-center gap-2">
                      <span className="subject-dot" style={{ background: c.dot }} />
                      <span>{s.name}</span>
                    </div>
                    <div className="text-muted-foreground text-xs">{formatSeconds(s.seconds)} ({pct}%)</div>
                  </div>
                  <div className="h-2 bg-accent rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.dot }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center"><Icon className="w-5 h-5" /></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-serif text-xl">{value}</div></div>
    </div>
  );
}
