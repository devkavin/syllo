import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { http, formatError } from "@/lib/api";

const selfRatings = { again: "Again · revisit", hard: "Hard · uncertain", good: "Good · recalled" };
const lessonStatuses = { not_started: "Not started", in_progress: "In progress", done: "Done" };

export default function Exams() {
  const [exams, setExams] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setExams(null); setError("");
    http.get("/study/exams").then(({ data }) => { if (live) setExams(data); })
      .catch(error => { if (live) setError(formatError(error)); });
    return () => { live = false; };
  }, [retry]);

  return <div className="max-w-4xl space-y-6" data-testid="exams-page">
    <header className="page-header"><div><h1 className="page-title">Exams</h1><p className="mt-2 text-muted-foreground">Your selected topics, revision work and self-rated recall.</p></div><Link className="btn btn-primary" to="/planner"><CalendarDays className="h-4 w-4" />Plan revision</Link></header>
    <p className="text-sm text-muted-foreground">Recall comes from your own practice ratings. Completed sessions record the work you have marked done.</p>
    {error && <div role="alert" className="notice flex flex-wrap items-center gap-3">{error}<button className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>Retry exams</button></div>}
    {!exams && !error && <p role="status">Loading exam plans…</p>}
    {exams?.length === 0 && <section className="empty-state space-y-2"><h2 className="font-serif text-xl">No exam plans yet</h2><p>Create a revision plan in Planner and choose the lessons on your syllabus.</p></section>}
    {exams && [...exams].sort((a, b) => a.exam_date.localeCompare(b.exam_date)).map(exam => <article key={exam.plan_id} aria-labelledby={`exam-${exam.plan_id}`} className="card p-4 sm:p-6 space-y-5">
      <div><h2 id={`exam-${exam.plan_id}`} className="font-serif text-2xl break-words">{exam.title}</h2><p className="mt-1 text-sm text-muted-foreground">Exam {exam.exam_date} · {exam.daily_minutes} min per study day</p><p className="mt-3 text-sm font-medium">{exam.completed_count} of {exam.total_items} revision sessions completed</p></div>
      <div className="space-y-3">{exam.topics.map(topic => <section key={topic.lesson_id} aria-labelledby={`exam-${exam.plan_id}-topic-${topic.lesson_id}`} className="rounded-lg border border-border p-4 space-y-2">
        <h3 id={`exam-${exam.plan_id}-topic-${topic.lesson_id}`} className="font-medium break-words">{topic.title}</h3>
        <p className="text-xs text-muted-foreground">Lesson marked {lessonStatuses[topic.status] || topic.status}</p>
        <p className="text-sm">{topic.completed_count} of {topic.scheduled_count} revision sessions completed</p>
        {topic.questions_count > 0 ? <p className="text-sm text-muted-foreground">{topic.questions_count} practice card{topic.questions_count === 1 ? "" : "s"} · {topic.due_count} due · {topic.needs_practice} need practice</p> : <p className="text-sm text-muted-foreground">No practice cards yet</p>}
        <p className="text-sm">{topic.last_quality ? `Last self-rating: ${selfRatings[topic.last_quality] || topic.last_quality}` : "No self-rating yet"}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1"><Link className="action-link" to={`/lessons/${encodeURIComponent(topic.lesson_id)}`}>Open lesson</Link><Link className="action-link" to={`/reviews?lesson=${encodeURIComponent(topic.lesson_id)}`}>Practice topic</Link></div>
      </section>)}</div>
      <p className="text-xs text-muted-foreground">Cards need practice until you rate them Good. You can review the schedule in <Link className="action-link" to="/planner">Planner</Link>.</p>
    </article>)}
  </div>;
}
