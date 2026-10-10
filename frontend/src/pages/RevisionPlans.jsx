import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronDown, Circle, Plus } from "lucide-react";
import { http, formatError } from "@/lib/api";
import { dateInZone, shiftDate } from "@/lib/studyTime";

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function RevisionPlans({ timezone, onChange }) {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [creating, setCreating] = useState(false);
  const today = dateInZone(new Date(), timezone);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setPlans(null); setError("");
    http.get("/study/plans").then(({ data }) => { if (live) setPlans(data); })
      .catch(e => { if (live) setError(formatError(e)); });
    return () => { live = false; };
  }, [open, retry]);

  const updateItem = (planId, item) => {
    setPlans(current => current.map(plan => plan.plan_id === planId
      ? { ...plan, items: plan.items.map(old => old.task_id === item.task_id ? item : old) } : plan));
    onChange?.();
  };
  const removePlan = planId => { setPlans(current => current.filter(plan => plan.plan_id !== planId)); onChange?.(); };

  return <section className="border-t border-border pt-5" aria-labelledby="revision-plans-heading">
    <h2 id="revision-plans-heading"><button className="flex w-full items-center justify-between gap-3 py-2 text-left font-serif text-xl" aria-expanded={open} aria-controls="revision-plans-content" onClick={() => setOpen(value => !value)}>
      Revision plans <ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button></h2>
    <p className="mt-1 text-sm text-muted-foreground">Make room for lesson revision before an exam.</p>
    <div id="revision-plans-content" hidden={!open} className="mt-5 space-y-5">
      {open && <>
        {error && <div role="alert" className="notice flex flex-wrap items-center gap-3">{error}<button className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>Retry plans</button></div>}
        {!plans && !error && <p role="status" className="text-sm text-muted-foreground">Loading revision plans…</p>}
        {plans && <>
          <div className="flex flex-wrap items-center gap-3">
            {!creating && <button className="btn btn-outline" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New revision plan</button>}
            <Link className="action-link text-sm" to="/tasks">View all tasks</Link>
          </div>
          {creating && <PlanForm today={today} onClose={() => setCreating(false)} onCreated={plan => {
            setPlans(current => [...current, plan]); setCreating(false); onChange?.();
          }} />}
          {!plans.length && <p className="text-sm text-muted-foreground">No revision plans yet. Choose your lessons and the time you can give them.</p>}
          {plans.map(plan => <PlanCard key={plan.plan_id} plan={plan} today={today} onItemChange={item => updateItem(plan.plan_id, item)} onDeleted={() => removePlan(plan.plan_id)} />)}
        </>}
      </>}
    </div>
  </section>;
}

