# Student Launch Implementation Plan

Goal: make Syllo discoverable, improve Companion answers, enable private Circles,
and prepare safely metered paid subscriptions in Paddle sandbox.

Architecture: keep React/Vite, FastAPI/SQLAlchemy/MySQL and static Nginx hosting.
Use existing authentication and referral ledgers. Native implementation in the
provided directory; preserve unrelated work. No build or live deployment.

Spec: `docs/superpowers/specs/2026-10-05-student-launch-design.md`.

- [x] Homepage: pure React content plus Vite HTML prerender, routing, metadata,
  sitemap and protected-route noindex. Test public access and starter behavior.
- [x] Companion: concise prompts and safe structured rendering. Test no automatic
  request, contextual history, HTML escaping and unsafe link rejection.
- [x] Circles: models, migration, access-controlled routes, invitations, shared
  goals, opt-in totals and responsive UI. Test outsider access, membership caps,
  own-goal edits, invite rotation, and no referral awards on join/rejoin.
- [x] Metering: token metadata, dated rates, reservations, aggregate report.
  Test thinking-token costs, cache pricing, future rates, and failed responses.
- [x] Paddle: settings, models, migration, transaction creation, webhook sync,
  checkout page, portal and sandbox setup script. Test signature/replay checks,
  event duplicates/order, ownership, server prices and allowance preservation.
- [x] Handoff: document current versus proposed student flow, launch settings,
  provider cap setup and credential-dependent sandbox acceptance tests.

Review focus: concurrent joins and webhook deliveries, cross-user data access,
untrusted checkout custom data, incomplete responses that still cost money,
and cancellation/refill races. Run relevant tests then one complete suite.
Stage only task files after verification. Do not commit or push implicitly.

Verified: 118 backend tests and 53 frontend tests pass; frontend lint passes.
Migration upgrade/check/downgrade/re-upgrade passes on SQLite. Independent review
found expiry, resume and membership-race defects; fixes were checked and covered
by regression tests. Real MySQL concurrent interleavings were not exercised.

Sandbox catalog products, prices and recurring intro discount were created and
verified through the official SDK using the local sandbox API key. Real checkout,
notification delivery, provider spend-cap configuration and deployment remain
external acceptance steps. No build was run. Younger students remain in scope;
the user confirmed a suitable provider arrangement must be reviewed before public
Companion launch. See the launch handoff documents for limitations and settings.
