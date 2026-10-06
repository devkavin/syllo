import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Check, ChevronDown, Clock, ListTodo, Plus, RotateCcw, NotebookPen } from "lucide-react";
import { http, formatError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUsage } from "@/lib/usage";
import AgendaList from "@/components/AgendaList";
import TaskDialog from "@/components/TaskDialog";
import ActivityDialog from "@/components/ActivityDialog";
import StudyDesk, { DeskResourceNotice } from "@/components/StudyDesk";
import StudyWorkDialog from "@/components/StudyWorkDialog";
import NewNoteDialog from "@/components/NewNoteDialog";
import useStudyDesk, { studyFocusHref } from "@/hooks/useStudyDesk";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { nextStudyAction } from "@/lib/nextStudyAction";
import { browserTimezone, formatStudyTime } from "@/lib/studyTime";

export default function Today() {
  const { user } = useAuth();
  const timezone = user?.timezone || browserTimezone();
  const [data, setData] = useState(null), [error, setError] = useState(""), [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState(null), [notice, setNotice] = useState("");
  const desk = useStudyDesk();
  const [workItem, setWorkItem] = useState(null);
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
  useEffect(() => { if (dialog) setNotice(""); }, [dialog]);
  const saved = message => { setNotice(message); refresh(); };

  const complete = async task => {
    if (mutation.current) return;
    mutation.current = true; setWorking(task.task_id); setError("");
    try {
      await http.patch(`/tasks/${task.task_id}`, { completed: true });
      setData(old => ({ ...old, tasks: (old.tasks || []).filter(t => t.task_id !== task.task_id), agenda: (old.agenda || []).filter(item => !(item.source === "task" && item.id === task.task_id)) }));
      setWorkItem(null); setNotice("Task completed");
      refresh();
    } catch (e) { setError(formatError(e)); }
    finally { mutation.current = false; setWorking(null); }
  };
  const next = data && nextStudyAction({ today: data.today, agenda: data.agenda, reviews: data.reviews_due, tasks: data.tasks });
  const lesson = desk.lesson;
  const firstUse = quiet && data.subjects_count === 0 && desk.history.data?.length === 0 && desk.timetable.data?.length === 0 && !desk.history.failed && !desk.timetable.failed;
  const focusHref = lesson ? `/timer?lesson=${encodeURIComponent(lesson.lesson_id)}` : "/timer";
  const remainingTasks = (data?.tasks || []).filter(t => !t.completed && !(next?.kind === "task" && next.item.task_id === t.task_id));
  const remainingReviews = (data?.reviews_due || []).filter(r => !(next?.kind === "review" && next.item.review_id === r.review_id));
  const schedule = (data?.agenda || []).filter(item => item.ends_at);
  const hasPlan = remainingTasks.length + remainingReviews.length > 0;
  const taskMeta = task => task.due_date < data.today ? "From an earlier day" : `Due today${task.due_time ? ` · ${task.due_time}` : ""}`;
  const completion = task => <button className="btn btn-ghost btn-icon" aria-label={`Complete ${task.title}`} disabled={working != null} onClick={() => complete(task)}><Check className="h-5 w-5" /></button>;
  const openWork = (item, isTask = false) => { setError(""); setWorkItem({ item, isTask }); };
  const contextName = next?.kind === "focus" ? desk.subjectName(lesson?.subject_id) : desk.subjectName(next?.item?.subject_id);
  const nextDescription = next?.kind === "task" ? taskMeta(next.item) : next?.kind === "review" ? "A chance to revisit what you've learned." :
    ["current", "upcoming"].includes(next?.kind) ? `${formatStudyTime(next.item.starts_at, timezone)} – ${formatStudyTime(next.item.ends_at, timezone)} · ${next.item.kind?.replaceAll("_", " ") || "Activity"}` :
    lesson ? "Pick up where you left off." : firstUse ? "Start a session, jot down a note, or add one thing to work on. Subjects can wait." : quiet ? "Choose a subject, write a note, or take a little time to focus." : "There's room for a focus session. Your due work is below.";

  return <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8" data-testid="today-page">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm text-muted-foreground mb-1">{data?.today ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${data.today}T12:00:00Z`)) : "Today"}</p>
        <h1 className="page-title">Hello{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</h1></div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button ref={addTrigger} className="btn btn-outline" aria-label="Add to today" disabled={!data}><Plus className="h-4 w-4" />Add<ChevronDown className="h-4 w-4" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (dialog) event.preventDefault(); }}>
          <DropdownMenuItem className="min-h-11" onSelect={() => setDialog("task")}><ListTodo />Task</DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onSelect={() => setDialog("study")}><Clock />Study time</DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onSelect={() => setDialog("note")}><NotebookPen />Note</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    {error && !workItem && <div role="alert" className="notice">{error}<button className="btn btn-outline" onClick={refresh}>Retry</button></div>}
    {notice && <p role="status" className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-primary" />{notice}</p>}
    {!data && !error && <p role="status" className="py-8 text-muted-foreground">Loading your day…</p>}
    {data && <>
      <div className="grid grid-cols-1 min-[1200px]:grid-cols-[minmax(0,1fr)_19rem] gap-8 min-[1200px]:gap-10">
      <div className="min-w-0 space-y-7 sm:space-y-9">
      <section aria-label="Suggested next step" className="border-l-2 border-primary pl-5 py-1 sm:pl-6">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground mb-2">{next.kind === "current" ? "Happening now" : next.kind === "upcoming" ? "Later today" : next.kind === "review" ? "Ready for review" : next.kind === "task" ? "One thing to work on" : lesson ? "Continue learning" : firstUse ? "Welcome to your study space" : "Make some room to study"}</p>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight break-words">{next.kind === "focus" ? lesson?.title || "What would you like to work on?" : next.label}</h2>
            {contextName && <p className="text-sm font-medium mt-1 text-primary break-words">{contextName}</p>}
            <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-xl">{nextDescription}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
              {next.kind === "focus" ? <Link to={focusHref} className="btn btn-primary">{lesson ? "Continue studying" : "Start Focus"}</Link> :
                next.kind === "task" ? <button className="btn btn-primary" onClick={() => openWork(next.item, true)}>Work on task</button> :
                next.kind === "review" || next.item.kind === "circle_study" ? <Link to={next.href} className="btn btn-primary">{next.kind === "review" ? "Review lesson" : "Start session"}</Link> :
                <button className="btn btn-primary" onClick={() => openWork(next.item)}>{next.item.kind === "class" ? "Open class" : "Open activity"}</button>}
              {next.kind === "task" && completion(next.item)}
              {next.kind !== "focus" && <Link to={studyFocusHref(next.item)} className="btn btn-ghost">Start Focus</Link>}
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
        <h2 id="today-plan-heading" className="text-lg font-semibold mb-3">Due work & reviews</h2>
        <ul className="divide-y divide-border">
          {remainingTasks.map(task => <li key={task.task_id} className="flex items-center gap-3 py-3">
            {completion(task)}<div className="min-w-0 flex-1"><button onClick={() => openWork(task, true)} className="row-link -ml-3 text-left break-words">{task.title}</button><p className="text-sm text-muted-foreground">{taskMeta(task)}{desk.subjectName(task.subject_id) && ` · ${desk.subjectName(task.subject_id)}`}</p></div>
          </li>)}
          {remainingReviews.map(review => <li key={review.review_id} className="flex flex-wrap items-center gap-3 py-4">
            <RotateCcw aria-hidden="true" className="h-5 w-5 text-muted-foreground shrink-0" /><div className="min-w-0 flex-1"><p className="font-medium">{review.lesson_title || review.title || "Review lesson"}</p><p className="text-sm text-muted-foreground">{new Date(review.next_review_at).getTime() <= Date.now() ? "Ready for review" : `Review at ${formatStudyTime(review.next_review_at, timezone)}`}</p></div>
            <Link className="btn btn-outline" to={review.lesson_id ? `/lessons/${review.lesson_id}` : "/reviews"}>Review lesson<span className="sr-only">: {review.lesson_title || review.title || "lesson"}</span></Link>
          </li>)}
        </ul>
      </section>}
      <StudyDesk desk={desk} onNewNote={() => setDialog("note")} />
      </div>
      <aside className="min-w-0 space-y-6 border-t min-[1200px]:border-t-0 min-[1200px]:border-l border-border pt-6 min-[1200px]:pt-0 min-[1200px]:pl-7">
      <section aria-labelledby="schedule-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-2"><h2 id="schedule-heading" className="text-lg font-semibold">Your schedule</h2><Link to="/planner" className="btn btn-ghost btn-icon" aria-label="Open Planner"><CalendarDays className="h-5 w-5" /></Link></div>
        {schedule.length ? <ol className="relative space-y-1">{schedule.map(item => <li key={`${item.source}-${item.id}`}>
          {item.kind === "circle_study" ? <Link to={item.href} className="flex gap-3 rounded-lg p-3 -mx-3 hover:bg-accent/40"><ScheduleItem item={item} timezone={timezone} subject={desk.subjectName(item.subject_id)} /></Link> :
            <button className="flex w-[calc(100%+1.5rem)] gap-3 rounded-lg p-3 -mx-3 text-left hover:bg-accent/40" onClick={() => openWork(item)}><ScheduleItem item={item} timezone={timezone} subject={desk.subjectName(item.subject_id)} /></button>}
        </li>)}</ol> : <p className="text-sm text-muted-foreground leading-relaxed">No classes or study time planned today. Leave it open, or make time for something.</p>}
        <button className="btn btn-outline w-full" onClick={() => setDialog("study")}><Plus className="h-4 w-4" />Plan study time</button>
        <DeskResourceNotice resource={desk.timetable} label="timetable" />
      </section>
      {!!data.upcoming_deadlines?.length && <section aria-labelledby="coming-up-heading" className="border-t border-border pt-5"><h2 id="coming-up-heading" className="text-lg font-semibold mb-2">Coming up</h2><AgendaList items={data.upcoming_deadlines} timezone={timezone} withDate /></section>}
      {data.schedule_warnings?.map(w => <p key={w.id} role="status" className="notice">{w.message}<Link to={w.href || "/timetable"} className="action-link">Check timetable</Link></p>)}
      <footer className="border-t border-border pt-4 space-y-4 text-sm">
        <Link to="/analytics" className="action-link"><Clock className="h-4 w-4" />{Math.round((data.seconds_today || 0) / 60)} min studied today</Link>
        <StarterSteps />
      </footer>
      </aside>
      </div>
    </>}
    {dialog === "task" && <TaskDialog initialDueDate={data.today} fallbackFocusRef={addTrigger} onClose={() => setDialog(null)} onCreated={() => saved("Task added")} />}
    {dialog === "study" && <ActivityDialog defaults={{ kind: "study", recurrence: "none", date: data.today, start_time: "", end_time: "" }} fallbackFocusRef={addTrigger} onClose={() => setDialog(null)} onCreated={() => saved("Study time added")} />}
    {dialog === "note" && <NewNoteDialog subjects={desk.subjects} fallbackFocusRef={addTrigger} onClose={() => setDialog(null)} />}
    {workItem && <StudyWorkDialog {...workItem} error={error} desk={desk} timezone={timezone} busy={working != null} fallbackFocusRef={addTrigger} onClose={() => setWorkItem(null)} onComplete={complete} />}
  </div>;
}

function ScheduleItem({ item, timezone, subject }) {
  return <><time dateTime={item.starts_at} className="shrink-0 text-sm font-medium text-primary pt-0.5">{formatStudyTime(item.starts_at, timezone)}</time><span className="min-w-0 flex-1"><span className="block font-medium break-words">{item.title}</span><span className="block text-xs text-muted-foreground mt-1">{subject || item.kind.replaceAll("_", " ")} · until {formatStudyTime(item.ends_at, timezone)}</span></span></>;
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