function PlanForm({ today, onClose, onCreated }) {
  const [form, setForm] = useState({ title: "", subject_id: "", exam_date: "", daily_minutes: 60, minutes_per_lesson: 30, start_date: today, study_days: [0, 1, 2, 3, 4], lesson_ids: [] });
  const [subjects, setSubjects] = useState(null), [groups, setGroups] = useState([]);
  const [subjectsError, setSubjectsError] = useState(""), [lessonsError, setLessonsError] = useState("");
  const [subjectsRetry, setSubjectsRetry] = useState(0), [lessonsRetry, setLessonsRetry] = useState(0);
  const [loadingLessons, setLoadingLessons] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const setField = (key, value) => setForm(current => ({ ...current, [key]: value }));

  useEffect(() => {
    let live = true; setSubjectsError("");
    http.get("/subjects").then(({ data }) => { if (live) setSubjects(data); }).catch(e => { if (live) setSubjectsError(formatError(e)); });
    return () => { live = false; };
  }, [subjectsRetry]);
  useEffect(() => {
    let live = true; setGroups([]); setLessonsError("");
    if (!form.subject_id) { setLoadingLessons(false); return; }
    setLoadingLessons(true);
    const load = async () => {
      try {
        const { data: units } = await http.get(`/subjects/${form.subject_id}/units`);
        const loaded = await Promise.all(units.map(async unit => {
          const { data: lessons } = await http.get(`/units/${unit.unit_id}/lessons`);
          return { ...unit, lessons };
        }));
        if (live) setGroups(loaded);
      } catch (e) { if (live) setLessonsError(formatError(e)); }
      finally { if (live) setLoadingLessons(false); }
    };
    load();
    return () => { live = false; };
  }, [form.subject_id, lessonsRetry]);

  const toggle = (key, value) => setForm(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(old => old !== value) : [...current[key], value].sort() }));
  const submit = async event => {
    event.preventDefault();
    if (!form.lesson_ids.length) { setError("Choose at least one lesson to revise."); return; }
    if (!form.study_days.length) { setError("Choose at least one study day."); return; }
    if (form.exam_date <= form.start_date) { setError("Choose an exam date after the start date."); return; }
    setBusy(true); setError("");
    try {
      const { data } = await http.post("/study/plans", { ...form, title: form.title.trim(), daily_minutes: Number(form.daily_minutes), minutes_per_lesson: Number(form.minutes_per_lesson) });
      onCreated(data);
    } catch (e) { setError(formatError(e)); }
    finally { setBusy(false); }
  };
  const lessonCount = groups.reduce((count, group) => count + group.lessons.length, 0);
  let capacity = null;
  if (form.start_date && form.exam_date && Number(form.minutes_per_lesson) > 0) {
    const start = new Date(`${form.start_date}T00:00:00Z`);
    const days = Math.max(0, Math.round((Date.parse(`${form.exam_date}T00:00:00Z`) - start.getTime()) / 86400000));
    const weekday = (start.getUTCDay() + 6) % 7;
    let studyDays = Math.floor(days / 7) * form.study_days.length;
    for (let index = 0; index < days % 7; index++) {
      if (form.study_days.includes((weekday + index) % 7)) studyDays++;
    }
    capacity = studyDays * Math.floor(Number(form.daily_minutes || 0) / Number(form.minutes_per_lesson));
  }

  return <form className="rounded-xl border border-border bg-accent/20 p-4 sm:p-5 space-y-5" onSubmit={submit} aria-label="Create revision plan">
    <h3 className="font-semibold">Plan your revision</h3>
    <fieldset disabled={busy} className="space-y-5 min-w-0">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">Plan title<input className="input mt-1" required maxLength={200} value={form.title} onChange={e => setField("title", e.target.value)} autoFocus /></label>
        <label className="block text-sm">Revision subject<select className="input mt-1" required disabled={!subjects} value={form.subject_id} onChange={e => setForm(current => ({ ...current, subject_id: e.target.value, lesson_ids: [] }))}>
          <option value="">Choose a subject</option>{subjects?.map(subject => <option key={subject.subject_id} value={subject.subject_id}>{subject.name}</option>)}
        </select></label>
      </div>
      {subjectsError && <p role="alert" className="notice">{subjectsError} <button type="button" className="action-link" onClick={() => setSubjectsRetry(value => value + 1)}>Retry subjects</button></p>}
      {subjects?.length === 0 && <p className="text-sm text-muted-foreground">Add a <Link to="/subjects" className="action-link">subject with lessons</Link> to start a plan.</p>}
      <fieldset className="space-y-3 min-w-0">
        <legend className="text-sm font-medium">Lessons to revise</legend>
        {!form.subject_id && <p className="text-sm text-muted-foreground">Choose a subject to see its lessons.</p>}
        {loadingLessons && <p role="status" className="text-sm text-muted-foreground">Loading lessons…</p>}
        {lessonsError && <p role="alert" className="notice">{lessonsError} <button type="button" className="action-link" onClick={() => setLessonsRetry(value => value + 1)}>Retry lessons</button></p>}
        {!!form.subject_id && !loadingLessons && !lessonsError && (lessonCount ? <>
          <button type="button" className="action-link text-sm" onClick={() => setField("lesson_ids", form.lesson_ids.length === lessonCount ? [] : groups.flatMap(group => group.lessons.map(lesson => lesson.lesson_id)))}>{form.lesson_ids.length === lessonCount ? "Clear selection" : "Select all lessons"}</button>
          <div className="max-h-64 overflow-y-auto space-y-4 rounded-lg border border-border p-3">
            {groups.filter(group => group.lessons.length).map(group => <fieldset key={group.unit_id} className="space-y-2 min-w-0"><legend className="text-xs font-semibold text-muted-foreground mb-2">{group.name}</legend>
              {group.lessons.map(lesson => <label key={lesson.lesson_id} className="flex items-start gap-2 py-1 text-sm cursor-pointer"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={form.lesson_ids.includes(lesson.lesson_id)} onChange={() => toggle("lesson_ids", lesson.lesson_id)} /><span className="break-words min-w-0">{lesson.title}</span></label>)}
            </fieldset>)}
          </div>
        </> : <p className="text-sm text-muted-foreground">This subject has no lessons yet. <Link className="action-link" to={`/subjects/${form.subject_id}`}>Add lessons</Link></p>)}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">Exam date<input type="date" className="input mt-1" required min={shiftDate(today, 1)} value={form.exam_date} onChange={e => setField("exam_date", e.target.value)} /></label>
        <label className="block text-sm">Daily study minutes<input type="number" className="input mt-1" required min="1" max="1440" value={form.daily_minutes} onChange={e => setField("daily_minutes", e.target.value)} /></label>
      </div>
      <fieldset className="min-w-0"><legend className="text-sm font-medium mb-2">Study days</legend><div className="flex flex-wrap gap-2">
        {weekdays.map((day, index) => <label key={day} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm cursor-pointer"><input type="checkbox" aria-label={day} className="accent-primary" checked={form.study_days.includes(index)} onChange={() => toggle("study_days", index)} />{day.slice(0, 3)}</label>)}
      </div></fieldset>
      <details className="text-sm"><summary className="cursor-pointer font-medium py-2">Planning settings</summary><div className="grid gap-4 sm:grid-cols-2 mt-3">
        <label className="block">Start date<input type="date" className="input mt-1" required min={today} value={form.start_date} onChange={e => setField("start_date", e.target.value)} /></label>
        <label className="block">Minutes per lesson<input type="number" className="input mt-1" required min="1" max="1440" value={form.minutes_per_lesson} onChange={e => setField("minutes_per_lesson", e.target.value)} /></label>
      </div></details>
      <p className="text-sm text-muted-foreground">{form.lesson_ids.length} lesson{form.lesson_ids.length === 1 ? "" : "s"} selected · {form.lesson_ids.length * Number(form.minutes_per_lesson || 0)} minutes of revision. Lessons fit within your daily limit on selected days before the exam. If there isn't enough room, adjust the dates, time or lessons.</p>
      {capacity !== null && <p className={`text-sm ${capacity < form.lesson_ids.length ? "text-destructive" : "text-muted-foreground"}`} role="status">{capacity} lesson slot{capacity === 1 ? "" : "s"} before the exam</p>}
    </fieldset>
    {error && <p role="alert" className="notice">{error}</p>}
    <p className="text-xs text-muted-foreground">Your revision work will also appear in Today, Tasks and your agenda.</p>
    <div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy || loadingLessons || !!lessonsError || !subjects?.length}>{busy ? "Creating…" : "Create plan"}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>Cancel</button></div>
  </form>;
}

