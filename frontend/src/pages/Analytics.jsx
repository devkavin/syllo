import React, { useEffect, useState } from "react";
import { http, formatError } from "@/lib/api";
import { formatSeconds, subjectClasses } from "@/lib/palette";
import { useTheme } from "@/lib/theme";
import { Flame, Clock, Calendar } from "lucide-react";
import { Link } from "react-router-dom";

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
      <div className="space-y-2">
        <div className="section-title mb-2">Your rhythm</div>
        <h1 className="page-title">Progress</h1>
        <p className="text-muted-foreground mt-2">A calm look at how you've been studying.</p>
      </div>

      {data.total_seconds === 0 ? <section className="empty-state space-y-3"><h2>Your study story starts here</h2><p>Record a focus session to see your study time and progress.</p><Link className="btn btn-primary" to="/timer">Start Focus</Link></section> : <>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Stat icon={Clock} label="Total study time" value={formatSeconds(data.total_seconds)} />
        <Stat icon={Flame} label="Current streak" value={`${data.streak.current} day${data.streak.current === 1 ? "" : "s"}`} />
        <Stat icon={Calendar} label="Longest streak" value={`${data.streak.longest} day${data.streak.longest === 1 ? "" : "s"}`} />
      </div>

      {!!data.heatmap?.length && <section aria-label="Study consistency"><h2 className="font-serif text-xl mb-4">Last 30 days</h2><div className="flex flex-wrap gap-1">{data.heatmap.map(day => <span key={day.day} title={`${day.day}: ${formatSeconds(day.seconds)}`} aria-label={`${day.day}: ${formatSeconds(day.seconds)}`} className={`h-5 w-5 rounded-sm ${day.seconds ? "bg-primary" : "bg-accent"}`} />)}</div><p className="mt-2 text-xs text-muted-foreground">Filled squares are days with recorded study.</p></section>}
      <section className="border-t border-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl">Last 14 days</h2>
        </div>
        <div className="flex items-end gap-1 sm:gap-2 h-40" data-testid="daily-bars" role="img" aria-label={`Study time over the last 14 days: ${data.daily.map(d => `${d.day}: ${formatSeconds(d.seconds)}`).join("; ")}`}>
          {data.daily.map((d) => {
            const h = Math.max(3, Math.round((d.seconds / maxDay) * 100));
            return (
              <div key={d.day} className="flex-1 h-full flex flex-col items-center justify-end gap-1" title={`${d.day}: ${formatSeconds(d.seconds)}`}>
                <div className="w-full rounded-t-md" style={{ height: `${h}%`, background: "hsl(var(--primary) / 0.75)" }} />
                <div className="hidden sm:block text-xs text-muted-foreground">{d.day.slice(5)}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border pt-6">
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
      </>}
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="py-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center"><Icon className="w-5 h-5" /></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-serif text-xl">{value}</div></div>
    </div>
  );
}
