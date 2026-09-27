import React, { useEffect, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Link } from "react-router-dom";
import { subjectClasses, formatSeconds, greeting } from "@/lib/palette";
import { Flame, Clock, CheckCircle2, Circle, PlayCircle, BookOpen, Calendar, Sparkles, Target } from "lucide-react";
import { useTheme } from "@/lib/theme";

export default function Today() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [data, setData] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [t, s] = await Promise.all([http.get("/today"), http.get("/subjects")]);
      setData(t.data);
      setSubjects(s.data);
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
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-8" data-testid="today-page">
      <header>
        <div className="text-sm text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
        <h1 className="font-serif text-3xl sm:text-4xl mt-1 tracking-tight">{greeting()}, {first}.</h1>
        <p className="text-muted-foreground mt-2 max-w-xl">A gentle plan for the day. Take one thing at a time.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Stat icon={Clock} label="Studied today" value={formatSeconds(data?.seconds_today || 0)} testid="stat-time" />
        <Stat icon={Flame} label="Current streak" value={`${streak} day${streak === 1 ? "" : "s"}`} testid="stat-streak" />
        <div className="card p-4" data-testid="stat-goal">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center">
              <Target className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Daily goal</div>
              <div className="font-serif text-xl">{doneMin} / {goalMin} min</div>
            </div>
          </div>
          <div className="h-1.5 mt-3 bg-accent rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${goalPct}%` }} />
          </div>
        </div>
      </div>

      {/* Timetable + Reviews strip */}
      {(data?.timetable?.length > 0 || data?.reviews_due?.length > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="card p-5" data-testid="today-timetable">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-lg inline-flex items-center gap-2"><Calendar className="w-4 h-4" /> On the schedule</h2>
              <Link to="/timetable" className="text-xs text-muted-foreground hover:text-foreground">Open</Link>
            </div>
            {data?.timetable?.length ? (
              <ul className="space-y-2">
                {data.timetable.map((b) => (
                  <li key={b.timetable_id} className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-xs text-muted-foreground w-24">{b.start_time} to {b.end_time}</span>
                    <span className="flex-1">{b.title}</span>
                    {b.subject_id && <span className="text-xs text-muted-foreground">{subjectsMap[b.subject_id]?.name}</span>}
                  </li>
                ))}
              </ul>
            ) : <div className="text-sm text-muted-foreground">Nothing on the calendar.</div>}
          </div>

          <div className="card p-5" data-testid="today-reviews">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-lg inline-flex items-center gap-2"><Sparkles className="w-4 h-4" /> Reviews due</h2>
              <Link to="/reviews" className="text-xs text-muted-foreground hover:text-foreground">Open</Link>
            </div>
            {data?.reviews_due?.length ? (
              <ul className="space-y-2">
                {data.reviews_due.slice(0, 4).map((r) => (
                  <li key={r.review_id} className="text-sm flex items-center gap-2">
                    <span className="subject-dot" style={{ background: subjectsMap[r.subject_id] ? subjectClasses(subjectsMap[r.subject_id].color, isDark).dot : "hsl(var(--muted-foreground))" }} />
                    <span className="flex-1">{r.lesson_title}</span>
                    <span className="text-xs text-muted-foreground">{r.interval_days}d</span>
                  </li>
                ))}
              </ul>
            ) : <div className="text-sm text-muted-foreground">Nothing to review right now.</div>}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl">Today's tasks</h2>
            <Link to="/tasks" className="text-sm text-muted-foreground hover:text-foreground" data-testid="see-all-tasks">See all</Link>
          </div>
          {data?.tasks?.length === 0 ? (
            <EmptyBlock label="Nothing due today. A quiet day is a good day." />
          ) : (
            <ul className="space-y-2">
              {data?.tasks?.map((t) => {
                const sc = t.subject_id ? subjectClasses(subjectsMap[t.subject_id]?.color, isDark) : null;
                return (
                  <li key={t.task_id} className="flex items-center gap-3 py-2 border-b border-border last:border-b-0">
                    <button
                      onClick={() => toggleTask(t)}
                      data-testid={`today-task-toggle-${t.task_id}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {t.completed
                        ? <CheckCircle2 className="w-5 h-5 text-primary" />
                        : <Circle className="w-5 h-5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm ${t.completed ? "line-through text-muted-foreground" : ""}`}>{t.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        {t.subject_id && (
                          <span className="inline-flex items-center gap-1">
                            <span className="subject-dot" style={{ background: sc?.dot }} />
                            {subjectsMap[t.subject_id]?.name || "Subject"}
                          </span>
                        )}
                        {t.due_date && <span>Due {t.due_date}</span>}
                        {t.priority === "high" && <span className="text-terracotta">High</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl">Quick start</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            A short focus block is enough. You can always stop.
          </p>
          <Link
            to="/timer"
            className="btn btn-primary w-full"
            data-testid="today-start-focus"
          >
            <PlayCircle className="w-4 h-4" /> Start a focus session
          </Link>
          <div className="mt-5 pt-5 border-t border-border">
            <div className="text-sm mb-2">Recent sessions</div>
            {data?.sessions?.length ? (
              <ul className="space-y-1.5">
                {data.sessions.slice(0, 4).map((s) => (
                  <li key={s.session_id} className="text-sm flex justify-between">
                    <span className="text-muted-foreground">
                      {subjectsMap[s.subject_id]?.name || "Focus"}
                    </span>
                    <span className="font-mono">{formatSeconds(s.duration_seconds)}</span>
                  </li>
                ))}
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

function Stat({ icon: Icon, label, value, testid }) {
  return (
    <div className="card p-4 flex items-center gap-3" data-testid={testid}>
      <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center">
        <Icon className="w-5 h-5 text-accent-foreground" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-serif text-xl">{value}</div>
      </div>
    </div>
  );
}

function EmptyBlock({ label }) {
  return <div className="text-sm text-muted-foreground italic py-6 text-center">{label}</div>;
}

function SkeletonToday() {
  return (
    <div className="space-y-6 animate-pulse" data-testid="today-loading">
      <div className="h-8 w-72 bg-muted rounded" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[0,1,2].map((i) => <div key={i} className="h-20 bg-muted rounded-xl" />)}
      </div>
      <div className="h-64 bg-muted rounded-xl" />
    </div>
  );
}