function PlanCard({ plan, today, onItemChange, onDeleted }) {
  const [deleting, setDeleting] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const done = plan.items.filter(item => item.completed).length;
  const overdue = plan.items.filter(item => !item.completed && item.due_date < today).length;
  const upcoming = plan.items.length - done - overdue;
  const remove = async () => {
    setBusy(true); setError("");
    try { await http.delete(`/study/plans/${plan.plan_id}`); onDeleted(); }
    catch (e) { setError(formatError(e)); }
    finally { setBusy(false); }
  };
  return <article className="rounded-xl border border-border p-4 sm:p-5 space-y-4" aria-labelledby={`revision-plan-${plan.plan_id}`}>
    <div><h3 id={`revision-plan-${plan.plan_id}`} className="font-serif text-xl break-words">{plan.title}</h3>
      <p className="text-xs text-muted-foreground mt-1">Exam {plan.exam_date} · {plan.daily_minutes} min per study day</p>
      <p className="mt-2 text-sm">{done}/{plan.items.length} completed · <span className={overdue ? "text-destructive" : ""}>{overdue} overdue</span> · {upcoming} upcoming</p>
    </div>
    <ul className="divide-y divide-border">{[...plan.items].sort((a, b) => Number(a.completed) - Number(b.completed) || a.due_date.localeCompare(b.due_date)).map(item => <PlanItem key={item.task_id} plan={plan} item={item} today={today} onSaved={onItemChange} disabled={busy} />)}</ul>
    <details className="text-sm border-t border-border pt-2"><summary className="cursor-pointer py-2 text-muted-foreground">Plan options</summary>
      <p className="text-xs text-muted-foreground mt-2">Study days: {plan.study_days.map(day => weekdays[day]).join(", ")}</p>
      {deleting ? <div role="group" aria-label={`Delete ${plan.title}?`} className="notice mt-3 space-y-3"><p>Delete this plan and its generated tasks from Today, Tasks and your agenda?</p>
        {error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2"><button className="btn btn-outline text-destructive" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete plan and tasks"}</button><button className="btn btn-ghost" disabled={busy} onClick={() => { setDeleting(false); setError(""); }}>Keep plan</button></div>
      </div> : <button className="btn btn-ghost text-destructive mt-2" aria-label={`Delete ${plan.title}`} onClick={() => setDeleting(true)}>Delete plan</button>}
    </details>
  </article>;
}

