# Connected Study Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user already chose native/local work: preserve that choice and use executing-plans, not worktrees.

**Goal:** Connect personal study from lesson to review, prioritize Today, and coordinate private Circle study through explicit availability and accepted dated sessions.

**Architecture:** Reuse existing academic ownership and relationships. Add a shared timezone-aware scheduling service with dated agenda projections; Circle sessions are another source in that agenda, not copied timetable rows. Deliver personal study first, then dated planning/Today, then Circle scheduling, with verification after each checkpoint.

**Tech Stack:** React 19, React Router, existing Tailwind/Radix controls, FastAPI, SQLAlchemy async, Alembic, hosted MySQL; pytest and Vitest/Testing Library. Use Python zoneinfo plus tzdata, no scheduling/model service.

**Spec:** `docs/superpowers/specs/2026-10-05-connected-study-design.md`

**Execution:** all twelve tasks implemented locally. The retained progress ledger
records per-task verification, final review findings, fixes and rulings. Final
checks: 94 frontend tests and lint pass; 135 backend tests pass, with three guarded
MySQL race tests skipped. No builds, app startup, live migrations or deployments.

## Global Constraints

- Work in the existing local project on main; no worktrees.
- Do not build, start the app, deploy, change live payments, or call paid inference.
- No model runs on the server. Scheduling is deterministic application logic.
- Keep younger students eligible; the unresolved Companion provider arrangement is outside this work.
- Ordinary app use must not require subjects, Circle membership or sharing.
- Push notifications, upload processing, live payments, rich mathematical editing, shared class/exam template import, and real-time synchronized timers remain later work.
- Use additive migrations; do not seed students or change prices/help allowances.
- Stage only task files at each verified checkpoint; leave commits/pushes to the user unless separately requested.

## Review Focus

- Switching a notebook while saves are pending must not lose title/content edits or apply a response to the new notebook (Task 2).
- Retrying a recorded session with the same request ID but different lesson/duration must return a conflict rather than silently accept a different recording (Task 1).
- DST gaps/folds must be handled explicitly, not create shifted or doubled study suggestions (Task 6).
- A Circle member removed while an event is being accepted cannot remain scheduled or retain private event access (Task 10).
- Canceling an event after studying must not delete the participant's saved personal focus history (Task 11).

## File ownership and shared interfaces

Backend services own transactional study writes and scheduling calculations; routes own authentication and schemas. UI components own selection/completion forms; pages compose them. Keep the existing public payload fields and routes compatible.

- `services/study.py`: `record_session(session, user, body) -> StudySession`; `schedule_review(session, user, lesson_id, next_review_at) -> Review`.
- `services/scheduling.py`: `user_timezone(user) -> tzinfo`, `busy_intervals(session, user, start, end) -> list[tuple[datetime, datetime]]`, `build_agenda(session, user, start, end) -> list[dict]`, `lock_schedule_users(session, user_ids) -> None`.
- `services/circle_scheduling.py`: membership-authorized suggestions and event state transitions, consuming the scheduling service.
- `hooks/useResourceAutosave.js`: `useResourceAutosave({ resourceKey, initialValue, save }) -> { draft, update, saveState, error, retry, flush }`; updates merge patches rather than canceling unrelated fields.
- `components/AcademicSelector.jsx`: `{ value: { subject_id, unit_id, lesson_id }, onChange, disabled }`; optional selection and owned academic queries only.
- `components/ReviewScheduler.jsx`: `{ lessonId, onSaved, onSkip }`; presets/custom time call one owned review API.
- Agenda item fields: `{ id, source, kind, title, starts_at, ends_at, lesson_id, subject_id, href }`; point items have `ends_at=null`, private personal payloads never become Circle payloads.

## Delivery 1 — Personal study

### Task 1: Idempotent session writes and explicit review scheduling

**Files:** modify `backend/app/models/academics.py`, `backend/app/schemas/academics.py`, `backend/app/api/routes/sessions.py`, `backend/app/api/routes/academics.py`; create `backend/app/services/study.py`, `backend/alembic/versions/20261005_0007_connected_study.py`, `backend/tests/test_connected_study.py`; extend `backend/tests/test_migrations.py`.

