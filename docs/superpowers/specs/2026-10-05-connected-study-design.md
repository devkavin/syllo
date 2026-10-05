# Connected study and Circle scheduling

Status: design and plan approved; implemented locally with automated verification.
Production build, visual smoke testing and hosted MySQL concurrency verification
remain release checks, not claims made by this implementation.

## Intent and boundaries

The student should know what to do next, enter study information once, and
coordinate study with friends without exposing private academic content.
The user requested three priorities: connect lessons/notes/tasks/focus/reviews,
make Today action-first, then add private Circle availability and scheduled study.
Deliver them in that order, each with its own verification checkpoint.

Work in the existing local project on main; no worktrees. Do not build, start
the app, deploy, change live payments, or call paid inference. No model runs on
the server. Scheduling is deterministic application logic. Keep younger students
eligible; the unresolved Companion provider arrangement is outside this work.

This does not implement every outstanding feature from the original brief.
Push notifications, upload processing, live payments, rich mathematical editing,
shared class/exam template import, and real-time synchronized timers remain later
work. Ordinary app use must not require subjects, Circle membership or sharing.

## Architecture choice

Recommended: extend the existing academic relationships, introduce dated planned
activities, and reuse them for accepted Circle sessions. Build a small scheduling
service shared by Planner, Today and Circle availability.

Alternatives considered: keep Circle scheduling in an independent calendar
(less initial change, but divergent Today/conflict behavior), or introduce a
real-time collaborative room system (more operational complexity than required).
Neither solves the student's immediate planning problem as cleanly.

## Delivery 1 — the personal study loop

### Lesson workspace and notes

Add an owned lesson route `/lessons/:id`, accessible from curriculum, linked
tasks, linked notebooks and reviews. The notebook area is the visual focus.
Show subject/unit breadcrumbs, status, recorded time, last studied, next review
and related tasks. Actions: Start studying, Schedule review, Add task.

Preserve existing `Lesson.notes` as the primary lesson text. Do not copy it into
`Notebook.content`, automatically merge two editable documents, or overwrite
existing content. Standalone notebooks remain independent documents; attaching
one to a lesson makes it a related notebook, not a second copy of the lesson text.
Expose lesson selection in standalone notebooks and task creation/editing.
Changing a parent subject clears incompatible lesson selection explicitly.
Server ownership and subject/unit consistency checks remain authoritative.

Use a shared debounced autosave hook: capture resource ID with the draft, serialize
writes per resource, cancel queued work when navigating away, show saving/saved/
failed states, and retain unsaved text for retry. Never report success before the
write finishes. This release does not claim cross-device conflict resolution or
offline synchronization; do not silently discard a visibly failed draft.

### Focus and completion

Allow no subject, subject only, or subject → unit → lesson. Lesson entry points
prefill the owned lesson; Focus still works without curriculum. Persist the
selection with the current timer state. Keep selection locked while studying.
Send lesson ID with the recorded session; the server derives its subject/unit.

Session completion opens a calm summary only after the session is recorded:
actual focused minutes, lesson if selected, optional private session note,
and review choices: 30 minutes, tomorrow, 3 days, 1 week, custom date/time.
Finish without a note or review remains possible. A failed save preserves the
timer/session state and offers retry; it must not display a successful completion.

Add a client-generated session request ID with a unique per-user server constraint.
Retrying the same recording returns the original result and must not duplicate
minutes, progress or streak updates. Editing a completion note updates that owned
session; it does not append another session or replace lesson notes.

Existing automatic next-day review creation remains the default for a first
lesson-linked session or lesson completion. Explicit scheduling replaces the
single outstanding review for that lesson; skipping leaves its existing date.
Upserts are race-safe and validate time/ownership. Review actions open the lesson
before marking practice Good/Again; those outcomes retain the existing interval
behavior. No extra helps are awarded for review actions.

### Acceptance checks

- A lesson-started timer records the correct lesson, unit, subject and time.
- A successful session is counted once even after timeout/retry.
- A scheduled review appears in Today and the planning agenda.
- Personal tasks and notebooks can be linked, unlinked and opened from a lesson.
- Failed/autosaving notes never write to another lesson after navigation.
- Existing unlinked notebooks, tasks, sessions and notes remain intact.

## Delivery 2 — Today and dated planning

### Scheduling foundation

Keep weekly timetable entries as recurring class/study blocks. Add optional
calendar date to non-recurring entries; require a date on new one-off exams,
deadlines and study blocks. Legacy undated `recurrence=none` entries need an
explicit date in the UI: do not invent a date or keep repeating them forever.
Preserve them in timetable management until the student fixes them.

Persist an IANA timezone per student, initially inferred with explicit settings
control; retain the existing numeric offset as a legacy fallback. Store dated
instants in UTC and expand weekly blocks in the student's timezone. Validate real
HH:MM values, positive durations and timezone identifiers. Split overnight busy
intervals or require separate blocks; never accept ambiguous start/end silently.

Expose one dated agenda API merging recurring blocks, dated plans, due tasks,
reviews and accepted Circle sessions. Source IDs and kinds make items actionable.
Tasks/reviews are point-in-time obligations, not automatic busy intervals.
Provide day/week agenda views; a full month calendar is a later enhancement.
Retain the weekly timetable management screen and existing route compatibility.

