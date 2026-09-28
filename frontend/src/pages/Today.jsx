import React, { useEffect, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUsage } from "@/lib/usage";
import { Link } from "react-router-dom";
import { subjectClasses, formatSeconds, greeting } from "@/lib/palette";
import {
  Flame, Clock, CheckCircle2, Circle, PlayCircle, Calendar,
  Sparkles, Target, Sun, Moon, Coffee, Trophy, ArrowUpRight, Gift, Loader2
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import AiPrivacyNote from "@/components/AiPrivacyNote";

export default function Today() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [data, setData] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [t, s, a] = await Promise.all([
        http.get("/today"),
        http.get("/subjects"),
        http.get("/analytics"),
      ]);
      setData(t.data);
      setSubjects(s.data);
      setHeatmap(a.data?.heatmap || []);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleTask = async (task) => {
    setData((d) => ({ ...d, tasks: d.tasks.map((x) => x.task_id === task.task_id ? { ...x, completed: !x.completed } : x) }));
    try { await http.patch(`/tasks/${task.task_id}`, { completed: !task.completed }); }
    catch (e) { setErr(formatError(e)); load(); }
  };

  if (loading) return <SkeletonToday />;
  if (err) return <div className="text-destructive" data-testid="today-error">{err}</div>;

  const first = user?.name?.split(" ")[0] || "friend";
  const streak = data?.streak?.current || 0;
  const subjectsMap = Object.fromEntries(subjects.map((s) => [s.subject_id, s]));
  const goalMin = data?.daily_goal_minutes || 60;
  const doneMin = Math.round((data?.seconds_today || 0) / 60);
  const goalPct = Math.min(100, Math.round((doneMin / goalMin) * 100));
  const goalMet = doneMin >= goalMin && goalMin > 0;
  const hour = new Date().getHours();
  const Icon = hour < 12 ? Sun : hour < 18 ? Coffee : Moon;

  return (
    <div className="space-y-10" data-testid="today-page">
      {/* Hero */}
      <header className="hero-glow relative rise">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5" />
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </span>
          {goalMet && (
            <span
              className="badge pulse-soft"
              style={{ background: "hsl(133 30% 92%)", color: "hsl(133 40% 22%)", borderColor: "hsl(133 30% 78%)" }}
              data-testid="goal-badge"
            >
              <Trophy className="w-3 h-3" /> Goal met for today
            </span>
          )}
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl mt-2 tracking-tight leading-[1.05]">
          {greeting()}, <span className="italic">{first}</span>.
        </h1>
        <p className="text-muted-foreground mt-3 max-w-xl text-base">
          A gentle plan for the day. Take one thing at a time, and celebrate the small wins.
        </p>
      </header>

      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          testid="stat-time"
          label="Studied today"
          value={formatSeconds(data?.seconds_today || 0)}
          icon={Clock}
          accentHsl="208 39% 48%"
        />
        <StatCard
          testid="stat-streak"
          label="Current streak"
          value={`${streak} day${streak === 1 ? "" : "s"}`}
          icon={Flame}
          accentHsl="18 70% 55%"
          note={streak >= 3 ? "Keep going" : "Warming up"}
        />
        <GoalCard doneMin={doneMin} goalMin={goalMin} goalPct={goalPct} goalMet={goalMet} />
      </div>

      {/* Streak Calendar (30-day heatmap) */}
      <StreakCalendar heatmap={heatmap} streak={data?.streak} isDark={isDark} />

      {/* Bonus quests + Reflection */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <BonusQuests />
        <WeeklyReflection />
      </section>

      {/* Schedule + Reviews */}
      {(data?.timetable?.length > 0 || data?.reviews_due?.length > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="card-elevated p-5 relative overflow-hidden" data-testid="today-timetable">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md grid place-items-center" style={{ background: "hsl(208 39% 92%)", color: "hsl(208 40% 30%)" }}>
                  <Calendar className="w-4 h-4" />
                </div>
                <span className="section-title">On the schedule</span>
              </div>
              <Link to="/timetable" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                Open <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            {data?.timetable?.length ? (
              <ul className="space-y-3">
                {data.timetable.map((b) => {
                  const sub = b.subject_id ? subjectsMap[b.subject_id] : null;
                  const c = sub ? subjectClasses(sub.color, isDark) : null;
                  return (
                    <li key={b.timetable_id} className="flex items-center gap-3">
                      <div className="accent-bar self-stretch" style={{ background: c?.dot || "hsl(var(--muted))" }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{b.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="font-mono">{b.start_time} to {b.end_time}</span>
                          {sub && <span>{sub.name}</span>}
                          {b.kind === "study" && <span className="badge">study block</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <div className="text-sm text-muted-foreground">Nothing on the calendar.</div>}
          </div>

          <div className="card-elevated p-5" data-testid="today-reviews">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md grid place-items-center" style={{ background: "hsl(267 30% 92%)", color: "hsl(267 40% 30%)" }}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <span className="section-title">Reviews due</span>
              </div>
              <Link to="/reviews" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                Open <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            {data?.reviews_due?.length ? (
              <ul className="space-y-3">
                {data.reviews_due.slice(0, 4).map((r) => {
                  const sub = r.subject_id ? subjectsMap[r.subject_id] : null;
                  const c = sub ? subjectClasses(sub.color, isDark) : null;
                  return (
                    <li key={r.review_id} className="flex items-center gap-3">
                      <span className="subject-dot" style={{ background: c?.dot || "hsl(var(--muted-foreground))" }} />
                      <span className="flex-1 text-sm truncate">{r.lesson_title}</span>
                      <span className="text-xs text-muted-foreground font-mono">{r.interval_days}d</span>
                    </li>
                  );
                })}
              </ul>
            ) : <div className="text-sm text-muted-foreground">Nothing to review right now. A calm day.</div>}
          </div>
        </section>
      )}

      {/* Main two-column */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card-elevated p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md grid place-items-center" style={{ background: "hsl(30 40% 92%)", color: "hsl(30 60% 30%)" }}>
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <span className="section-title">Today's tasks</span>
            </div>
            <Link to="/tasks" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" data-testid="see-all-tasks">
              See all <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          {data?.tasks?.length === 0 ? (
            <EmptyBlock label="Nothing due today. A quiet day is a good day." />
          ) : (
            <ul className="space-y-1">
              {data?.tasks?.map((t) => {
                const sc = t.subject_id ? subjectClasses(subjectsMap[t.subject_id]?.color, isDark) : null;
                return (
                  <li key={t.task_id} className="flex items-center gap-3 py-2.5 border-b border-border last:border-b-0">
                    <button
                      onClick={() => toggleTask(t)}
                      data-testid={`today-task-toggle-${t.task_id}`}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t.completed
                        ? <CheckCircle2 className="w-5 h-5 text-primary" />
                        : <Circle className="w-5 h-5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm ${t.completed ? "line-through text-muted-foreground" : ""}`}>{t.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                        {t.subject_id && (
                          <span className="inline-flex items-center gap-1">
                            <span className="subject-dot" style={{ background: sc?.dot }} />
                            {subjectsMap[t.subject_id]?.name || "Subject"}
                          </span>
                        )}
                        {t.due_date && <span>Due {t.due_date}</span>}
                        {t.priority === "high" && (
                          <span className="badge" style={{ background: "hsl(0 60% 94%)", color: "hsl(0 60% 32%)", borderColor: "hsl(0 40% 82%)" }}>High</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card-elevated p-5 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-md grid place-items-center" style={{ background: "hsl(133 24% 92%)", color: "hsl(133 30% 24%)" }}>
              <PlayCircle className="w-4 h-4" />
            </div>
            <span className="section-title">Quick start</span>
          </div>
          <div className="font-serif text-xl leading-snug mb-1">A short focus block.</div>
          <p className="text-sm text-muted-foreground mb-4">
            You can always stop. The clock is patient.
          </p>
          <Link
            to="/timer"
            className="btn btn-primary w-full"
            data-testid="today-start-focus"
          >
            <PlayCircle className="w-4 h-4" /> Start a focus session
          </Link>
          <div className="mt-6 pt-5 border-t border-border">
            <div className="section-title mb-3">Recent sessions</div>
            {data?.sessions?.length ? (
              <ul className="space-y-2">
                {data.sessions.slice(0, 4).map((s) => {
                  const sub = subjectsMap[s.subject_id];
                  const c = sub ? subjectClasses(sub.color, isDark) : null;
                  return (
                    <li key={s.session_id} className="text-sm flex items-center gap-2">
                      <span className="subject-dot" style={{ background: c?.dot || "hsl(var(--muted-foreground))" }} />
                      <span className="flex-1 text-muted-foreground truncate">
                        {sub?.name || "Focus"}
                      </span>
                      <span className="font-mono text-xs">{formatSeconds(s.duration_seconds)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-xs text-muted-foreground">No sessions yet today.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, testid, accentHsl, note }) {
  return (
    <div
      className="card-elevated p-5 relative overflow-hidden"
      data-testid={testid}
    >
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20"
        style={{ background: `radial-gradient(circle, hsl(${accentHsl}) 0%, transparent 70%)` }}
      />
      <div className="flex items-start justify-between">
        <div>
          <div className="section-title">{label}</div>
          <div className="font-serif text-3xl mt-2 tracking-tight">{value}</div>
          {note && <div className="text-xs text-muted-foreground mt-1">{note}</div>}
        </div>
        <div
          className="w-9 h-9 rounded-lg grid place-items-center"
          style={{ background: `hsl(${accentHsl} / 0.12)`, color: `hsl(${accentHsl})` }}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

function GoalCard({ doneMin, goalMin, goalPct, goalMet }) {
  const size = 68;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (goalPct / 100) * circ;
  const color = goalMet ? "hsl(133 30% 40%)" : "hsl(108 12% 40%)";
  return (
    <div
      className="card-elevated p-5 relative overflow-hidden flex items-center gap-4"
      data-testid="stat-goal"
    >
      <div className="relative w-[68px] h-[68px] shrink-0">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
          <circle cx={size/2} cy={size/2} r={r} stroke="hsl(var(--accent))" strokeWidth={stroke} fill="none" />
          <circle
            cx={size/2} cy={size/2} r={r}
            stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 500ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          {goalMet
            ? <Trophy className="w-5 h-5" style={{ color }} />
            : <Target className="w-4 h-4 text-muted-foreground" />
          }
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="section-title">Daily goal</div>
        <div className="font-serif text-2xl mt-1 tracking-tight">{doneMin} <span className="text-muted-foreground text-base">/ {goalMin} min</span></div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {goalMet ? "You did it. A calm win." : `${goalMin - doneMin} min to go`}
        </div>
      </div>
    </div>
  );
}

function EmptyBlock({ label }) {
  return <div className="text-sm text-muted-foreground italic py-6 text-center">{label}</div>;
}

function BonusQuests() {
  const { usage, refresh, setRemaining } = useUsage();
  const [busyId, setBusyId] = useState(null);
  const [claimed, setClaimed] = useState(null);
  if (!usage || usage.plan?.id !== "freshman") return null;
  const quests = usage.quests || [];
  const already = usage.bonuses_claimed || {};
  const remaining = quests.filter((q) => !already[q.id]).length;
  if (remaining === 0) return null;

  const claim = async (q) => {
    setBusyId(q.id);
    try {
      const { data } = await http.post(`/bonuses/claim/${q.id}`);
      if (data.credits_remaining !== undefined) setRemaining(data.credits_remaining);
      setClaimed(q.id);
      refresh();
    } catch (e) {
      alert(e?.response?.data?.detail || "Not eligible yet.");
    } finally { setBusyId(null); }
  };

  return (
    <div className="card-elevated p-5" data-testid="bonus-quests">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-md grid place-items-center" style={{ background: "hsl(30 60% 92%)", color: "hsl(30 60% 32%)" }}>
          <Gift className="w-4 h-4" />
        </div>
        <span className="section-title">Earn more helps</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Small steps unlock more free AI helps. Each one gives you 10 more.</p>
      <ul className="space-y-2">
        {quests.map((q) => {
          const done = !!already[q.id];
          return (
            <li key={q.id} className="flex items-center gap-3 text-sm" data-testid={`quest-${q.id}`}>
              <span className={`w-6 h-6 grid place-items-center rounded-full ${done ? "bg-primary text-primary-foreground" : "bg-accent"}`}>
                {done ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-xs">+{q.credits}</span>}
              </span>
              <span className={`flex-1 ${done ? "line-through text-muted-foreground" : ""}`}>{q.label}</span>
              {!done && (
                <button
                  onClick={() => claim(q)}
                  disabled={busyId === q.id}
                  className="btn btn-outline text-xs !py-1"
                  data-testid={`quest-claim-${q.id}`}
                >
                  {busyId === q.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Claim"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {claimed && <div className="text-xs text-primary mt-3">Nice. Credits added.</div>}
    </div>
  );
}

function WeeklyReflection() {
  const [text, setText] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { setRemaining } = useUsage();

  const generate = async () => {
    setBusy(true); setErr("");
    try {
      const { data } = await http.get("/ai/reflection");
      setText(data.text);
      setRemaining(data.credits_remaining);
    } catch (e) { setErr(e?.response?.data?.detail || "Could not generate."); }
    finally { setBusy(false); }
  };

  return (
    <div className="card-elevated p-5" data-testid="weekly-reflection">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-md grid place-items-center" style={{ background: "hsl(267 30% 92%)", color: "hsl(267 40% 32%)" }}>
          <Sparkles className="w-4 h-4" />
        </div>
        <span className="section-title">Weekly reflection</span>
      </div>
      {!text ? (
        <>
          <p className="text-sm text-muted-foreground mb-4">A short, warm summary of your week. Uses one AI help.</p>
          <button className="btn btn-outline" onClick={generate} disabled={busy} data-testid="reflection-generate">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Reflect on my week
          </button>
          <AiPrivacyNote className="mt-3" />
        </>
      ) : (
        <div className="text-sm font-serif italic leading-relaxed" data-testid="reflection-text">{text}</div>
      )}
      {err && <div className="text-destructive text-xs mt-3">{err}</div>}
    </div>
  );
}

function StreakCalendar({ heatmap, streak, isDark }) {
  if (!heatmap || heatmap.length === 0) return null;
  const maxSec = Math.max(1, ...heatmap.map((d) => d.seconds));
  // Build 5 columns of ~6 days each (30 days total). We'll display as 6 rows x 5 cols with weekday labels
  // Simpler: horizontal strip of 30 cells grouped into weeks.
  // Layout: 30 cells, arranged in 5 columns (weeks) x 7 rows (weekdays) with today at bottom-right of last column.
  // Compute weekday of each date and place accordingly.
  const dayCells = heatmap.map((d) => {
    const date = new Date(d.day + "T00:00:00");
    const jsDow = date.getDay(); // 0=Sun
    const isoDow = (jsDow + 6) % 7; // 0=Mon..6=Sun
    return { ...d, isoDow, date };
  });
  // Group into columns by week starting Monday
  const cols = [];
  let currentCol = new Array(7).fill(null);
  let started = false;
  for (const c of dayCells) {
    if (!started && c.isoDow !== 0) {
      currentCol[c.isoDow] = c;
      started = true;
      continue;
    }
    if (c.isoDow === 0 && started) {
      cols.push(currentCol);
      currentCol = new Array(7).fill(null);
    }
    if (!started) started = true;
    currentCol[c.isoDow] = c;
  }
  if (currentCol.some(Boolean)) cols.push(currentCol);

  const intensity = (sec) => {
    if (!sec) return 0;
    const r = sec / maxSec;
    if (r < 0.25) return 1;
    if (r < 0.5) return 2;
    if (r < 0.75) return 3;
    return 4;
  };
  const swatch = (level) => {
    if (level === 0) return isDark ? "hsl(32 8% 17%)" : "hsl(42 22% 92%)";
    const alphas = [0, 0.28, 0.48, 0.72, 1];
    const base = isDark ? "133 26% 55%" : "133 30% 40%";
    return `hsl(${base} / ${alphas[level]})`;
  };

  const total = heatmap.reduce((a, d) => a + d.seconds, 0);
  const activeDays = heatmap.filter((d) => d.seconds > 0).length;
  const weekdayLabels = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

  return (
    <section className="card-elevated p-5" data-testid="streak-calendar">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md grid place-items-center" style={{ background: "hsl(18 40% 92%)", color: "hsl(18 60% 30%)" }}>
            <Flame className="w-4 h-4" />
          </div>
          <span className="section-title">Last thirty days</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span><span className="font-mono text-foreground">{activeDays}</span> active</span>
          <span><span className="font-mono text-foreground">{formatSeconds(total)}</span> studied</span>
          <span><span className="font-mono text-foreground">{streak?.current || 0}</span> day streak</span>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="hidden sm:flex flex-col justify-between py-0.5 text-[9px] text-muted-foreground pr-1">
          {weekdayLabels.map((w, i) => (
            <span key={i} className="h-3.5 leading-3.5">{w}</span>
          ))}
        </div>
        <div className="flex gap-1.5 flex-1 overflow-x-auto">
          {cols.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-1.5">
              {col.map((cell, ri) => (
                <div
                  key={ri}
                  data-testid={cell ? `heatmap-cell-${cell.day}` : undefined}
                  title={cell ? `${cell.day}: ${formatSeconds(cell.seconds)}` : ""}
                  className="w-3.5 h-3.5 rounded-[3px] transition-colors"
                  style={{
                    background: cell ? swatch(intensity(cell.seconds)) : "transparent",
                    outline: cell && cell.day === heatmap[heatmap.length - 1].day
                      ? `1px solid hsl(var(--foreground) / 0.35)` : "none",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="hidden sm:flex flex-col justify-end gap-1.5 pl-2">
          <span className="text-[9px] text-muted-foreground">Less</span>
          {[1, 2, 3, 4].map((l) => (
            <div key={l} className="w-3.5 h-3.5 rounded-[3px]" style={{ background: swatch(l) }} />
          ))}
          <span className="text-[9px] text-muted-foreground">More</span>
        </div>
      </div>
    </section>
  );
}

function SkeletonToday() {
  return (
    <div className="space-y-6 animate-pulse" data-testid="today-loading">
      <div className="h-10 w-80 bg-muted rounded" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[0,1,2].map((i) => <div key={i} className="h-24 bg-muted rounded-xl" />)}
      </div>
      <div className="h-64 bg-muted rounded-xl" />
    </div>
  );
}