**Interfaces:** extend `StudySessionCreate` with optional UUID `request_id`; unique `(user_id, request_id)` nullable for old clients. Add `PATCH /sessions/{id}` for an owned bounded private note, and `PUT /lessons/{id}/review` with timezone-aware future `next_review_at`. Responses retain existing fields plus `request_id`.

- [ ] Write failing `test_session_retry_records_time_once`, `test_session_retry_changed_payload_conflicts`, `test_review_upsert_is_owned_and_unique`, `test_session_note_does_not_change_lesson_notes`. Assertions: repeated request returns identical session ID; progress minutes increment once; changed duration returns 409; foreign lesson/session returns 404; review replacement leaves one row.
- [ ] Run `.venv\Scripts\python.exe -m pytest -o addopts= backend/tests/test_connected_study.py -q`; verify failures are missing behavior.
- [ ] Implement the interfaces in `services/study.py`. Lock the owning user before replay lookup, lesson/streak updates and review upsert; centralize lesson-completion review creation to use that same lock order. Replay lookup precedes generating timestamps. Preserve first next-day review default, and never overwrite an existing review unless explicitly scheduled.
- [ ] Run focused tests plus `backend/tests/test_migrations.py`; upgrade/check/downgrade/reupgrade only temporary SQLite fixtures. Test old rows with null request IDs and unchanged legacy POST bodies.
- [ ] Inspect diff and stage exactly this task's files after tests pass.

### Task 2: Resource-safe autosave

**Files:** create `frontend/src/hooks/useResourceAutosave.js`, `frontend/src/hooks/useResourceAutosave.test.jsx`; modify `frontend/src/pages/Notebooks.jsx`, `frontend/src/pages/SubjectDetail.jsx`.

**Interfaces:** use the shared hook above. `save(patch)` resolves the updated resource; callers capture the resource ID and ignore results for inactive resources. Pending patches merge field-by-field, and writes serialize per resource.

- [ ] Write failing `keeps_title_and_content_in_one_pending_draft`, `does_not_apply_old_resource_response`, `retains_failed_draft_for_retry`, `navigation_cancels_queued_writes_without_discarding_draft`. Assert returned draft text and real save payloads using controlled promises/fake timers; no assertions on private implementation.
- [ ] Run `.\node_modules\.bin\vitest.cmd run src/hooks/useResourceAutosave.test.jsx` from frontend; expect those behavior assertions to fail.
- [ ] Implement the hook and integrate both editors; retain per-resource failed/queued drafts in sessionStorage with guarded access. Show explicit saving/saved/failed text and Retry; flush when safe on navigation and do not update an unrelated active editor. Clear a stored draft only after confirmed save.
- [ ] Run hook tests and existing frontend suite; verify storage-unavailable behavior with a stubbed throwing Storage implementation.
- [ ] Inspect diff and stage task files.

### Task 3: Academic selection and dedicated lesson workspace

**Files:** create `frontend/src/components/AcademicSelector.jsx`, `frontend/src/components/AcademicSelector.test.jsx`, `frontend/src/pages/LessonWorkspace.jsx`, `frontend/src/pages/LessonWorkspace.test.jsx`; modify `frontend/src/App.js`, `frontend/src/pages/SubjectDetail.jsx`, `frontend/src/pages/Tasks.jsx`, `frontend/src/pages/Notebooks.jsx`.

**Interfaces:** `/lessons/:id` consumes existing GET/PATCH lesson APIs plus owned subjects/units, task/notebook/review lists. `AcademicSelector` returns nullable IDs; subject changes reset unit/lesson. `Tasks` accepts `?lesson=<id>` prefill; Notebooks accepts `?notebook=<id>` selection. Focus destination is `/timer?lesson=<id>`.

- [ ] Write failing `opens_lesson_with_private_notes_and_related_work`, `creates_lesson_linked_task`, `changing_subject_clears_incompatible_links`, `unlinks_notebook_without_erasing_content`. Assert navigation destinations, POST/PATCH payloads and preserved text.
- [ ] Run the new Vitest files; confirm missing route/link functionality fails.
- [ ] Implement reusable selector and workspace using Task 2 autosave. Use lesson notes as the sole primary text; show attached independent notebooks separately. Add editable optional task/notebook lesson links, safe prefill validation, status/time/review details and links from curriculum. Do not auto-copy content.
- [ ] Run new tests and existing academic backend CRUD tests to verify server link validation remains consistent.
- [ ] Stage verified task files.

