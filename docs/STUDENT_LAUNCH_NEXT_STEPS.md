# Student launch and follow-up improvements

## Implemented now

- Public homepage and build-time readable HTML, canonical URL and sitemap.
- Exact planning-question starter, explicitly sent by the student, never autocharged.
- Concise Companion instructions and safe paragraph/list/code rendering.
- Private Circles with shared goals, member controls and opt-in UTC weekly time.
- Existing signup referral ledger reused, including Google signup; no join rewards.
- Visible-output/thinking/cache/total-token and finish-reason metering; no prompts
  or responses stored in usage logs. Per-request plan recorded for later analysis.
- Conservative shared budget reservations and admin-only aggregate usage endpoint:
  `/api/admin/companion-usage?days=30`. Unknown-cost failures retain reservations.
- Paddle sandbox-only admin testing, verified webhook ledger and owned checkout.

## Google spending controls — action required in your account

**Public Companion launch blocker:** [Google's current API terms](https://ai.google.dev/gemini-api/terms)
restrict API clients directed at or likely accessed by under-18s. They also require
paid API services for users in the EEA, Switzerland and UK. Syllo currently allows
younger students, so broad Gemini Companion launch needs a deliberate audience or
provider arrangement decision. A per-user age checkbox alone should not be assumed
to resolve the application-level restriction. No audience/registration restriction
was silently added in this change. Review this before making the app broadly available.

Decision confirmed: keep younger students. Review a provider arrangement suitable
for minors before public Companion launch, including applicable contract, data use,
guardian requirements and regional availability. Keep adult-only development
testing separate; this implementation does not claim Google approval for minors.

When switching to paid Google API, set the actual project cap in AI Studio's
**Spend → Monthly spend cap → Edit** and keep
`GEMINI_MONTHLY_BUDGET_CENTS` at or below that amount ($25 = 2500).
Use a dedicated Syllo API project/key; calls from other apps bypass Syllo's ledger.
Google's cap can lag, so keep a small margin and billing alerts. The app's ledger
does not replace your Google bill or the provider cap. The free tier still has
provider rate limits and different data-use terms; do not promise confidential
school material until your paid-provider/privacy policy review is complete.

[Google billing guidance](https://ai.google.dev/gemini-api/docs/billing) and
[model prices](https://ai.google.dev/gemini-api/docs/pricing).
Thinking is billed as output. Cached input is currently charged conservatively at
the full input rate in Syllo's estimate. Gemini 3.8 Flash's published price increase
on January 1, 2027 is handled by the estimator. Unknown model overrides use a
conservative fallback; update the table before choosing a more expensive model.

Before public paid launch, sample 30–50 representative real questions per plan:
short explanation, worked problem, follow-up, multilingual question and long notes.
Measure full token cost, failure/truncation rate and answer correctness, with student
permission for any question collection. Review median and upper-percentile cost,
not just averages. Provider/model evaluations and image/PDF support remain future work.

## Ten high-impact improvements for later prompts

1. **Today hierarchy:** lead with the next useful action, schedule and due work;
   move large statistics and heatmaps to Progress. Keep calm busy/empty states.
2. **Connected study loop:** link focus to a specific lesson; session completion
   offers review intervals and a short note, updating Today and Planner.
3. **First-use freedom:** make the current onboarding skippable; start with one task
   or timer and progressively offer subjects and timetable setup.
4. **Mobile navigation:** prioritize Today, Subjects, Planner, Focus and Progress;
   keep Circles optional, not a new compulsory destination.
5. **Notebook quality:** autosave status, offline drafts, recoverable conflicts and
   clean equations; never silently overwrite edits from another device.
6. **Reminder delivery:** granular permissions, quiet hours, in-app notices and
   optional push; no guilt wording or constant growth prompts.
7. **Safer uploads:** capped image/document size and pages, malware checks,
   extracted-text preview, per-plan daily limits and retention policy. Do not
   advertise uploads until implemented and measured.
8. **Circle polish:** member report/block tools, invitation moderation, optional
   group focus sessions and deep links into personal study. No teacher monitoring
   or public ranking by default. Measure actual study retention, not invite counts.
9. **Live paid launch:** complete real sandbox checklist, refunds/disputes, localized
   tax-aware price previews, plan-change previews, renewal reconciliation and alerts.
10. **Admin profitability view:** later, combine collected revenue minus Paddle fees,
    refunds, Google billed output including thinking, and hosting ($10.09/month).
    Break down cost per plan and request percentile; never claim guaranteed profit.

## Current versus proposed UX

The homepage describes planning → studying → remembering. Existing Today still has
statistics-first sections; post-focus review linking and first-use onboarding
simplification are proposed follow-ups, not changes made in this release. Circles
is optional and personal content remains private. There is no claim that a starter
prompt can automatically infer someone's timetable without supplied context.

No build, production deployment, live Paddle mutation or paid Google inference was
performed during this implementation. Mobile source remains separate from web
container contexts. Keep secrets runtime-only in Coolify, not frontend build args.