function PlanItem({ plan, item, today, onSaved, disabled }) {
  const [editing, setEditing] = useState(false), [dueDate, setDueDate] = useState(item.due_date);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const save = async (patch, close = false) => {
    setBusy(true); setError("");
    try { const { data } = await http.patch(`/study/plans/${plan.plan_id}/items/${item.task_id}`, patch); onSaved(data); if (close) setEditing(false); }
    catch (e) { setError(formatError(e)); }
    finally { setBusy(false); }
  };
  return <li className="py-3 space-y-3">
    <div className="flex items-start gap-2">
      <button className="btn btn-ghost btn-icon shrink-0" aria-label={`${item.completed ? "Reopen" : "Complete"} ${item.title}`} aria-pressed={item.completed} disabled={busy || disabled} onClick={() => save({ completed: !item.completed })}>{item.completed ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5" />}</button>
      <div className="min-w-0 flex-1"><p className={`text-sm break-words ${item.completed ? "line-through text-muted-foreground" : "font-medium"}`}>{item.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>Due {item.due_date}</span>{!item.completed && item.due_date < today && <span className="text-destructive">Overdue</span>}{item.completed && <span>Completed</span>}
          {item.lesson_id && <Link className="action-link" aria-label={`${item.title.replace(/^Revise /, "")} lesson`} to={`/lessons/${item.lesson_id}`}>Open lesson</Link>}
          <button className="action-link" disabled={busy || disabled} aria-label={`Reschedule ${item.title}`} onClick={() => { setDueDate(item.due_date); setError(""); setEditing(value => !value); }}>Reschedule</button>
        </div>
      </div>
    </div>
    {editing && <form className="flex flex-wrap items-end gap-2 pl-2 sm:pl-11" onSubmit={e => { e.preventDefault(); save({ due_date: dueDate }, true); }}><label className="block text-sm min-w-0">New date for {item.title}<input type="date" className="input mt-1 w-full sm:w-44" required max={shiftDate(plan.exam_date, -1)} value={dueDate} disabled={busy || disabled} onChange={e => setDueDate(e.target.value)} /></label><button className="btn btn-outline" disabled={busy || disabled}>{busy ? "Saving…" : "Save date"}</button><button className="btn btn-ghost" type="button" disabled={busy || disabled} onClick={() => { setEditing(false); setError(""); }}>Cancel</button><p className="basis-full text-xs text-muted-foreground">Choose a selected study day before the exam with room in your daily limit.</p></form>}
    {error && <p role="alert" className="notice text-sm">{error} {!editing && <button className="action-link" disabled={busy || disabled} onClick={() => save({ completed: !item.completed })}>Retry completion</button>}</p>}
  </li>;
}