### Today hierarchy

Greeting/date → next useful action → chronological schedule → due reviews/tasks
→ upcoming deadlines. Start Focus remains immediately visible. Move large study
metrics/heatmaps out of Today into Progress; keep a small optional daily summary.

Next action uses explicit rules, not a model: active class/session, next scheduled
activity, due review/overdue task, then choose a focus activity. Never silently
rearrange plans or start timers. Show empty, busy, overdue, loading and retry states.
Missing timetable prompts setup but does not prevent other actions. Allow skipping
onboarding and completing subjects/timetable setup later.

### Acceptance checks

- A one-off exam occurs once on its actual date, not every matching weekday.
- Today agrees with the planning agenda across midnight and timezone boundaries.
- Reviews/tasks open their actual content or completion action.
- A new student can reach Today and start a task/timer without adding curriculum.
- Mobile shows schedule/action priority without shrinking a desktop dashboard.

## Delivery 3 — privacy-controlled Circle scheduling

### Availability

Each membership has a separate availability-sharing switch, off by default.
Weekly study-availability windows and dated exclusions are personal settings.
Having no timetable entries does not imply availability: explicit windows are
required. Busy intervals subtract classes, planned activities, accepted sessions
and exclusions from those windows.

Members choose participants (including themselves), duration and a date range
up to 14 days. Suggest at most five common slots in 15-minute increments.
Only return suggestions when every selected current member explicitly opted in
and configured windows. Otherwise report that shared availability is unavailable;
allow a manually proposed time without exposing another member's calendar.
No calendar titles, locations, private lessons, tasks or raw personal schedules
appear in Circle responses. Membership authorization is checked on every request.

### Scheduled sessions

A current member can propose a bounded dated study session, invite selected
current members, and optionally describe a topic. Participation states: invited,
accepted, declined. The proposer accepts their own session; everyone else must
accept explicitly. Invited items appear separately in Today/Circles, not as
confirmed busy time. Accepted items appear in the shared planning agenda and
block future availability.

On acceptance, check current membership, event revision and conflicting busy
intervals in a transaction. Conflict returns a clear reason without calendar
details; student can decline or choose another time. Serialize concurrent
acceptances and plan writes for the same user to avoid double booking. Suggestions
are advisory and are always revalidated when accepted.

Rescheduling changes the event revision, clears participants' acceptances to
invited and asks everyone to confirm again; the organiser's new time is validated
and accepted explicitly. Canceling removes the event from active agendas but
preserves already-recorded personal study sessions. Leaving/removal revokes Circle
access and participation in future sessions. It never deletes personal notes,
tasks or focus history. Invite/referral help rules remain unchanged.

Start from an accepted session with an optional personal lesson selection. Link
the recorded personal session to the Circle event, validate participation and
record actual study time only. Joining a scheduled event does not automatically
log its entire duration. There is no live presence, chat, camera or shared timer
in this first release. Weekly time sharing remains a separate opt-in permission.

Circle goals may optionally link to the author's own lesson/task for their own
navigation. Other members see only the explicitly shared goal text and completion;
private object IDs, content and progress are not returned to them. Completing a
goal does not silently complete its task, lesson or review.

### Acceptance checks

- Nonmembers cannot enumerate availability, events or participants.
- Opt-out and removal immediately stop availability use.
- Unknown availability never produces an invented free slot.
- UTC/timezone/DST conversion and recurring busy blocks yield correct suggestions.
- Accept/reschedule/cancel events agree across Today, Planner and Circles.
- Conflicting concurrent actions cannot create two accepted overlapping sessions.
- Each participant's notes, lesson selection and recorded time remain private.

## Migration, efficiency and verification

Use additive Alembic migrations with indexed ownership/date/event lookups and
foreign keys compatible with hosted MySQL. No destructive content migrations,
demo users or plan allowance changes. Preserve old clients' academic payloads.
Bound availability requests and fetch relevant intervals in batches; no query
per slot or per member. Avoid background workers and new infrastructure for this
release. Fetch Circle changes on entry/action refresh, not constant polling.

Write failing behavioral tests before each implementation step. Verify backend
ownership, session idempotency, scheduling boundaries and event state transitions;
frontend tests cover the full lesson/completion flow, Today hierarchy, invitation
acceptance and privacy states. Run existing frontend/backend tests and lint, plus
migration checks against disposable test databases only. Production build and
deployment verification remain explicitly unperformed unless the user later
authorizes them. Actual hosted MySQL race behavior must be verified before claiming
production concurrency guarantees; SQLite-only tests are insufficient evidence.

## Design self-review

- Source of lesson text is explicit; linking notebooks does not duplicate content.
- Invitation, acceptance, actual focus and weekly sharing are separate actions.
- Existing automatic reviews and explicit review choices have one defined result.
- One-off dates, timezone handling and legacy entries have no invented defaults.
- Scope excludes unrelated paid/provider/upload/reminder work and server inference.
- Three delivery checkpoints keep the personal experience useful without Circles.
