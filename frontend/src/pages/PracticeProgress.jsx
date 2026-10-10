import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { http, formatError } from "@/lib/api";

const qualityLabels = { again: "Again", hard: "Hard", good: "Good" };

export default function PracticeProgress() {
  const [data, setData] = useState(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true; setError("");
    http.get("/study/progress").then(result => { if (live) setData(result.data); })
      .catch(e => { if (live) setError(formatError(e)); });
    return () => { live = false; };
  }, [retry]);
  const revisit = (data?.topics || []).filter(topic => topic.needs_practice);
  return <section aria-labelledby="recall-results-heading" className="rounded-xl border border-border p-4 sm:p-5 space-y-4">
    <div><h2 id="recall-results-heading" className="font-serif text-xl">Self-rated recall results</h2><p className="mt-2 text-sm text-muted-foreground">Good means you felt able to recall the answer. These are your own ratings; study time is recorded separately.</p></div>
    {error && <div role="alert" className="notice flex flex-wrap items-center gap-3">{error}<button className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>Retry recall results</button></div>}
    {!data && !error && <p role="status" className="text-sm text-muted-foreground">Loading recall results…</p>}
    {data && <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm"><p className="rounded-lg bg-accent/40 p-3">{data.attempts_count || 0} recall attempts</p><p className="rounded-lg bg-accent/40 p-3">{data.successful_attempts || 0} rated Good</p><p className="rounded-lg bg-accent/40 p-3">{data.due_count || 0} due for practice</p></div>
      <p className="text-xs text-muted-foreground">{data.questions_count || 0} questions · {data.mistakes_count || 0} mistakes</p>
      {!data.questions_count && !data.mistakes_count ? <p className="text-sm text-muted-foreground">Turn your own notes into recall questions or record a mistake. <Link className="action-link" to="/notebooks">Add practice in a notebook</Link></p> : <Link className="btn btn-outline" to="/reviews">{data.due_count ? "Practise due questions" : "Open practice"}</Link>}
      {!!revisit.length && <div className="border-t border-border pt-4"><h3 className="text-sm font-semibold mb-2">Topics to revisit</h3><ul className="divide-y divide-border">{revisit.map((topic, index) => <li key={topic.lesson_id || `${topic.subject_id}-${index}`} className="py-3 space-y-1">
        {topic.lesson_id ? <Link className="action-link text-sm break-words" to={`/lessons/${topic.lesson_id}`}>{topic.title}</Link> : <span className="text-sm break-words">{topic.title}</span>}
        <p className="text-xs text-muted-foreground">{topic.attempts} recall attempts · {topic.successful_attempts} rated Good{qualityLabels[topic.last_quality] && ` · Last rated ${qualityLabels[topic.last_quality]}`}</p>
      </li>)}</ul></div>}
    </>}
  </section>;
}
