import React, { useState } from "react";
import { Link } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { subjectClasses, SUBJECT_COLORS, SUBJECT_COLOR_IDS } from "@/lib/palette";
import { Plus, ArrowUpRight } from "lucide-react";
import Modal from "@/components/Modal";
import { useSubjectsQuery } from "@/hooks/useAcademicQueries";

export default function Subjects() {
  const { data: subjects = [], isPending: loading, error, refetch } = useSubjectsQuery();
  const [showNew, setShowNew] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="space-y-8" data-testid="subjects-page">
      <div className="page-header">
        <div>
          <div className="section-title mb-2">Your curriculum</div>
          <h1 className="page-title">Subjects</h1>
          <p className="text-muted-foreground mt-2 max-w-md">A quiet shelf for everything you're learning.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)} data-testid="new-subject-btn">
          <Plus className="w-4 h-4" /> New subject
        </button>
      </div>

      {error && <div className="text-destructive text-sm">{formatError(error)}</div>}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0,1,2,3].map((i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : subjects.length === 0 ? (
        <div className="empty-state">
          <div className="font-serif text-xl mb-1">A blank shelf</div>
          <div className="text-muted-foreground text-sm mb-4">Add your first subject to get started.</div>
          <button className="btn btn-primary" onClick={() => setShowNew(true)} data-testid="empty-new-subject">
            <Plus className="w-4 h-4" /> Add a subject
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {subjects.map((s) => {
            const c = subjectClasses(s.color, isDark);
            return (
              <Link
                key={s.subject_id}
                to={`/subjects/${s.subject_id}`}
                data-testid={`subject-card-${s.subject_id}`}
                className="card p-5 hover:border-ring transition-colors group"
              >
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="subject-dot" style={{ background: c.dot }} />
                  <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="font-serif text-2xl mb-1 tracking-tight">{s.name}</div>
                <div className="text-sm text-muted-foreground line-clamp-2">
                  {s.description || "Open to view units and lessons."}
                </div>
                <div className="text-sm mt-4 inline-flex items-center gap-1 text-primary">
                  Open subject →
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showNew && <NewSubjectModal onClose={() => setShowNew(false)} onCreated={refetch} />}
    </div>
  );
}

function NewSubjectModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("sage");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr("");
    try {
      await http.post("/subjects", { name: name.trim(), color });
      onCreated(); onClose();
    } catch (e) { setErr(formatError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="New subject" description="Give it a name and a colour to remember it by." onClose={onClose}>
      <form onSubmit={submit} data-testid="new-subject-modal">
        <label className="text-xs text-muted-foreground" htmlFor="subjects-field-1">Name</label>
        <input id="subjects-field-1" className="input mt-1 mb-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Organic Chemistry" data-testid="new-subject-name" autoFocus />
        <fieldset><legend className="field-label">Colour</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 mb-4">
          {SUBJECT_COLOR_IDS.map((cid) => (
            <button
              key={cid}
              type="button"
              onClick={() => setColor(cid)}
              aria-pressed={color === cid}
              data-testid={`color-swatch-${cid}`}
              className={`flex min-h-11 items-center gap-2 rounded-lg border px-2 py-2 text-sm transition-colors ${color === cid ? "border-ring bg-accent" : "border-border hover:bg-accent/60"}`}
            >
              <span className="subject-dot" style={{ background: SUBJECT_COLORS[cid].dot }} />
              <span>{SUBJECT_COLORS[cid].name}</span>
            </button>
          ))}
        </div></fieldset>
        {err && <div role="alert" className="text-destructive text-sm mb-2">{err}</div>}
        <button className="btn btn-primary w-full" disabled={busy} data-testid="new-subject-submit">
          {busy ? "Adding" : "Add subject"}
        </button>
      </form>
    </Modal>
  );
}
