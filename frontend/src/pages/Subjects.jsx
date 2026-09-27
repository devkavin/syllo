import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { subjectClasses, SUBJECT_COLORS, SUBJECT_COLOR_IDS } from "@/lib/palette";
import { Plus, X } from "lucide-react";

export default function Subjects() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showNew, setShowNew] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const load = async () => {
    try { setSubjects((await http.get("/subjects")).data); }
    catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6" data-testid="subjects-page">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Subjects</h1>
          <p className="text-muted-foreground mt-1">Your curriculum, calmly organised.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)} data-testid="new-subject-btn">
          <Plus className="w-4 h-4" /> New subject
        </button>
      </div>

      {err && <div className="text-destructive text-sm">{err}</div>}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0,1,2,3].map((i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : subjects.length === 0 ? (
        <div className="card p-10 text-center">
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
                className="card p-5 hover:shadow-sm transition-all hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="subject-dot" style={{ background: c.dot }} />
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {SUBJECT_COLORS[s.color]?.name || "Subject"}
                  </span>
                </div>
                <div className="font-serif text-xl mb-1">{s.name}</div>
                <div className="text-sm text-muted-foreground line-clamp-2">
                  {s.description || "Open to view units and lessons."}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showNew && <NewSubjectModal onClose={() => setShowNew(false)} onCreated={load} />}
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
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form onSubmit={submit} className="relative card p-6 w-full max-w-md" data-testid="new-subject-modal">
        <button type="button" className="btn btn-ghost !p-1 absolute right-2 top-2" onClick={onClose} data-testid="new-subject-close"><X className="w-4 h-4" /></button>
        <h2 className="font-serif text-xl mb-1">New subject</h2>
        <p className="text-sm text-muted-foreground mb-4">Give it a name and a colour to remember it by.</p>
        <label className="text-xs text-muted-foreground">Name</label>
        <input className="input mt-1 mb-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Organic Chemistry" data-testid="new-subject-name" autoFocus />
        <label className="text-xs text-muted-foreground">Colour</label>
        <div className="grid grid-cols-4 gap-2 mt-2 mb-4">
          {SUBJECT_COLOR_IDS.map((cid) => (
            <button
              key={cid}
              type="button"
              onClick={() => setColor(cid)}
              data-testid={`color-swatch-${cid}`}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors ${color === cid ? "border-ring bg-accent" : "border-border hover:bg-accent/60"}`}
            >
              <span className="subject-dot" style={{ background: SUBJECT_COLORS[cid].dot }} />
              <span>{SUBJECT_COLORS[cid].name}</span>
            </button>
          ))}
        </div>
        {err && <div className="text-destructive text-sm mb-2">{err}</div>}
        <button className="btn btn-primary w-full" disabled={busy} data-testid="new-subject-submit">
          {busy ? "Adding" : "Add subject"}
        </button>
      </form>
    </div>
  );
}