### Task 4: Focus selection and completion workflow

**Files:** modify `frontend/src/pages/FocusTimer.jsx`, `frontend/src/pages/FocusTimer.test.jsx`; create `frontend/src/components/SessionComplete.jsx`, `frontend/src/components/ReviewScheduler.jsx`, `frontend/src/components/ReviewScheduler.test.jsx`; modify `frontend/src/pages/Reviews.jsx`, `frontend/src/pages/LessonWorkspace.jsx`.

**Interfaces:** selector uses Task 3 contract; completion uses Task 1 session/note/review APIs. Timer persistence includes lesson/unit, optional event ID for Task 12, and request UUID stable across retries. Review presets are 30 minutes, tomorrow, 3 days, 1 week, custom; resolve local date/time to an explicit instant.

- [ ] Write failing `starts_focus_from_owned_lesson`, `failed_save_retains_recording_request_id`, `completion_only_after_success`, `schedules_review_from_completion`, `skip_keeps_existing_review`, `review_opens_lesson`. Assert 45 focused minutes sends 2700 seconds and lesson ID; retry uses the same UUID; no completion on rejected POST.
- [ ] Run FocusTimer and ReviewScheduler tests; verify expected new behavior fails without weakening existing timer tests.
- [ ] Implement selector/prefill and locked selection, completion summary/note edit/review controls. Normalize existing short timer mode to backend-supported pomodoro; preserve stopwatch/custom behavior. Reset only after a confirmed save, keeping completion state distinct from a running timer.
- [ ] Run frontend suite and Task 1 backend tests. Test no-curriculum focus and unknown/deleted lesson prefill with an actionable fallback.
- [ ] Stage verified files; run Delivery 1 full verification below and record evidence before starting Delivery 2.

## Delivery 2 — Dated planning and Today

### Task 5: Timezone and one-off scheduling persistence

**Files:** modify `backend/app/models/identity.py`, `backend/app/models/academics.py`, `backend/app/schemas/auth.py`, `backend/app/schemas/academics.py`, `backend/app/api/routes/auth.py`, `backend/app/api/routes/planner.py`, `backend/requirements.txt`; create `backend/app/services/scheduling.py`, `backend/alembic/versions/20261005_0008_dated_planning.py`, `backend/tests/test_scheduling.py`.

**Interfaces:** nullable validated `User.timezone` IANA name; retain offset fallback. Nullable `TimetableEntry.date`, `starts_at`, `ends_at` for one-off blocks; persist dated instants in UTC after resolving date/time/timezone. Optional request `utc_offset_minutes` disambiguates a DST fold; reject nonmatching offsets. New/converted `recurrence=none` requires date; old undated rows return `needs_date=true`. Introduce `user_timezone(user) -> tzinfo` and `resolve_local_time(user, date, time, utc_offset_minutes=None) -> datetime` here for Task 6 reuse.

- [ ] Write failing `one_off_requires_real_date`, `legacy_undated_not_repeated`, `rejects_invalid_time_and_duration`, `timezone_patch_validates_iana`. Assert 25:90/zero duration/unknown zone reject with 422; existing weekly blocks remain readable.
- [ ] Run `backend/tests/test_scheduling.py` and migration tests to watch missing validation fail.
- [ ] Implement schemas/migration/profile exposure; include tzdata for zoneinfo on Windows/minimal images. Require separate blocks for overnight schedules. Do not guess dates or change existing timezone offsets.
- [ ] Run migrations and backend auth/planner regressions; validate date/weekday consistency and explicit-null timezone fallback.
- [ ] Stage verified files.

### Task 6: Shared agenda and busy interval service

**Files:** create `backend/app/api/routes/agenda.py`; modify `backend/app/services/scheduling.py`, `backend/app/api/router.py`, `backend/app/api/routes/sessions.py`, `backend/app/api/routes/planner.py`; extend `backend/tests/test_scheduling.py`, `backend/tests/test_today_search_reviews.py`.

