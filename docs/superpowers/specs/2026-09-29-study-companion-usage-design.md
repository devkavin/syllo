# Study Companion Usage Experience — Design

## Intent and approved choices

Make Syllo's study companion economical and predictable without making students feel pressured. Preserve existing plan allowances and monthly refill behavior, but explain usage with a calm weekly pace view. Do not convert plans to weekly grants.

The user explicitly rejected urgency, referral pressure, pyramid-scheme-like language, and misleading weekly reset claims. Low-balance messaging must be neutral, optional, and informational.

## Current behavior

- Chat accepts up to 12 history messages, each up to 2,000 characters; the client sends up to 12, and the API joins them into up to 10,000 characters on every turn. The new message is separately capped at 3,000 characters.
- Feature outputs are already bounded (chat 600, summarize 500, explain 450, reflection 350 tokens). Freshman uses the economical configured model; successful requests record token usage and cost.
- Per-user rate limiting exists. The backend budget guard is shared, but there is no separate configurable application-wide requests-per-minute ceiling aligned to the Gemini project quota.
- Credits refill by UTC calendar month. The Freshman balance, including any claimed one-time bonus credits, is currently reset to the base plan amount during refill. Usage reporting exposes remaining credits and the period string but no daily/weekly activity or next-refill date.
- Coolify passes Gemini configuration through Compose and has a deployment guide.

## Design

### Chat context and cost controls

Keep the full transcript in the interface, but send only the latest six completed, non-empty prior messages, in chronological order, with a 4,000-character aggregate history ceiling. Omit the canned welcome greeting and pending assistant placeholder. Always send the current question intact (within its existing 3,000-character validation limit); older history must be discarded before the current question is considered. Enforce the same limits on the server so non-web clients cannot bypass them.

Keep existing per-feature output ceilings, Freshman model selection, token/cost logging, successful-request help charging, and failure refunds. Add a configurable application-wide requests-per-minute guard backed by the shared MySQL usage log so all API replicas share the same limit. Default conservatively to 10 requests/minute; permit deployment to tune it to the currently assigned Gemini project quota. Rate-limit and budget rejections must not consume student helps.

### Usage summary and low-balance communication

Extend the existing usage response with current-cycle help usage, successful requests today, successful requests this week, a non-enforced weekly pacing reference derived from the current recurring plan allowance, and the exact next refill instant. The weekly reference is explanatory only; it never blocks usage or changes allowance. Use the student's saved offset for local day/week boundaries where available; retain UTC as a safe fallback.

Reuse the existing plan affordance and companion surface rather than adding a dashboard or interrupting modal. Show a small accessible balance meter with a text label (not color alone), helps remaining, today's usage, weekly pace, and “refreshes [date]”. The companion header should surface the same remaining count. Display persistent, quiet inline notices when the balance is low (at 25% and 10% of the user's available cycle allotment) and a clear reached-limit state at zero. Do not use streaks, urgency, scarcity, guilt, celebratory “unlock” language, or friend-invite/referral prompts in these notices.

At zero, explain the actual refill date and that non-companion Syllo tools remain available. Provide a plan-details/upgrade action only if billing is enabled. Keep eligible Freshman milestone/referral information in its existing dedicated place, optional and factual; it must not be the prominent low-balance CTA.

### Freshman bonus balance

Keep the existing configured Freshman limits and rewards; do not change plan prices, included help counts, bonus amounts, or eligibility. Separate earned one-time bonus credits from the recurring Freshman allowance so the calendar-month refill restores only the recurring allowance and never erases unused earned credits. Keep the configured Freshman maximum as the cap. Preserve an existing user's visible remaining balance during the migration, and do not create bonus credits for previously claimed rewards that cannot be safely reconstructed.

### Deployment

No new required Coolify secret is introduced. Expose the application-wide request limit as an optional environment variable with the default above through Settings, .env.example files, Compose, and the Coolify guide. Keep GEMINI_API_KEY server-side. Database changes must be represented by an Alembic migration and applied through the existing Coolify deployment flow; do not require manually editing production tables.

## Acceptance criteria

1. Chat requests never exceed six prior messages or 4,000 history characters at either client or server; the current question is not truncated by history budgeting.
2. Usage counts are based on successful AI usage-log rows and use local calendar boundaries from the saved offset with UTC fallback.
3. Weekly pacing is descriptive only; allowances still refill on the existing monthly boundary and maintain existing plan values.
4. Low-balance UI is calm, accessible, non-modal, and contains no invitation/referral pressure or urgency/guilt language.
5. Zero balance shows the correct refill date, preserves access to non-AI product areas, and only shows a purchase CTA when billing is available.
6. Freshman earned bonuses survive normal monthly refill; the maximum remains configured and failed requests continue to refund one help.
7. The shared application request limit is atomic across MySQL-backed app replicas, configurable, and does not consume a help when rejected.
8. A fresh Coolify deployment can apply the database migration and start with existing Gemini env variables; the new limit has a safe default when unset.

## Out of scope

- Actual weekly credit grants, changing plan economics, or changing billing cadence.
- Email, push, or browser notifications for balance warnings.
- Changing plan prices/model assignment or adding a help-purchase flow.
- AI prompt/model redesign beyond the already configured routing and response ceilings.

## Review focus

- Oversized or malformed client history: server retains the newest permitted history and full current question.
- Empty, pending, or canned greeting history: excluded from provider context and cost reservation.
- Request racing the shared RPM limit across replicas: only requests within the global window proceed; rejected calls consume no credits.
- Low-credit Freshman account with one-time bonuses at refill: recurring grant refreshes while unspent bonus remains intact and cap is respected.
- User with a non-whole-hour saved offset or no offset: daily/weekly windows are correct for the saved offset or safely fall back to UTC.
- Billing disabled at zero balance: no nonfunctional checkout CTA is shown.
- Migration applied to users who already have a non-default balance: remaining balance is preserved without inventing rewards.
