# SDD ledger — plan: docs/superpowers/plans/2026-10-05-connected-study.md

Execution: native in main, user-approved. No worktrees, builds, app startup or deployment.
Ledger retained with the deliverable because the user requested staging, not commits.

Pre-flight: Tasks 1→4 share session/review contracts; nullable request UUID preserves old clients.
Pre-flight: Tasks 2→3 share resource autosave; Lesson.notes remains primary text.
Pre-flight: Tasks 5→6→7→8 share dated agenda/timezone handling; one-off instants persist in UTC.
Pre-flight: Tasks 6→10→11 share busy intervals and sorted user locking.
Pre-flight: Tasks 9→12 share event/participation revisions; circles never copy private calendar rows.
Ruling: use a tracked progress ledger rather than Unix-only skill scripts on Windows — preserves resumability without new shell dependencies — cost if wrong: bookkeeping format only.

Task 1: complete — regression RED (duplicate sessions, missing note endpoint) → GREEN; 7 focused backend/migration tests pass.
Ruling: retain record_study_session in its established route module while shared review/locking writes live in services/study.py — avoids needless moving of working session/streak logic — cost if wrong: later service extraction only.
Task 2: in progress.
Task 2: complete — pending title/content RED→GREEN; resource retry/isolation/recovery verified in 4 frontend tests.
Task 3: complete — lesson workspace, linked notebooks and editable task selection implemented; workspace and selector tests pass.
Task 4: complete — lesson focus/retry tests RED→GREEN; 66 frontend tests and 120 backend tests pass. No builds.
Tasks 5–6: complete — one-off/date/timezone/DST/agenda RED→GREEN; 8 backend planning/migration/Today tests pass.
Tasks 7–8: in progress.
Tasks 7–8: dated Planner, editable one-off forms, timezone preferences, action-first Today and skip setup implemented; focused UI tests pass. Full frontend run found the existing local API override test needs the documented cleared process environment.
Tasks 9–11: privacy/availability/event lifecycle RED→GREEN; 10 focused backend/migration tests pass.
Ruling: update the existing timetable CRUD test to move both start and end — its old payload created a zero-length block now explicitly forbidden by the approved spec — cost if wrong: only that test's rescheduling example differs.
Ruling: cancel future sessions organized by a departing member — otherwise nobody remaining could manage them — cost if wrong: members must propose a replacement session.
Task 12: in progress.
Tasks 7–8: complete — Planner/Today/optional setup/timezone and local-date tests pass; full frontend run 80 passed, lint passed, backend 129 passed/3 gated MySQL checks skipped.
Tasks 9–12: implemented — bounded settings/suggestions, explicit session participation, conflict/revision handling, accepted agendas, personal focus linking and private goal links. New UI and lifecycle tests pass; final full-suite verification follows.
Ruling: normalize breaks by excluding them from study recording rather than counting them as pomodoro — breaks are not focused study — cost if wrong: breaks are not present in study history.
Ruling: add a conditional timezone-inference endpoint — its locked write cannot overwrite a student's chosen timezone — cost if wrong: one additional profile request on first use only.
Ruling: combine related acceptance assertions in lifecycle tests rather than one fixture per named plan case — covers the same contracts with less duplicate setup — cost if wrong: failure isolation is coarser.
Tasks 9–12: complete pending final review — 83 frontend tests pass across 30 files; eslint passes; 129 backend tests pass, 3 disposable-MySQL race checks skipped without an explicitly configured test database. One existing Google SDK deprecation warning. Migration roundtrip and metadata checks pass. No builds, servers, live migrations, inference or deployments run.
Final review: requested against uncommitted changes on main, base 1ce95f431f44656bc1c38aa36fd0af9884efdbd3; staging follows any required fixes.
Final review: one fresh gpt-6-astra reviewer; no Critical findings, six Important findings plus original autosave recovery defect. All accepted for one TDD fix pass; no minors reported.
Final: fixed in-flight recovery loss, newer draft erasure and inactive queued replay — four autosave regressions RED→GREEN; writes serialize across remounts without letting inactive editors overwrite newer drafts.
Final: fixed timezone double booking — test_timezone_change_cannot_shift_classes_into_accepted_sessions RED→GREEN; profile edits and conditional inference share locked validation.
Final: fixed MySQL second-precision retries — test_session_retry_survives_mysql_second_precision RED→GREEN using disposable SQLite precision simulation, not live MySQL.
Ruling: normalize recorded start times to whole seconds before storage and retry comparison — matches the existing MySQL DATETIME(0) column without a precision-changing migration — cost if wrong: subsecond start distinctions are ignored; recorded durations are unchanged.
Final: fixed stale Circle focus context — fresh-personal and post-success timer tests RED→GREEN; active/pending Circle recordings are preserved.
Final: fixed one-off edits shifting UTC instants or losing fold choices — two metadata-edit regressions RED→GREEN, plus local-midnight UI and legacy-Today consistency regressions; only explicit schedule changes re-resolve instants.
Final: fixed DST suggestion selection — fold suggestions and exact selected-instant UI regressions RED→GREEN; slot labels include UTC offsets.
Ruling: suggest only first-occurrence starts in repeated local hours — follows recurring windows' first-occurrence policy and avoids doubled clock labels — cost if wrong: second-occurrence starts are not automatically suggested; explicit UTC proposals remain possible through the API.
Final: fixed review-to-lesson completion — Good/Again lesson tests RED→GREEN; Reviews now opens the lesson rather than offering completion without practice.
Final: Ruling: hosted MySQL locking/migration behavior was not judged by the reviewer — do not claim production concurrency until the guarded disposable-MySQL tests run — cost if wrong: production verification is still required before release.
Final: Ruling: runtime responsive layout was not judged by the reviewer — honor the user's no-app-start restriction and report component tests only, leaving visual smoke testing for the authorized local run — cost if wrong: visual regressions can remain undetected by automated tests.
Final verification: after the single fix pass, frontend `VITE_API_BASE_URL='' node node_modules/vitest/vitest.mjs run` → 94/94 tests across 30 files, then `node node_modules/eslint/bin/eslint.js src` → exit 0. Backend `.venv/Scripts/python.exe -m pytest -o addopts= backend/tests -q` → 135 passed, 3 gated MySQL checks skipped, 1 existing Google SDK deprecation warning. `git diff --check` → exit 0. No production code changed after those runs.
Final: all seven reviewed issues addressed; no deferred minor findings. Migrations checked through disposable SQLite upgrade/schema/downgrade/re-upgrade tests, not live MySQL. Production release checks remain explicit.
Handoff: stage task source/tests/migrations/docs on local main only; no commit/push or workspace deletion. The tracked ledger remains the resumable record until the user commits.
