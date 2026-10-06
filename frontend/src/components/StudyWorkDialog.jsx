import React from "react";
import { Link } from "react-router-dom";
import { BookOpen, Check, Play } from "lucide-react";
import Modal from "@/components/Modal";
import { DeskResourceNotice } from "@/components/StudyDesk";
import { studyFocusHref } from "@/hooks/useStudyDesk";
import { formatStudyTime } from "@/lib/studyTime";

export default function StudyWorkDialog({ item, isTask, desk, timezone, onClose, onComplete, busy, error, fallbackFocusRef }) {
  const subject = desk.subjectName(item.subject_id);
  // Exact lesson matches first. Subject-only work can use any note in that subject.
  const notes = (desk.notes.data || []).filter(n => item.lesson_id ? n.lesson_id === item.lesson_id : item.subject_id && n.subject_id === item.subject_id).slice(0, 3);
  const description = isTask ? `${item.due_date ? `Due ${item.due_date}` : "No due date"}${subject ? ` · ${subject}` : ""}` : `${formatStudyTime(item.starts_at, timezone, true)}${item.ends_at ? ` – ${formatStudyTime(item.ends_at, timezone)}` : ""}${subject ? ` · ${subject}` : ""}`;
  return <Modal title={item.title} description={description} onClose={onClose} fallbackFocusRef={fallbackFocusRef}>
    <div className="space-y-5">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {item.notes && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.notes}</p>}
      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-primary" to={studyFocusHref(item)}><Play className="h-4 w-4" />Start Focus</Link>
        {item.lesson_id ? <Link className="btn btn-outline" to={`/lessons/${encodeURIComponent(item.lesson_id)}`}><BookOpen className="h-4 w-4" />Open lesson notes</Link> : item.subject_id && <Link className="btn btn-outline" to={`/subjects/${encodeURIComponent(item.subject_id)}`}><BookOpen className="h-4 w-4" />Open subject</Link>}
        {isTask && <button className="btn btn-outline" disabled={busy} onClick={() => onComplete(item)}><Check className="h-4 w-4" />Mark complete</button>}
      </div>
      <DeskResourceNotice resource={desk.notes} label="notes" />
      {!!notes.length && <section aria-label="Related notebooks" className="space-y-2"><h3 className="text-sm font-semibold">Related notebooks</h3><ul className="divide-y divide-border">{notes.map(n => <li key={n.notebook_id}><Link className="row-link w-full break-words" to={`/notebooks?notebook=${encodeURIComponent(n.notebook_id)}`}>{n.title}</Link></li>)}</ul></section>}
      <div className="border-t border-border pt-3"><Link className="btn btn-ghost" to={isTask ? `/tasks?task=${encodeURIComponent(item.task_id)}` : item.href || "/timetable"}>{isTask ? "Edit task" : "Edit schedule"}</Link></div>
    </div>
  </Modal>;
}
