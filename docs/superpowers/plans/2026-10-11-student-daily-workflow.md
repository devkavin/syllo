# Student daily workflow implementation

User authorized implementation. Execute in this session with independent file
ownership following dispatching-parallel-agents; no extra approval stages or commits.
Spec: ../specs/2026-10-11-student-daily-workflow-design.md.

1. Backend: additive format/plan-duration/reminder migration; question format and
   marks validation; due/search summaries; capacity-aware plans and atomic preview
   application; exams and timezone-aware reminder digest. Test ownership, migration
   preservation, duplicate requests, stale previews and date/capacity boundaries.
2. Practice UI: richer manual practice with safe retry keys; mixed/scoped review
   queue; Write/Practice notebook workspace preserving editor state; compact lesson
   actions. Tests exercise reveal, timers/marks, deep links and preserved drafts.
3. Planning UI: per-topic duration/repetition, preview/apply rescheduling, exam
   topic overview. Collapse secondary controls in planning/tasks/subjects/timetable.
   Tests exercise capacity rejection, preview confirmation and honest recall labels.
4. Root shell: mobile navigation, active timer outside dedicated timer/notebook,
   Today due practice, command actions/search, quiet opt-in reminder digest and
   compact settings. Tests cover navigation, timer authority and delivery policy.
5. Offline/install: bounded owner-scoped IndexedDB cache; static PWA shell only;
   explicit cached/auth behavior, reconnect autosave and visible sync states.
   Tests cover account switch/logout, exclusions, cache expiry and conflicts.
6. Integration/review: inspect all diffs; focused then complete tests, lint/build;
   visual review if tool available; document migration/browser limitations; remove
   only generated test artifacts. Leave local changes uncommitted/unpushed.

## Verification completed

- Frontend: 54 test files, 325 tests passed; ESLint and production Vite build passed.
- Backend: 212 tests passed, three skipped. Migration preservation/up/down and
  SQLite schema checks passed; MySQL migration SQL compiled without a live database.
- Final draft regressions reproduced the failures before the fix: another tab
  overwriting a draft during notebook loading, and missing focus controls with an
  empty notebook list. All 40 focused notebook/autosave tests passed afterward.
- The generated service worker has 137 existing static assets (6.54 MB), including
  the notebook editor, lazy diagram renderers and math fonts. API requests and
  writes remain outside service-worker caching.
- Review findings addressed cache invalidation, account changes, draft safety,
  bounded plan scheduling, shared capacity and overnight quiet-hour delivery.
- Browser preview could not initialize, so layout/installation behavior needs a
  real browser check. No live MySQL or production deployment was performed.
- Existing large editor/diagram chunk warnings remain. Reminders run while the
  app is open; offline support covers cached notes, with draft conflict recovery.
- Apply migration `20261011_0013` before this frontend. Changes are uncommitted
  and unpushed; only this run's generated backend test scratch directory was removed.
