# Student launch design

Approved scope: public homepage, Companion starter and response quality, private
Circles, paid-launch cost controls, and Paddle sandbox preparation. Implementation
is native in the project directory. Keep production checkout disabled until a
separate live release. No builds or production deployment in this task.

## Homepage and Companion

The public `/` explains the student's problem and provides registration, sign-in,
pricing, and legal links. Render the homepage into HTML during the existing Vite
build, while app routes use their own HTML fallback. Add canonical metadata,
robots policy and sitemap. Do not require authentication to read the homepage.

The exact starter is: “I have classes, deadlines, notes and exams everywhere.
What is the most useful thing I can do with the time I have today?” Clicking it
fills the composer. Only the Send action calls Google and consumes a help.
Answers lead with the answer, normally use 40–120 words, preserve necessary
academic steps and uncertainty, and omit greetings, filler, generic encouragement,
and unsolicited follow-up questions. Render simple formatting safely; never HTML.

## Circles

Private student groups, maximum 30 members and five owned groups per student.
Invite links can be rotated. Members share a short study goal and mark their own
goals complete. Study-time sharing is opt-in per membership. Only names, group
goals, and opted-in weekly totals are visible to other members. Private notes,
tasks, email addresses, and Companion questions never become group content.
Owners may remove members and delete their group; members may leave. No public
directory, teacher oversight, chat feed, or competitive leaderboard in this release.

Invites use the existing referral code, ledger, monthly reward limit and cap.
Only first registration can award helps. Joining, leaving, rejoining, and rotating
links cannot award helps. Invitation preview exposes only the name and inviter.
Registration and Google sign-in preserve the invitation for explicit joining later.

## Cost controls

Persist visible output, thinking, cached input, total tokens and finish reason.
Account for all billable output and dated model prices. Preserve conservative
reservations on uncertain provider failures. Reserve under the existing shared
database lock. Estimate text input conservatively from UTF-8 bytes. Report aggregate
feature/model/plan token, latency, failure and cost data without saving prompts.
Document provider project spend-cap setup; credentials here cannot change Google
Cloud billing. Provider cap enforcement can lag, so maintain application reserves.

## Paddle

Adapt the Paddle skills' checkout and webhook contracts to React and FastAPI.
Runtime public client token avoids frontend build secrets. Server creates a
transaction with its own price and an unguessable reference stored locally.
Provision only from raw-body HMAC-verified, timestamp-checked webhooks matched
to that reference/transaction. Ledger events atomically; reject stale state.
Mirror customers, subscriptions and transactions. Preserve access through a
scheduled cancellation; revoke when canceled or paused. Past-due access ends at the
verified paid-period boundary. Recompute remaining calendar-month helps from actual usage on
plan changes, rather than granting repeat allowances. Sandbox checkout is admin-only.

Scholar: $8.99 monthly, $2 off the first three months, 250 helps.
Dean's List: $13.99 monthly, $2 off the first three months, 800 helps.
Intro offer is once per account, not repeated on resubscription. Sandbox catalog
setup validates existing amounts and creates missing entries on explicit execution.
Paid plans remain unavailable to public visitors during sandbox testing.
