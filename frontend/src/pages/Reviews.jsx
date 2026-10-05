import React, { useEffect, useMemo, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { subjectClasses } from "@/lib/palette";
import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export default function Reviews() {
  const [items, setItems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const load = async () => {
    try {
      const [r, s] = await Promise.all([http.get("/reviews"), http.get("/subjects")]);
      setItems(r.data); setSubjects(s.data);
    } catch (e) { setErr(formatError(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const subMap = useMemo(() => Object.fromEntries(subjects.map((x) => [x.subject_id, x])), [subjects]);
  const now = new Date();
  const due = items.filter((r) => new Date(r.next_review_at) <= now);
  const later = items.filter((r) => new Date(r.next_review_at) > now);

  const renderItem = (r) => {
    const sub = r.subject_id ? subMap[r.subject_id] : null;
    const c = sub ? subjectClasses(sub.color, isDark) : null;
    const dueSoon = new Date(r.next_review_at) <= now;
    return (
      <li key={r.review_id} className="card px-4 py-3 flex items-center gap-3" data-testid={`review-${r.review_id}`}>
        <div className="flex-1 min-w-0">
          <div className="text-sm">{r.lesson_id ? <Link className="hover:underline" to={`/lessons/${r.lesson_id}`}>{r.lesson_title || "Lesson"}</Link> : "Lesson no longer available"}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
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
      <div className="hero-glow relative rise">
        <div className="section-title mb-2">Spaced practice</div>
        <h1 className="font-serif text-4xl tracking-tight">Reviews</h1>
        <p className="text-muted-foreground mt-2 max-w-md">A small daily loop that keeps what you've learned close.</p>
      </div>
      {err && <div className="text-destructive text-sm">{err}</div>}

      {loading ? (
        <div className="space-y-2">{[0,1,2].map((i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center">
          <Sparkles className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
          <div className="font-serif text-lg mb-1">Nothing to review yet</div>
          <div className="text-sm text-muted-foreground">Finish a lesson and Syllo will queue a gentle review here.</div>
        </div>
      ) : (
        <>
          <section>
            <h2 className="font-serif text-xl mb-3">Due now ({due.length})</h2>
            {due.length === 0 ? <div className="text-sm text-muted-foreground">All caught up. Nice.</div> : (
              <ul className="space-y-2">{due.map(renderItem)}</ul>
            )}
          </section>
          {later.length > 0 && (
            <section>
              <h2 className="font-serif text-xl mb-3">Scheduled ({later.length})</h2>
              <ul className="space-y-2">{later.map(renderItem)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
