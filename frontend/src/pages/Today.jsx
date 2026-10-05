import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CalendarDays, Check, ChevronDown, Clock, ListTodo, Plus, RotateCcw } from "lucide-react";
import { http, formatError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUsage } from "@/lib/usage";
import AgendaList from "@/components/AgendaList";
import TaskDialog from "@/components/TaskDialog";
import ActivityDialog from "@/components/ActivityDialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { nextStudyAction } from "@/lib/nextStudyAction";
import { browserTimezone, formatStudyTime } from "@/lib/studyTime";

export default function Today() {
  const { user } = useAuth();
  const timezone = user?.timezone || browserTimezone();
  const [data, setData] = useState(null), [error, setError] = useState(""), [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState(null), [notice, setNotice] = useState("");
  const [quietContext, setQuietContext] = useState(null);
  const [working, setWorking] = useState(null);
  const mutation = useRef(false);
  const addTrigger = useRef(null);
  const refresh = () => setVersion(n => n + 1);
  useEffect(() => {
    let live = true;
    setError("");
    http.get("/today").then(r => { if (live) setData(r.data); }).catch(e => { if (live) setError(formatError(e)); });
    return () => { live = false; };
  }, [version]);
  const quiet = data && !(data.agenda || []).length && !(data.tasks || []).some(t => !t.completed) && !(data.reviews_due || []).length;
  useEffect(() => {
    if (!quiet) { setQuietContext(null); return; }
    let live = true;
    setQuietContext(null);
    // Optional context must never prevent the day's own actions from loading.
    Promise.allSettled([http.get("/timetable"), http.get("/sessions?limit=10")]).then(async ([tt, history]) => {
      const recent = history.status === "fulfilled" && history.value.data.find(s => s.lesson_id && s.duration_seconds > 0 && !["short", "long"].includes(s.mode));
      let lesson = null;
      if (recent) { try { lesson = (await http.get(`/lessons/${encodeURIComponent(recent.lesson_id)}`)).data; } catch { /* Deleted lessons are not suggested. */ } }
      if (live) setQuietContext({
        timetableConfigured: tt.status === "fulfilled" ? tt.value.data.length > 0 : null,
        hasStudied: history.status === "fulfilled" ? history.value.data.length > 0 : null,
        lesson,
      });
    });
    return () => { live = false; };
  }, [quiet, version]);
  useEffect(() => { if (dialog) setNotice(""); }, [dialog]);
  const saved = message => { setNotice(message); refresh(); };

  const complete = async task => {
    if (mutation.current) return;
    mutation.current = true; setWorking(task.task_id); setError("");
    try {
      await http.patch(`/tasks/${task.task_id}`, { completed: true });
      setData(old => ({ ...old, tasks: (old.tasks || []).filter(t => t.task_id !== task.task_id), agenda: (old.agenda || []).filter(item => !(item.source === "task" && item.id === task.task_id)) }));
      refresh();
    } catch (e) { setError(formatError(e)); }
    finally { mutation.current = false; setWorking(null); }
  };
  const next = data && nextStudyAction({ today: data.today, agenda: data.agenda, reviews: data.reviews_due, tasks: data.tasks });
  const lesson = quietContext?.lesson;
  const firstUse = quiet && data.subjects_count === 0 && quietContext?.hasStudied === false && quietContext?.timetableConfigured === false;
  const focusHref = lesson ? `/timer?lesson=${encodeURIComponent(lesson.lesson_id)}` : "/timer";
  const remainingTasks = (data?.tasks || []).filter(t => !t.completed && !(next?.kind === "task" && next.item.task_id === t.task_id));
  const remainingReviews = (data?.reviews_due || []).filter(r => !(next?.kind === "review" && next.item.review_id === r.review_id));
  const remainingSchedule = (data?.agenda || []).filter(item => item.ends_at && !(["current", "upcoming"].includes(next?.kind) && next.item.id === item.id && next.item.source === item.source));
  const hasPlan = remainingTasks.length + remainingReviews.length + remainingSchedule.length > 0;
  const taskMeta = task => task.due_date < data.today ? "From an earlier day" : `Due today${task.due_time ? ` · ${task.due_time}` : ""}`;
  const completion = task => <button className="btn btn-ghost btn-icon" aria-label={`Complete ${task.title}`} disabled={working != null} onClick={() => complete(task)}><Check className="h-5 w-5" /></button>;
  const nextDescription = next?.kind === "task" ? taskMeta(next.item) : next?.kind === "review" ? "A chance to revisit what you've learned." :
    ["current", "upcoming"].includes(next?.kind) ? `${formatStudyTime(next.item.starts_at, timezone)} – ${formatStudyTime(next.item.ends_at, timezone)} · ${next.item.kind?.replaceAll("_", " ") || "Activity"}` :
    lesson ? "Pick up where you left off. Your notes are ready." : firstUse ? "Start a focus session or add one thing to work on. You can set up subjects later." : quiet ? "Nothing planned today. Start a session, or make a little time to study." : "There's room for a focus session. The rest of your day is below.";

  return <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8" data-testid="today-page">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm text-muted-foreground mb-1">{data?.today ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${data.today}T12:00:00Z`)) : "Today"}</p>
        <h1 className="page-title">Hello{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</h1></div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button ref={addTrigger} className="btn btn-outline" aria-label="Add to today" disabled={!data}><Plus className="h-4 w-4" />Add<ChevronDown className="h-4 w-4" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (dialog) event.preventDefault(); }}>
          <DropdownMenuItem className="min-h-11" onSelect={() => setDialog("task")}><ListTodo />Task</DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onSelect={() => setDialog("study")}><Clock />Study time</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    {error && <div role="alert" className="notice">{error}<button className="btn btn-outline" onClick={refresh}>Retry</button></div>}
    {notice && <p role="status" className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-primary" />{notice}</p>}
    {!data && !error && <p role="status" className="py-8 text-muted-foreground">Loading your day…</p>}
    {data && <>
      <section aria-label="Suggested next step" className="rounded-xl border border-border bg-muted/40 p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <BookOpen aria-hidden="true" className="hidden sm:block h-6 w-6 shrink-0 text-primary mt-1" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground mb-2">{next.kind === "current" ? "Happening now" : next.kind === "upcoming" ? "Later today" : next.kind === "review" ? "Ready for review" : next.kind === "task" ? "One thing to work on" : lesson ? "Continue learning" : firstUse ? "Welcome to your study space" : "Make some room to study"}</p>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">{next.kind === "focus" ? lesson?.title || "Start with a little focus" : <Link className="hover:text-primary rounded" to={next.href}>{next.label}</Link>}</h2>
            <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-xl">{nextDescription}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
              {next.kind === "focus" ? <Link to={focusHref} className="btn btn-primary">{lesson ? "Continue studying" : "Start Focus"}</Link> :
                <Link to={next.href} className="btn btn-primary">{next.kind === "review" ? "Review lesson" : next.kind === "task" ? "View task" : next.item.kind === "circle_study" ? "Start session" : "View activity"}</Link>}
              {next.kind === "task" && completion(next.item)}
              {next.kind !== "focus" && <Link to="/timer" className="btn btn-ghost">Start Focus</Link>}
              {next.kind === "focus" && (lesson ? <Link to="/timer" className="btn btn-ghost">Choose something else</Link> : <button className="btn btn-ghost" onClick={() => setDialog("task")}>Add task</button>)}
            </div>
            {firstUse && <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm"><Link to="/subjects" className="action-link">Add your subjects</Link><Link to="/timetable?new=1" className="action-link">Add your timetable</Link></div>}
          </div>
        </div>
      </section>

      {!!data.circle_invitations?.length && <section aria-label="Circle session invitations" className="border border-primary/25 bg-accent/40 rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold">You're invited to study together</h2>
        {data.circle_invitations.map(event => <div key={event.id} className="space-y-2"><p className="font-medium">{event.topic}</p><p className="text-sm text-muted-foreground">{formatStudyTime(event.start, timezone, true)} · not confirmed yet</p><div className="flex flex-wrap gap-2"><Link className="btn btn-primary" to={`/circles?circle=${event.circle_id}`}>Review session</Link><button className="btn btn-outline" disabled={working != null} onClick={async () => { if (mutation.current) return; mutation.current = true; setWorking(event.id); try { await http.post(`/circles/${event.circle_id}/sessions/${event.id}/respond`, { status: "declined", revision: event.revision }); refresh(); } catch (e) { setError(formatError(e)); } finally { mutation.current = false; setWorking(null); } }}>Decline</button></div></div>)}
      </section>}

      {hasPlan && <section aria-labelledby="today-plan-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3"><h2 id="today-plan-heading" className="text-lg font-semibold">Today's plan</h2><Link to="/planner" className="btn btn-ghost text-sm"><CalendarDays className="h-4 w-4" />Open Planner</Link></div>
        <ul className="divide-y divide-border">
          {remainingTasks.map(task => <li key={task.task_id} className="flex items-center gap-3 py-3">
            {completion(task)}<div className="min-w-0 flex-1"><Link to={`/tasks?task=${task.task_id}`} className="row-link -ml-3">{task.title}</Link><p className="text-sm text-muted-foreground">{taskMeta(task)} · Task</p></div>
          </li>)}
          {remainingReviews.map(review => <li key={review.review_id} className="flex flex-wrap items-center gap-3 py-4">
            <RotateCcw aria-hidden="true" className="h-5 w-5 text-muted-foreground shrink-0" /><div className="min-w-0 flex-1"><p className="font-medium">{review.lesson_title || review.title || "Review lesson"}</p><p className="text-sm text-muted-foreground">{new Date(review.next_review_at).getTime() <= Date.now() ? "Ready for review" : `Review at ${formatStudyTime(review.next_review_at, timezone)}`}</p></div>
            <Link className="btn btn-outline" to={review.lesson_id ? `/lessons/${review.lesson_id}` : "/reviews"}>Review lesson<span className="sr-only">: {review.lesson_title || review.title || "lesson"}</span></Link>
          </li>)}
        </ul>
        {remainingSchedule.length > 0 && <AgendaList items={remainingSchedule} timezone={timezone} />}
      </section>}

      {!!data.upcoming_deadlines?.length && <section aria-labelledby="coming-up-heading" className="border-t border-border pt-5"><h2 id="coming-up-heading" className="text-lg font-semibold mb-2">Coming up</h2><AgendaList items={data.upcoming_deadlines} timezone={timezone} withDate /></section>}
      {data.schedule_warnings?.map(w => <p key={w.id} role="status" className="notice">{w.message}<Link to={w.href || "/timetable"} className="action-link">Check timetable</Link></p>)}
      <footer className="border-t border-border pt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
        <Link to="/analytics" className="action-link"><Clock className="h-4 w-4" />{Math.round((data.seconds_today || 0) / 60)} min studied today</Link>
        <StarterSteps />
      </footer>
    </>}
    {dialog === "task" && <TaskDialog initialDueDate={data.today} fallbackFocusRef={addTrigger} onClose={() => setDialog(null)} onCreated={() => saved("Task added")} />}
    {dialog === "study" && <ActivityDialog defaults={{ kind: "study", recurrence: "none", date: data.today, start_time: "", end_time: "" }} fallbackFocusRef={addTrigger} onClose={() => setDialog(null)} onCreated={() => saved("Study time added")} />}
  </div>;
}

function StarterSteps() {
  const { usage, refresh, setRemaining } = useUsage();
  const [busy, setBusy] = useState(null), [error, setError] = useState("");
  if (usage?.plan?.id !== "freshman" || !(usage.quests || []).some(q => !usage.bonuses_claimed?.[q.id])) return null;
  const done = usage.quests.filter(q => usage.bonuses_claimed?.[q.id]).length;
  const claim = async q => { if (busy) return; setBusy(q.id); setError(""); try { const { data } = await http.post(`/bonuses/claim/${q.id}`); setRemaining(data.credits_remaining); await refresh(); } catch (e) { setError(formatError(e)); } finally { setBusy(null); } };
  return <details className="text-sm basis-full sm:basis-auto" data-testid="bonus-quests">
    <summary className="cursor-pointer text-muted-foreground">Getting started · {done}/{usage.quests.length}</summary>
    <p className="mt-3 text-muted-foreground">Get to know your study space. These steps unlock {usage.free_milestone_max} helps each month.</p>
    <ul>{usage.quests.map(q => <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-2"><span>{q.label}</span>{usage.bonuses_claimed?.[q.id] ? "Done" : <button className="btn btn-outline text-xs" disabled={!!busy} onClick={() => claim(q)}>{busy === q.id ? "Saving…" : "Claim"}</button>}</li>)}</ul>
    {error && <p role="alert">{error}</p>}
  </details>;
}
