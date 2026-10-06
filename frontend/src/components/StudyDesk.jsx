import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BookOpen, NotebookPen, Plus } from "lucide-react";

export function DeskResourceNotice({ resource, label }) {
  if (resource.loading) return <p role="status" className="text-sm text-muted-foreground py-3">Loading {label}…</p>;
  if (!resource.failed) return null;
  return <div className="flex flex-wrap items-center gap-2 py-3 text-sm"><p role="status" className="text-muted-foreground">Your {label} couldn't load.</p><button className="btn btn-outline" onClick={resource.retry}>Retry {label}</button></div>;
}

export default function StudyDesk({ desk, onNewNote }) {
  const { subjects, notes, history, lesson, lessonFailed, subjectName } = desk;
  const recentNotes = [...(notes.data || [])].sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0, 3);
  const hasWork = !!lesson || recentNotes.length > 0;
  return <section aria-labelledby="continue-working-heading" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="continue-working-heading" className="text-lg font-semibold">Continue working</h2><button className="btn btn-ghost" onClick={onNewNote}><Plus className="h-4 w-4" />New note</button></div>
    <DeskResourceNotice resource={notes} label="notes" />
    <DeskResourceNotice resource={history} label="study history" />
    {subjects.failed && <DeskResourceNotice resource={subjects} label="subjects" />}
    {lessonFailed && <div className="flex flex-wrap gap-2 items-center text-sm"><p role="status">Your recent lesson couldn't load.</p><button className="btn btn-outline" onClick={history.retry}>Retry recent lesson</button></div>}
    {hasWork && <ul className="divide-y divide-border">
      {lesson && <li><Link to={`/lessons/${encodeURIComponent(lesson.lesson_id)}`} className="group flex items-center gap-3 rounded-lg py-4 px-3 -mx-3 hover:bg-accent/40"><BookOpen aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block font-medium break-words">{lesson.title}</span><span className="block text-sm text-muted-foreground">Lesson notes{subjectName(lesson.subject_id) && ` · ${subjectName(lesson.subject_id)}`}</span></span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" /></Link></li>}
      {recentNotes.map(note => <li key={note.notebook_id}><Link to={`/notebooks?notebook=${encodeURIComponent(note.notebook_id)}`} className="group flex items-center gap-3 rounded-lg py-4 px-3 -mx-3 hover:bg-accent/40"><NotebookPen aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block font-medium break-words">{note.title}</span><span className="block text-sm text-muted-foreground">Notebook{subjectName(note.subject_id) && ` · ${subjectName(note.subject_id)}`}</span></span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" /></Link></li>)}
    </ul>}
    {!hasWork && !notes.loading && !history.loading && !notes.failed && !history.failed && !lessonFailed && <div className="py-2 space-y-3"><p className="text-sm text-muted-foreground">A place for what you're learning. Write a note now, or open a subject to get started.</p>
      {!!subjects.data?.length && <ul className="divide-y divide-border">{subjects.data.slice(0, 4).map(subject => <li key={subject.subject_id}><Link className="flex items-center gap-3 rounded-lg py-3 px-3 -mx-3 hover:bg-accent/40" to={`/subjects/${encodeURIComponent(subject.subject_id)}`}><BookOpen aria-hidden="true" className="h-5 w-5 text-primary shrink-0" /><span className="font-medium break-words min-w-0 flex-1">{subject.name}</span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" /></Link></li>)}</ul>}
      <Link to="/subjects" className="btn btn-outline"><BookOpen className="h-4 w-4" />Browse subjects</Link></div>}
    {hasWork && <Link to="/notebooks" className="action-link text-sm">All notebooks<ArrowUpRight className="h-4 w-4" /></Link>}
  </section>;
}