**Interfaces:** shared signatures above. `GET /agenda?start=<UTC>&end=<UTC>` returns `{items, warnings}` with chronological agenda items, maximum 31 days. `/today` preserves legacy fields and adds `agenda`, `schedule_warnings` and upcoming deadlines; use the same timezone/day boundaries. Half-open busy intervals `[start,end)` permit adjacent sessions.

- [ ] Write failing `agenda_and_today_agree`, `dated_exam_not_repeated`, `adjacent_blocks_do_not_conflict`, `dst_gap_does_not_create_shifted_slot`, `dst_fold_requires_disambiguation`. Hand-check America/New_York March 8/November 1 2026 and Asia/Colombo UTC conversion.
- [ ] Run scheduling/Today tests for expected missing service/agenda failures.
- [ ] Implement batch-owned queries and weekly expansion. Skip nonexistent recurring local times with a visible scheduling warning; use the first occurrence of an ambiguous weekly time once. Reject ambiguous one-off local times unless an explicit offset selects the occurrence. Exclude unresolved legacy blocks with a warning, not invented calendar events. Tasks/reviews remain point obligations, not busy intervals.
- [ ] Run focused tests; derive streak local dates with `user_timezone` while preserving offset-only accounts. Introduce `lock_schedule_users` locking users in sorted ID order; use it for timetable writes so Circle acceptance can share the protocol later.
- [ ] Stage verified files.

### Task 7: Planner agenda, dated forms and timezone settings

**Files:** create `frontend/src/pages/Planner.jsx`, `frontend/src/pages/Planner.test.jsx`, `frontend/src/components/AgendaList.jsx`; modify `frontend/src/pages/Timetable.jsx`, `frontend/src/pages/Settings.jsx`, `frontend/src/App.js`, `frontend/src/components/AppShell.jsx`, `frontend/src/lib/auth.jsx`.

**Interfaces:** `/planner` day/week view consumes Task 6 agenda; `/timetable` stays available for weekly management. Settings PATCH `/auth/me` carries a validated timezone. Initial inference happens only when absent, with a visible change option and no overwrite of a chosen timezone.

- [ ] Write failing `shows_one_off_exam_on_actual_date`, `edits_legacy_block_date`, `opens_point_item_content`, `timezone_selection_persists`. Assert form payloads include date and recurring forms do not require it.
- [ ] Run Planner tests expecting missing route/forms to fail.
- [ ] Implement dated creation/edit/rescheduling and day/week agenda, retain timetable weekly control, explicit validation/error states and responsive rows. Display all instants in selected user timezone; update sidebar destination to Planner without breaking `/timetable` links.
- [ ] Run frontend suite and profile backend tests.
- [ ] Stage verified files.

### Task 8: Action-first Today and optional onboarding

**Files:** modify `frontend/src/pages/Today.jsx`, `frontend/src/pages/Onboarding.jsx`, `frontend/src/pages/Analytics.jsx`, `frontend/src/App.js`; create `frontend/src/lib/nextStudyAction.js`, `frontend/src/lib/nextStudyAction.test.js`, `frontend/src/pages/Today.test.jsx`; extend `frontend/src/App.test.jsx`.

**Interfaces:** `nextStudyAction({ now, agenda, reviews, tasks }) -> { label, href, kind }` uses explicit ordering: current scheduled activity, upcoming activity, due review/overdue task, choose focus. No model calls. Skip onboarding sets `onboarded=true` without subjects.

- [ ] Write failing `current_activity_first`, `due_work_when_no_schedule`, `empty_day_focus_fallback`, `first_user_can_skip_setup`, `today_primary_actions_precede_statistics`. Assert visible action destinations, skip PATCH and absence of forced subject creation.
- [ ] Run new tests; confirm failures are the existing dashboard/mandatory onboarding behavior.
- [ ] Replace Today hierarchy with date/action/chronological schedule/due work/deadlines; retain calm claims/reflection access without dominating the page. Move heatmap/large metrics to existing Analytics, with a small optional daily summary. Preserve task completion and invitation banner behavior.
- [ ] Run all frontend/backend tests; cover busy, empty, overdue, loading and retry states and no-timetable setup prompts.
- [ ] Stage verified files and record Delivery 2 verification.

