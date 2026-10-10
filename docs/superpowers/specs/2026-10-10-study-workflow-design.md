# Connected study workflow

User request: implement the six recommended improvements with a clean UI.

## Outcome and constraints

Students can safely write notes, focus while writing, practise recall, revisit
mistakes, plan exam revision, and see practice outcomes separately from time.
Preserve existing notes and work. No commits, paid services, new AI dependencies,
file uploads, or forced setup. Use current React/Tailwind components and owned
FastAPI resources. Respect mobile widths and keyboard navigation. Timer remains
server-authoritative. Persistence failures must remain recoverable.

## Notebook reliability

Notebook responses include revision (initial 1). PATCH accepts expected_revision;
stale writes return 409 with detail.current containing the current notebook.
For compatibility an omitted revision still writes, but the web editor always
sends it. Each successful change snapshots the previous notebook, keeping the
latest 30 snapshots. GET /notebooks/{id}/history returns snapshots with version_id,
revision, title, content, rich_content, paper_style, font_style, subject_id,
lesson_id, created_at. POST /notebooks/{id}/history/{version_id}/restore accepts
expected_revision and returns the restored notebook with a new revision.
DELETE soft-deletes; GET /notebooks?trash=true lists deleted notebooks;
POST /notebooks/{id}/restore restores with revision protection.

Draft recovery uses account-scoped localStorage and remembers the server revision
it was based on. Conflict UI offers save a recovered copy or load server version
after explicit choice; it never blindly overwrites. History/Trash remain in a
small notebook options panel. JSON export preserves rich notes.

GET /lessons/{id}/notebook returns the existing linked notebook or creates one
with literal legacy lesson notes and the lesson title. Lesson notes links open
this canonical editor; no legacy text is discarded.

## Practice and mistakes API

Study routes use /study prefix and own all resources to the authenticated user.
GET /study/questions accepts notebook_id, kind (question/mistake), due (boolean).
Question fields: question_id, notebook_id, subject_id, lesson_id, kind, prompt,
answer, mistake, correction, confidence (nullable again/hard/good), interval_days,
next_review_at, attempts, successes, revision, created_at, updated_at.
POST /study/questions accepts optional notebook_id/subject_id/lesson_id, kind,
prompt (required), answer, mistake, correction. Mistake practice reveals correction
as its answer; prompts and responses are authored by the student.
PATCH /study/questions/{id} accepts expected_revision and editable text fields;
DELETE removes an owned question. POST /study/questions/{id}/attempt accepts
quality (again/hard/good), expected_revision, request_id UUID; return updated
question. Again schedules tomorrow, hard a short interval, good expands a bounded
interval. Duplicate request IDs never count twice; stale actions return 409.
The ratings are self-assessments, not independently graded exam scores.

GET /study/progress returns questions_count, mistakes_count, attempts_count,
successful_attempts, due_count, topics:[{lesson_id,subject_id,title,attempts,
successful_attempts,needs_practice,last_quality}]. Count actual attempts separately
from elapsed study time. Success means a self-rated good attempt; label honestly.

## Revision plans API

GET /study/plans returns plans with plan_id,title,subject_id,exam_date,
daily_minutes,study_days (0 Monday..6 Sunday),items. Each item has task_id,title,
lesson_id,due_date,completed. POST accepts title,subject_id,exam_date,daily_minutes,
study_days,lesson_ids,minutes_per_lesson (default 30), optional start_date.
Distribute lessons across selected days before the exam within daily capacity.
Reject impossible schedules clearly rather than silently overbook. Store generated
items as existing Task records so they appear on Today, Tasks and agenda.
PATCH /study/plans/{plan_id}/items/{task_id} accepts due_date or completed and
checks plan ownership. Rescheduling may move work before the exam; don't rewrite
completed tasks automatically. DELETE plan removes its generated tasks explicitly.

## UI

Notebooks: compact StudyFocus bar above editor, Start/Pause/Resume/Finish; link to
Focus for configuration. Active context from another lesson is shown honestly.
Optional Practice section supports questions and mistakes, selected text as a
prompt, reveal then rating, due practice, editing/deletion and retry states.
Reviews includes practice queue alongside existing lesson reviews.
Planner includes a collapsed Revision plans section with simple guided creation,
lesson selection, dates, capacity, and per-item completion/rescheduling.
Progress includes recall results and topics to revisit, always distinct from time.
LessonWorkspace opens canonical rich notes and preserves its review/status tools.

## Validation

Prove account isolation, migration preservation, conflicting writes, recovery
across browser sessions, history restore, idempotent attempts, scheduling capacity,
rating only after reveal, failed save retry, and no client-owned timer time.
Run full backend/frontend suites, lint and build. Check desktop/mobile if browser
tool is available; disclose inability to verify visuals if it is unavailable.
