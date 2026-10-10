# Connected Study Workflow Implementation Plan

> For agentic workers: use executing-plans for each task; independently owned
> files may be implemented in parallel following dispatching-parallel-agents.

**Goal:** Complete the safe notes → focus → practice → revision study cycle.
**Architecture:** Existing UI pages use owned versioned API resources. Existing
tasks carry revision-plan work; the current server timer supplies notebook focus.
**Tech Stack:** React 19, Tailwind 4, BlockNote, FastAPI, SQLAlchemy, Alembic.
**Spec:** docs/superpowers/specs/2026-10-10-study-workflow-design.md

## Global constraints

No commits, no uploads, no new paid service or AI dependency. Preserve legacy
notes and current working changes. Avoid multiple editors owning the same files.

## Review focus

- Reopening drafts based on stale revisions must trigger conflict handling.
- Deleted/foreign links must not leak data or lose literal notes.
- Simultaneous/retried rating requests must not duplicate attempts.
- Date/capacity validation must prevent unrealistic exam schedules.
- Shared timer errors must preserve authoritative running state.

## Tasks

1. Backend study resources and migrations: notebook revisions/history/trash,
   canonical lesson notebook, practice ledger/progress, and task-based revision
   plans. Add regression tests before implementation, then run focused tests.
2. Notebook reliability UI: account-scoped persistent drafts, revision-aware saves,
   conflict recovery, history/trash/export, canonical lesson editor links. Add
   recovery/conflict tests; preserve existing autosave behaviour.
3. Practice UI: notebook Practice panel and Reviews queue; selected-text prompts,
   mistake correction, reveal/rating, editing and retries. Test real interactions.
4. Connected focus: compact notebook controls backed by useSharedFocusTimer;
   reuse timer configuration and maintain correct cross-device context. Test.
5. Planner/progress UI: guided revision plans, existing task integration, capacity
   errors and rescheduling; show self-rated recall metrics distinctly. Test.
6. Integration: inspect all changes, full tests, lint, build, visual verification
   where available, migration documentation and cleanup. Never commit.
