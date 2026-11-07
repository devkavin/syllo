# Syllo Usability Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement sequentially. The user has approved the design comparisons and explicitly requested execution.

**Goal:** Make starting, writing and first-time studying clearer while preserving existing functionality.

**Architecture:** Recompose existing frontend components, use existing owned notebook/question/profile APIs, and retain notebook/editor persistence unchanged. No database changes or new dependencies.

**Tech Stack:** React 19, Vite, Tailwind, Radix, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-07-usability.md`

## Global constraints

- Preserve the pending NotebookStudyTools dropdown fix and all scientific illustration functionality.
- No real API writes, migrations, seeds, commits, pushes or deployment.
- The approved implementation request authorizes editing and tests; no additional design/plan approval is needed.
- Keep implementation in the user's current checkout so existing work and installed dependencies remain available.

## Review focus

- Loading/failing resources must not suggest that the student has no notes or lose retries.
- Recommended tasks/reviews/notes must open the exact context, with urgent work priority preserved.
- Menu dismissal/focus changes must preserve the editor selection and not remount it.
- Failed first-session note/question/profile saves must retain inputs and avoid duplicating successful earlier steps on retry.
- Dismissed guidance and onboarding drafts must remain account-scoped and tolerate unavailable browser storage.

### Task 1: Today recommendation and compact secondary work

**Files:** `frontend/src/pages/Today.jsx`, `Today.test.jsx`; existing `StudyDesk.jsx`, `nextStudyAction.js` only as necessary.
**Interfaces:** Preserve `nextStudyAction` priority and existing dialogs. Use owned recent notes from `useStudyDesk`; direct notebook and lesson URLs use their IDs.

- [x] Write regression tests for a single primary recommendation, direct recent-note continuation, compact accessible work/schedule, and first-note entry.
- [x] Run focused tests and observe failures.
- [x] Implement the main recommendation card, compact secondary sections, and contextual guidance.
- [x] Pass Today and nextStudyAction tests, preserving existing context/error/retry tests.

### Task 2: Notebook control hierarchy

**Files:** `NotebookStudyTools.jsx` and tests, `NotebookFocus.jsx` and tests, `NotebookEditor.jsx`, `Notebooks.jsx` and tests; a reusable guidance/menu component if needed.
**Interfaces:** Preserve all editor commands and current `NotebookFocus` defaults; add an optional compact rendering mode for the notebook header. Keep the same mounted editor and autosave hook.

- [x] Write failures proving Insert/Format/Outline access, preserved selection and focus restoration, compact focus header, and recovery visibility.
- [x] Implement grouped controls and responsive header while retaining options Sheet and existing drafts/history/illustrations.
- [x] Pass focused toolbar/editor/notebook/focus tests.

### Task 3: First-session onboarding and final verification

**Files:** `Onboarding.jsx` and tests; account-scoped guidance/draft helper and tests if extracted; current `App.js` routing only if necessary.
**Interfaces:** Existing `POST /notebooks`, `POST /study/questions`, and `updateMe({onboarded:true})`. On success navigate to `/notebooks?notebook=<id>`; explore routes to `/today`.

- [x] Write failures for creating an unlinked note/question, skip/explore, per-stage retry, duplicate-submit protection, account isolation, and dismiss/reopen guidance.
- [x] Implement three first-session steps, optional actions, durable account-scoped draft/progress and safe navigation.
- [x] Pass focused tests and review complete changes against the approved spec.
- [x] Run all frontend tests with `VITE_API_BASE_URL=/api`, production build, and appropriate static checks; record actual results.
- [x] Have a fresh reviewer inspect the final working-tree diff and address important findings with regressions.

## Review and verification notes

- A fresh read-only reviewer identified upcoming activities being displaced by notes and narrow-screen toolbar panels extending past the viewport. Upcoming priority was reproduced RED and fixed GREEN; panels now anchor against the full toolbar, use `max-w-full`, and wrap script controls. Mobile anchoring was checked statically; browser layout verification could not complete.
- An additional integration regression reproduced immediate profile updates redirecting onboarding to Today before opening the saved notebook. The active per-account onboarding route now remains mounted until its explicit navigation completes; the regression passes.
- Unavailable browser storage retains the in-memory flow and now displays a warning for unsaved first-note drafts. Confirmed note/question stages persist per account, so later-stage retries do not recreate earlier successful stages.
- Existing create APIs are reused without a new idempotency contract. As elsewhere in the app, a lost response after server-side creation remains ambiguous; this task introduces no backend/database changes.
- Stored notebook IDs remain subject to existing server ownership/deletion validation. A deleted notebook surfaces the existing API/editor error handling; the first-session draft still retains the student's text.
- Existing editor identity and selection protections remain covered by focused regressions. A mock-data-only preview was prepared with no database connection, but computer use stopped because it could not confidently identify the browser URL. No further UI automation was attempted, and the preview server was stopped.
- Final verification on November 7, 2026: all **490 tests in 72 frontend test files passed**, using `VITE_API_BASE_URL=/api` and two workers; **ESLint passed**; **production build passed** in 17.89 seconds with the existing large-chunk warning; **git diff --check passed**. No backend/database operations were executed. Browser verification remains limited as described above.
