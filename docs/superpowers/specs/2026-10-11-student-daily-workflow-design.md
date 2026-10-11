# Student daily workflow and compact controls

The user authorized implementing all eight suggestions and compact controls across
the web app. Preserve existing notes, timer authority, account isolation, revision
conflicts, keyboard access and mobile touch targets. No commits, push, deployment,
media uploads, paid services or AI dependence are authorized by this request.

## Product behavior

- Today includes due questions and mistakes with a single Start practice action.
- Notes have Write/Practice modes, preserving the mounted editor and its selection.
  Focus remains accessible; an active server timer follows other workspace pages.
- Revision plans accept different topic durations, optional repeat sessions for
  difficult topics and account-wide capacity checks. Missed work is redistributed
  only after a preview and explicit Apply action, preserving completed work.
- Exams summarize selected syllabus topics, scheduled/completed work and self-rated
  recall. No invented mastery percentage or predicted exam grade.
- Practice supports basic, cloze ({{hidden words}}), reverse and timed exam prompts,
  mixed sessions, optional self-marked earned/max marks. Ratings remain manual.
- Installable web shell and bounded account-scoped recent-note cache support offline
  reading/writing; existing drafts synchronize with revision checks on reconnect.
  Cached data must never replace a successful live response or bypass an HTTP
  ownership/authentication rejection. No offline timer actions or fake study logs.
- Optional reminders use an in-app daily digest and opt-in browser notifications
  while the application is open, with quiet hours and per-account/day deduplication.
  Browser notification permission is requested only by the student's explicit click.
  This release does not promise closed-browser push delivery.
- Search becomes Search and commands: quick note/task/focus/practice actions plus
  existing resource search and searchable questions/mistakes.

## Stable API contract

One additive migration 20261011_0013 follows 0012. Existing clients remain compatible.

Question format additions: format=basic|cloze|reverse|exam (default basic),
time_limit_seconds nullable 30..7200, max_marks nullable 1..1000. Existing kind
question|mistake is unchanged. GET /study/questions supports optional subject_id,
lesson_id, q. PATCH includes expected_revision as before. Attempt additionally
accepts optional elapsed_seconds and earned_marks; validate against max_marks,
keep idempotence/account ownership and existing success totals intact.
GET /study/due-summary => {questions_count,mistakes_count,due_count}.
GET /search adds questions:[{question_id,prompt,kind,notebook_id,lesson_id}].
Reviews supports ?question=<id> for search and ?lesson=<id> for scoped practice.

Plan creation additionally accepts lesson_minutes:{lesson_id:minutes},
repeat_difficult:boolean default false. Plan item responses additionally return
minutes and plan response minutes_per_lesson. Capacity counts owned revision tasks
and planned study occurrences on that date; other plans share the current plan's
declared daily allowance. Existing tasks/screens enforce the same reschedule rule.
POST /study/plans/{id}/reschedule/preview => {fingerprint,moves:[{task_id,title,
from_date,to_date,minutes}]}; preview redistributes only incomplete overdue items,
reserving future/completed work. POST /study/plans/{id}/reschedule accepts
{fingerprint,moves:[{task_id,due_date}]} and atomically validates current state,
study days, capacity and pre-exam dates; stale preview =>409, impossible =>422.
GET /study/exams => array of {plan_id,title,subject_id,exam_date,daily_minutes,
completed_count,total_items,topics:[{lesson_id,title,status,scheduled_count,
completed_count,questions_count,due_count,needs_practice,last_quality}]}.

GET/PATCH /study/reminders => {enabled,quiet_start,quiet_end,digest_time}; time
strings HH:MM, default false/22:00/07:00/17:00. GET /study/reminders/digest =>
{date,timezone,quiet,notification_due,practice_due:{questions,mistakes},tasks:
[{task_id,title,due_date}],sessions:[{title,starts_at,href}],total_count}.
Digest is read-only, owner-scoped, uses user timezone; browser delivery is client
deduplicated. Task priority/reminder fields stay compatible.

## Interface and ownership

One main page action; secondary filters/options in labeled expandable panels.
No nested menu maze. Save errors, offline status, recovery and active timer stay
visible. Mobile bottom navigation: Today, Study (/notebooks), Planner, More.
Secondary menus retain descriptive labels and ~44px touch targets. Settings groups
collapse; essential profile/save remains easy to reach.

Backend owner handles APIs, models, migration and regression tests. Planning UI
owner handles RevisionPlans, Exams, Planner and compact Subjects/Tasks/Timetable.
Practice UI owner handles NotebookPractice/Notebooks/Reviews and compact lessons.
Root handles shell/mobile navigation, persistent timer, Today, commands, reminders,
offline/install, settings, integration/docs. Avoid shared-file edits.

## Verification

Account isolation; offline logout/account switch; no cached 401/403/404 fallback;
conflicting recovered drafts; retry idempotence including gateway failures; cloze
reveal/reverse/timed manual marks; shared capacity and stale preview; unchanged
completed tasks; quiet hours and duplicate notification suppression; accessible
expandable controls. Full frontend/backend suites, lint/build and desktop/mobile
browser review if available. Report unavailable live browser/MySQL checks honestly.
