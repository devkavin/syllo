# Today Study Desk Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make Today a useful personal study desk, rather than a large generic empty panel.

**Architecture:** Compose a compact next action, persistent recent work and a responsive schedule column using existing authenticated APIs. Read-only work dialogs connect tasks and classes to notes and Focus; editing stays explicit.

**Tech Stack:** React, React Router, Tailwind, Radix dialogs, Vitest/Testing Library.

**Spec:** The user's October 6 screenshot and approved “desk for today” direction in this conversation.

## Global Constraints

- Work in the provided local project; no worktrees, builds, app startup or deployment.
- No backend, environment, pricing, quotas, mobile or payment changes.
- No invented content or extra analytics dashboard widgets.
- Keep Circle invitation responses, task completion, optional setup and starter claims.
- Leave changes uncommitted; no staging/push requested.

## Review Focus

- Busy days still expose real recent notes and lessons.
- Failed optional resource loads are distinguishable from empty content and retryable.
- Task work actions preserve academic context; class actions do not silently open editors.
- Subject Focus links never overwrite a running, paused or pending-recording session.
- Dialog errors retain drafts, keyboard focus returns, long titles wrap on small screens.

### Task 1: Connected Today desk

**Files:** Today.jsx/Today.test.jsx; components/StudyDesk.jsx; components/StudyWorkDialog.jsx; components/NewNoteDialog.jsx; hooks/useStudyDesk.js.

**Interfaces:** Existing /today, /subjects, /notebooks (summaries only), /sessions?limit=10, /timetable and /lessons/:id. StudyDesk consumes resource states, subject lookup and recent lesson; StudyWorkDialog consumes an actual task/agenda item and summary resources. NewNoteDialog posts title/content/subject_id/lesson_id then navigates to the returned notebook_id.

- [x] Add failing Today tests for busy-day recent work, task/class study context, note creation and optional-resource retry.
- [x] Run targeted tests; verify failures on missing behavior.
- [x] Implement compact desktop work/schedule columns and natural mobile stacking, real content, contextual dialogs and note creation.
- [x] Run Today tests; preserve quick-add, completion, review and focus restoration tests.

### Task 2: Subject-linked Focus

**Files:** FocusTimer.jsx/FocusTimer.test.jsx.

**Interface:** /timer?subject=:id prefills an owned subject and its duration, only before a session is started; lesson/event links take precedence.

- [x] Add and run failing tests for subject prefill and saved-session protection.
- [x] Implement guarded subject prefill and retry/error behavior.
- [x] Run Focus tests and full frontend suite, lint and git diff --check.
- [x] Perform independent read-only review and document browser QA still required.

## Execution record

Approved design and native/local execution are carried forward from the conversation. No additional approval gate or commit is introduced.
Pre-flight: Task 1 emits subject Focus URLs consumed by Task 2; both use existing owned subject IDs. No new backend endpoints required.
Task 1: RED observed missing work actions/recent work/note creation/retry; GREEN in full 154-test suite. Schedule intentionally repeats the suggested class to preserve time orientation; assertion now selects its heading rather than an ambiguous text match.
Task 2: RED observed missing subject prefill and loading protection; GREEN in full 154-test suite. Paused-session and lesson-precedence tests remain green. Subject-load failure has retry and an explicit unlinked-focus escape.
Verification: 154 tests/34 files passed, ESLint and git diff --check passed. Final read-only review in progress; browser QA not run.
Final review: two Important findings verified and fixed. Explicit unlinked Focus clears restored academic context and resets duration; deleted subject links do likewise. New note ignores late completion after dismissal/unmount, preserving any newer draft/navigation. Both findings reproduced RED then verified GREEN.
Final verification: 156 tests/34 files passed; ESLint and git diff --check passed. No Critical or deferred Minor review findings. Visual browser/manual accessibility QA remains unverified because app startup was prohibited. All implementation work remains local and uncommitted.
