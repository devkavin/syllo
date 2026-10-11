import React, { useEffect, useMemo, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { subjectClasses } from "@/lib/palette";
import { Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import NotebookPractice from "@/components/NotebookPractice";
import { useAuth } from "@/lib/auth";

export default function Reviews() {
  const accountId = useAuth()?.user?.user_id;
  return <ReviewWorkspace key={accountId || "unavailable"} />;
}

function ReviewWorkspace() {
  const [params] = useSearchParams();
  const lessonId = params.get("lesson");
  const questionId = params.get("question");
  const [items, setItems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  useEffect(() => {
    let live = true; setLoading(true); setErr("");
    Promise.all([http.get("/reviews"), http.get("/subjects")])
      .then(([r, s]) => { if (live) { setItems(r.data); setSubjects(s.data); } })
      .catch(e => { if (live) setErr(formatError(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [retry]);

  const subMap = useMemo(() => Object.fromEntries(subjects.map((x) => [x.subject_id, x])), [subjects]);
  const now = new Date();
  const scopedItems = lessonId ? items.filter(item => item.lesson_id === lessonId) : items;
  const due = scopedItems.filter((r) => new Date(r.next_review_at) <= now);
  const later = scopedItems.filter((r) => new Date(r.next_review_at) > now);

  const renderItem = (r) => {
    const sub = r.subject_id ? subMap[r.subject_id] : null;
    const c = sub ? subjectClasses(sub.color, isDark) : null;
    const dueSoon = new Date(r.next_review_at) <= now;
    return (
      <li key={r.review_id} className="py-4 flex flex-wrap items-center gap-3" data-testid={`review-${r.review_id}`}>
        <div className="flex-1 min-w-0">
          <div className="text-sm">{r.lesson_id ? <Link className="hover:bg-accent rounded-md" to={`/lessons/${r.lesson_id}`}>{r.lesson_title || "Lesson"}</Link> : "Lesson no longer available"}</div>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
            {sub && <span className="inline-flex items-center gap-1"><span className="subject-dot" style={{ background: c.dot }} />{sub.name}</span>}
            <span>Next: {new Date(r.next_review_at).toLocaleDateString()}</span>
            <span>Interval: {r.interval_days}d</span>
          </div>
        </div>
        {dueSoon && r.lesson_id ? (
          <Link className="btn btn-primary text-xs" to={`/lessons/${r.lesson_id}`}>Open lesson to review</Link>
        ) : (
          <div className="text-xs text-muted-foreground">Scheduled</div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-8" data-testid="reviews-page">
      <div className="space-y-2">
        <div className="section-title mb-2">Spaced practice</div>
        <h1 className="page-title">Reviews</h1>
        <p className="text-muted-foreground mt-2 max-w-md">A little recall practice, then a chance to revisit your lessons.</p>
      </div>
      {lessonId && <Link className="action-link" to={`/lessons/${encodeURIComponent(lessonId)}`}>Back to lesson</Link>}
      <NotebookPractice key={`${lessonId || "all"}.${questionId || "queue"}`} dueOnly={!lessonId && !questionId} lessonId={lessonId} initialQuestionId={questionId} />
      <section className="border-t border-border pt-6 space-y-4" aria-label="Lesson reviews">
      <h2 className="font-serif text-xl">Lesson reviews</h2>
      {loading ? (
        <div className="space-y-2">{[0,1,2].map((i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : err ? <div role="alert" className="text-destructive text-sm space-y-2"><p>{err}</p><button className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>Retry lesson reviews</button></div> : scopedItems.length === 0 ? (
        <div className="empty-state">
          <Sparkles className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
          <div className="font-serif text-lg mb-1">Nothing to review yet</div>
          <div className="text-sm text-muted-foreground">Schedule a review from a lesson or after a focus session.</div>
        </div>
      ) : (
        <>
          <section>
            <h2 className="font-serif text-xl mb-3">Due now ({due.length})</h2>
            {due.length === 0 ? <div className="text-sm text-muted-foreground">All caught up. Nice.</div> : (
              <ul className="divide-y divide-border">{due.map(renderItem)}</ul>
            )}
          </section>
          {later.length > 0 && (
            <section>
              <h2 className="font-serif text-xl mb-3">Scheduled ({later.length})</h2>
              <ul className="divide-y divide-border">{later.map(renderItem)}</ul>
            </section>
          )}
        </>
      )}
      </section>
    </div>
  );
}