## Delivery 3 — Circle coordination

### Task 9: Availability settings and event persistence

**Files:** create `backend/app/models/scheduling.py`, `backend/app/schemas/scheduling.py`, `backend/app/api/routes/availability.py`, `backend/alembic/versions/20261005_0009_circle_scheduling.py`; modify `backend/app/models/circles.py`, `backend/app/models/academics.py`, `backend/app/models/__init__.py`, `backend/app/api/router.py`; create `backend/tests/test_circle_scheduling.py`.

**Interfaces:** availability windows `{day_of_week,start_time,end_time}` in user timezone and UTC exclusions `{start,end}`. `GET/PUT /availability` replace owned settings atomically (max 28 windows/100 exclusions). `CircleMember.share_availability=false` separate from weekly sharing. Models `CircleStudyEvent` (organizer, circle, topic, start/end UTC, revision, canceled) and `CircleParticipation` (event/user PK, status, accepted_revision); nullable `StudySession.circle_event_id` SET NULL on deletion. Optional goal lesson/task IDs are owner-only response fields.

- [ ] Write failing `availability_default_private`, `window_settings_are_owned`, `goal_private_ids_only_for_author`, `migration_preserves_focus_history`. Assert no inherited weekly-sharing permission; other members cannot read windows or goal links.
- [ ] Run Circle scheduling and migration tests expecting missing storage/API behavior to fail.
- [ ] Implement additive models/schema/routes with bounded ranges and task/lesson ownership checks. Enforce at most 30 event participants, duration 15–240 minutes and future proposals within 90 days. Date exclusion validation rejects reversed ranges.
- [ ] Run migrations and existing Circle/referral regressions; model exports must register all new tables.
- [ ] Stage verified files.

### Task 10: Safe common-time suggestions

**Files:** create `backend/app/services/circle_scheduling.py`, `backend/app/api/routes/circle_scheduling.py`; modify `backend/app/api/router.py`, `backend/app/api/routes/circles.py`; extend `backend/tests/test_circle_scheduling.py`.

**Interfaces:** `suggest_slots(session, user, circle_id, participants, start, end, duration_minutes) -> dict`; `POST /circles/{id}/availability` returns `{available, slots:[{start,end}], reason}` only. Require requester among 1–30 distinct current participants, duration 15–240, horizon <=14 days; <=5 suggestions, 15-minute increments anchored to UTC.

- [ ] Write failing `nonmember_cannot_query_slots`, `opt_out_yields_no_slots`, `no_windows_not_assumed_free`, `private_calendar_titles_never_returned`, `suggestions_subtract_classes_and_exclusions`. Assert hand-derived overlapping slots and adjacent interval behavior.
- [ ] Run focused tests to verify missing privacy/algorithm failures.
- [ ] Implement local availability expansion into UTC, subtract Task 6 busy intervals and exclusions, intersect participant sets, then take at most five future slots. Re-read membership/permissions on every call and batch queries. Membership removal follows sorted user → Circle → membership lock order shared with event mutation tasks.
- [ ] Run timezone/DST and Circle permission tests; explicitly characterize SQLite locks as nonconcurrent, not MySQL race proof.
- [ ] Stage verified files.

### Task 11: Explicit session participation and rescheduling

**Files:** extend `backend/app/services/circle_scheduling.py`, `backend/app/api/routes/circle_scheduling.py`, `backend/app/api/routes/circles.py`, `backend/app/services/scheduling.py`, `backend/app/api/routes/sessions.py`, `backend/app/schemas/academics.py`; extend `backend/tests/test_circle_scheduling.py` and `backend/tests/test_connected_study.py`.

**Interfaces:** `GET/POST /circles/{id}/sessions`, `POST /circles/{id}/sessions/{event}/respond` with `{status:accepted|declined,revision}`, `PATCH .../{event}` organizer-only reschedule, `DELETE .../{event}` logical cancellation. State changes return current event revision; stale revision/conflict returns 409, foreign/inaccessible event 404. `StudySessionCreate.circle_event_id` validates accepted current participation; no automatic minutes.

