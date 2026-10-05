import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUsage } from "@/lib/usage";
import AgendaList from "@/components/AgendaList";
import StudyResponse from "@/components/StudyResponse";
import AiPrivacyNote from "@/components/AiPrivacyNote";
import { nextStudyAction } from "@/lib/nextStudyAction";
import { browserTimezone } from "@/lib/studyTime";
import { formatStudyTime } from "@/lib/studyTime";
export default function Today() {
  const { user } = useAuth(); const timezone = user?.timezone || browserTimezone();
  const [data, setData] = useState(null), [error, setError] = useState(""), [version, setVersion] = useState(0);
  useEffect(() => { let live = true; setError(""); http.get("/today").then(r => { if (live) setData(r.data); }).catch(e => { if (live) setError(formatError(e)); }); return () => { live = false; }; }, [version]);
  const complete = async task => { try { await http.patch(`/tasks/${task.task_id}`, { completed: true }); setVersion(n => n + 1); } catch (e) { setError(formatError(e)); } };
  const next = data && nextStudyAction({ today: data.today, agenda: data.agenda, reviews: data.reviews_due, tasks: data.tasks });
  return <div className="max-w-3xl space-y-8" data-testid="today-page">
    <header className="page-header"><div>
      <p className="text-sm text-muted-foreground mb-2">{data?.today ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${data.today}T12:00:00Z`)) : "Today"}</p>
      <h1 className="page-title">Hello{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
    </div><Link to="/timer" className="btn btn-primary min-h-11">Start Focus</Link></header>
    {error && <div role="alert" className="text-destructive">{error} <button className="btn btn-outline" onClick={() => setVersion(n => n + 1)}>Retry</button></div>}
    {!data && !error && <p role="status">Loading your day…</p>}
    {data && <>
      <section className="border-l-2 border-primary pl-5 py-2"><p className="text-xs uppercase tracking-wide text-muted-foreground">{next.kind === "current" ? "Now" : "Next"}</p><Link to={next.href} className="mt-2 block text-xl font-medium hover:bg-accent rounded-md">{next.label}</Link></section>
      {!!data.circle_invitations?.length && <section aria-label="Circle session invitations" className="border border-primary/25 bg-accent/40 rounded-xl p-5 space-y-3"><h2 className="text-lg font-medium">You're invited to study together</h2>{data.circle_invitations.map(event => <div key={event.id} className="space-y-2"><p className="font-medium">{event.topic}</p><p className="text-sm text-muted-foreground">{formatStudyTime(event.start, timezone, true)} · not confirmed yet</p><div className="flex flex-wrap gap-2"><Link className="btn btn-primary" to={`/circles?circle=${event.circle_id}`}>Review session</Link><button className="btn btn-outline" onClick={async () => { try { await http.post(`/circles/${event.circle_id}/sessions/${event.id}/respond`, { status: "declined", revision: event.revision }); setVersion(n => n + 1); } catch (e) { setError(formatError(e)); } }}>Decline</button></div></div>)}</section>}
      <section><div className="flex justify-between items-center"><h2 className="font-serif text-xl">Your schedule</h2><Link to="/planner" className="text-sm action-link">Open Planner</Link></div><AgendaList items={(data.agenda || []).filter(item => item.ends_at)} timezone={timezone} />
        {!data.timetable?.length && !data.agenda?.some(item => item.ends_at) && <Link to="/timetable?new=1" className="text-sm action-link">Add classes or study time when you're ready</Link>}
      </section>
      <section><h2 className="font-serif text-xl mb-3">Reviews</h2>{!data.reviews_due?.length ? <p className="text-sm text-muted-foreground">No reviews due. Your next review will appear here.</p> : <ul className="divide-y divide-border">{data.reviews_due.map(review => <li key={review.review_id} className="py-3"><Link className="font-medium action-link" to={review.lesson_id ? `/lessons/${review.lesson_id}` : "/reviews"}>{review.lesson_title || review.title || "Review lesson"}</Link><p className="text-xs text-muted-foreground mt-1">Ready whenever you are</p></li>)}</ul>}</section>
      <section><div className="flex justify-between"><h2 className="font-serif text-xl">Due work</h2><Link to="/tasks" className="text-sm action-link">Add task</Link></div>{!data.tasks?.length ? <p className="text-sm text-muted-foreground py-3">Nothing due today.</p> : <ul className="divide-y divide-border">{data.tasks.filter(task => !task.completed).map(task => <li key={task.task_id} className="flex gap-3 py-3 items-center"><button className="btn btn-outline btn-icon" aria-label={`Complete ${task.title}`} onClick={() => complete(task)}>✓</button><div><Link to={`/tasks?task=${task.task_id}`} className="hover:bg-accent rounded-md">{task.title}</Link>{task.due_date < data.today && <p className="text-xs text-muted-foreground">From an earlier day</p>}</div></li>)}</ul>}</section>
      {!!data.upcoming_deadlines?.length && <section><h2 className="font-serif text-xl">Coming up</h2><AgendaList items={data.upcoming_deadlines} timezone={timezone} withDate /></section>}
      {data.schedule_warnings?.map(w => <p key={w.id} role="status" className="text-sm text-muted-foreground">{w.message} <Link to={w.href || "/timetable"} className="action-link">Check timetable</Link></p>)}
      <details className="text-sm border-t border-border pt-4"><summary className="cursor-pointer">My study today</summary><p className="mt-3 text-muted-foreground">{Math.round((data.seconds_today || 0) / 60)} minutes recorded. <Link to="/analytics" className="action-link">View Progress</Link></p></details>
      <StarterSteps /><Reflection />
    </>}
  </div>;
}
function StarterSteps() {
  const { usage, refresh, setRemaining } = useUsage(); const [busy, setBusy] = useState(null), [error, setError] = useState("");
  if (usage?.plan?.id !== "freshman" || !(usage.quests || []).some(q => !usage.bonuses_claimed?.[q.id])) return null;
  const claim = async q => { setBusy(q.id); setError(""); try { const { data } = await http.post(`/bonuses/claim/${q.id}`); setRemaining(data.credits_remaining); await refresh(); } catch (e) { setError(formatError(e)); } finally { setBusy(null); } };
  return <details className="text-sm border-t border-border pt-4" data-testid="bonus-quests"><summary className="cursor-pointer">Unlock more monthly study helps</summary><p className="mt-3 text-muted-foreground">Get to know your study space. Finish these steps to unlock {usage.free_milestone_max} helps each month.</p><ul>{usage.quests.map(q => <li key={q.id} className="flex justify-between gap-3 py-2"><span>{q.label}</span>{usage.bonuses_claimed?.[q.id] ? "Done" : <button className="btn btn-outline text-xs" disabled={!!busy} onClick={() => claim(q)}>{busy === q.id ? "Saving…" : "Claim"}</button>}</li>)}</ul>{error && <p role="alert">{error}</p>}</details>;
}
function Reflection() {
  const { setRemaining } = useUsage(); const [text, setText] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generate = async () => { setBusy(true); setError(""); try { const { data } = await http.get("/ai/reflection"); setText(data.text); setRemaining(data.credits_remaining); } catch (e) { setError(formatError(e)); } finally { setBusy(false); } };
  return <details className="text-sm border-t border-border pt-4"><summary className="cursor-pointer">Reflect on my week</summary><p className="mt-3 mb-3 text-muted-foreground">A short look back and one next step. Uses one study help.</p>{text ? <StudyResponse text={text} /> : <button className="btn btn-outline" disabled={busy} onClick={generate}>{busy ? "Working…" : "Reflect on my week"}</button>}<AiPrivacyNote className="mt-3" />{error && <p role="alert">{error}</p>}</details>;
}