- [ ] Write failing `proposal_requires_other_members_acceptance`, `acceptance_conflict_does_not_reveal_details`, `reschedule_requires_reconfirmation`, `removal_revokes_access_and_future_participation`, `cancel_preserves_recorded_minutes`, `event_join_never_awards_helps`. Assert invited items not busy; accepted items busy; cancel removes only agenda items.
- [ ] Run focused tests to confirm missing transitions fail.
- [ ] Implement transactions using sorted user locks before Circle/event/membership locks; revalidate current participants/event revision after locks. Reject timetable changes that overlap accepted future Circle sessions with actionable cancel/reschedule guidance. Reschedule atomically resets other participants and revalidates organizer; accepted agendas project from participation instead of copied rows.
- [ ] Run all Circle/academic/referral tests and add gated disposable-MySQL concurrency tests for two accepts, accept versus removal, and accept versus timetable write. Do not use hosted production DB; report unrun concurrency checks explicitly if no test MySQL is supplied.
- [ ] Stage verified files.

### Task 12: Circle availability and session UI

**Files:** create `frontend/src/components/CircleSchedule.jsx`, `frontend/src/components/CircleSchedule.test.jsx`, `frontend/src/components/AvailabilitySettings.jsx`; modify `frontend/src/pages/Circles.jsx`, `frontend/src/pages/Settings.jsx`, `frontend/src/pages/Today.jsx`, `frontend/src/pages/FocusTimer.jsx`, `frontend/src/pages/LessonWorkspace.jsx`; extend `frontend/src/pages/StudentLaunch.test.jsx`, `frontend/src/pages/FocusTimer.test.jsx`.

**Interfaces:** consume Tasks 9–11. Today exposes invited Circle items separately from agenda; accepted session links `/timer?event=<id>` with personal AcademicSelector. Circles goals expose owner-only task/lesson links, not other members' IDs. Event UI has accept/decline/reschedule/cancel with current revision.

- [ ] Write failing `sharing_requires_explicit_switch`, `unavailable_suggestions_allow_manual_proposal`, `invited_session_not_marked_confirmed`, `accepted_event_starts_private_lesson_focus`, `rescheduled_event_requires_new_confirmation`. Assert concrete API payloads and personal session actual duration rather than whole event duration.
- [ ] Run CircleSchedule/Today/Focus tests to verify missing actions fail.
- [ ] Implement responsive settings windows/exclusions, opt-in Circle controls, participant chooser, bounded suggestions, manual proposal and explicit responses. Refresh on navigation and mutations, not continuous polling. Show stale/conflict/error states with retry; no calendar details or realtime presence/chat promises.
- [ ] Run complete frontend/backend suites, lint and migration roundtrip. Verify date formatting consistency and preservation of invitation/referral flows.
- [ ] Stage verified task files; update `docs/STUDENT_LAUNCH_NEXT_STEPS.md` and stale `docs/circles-referral-integration.md` with implemented versus deferred scope and evidence.

## Verification at each delivery checkpoint

Backend from repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest -o addopts= backend/tests -q
```

Frontend from `frontend`, with the test API base cleared only for that process:

```powershell
$env:VITE_API_BASE_URL=''
try {
  .\node_modules\.bin\vitest.cmd run
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  .\node_modules\.bin\eslint.cmd .
} finally { Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue }
```

- [ ] Check `git diff --check` and review only in-scope changes before staging.
- [ ] Document actual test counts, failures and environment limitations. Do not claim build, live deployment or MySQL concurrency verification from SQLite evidence.
- [ ] No production database migrations, builds, application servers, live payments or paid inference during this implementation.

## Plan self-review

Personal loop requirements map to Tasks 1–4; dated planning/Today to Tasks 5–8;
Circle privacy/scheduling/lifecycle to Tasks 9–12. Existing text sources remain
unchanged, projections avoid calendar duplication, and retry semantics prevent
double-counting. Five review-focus cases are assigned to their owning tasks.
This plan deliberately does not broaden scope to upload/payment/provider work.
