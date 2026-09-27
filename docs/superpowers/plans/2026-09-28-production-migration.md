# Syllo Production Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Syllo's Emergent and MongoDB runtime dependencies with an application-owned MySQL, Google OAuth, Stripe, Vite, and Coolify-ready production stack without losing the existing academic product behavior.

**Architecture:** A modular FastAPI application uses SQLAlchemy 2 async sessions, Alembic migrations, and hosted MySQL. The Vite-built React SPA is served by Nginx at the public origin and proxies `/api` to a private FastAPI container; the Expo app stays in the repository but outside all deployment build contexts. Google OAuth and Stripe are server-owned integrations whose secrets exist only in runtime environment variables.

**Tech Stack:** Python 3.12, FastAPI, Pydantic Settings, SQLAlchemy 2, asyncmy, Alembic, Google Auth OAuthlib, Stripe Python SDK, React 19, Vite, Vitest, TanStack Query, Nginx, Docker Compose, Coolify.

**Spec:** `docs/superpowers/specs/2026-09-27-coolify-mysql-migration-design.md`

## Global Constraints

- Production uses the single public origin `https://syllo.kavinhq.com`; browser API calls use relative `/api` URLs.
- Hosted MySQL is external to Compose and is addressed by `DATABASE_URL=mysql+asyncmy://...` with TLS enabled when the provider supports it.
- Production startup creates no demo students or sample academic content; admin bootstrap is create-only and environment-controlled.
- Google client secrets, Stripe keys, database credentials, JWT secrets, and admin passwords never enter browser bundles, API responses, logs, or tracked files.
- Google OAuth uses an authorization-code flow with exact redirect URI matching and CSRF state validation; mobile receives only a short-lived, single-use code in its deep link.
- Stripe access changes only from verified Stripe state; redirects never grant a plan, client input never controls price or amount, and webhook processing is idempotent.
- Existing API response identifiers and user-facing flows remain compatible unless this plan explicitly replaces the contract.
- All timestamps are stored in UTC and emitted as ISO-8601 values.
- `mobile/` remains tracked for development but is not copied into production images and is not a Compose service.
- Production defaults to one Uvicorn worker and a SQLAlchemy pool of 5 plus 5 overflow connections.
- New behavior follows strict RED-GREEN-REFACTOR; configuration artifacts are verified by executable validation commands.

## Review Focus

- A forged, expired, replayed, or cross-client OAuth state/code must fail without creating a user or issuing Syllo tokens; covered in Task 6.
- A duplicate, out-of-order, wrong-user, or bad-signature Stripe event must not grant or duplicate plan access; covered in Task 7.
- Every read and mutation must include user ownership, including nested subject/unit/lesson relationships; covered in Tasks 3 and 4.
- Production startup with missing secrets, unavailable MySQL, or a failed migration must fail closed and never create demo data; covered in Tasks 1, 2, and 9.
- SPA fallback, API proxying, health checks, and Docker contexts must work without copying `mobile/` or local `.env` files; covered in Task 9.

---

### Task 1: Backend configuration, application factory, and test harness

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/main.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/router.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_config.py`
- Create: `backend/tests/test_health.py`
- Move: `backend/tests/test_syllo_backend.py` to `backend/tests/live/test_syllo_backend.py`
- Move: `backend/tests/test_syllo_iter2.py` to `backend/tests/live/test_syllo_iter2.py`
- Modify: `backend/requirements.txt`
- Modify: `backend/pytest.ini`

**Interfaces:**
- Consumes: existing FastAPI route contracts and environment names as compatibility inputs.
- Produces: `Settings`, cached `get_settings()`, and `create_app(settings: Settings, session_factory=None, google_service=None, stripe_service=None) -> FastAPI`.
- Produces: `GET /api/health/live` returning `{"status":"ok"}` without a database query.
- Preserves: the legacy `backend.server:app` entry point while the replacement application is assembled and tested in parallel; deployment switches only after route parity.

- [ ] **Step 1: Separate the existing preview-host acceptance tests**

  Mark the moved suites `live` and configure the default pytest run to deselect `live`. They remain available through `python -m pytest backend/tests/live -m live` until Task 10 converts their behavior into in-process regression tests.

- [ ] **Step 2: Write failing settings and liveness tests**

  Add `test_production_settings_reject_missing_required_values`, `test_client_secrets_are_not_serialized`, and `test_live_health_does_not_require_database`. The production test passes only names and safe placeholders, and asserts the missing-variable names rather than secret values.

- [ ] **Step 3: Run the focused tests and verify RED**

  Run: `python -m pytest backend/tests/test_config.py backend/tests/test_health.py -q`

  Expected: FAIL because `backend.app.config` and `create_app` do not exist.

- [ ] **Step 4: Add minimal modular application configuration**

  Implement `Settings` with environment, app URL, database pool, JWT/cookie, Google, Stripe, admin bootstrap, Gemini, and logging fields. Production validation requires `APP_URL`, `DATABASE_URL`, `JWT_SECRET`, `OAUTH_STATE_SECRET`, Google credentials/redirect URI, Stripe key/webhook/price IDs, and admin variables only when bootstrap is enabled.

- [ ] **Step 5: Add dependencies and keep the replacement app isolated**

  Add `sqlalchemy`, `asyncmy`, `alembic`, `pydantic-settings`, `httpx`, `google-auth`, `google-auth-oauthlib`, `stripe`, `pytest-asyncio`, and `aiosqlite`. Retain Motor and Emergent temporarily because the legacy module still imports them. Tests target `create_app`; the existing `server.py` remains untouched until Task 10, after every route has moved.

- [ ] **Step 6: Run the focused tests and full backend suite**

  Run: `python -m pytest backend/tests/test_config.py backend/tests/test_health.py -q`

  Expected: PASS.

  Run: `python -m pytest backend/tests -q`

  Expected: all in-process tests pass and the explicitly marked legacy live-server tests are deselected by default.

- [ ] **Step 7: Commit**

  Commit: `refactor(backend): establish production application foundation`

### Task 2: SQLAlchemy models, async database lifecycle, and Alembic

**Files:**
- Create: `backend/app/database.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/base.py`
- Create: `backend/app/models/identity.py`
- Create: `backend/app/models/academics.py`
- Create: `backend/app/models/billing.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/20260928_0001_initial_schema.py`
- Create: `backend/tests/test_database.py`
- Create: `backend/tests/test_migrations.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: Task 1 `Settings` and `create_app` lifespan/dependency overrides.
- Produces: declarative `Base`, `create_async_engine_from_settings(settings)`, `create_session_factory(engine)`, and FastAPI dependency `get_session()`.
- Produces: ORM models for users, subjects, units, lessons, notebooks, tasks, study sessions, streaks, timetable entries, reviews, app settings, plans, payment transactions, Stripe events, referrals, AI usage logs, and OAuth login codes.
- Produces: initial migration that upgrades an empty database to all required tables and downgrades cleanly.

- [ ] **Step 1: Write failing model, ownership, and migration tests**

  Tests assert unique normalized email and Stripe event IDs, required ownership foreign keys, nullable historical content links, cascading curriculum descendants, UTC timestamp defaults, and successful empty-database upgrade/downgrade/upgrade using temporary SQLite.

- [ ] **Step 2: Run tests and verify RED**

  Run: `python -m pytest backend/tests/test_database.py backend/tests/test_migrations.py -q`

  Expected: FAIL because models and Alembic configuration do not exist.

- [ ] **Step 3: Implement models and async database wiring**

  Use UUID strings, indexed owner/date columns, string status fields, JSON only for genuinely variable metadata, and explicit relationships. Configure `pool_pre_ping=True`, `pool_size=DB_POOL_SIZE`, `max_overflow=DB_MAX_OVERFLOW`, and `pool_recycle=DB_POOL_RECYCLE` for MySQL; omit incompatible pool arguments for SQLite tests.

- [ ] **Step 4: Create and exercise the initial Alembic migration**

  The migration creates schema and non-user plan configuration only. It does not create users, demo subjects, or academic records.

- [ ] **Step 5: Add readiness and lifespan behavior**

  `GET /api/health/ready` executes `SELECT 1`; application lifespan owns engine disposal and invokes no schema creation.

- [ ] **Step 6: Run focused and full backend tests**

  Run: `python -m pytest backend/tests/test_database.py backend/tests/test_migrations.py backend/tests/test_health.py -q`

  Expected: PASS, including readiness failure when the database dependency fails.

  Run: `python -m pytest backend/tests -q`

  Expected: all in-process tests pass.

- [ ] **Step 7: Commit**

  Commit: `feat(database): migrate persistence foundation to SQLAlchemy`

### Task 3: Email authentication, cookies, and admin-only bootstrap

**Files:**
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/security.py`
- Create: `backend/app/api/dependencies.py`
- Create: `backend/app/api/routes/auth.py`
- Create: `backend/app/services/admin_bootstrap.py`
- Create: `backend/tests/test_auth.py`
- Create: `backend/tests/test_admin_bootstrap.py`
- Modify: `backend/app/api/router.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: Task 1 `Settings` and Task 2 `User`, session factory, and `get_session()`.
- Produces: `TokenService.issue_pair(user_id)`, `TokenService.decode(token, expected_kind)`, password hash/verify helpers, `get_current_user`, and `require_admin`.
- Produces: `/api/auth/register`, `/login`, `/logout`, `/me`, and profile patch with existing response shape; web uses HttpOnly cookies and mobile may consume JSON tokens.
- Produces: `ensure_admin(session, settings) -> BootstrapResult` with create-only semantics.

- [ ] **Step 1: Write failing auth and bootstrap tests**

  Cover normalized duplicate email, bad password, access/refresh kind separation, Secure/SameSite cookie settings, Bearer auth for mobile, ownership-free unauthenticated rejection, disabled bootstrap, missing bootstrap variables, first creation, idempotent existing admin, and refusal to promote/reset an existing non-admin.

- [ ] **Step 2: Run tests and verify RED**

  Run: `python -m pytest backend/tests/test_auth.py backend/tests/test_admin_bootstrap.py -q`

  Expected: FAIL because the auth router and bootstrap service do not exist.

- [ ] **Step 3: Implement authentication and bootstrap**

  Keep bcrypt-compatible password hashes. Web cookies use `Secure=true`, `HttpOnly=true`, `SameSite=Lax` in production. Bootstrap runs after successful migrations/database readiness only when explicitly enabled and never seeds academic data.

- [ ] **Step 4: Run focused and full backend tests**

  Run: `python -m pytest backend/tests/test_auth.py backend/tests/test_admin_bootstrap.py -q`

  Expected: PASS.

  Run: `python -m pytest backend/tests -q`

  Expected: PASS for all migrated tests.

- [ ] **Step 5: Commit**

  Commit: `feat(auth): add SQL-backed auth and safe admin bootstrap`

### Task 4: Academic CRUD, Today, search, reviews, and analytics

**Files:**
- Create: `backend/app/schemas/academics.py`
- Create: `backend/app/api/routes/academics.py`
- Create: `backend/app/api/routes/notebooks.py`
- Create: `backend/app/api/routes/tasks.py`
- Create: `backend/app/api/routes/sessions.py`
- Create: `backend/app/api/routes/planner.py`
- Create: `backend/app/api/routes/search.py`
- Create: `backend/app/services/progress.py`
- Create: `backend/tests/test_academic_crud.py`
- Create: `backend/tests/test_today_search_reviews.py`
- Create: `backend/tests/test_progress.py`
- Modify: `backend/app/api/router.py`

**Interfaces:**
- Consumes: Task 2 academic ORM models/session dependency and Task 3 `get_current_user`.
- Produces: SQL-backed equivalents for every current endpoint from `/subjects` through `/search`, including notebooks, tasks, sessions, timetable, reviews, Today, and analytics.
- Produces: `record_study_session(session, user, payload)` which updates lesson totals/streak and creates the appropriate review record atomically.
- Preserves: existing JSON field names (`subject_id`, `unit_id`, `lesson_id`, and other public IDs) consumed by current web/mobile clients.

- [ ] **Step 1: Write failing ownership and CRUD tests**

  Exercise subjects/units/lessons/notebooks/tasks/timetable lifecycle, nested-parent validation, cross-user reads and mutations, cascade behavior, and stable response shapes.

- [ ] **Step 2: Run CRUD tests and verify RED**

  Run: `python -m pytest backend/tests/test_academic_crud.py -q`

  Expected: FAIL because SQL-backed academic routers do not exist.

- [ ] **Step 3: Implement academic CRUD routers**

  Every nested lookup joins or filters through `user_id`; a caller cannot attach a task, lesson, or timetable item to another user's hierarchy.

- [ ] **Step 4: Write failing aggregate behavior tests**

  Cover session recording, streak changes, Today ordering, due/missed review states, search scoping, weekly/monthly study totals, subject totals, lesson counts, and empty-history results.

- [ ] **Step 5: Run aggregate tests and verify RED**

  Run: `python -m pytest backend/tests/test_today_search_reviews.py backend/tests/test_progress.py -q`

  Expected: FAIL because aggregates and review behavior are missing.

- [ ] **Step 6: Implement SQL aggregates and transactional session behavior**

  Use database grouping and indexed date predicates rather than loading full session history into Python. Complete each session/streak/review update in one transaction.

- [ ] **Step 7: Run focused and full backend tests**

  Run: `python -m pytest backend/tests/test_academic_crud.py backend/tests/test_today_search_reviews.py backend/tests/test_progress.py -q`

  Expected: PASS.

  Run: `python -m pytest backend/tests -q`

  Expected: PASS.

- [ ] **Step 8: Commit**

  Commit: `feat(academics): port study workflows to MySQL`

### Task 5: Preserve AI usage, referrals, settings, and admin operations

**Files:**
- Create: `backend/app/api/routes/ai.py`
- Create: `backend/app/api/routes/admin.py`
- Create: `backend/app/api/routes/referrals.py`
- Create: `backend/app/services/credits.py`
- Create: `backend/app/services/gemini.py`
- Create: `backend/tests/test_admin_and_credits.py`
- Create: `backend/tests/test_ai.py`
- Modify: `backend/app/api/router.py`

**Interfaces:**
- Consumes: Task 2 billing/usage/admin ORM models, Task 3 `require_admin`, and Task 4 study aggregates.
- Produces: existing `/ai/*`, `/bonuses/*`, `/admin/*`, and `/me/referrals` behavior backed by SQL.
- Produces: `CreditService.consume/refund/refill` with row locking or an equivalent atomic update.
- Changes: admin settings may manage non-secret presentation/configuration only; Stripe, Google, Gemini, JWT, database, and bootstrap secrets remain environment-owned.

- [ ] **Step 1: Write failing credit/admin tests**

  Cover concurrent credit consumption, monthly refill idempotency, failed AI call refund, referral award idempotency, admin authorization, and absence of secret values from admin responses.

- [ ] **Step 2: Run tests and verify RED**

  Run: `python -m pytest backend/tests/test_admin_and_credits.py backend/tests/test_ai.py -q`

  Expected: FAIL because SQL-backed services do not exist.

- [ ] **Step 3: Implement minimal SQL-backed services and routes**

  Gemini is optional: when `GEMINI_API_KEY` is absent, AI endpoints return a controlled unavailable response while core study routes remain healthy.

- [ ] **Step 4: Run focused and full tests**

  Run: `python -m pytest backend/tests/test_admin_and_credits.py backend/tests/test_ai.py -q`

  Expected: PASS.

  Run: `python -m pytest backend/tests -q`

  Expected: PASS.

- [ ] **Step 5: Commit**

  Commit: `feat(backend): preserve admin credits and optional study companion`

### Task 6: Application-owned Google sign-in for web and mobile

**Files:**
- Create: `backend/app/services/google_oauth.py`
- Create: `backend/app/api/routes/google_auth.py`
- Create: `backend/tests/test_google_oauth.py`
- Modify: `backend/app/api/router.py`
- Modify: `frontend/src/pages/Login.jsx`
- Modify: `frontend/src/pages/Register.jsx`
- Delete: `frontend/src/pages/AuthCallback.jsx`
- Modify: `frontend/src/lib/auth.jsx`
- Create: `frontend/vite.config.js`
- Create: `frontend/src/test/setup.js`
- Create: `frontend/src/pages/GoogleAuth.test.jsx`
- Modify: `frontend/package.json`
- Modify: `frontend/yarn.lock`
- Modify: `mobile/lib/auth.ts`
- Modify: `mobile/app/(auth)/login.tsx`
- Modify: `mobile/app/(auth)/google-callback.tsx`
- Modify: `mobile/.env.example`
- Create: `mobile/jest.config.js`
- Create: `mobile/tests/google-auth.test.ts`
- Modify: `mobile/package.json`
- Modify: `mobile/package-lock.json`

**Interfaces:**
- Consumes: Task 1 Google settings, Task 2 `User`/`OAuthLoginCode`, and Task 3 token/cookie services.
- Produces: `GET /api/auth/google/start?client=web|mobile&return_to=/path`, `GET /api/auth/google/callback`, and `POST /api/auth/google/mobile/exchange`.
- Produces: `GoogleOAuthService.authorization_url`, `exchange_code`, and `verify_identity` behind an injectable interface for tests.
- Produces: hashed, expiring, atomically consumed `oauth_login_codes` for mobile; no Syllo token appears in a redirect URL.

- [ ] **Step 1: Write failing OAuth security tests**

  Test exact Google parameters (`response_type=code`, `openid email profile`, configured redirect URI), state cookie binding, safe relative return paths, callback denial, forged/expired/mismatched state, identity audience/email verification, account linking rules, mobile code hashing, one-time consumption, expiry, replay, and client-kind isolation.

- [ ] **Step 2: Run tests and verify RED**

  Run: `python -m pytest backend/tests/test_google_oauth.py -q`

  Expected: FAIL because application-owned OAuth routes do not exist.

- [ ] **Step 3: Implement backend-owned Google OAuth**

  Use the official Google OAuth/Auth libraries; keep client secret server-side. Web callback sets Syllo cookies then redirects without OAuth query data. Mobile callback redirects only with the one-time code to the configured `syllo://google-callback` URI.

- [ ] **Step 4: Run backend OAuth tests**

  Run: `python -m pytest backend/tests/test_google_oauth.py -q`

  Expected: PASS.

- [ ] **Step 5: Establish client test runners and add failing interaction tests**

  Add Vitest/jsdom/Testing Library alongside the existing CRA build without changing production bundling yet. Add the minimal Expo-compatible Jest setup. Web tests assert buttons navigate to the relative backend start endpoint. Mobile tests assert the auth browser opens that endpoint and posts the returned one-time code to `/auth/google/mobile/exchange`.

  Run: `yarn --cwd frontend test:run`

  Expected: FAIL because the web buttons still use Emergent.

  Run: `npm --prefix mobile test -- --runInBand`

  Expected: FAIL because mobile still exchanges an Emergent session ID.

- [ ] **Step 6: Replace Emergent client flows and run client tests**

  Run: `yarn --cwd frontend test:run`

  Expected: PASS for Google button behavior.

  Run: `npm --prefix mobile test -- --runInBand`

  Expected: PASS after adding a minimal Expo-compatible Jest configuration if mobile has none.

- [ ] **Step 7: Run full backend suite and commit**

  Run: `python -m pytest backend/tests -q`

  Expected: PASS.

  Commit: `feat(auth): replace Emergent with Google OAuth`

### Task 7: Official Stripe Checkout, webhooks, subscription state, and portal

**Files:**
- Create: `backend/app/services/stripe_billing.py`
- Create: `backend/app/api/routes/billing.py`
- Create: `backend/app/api/routes/stripe_webhooks.py`
- Create: `backend/tests/test_billing.py`
- Create: `backend/tests/test_stripe_webhooks.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/router.py`
- Modify: `frontend/src/pages/Upgrade.jsx`
- Modify: `frontend/src/pages/Settings.jsx`
- Modify: `frontend/src/pages/Payment.jsx`
- Modify: `frontend/src/pages/Admin.jsx`

**Interfaces:**
- Consumes: Task 1 Stripe settings, Task 2 billing ORM models, and Task 3 authenticated user dependency.
- Produces: authenticated `/api/billing/plans`, `/usage`, `/checkout`, `/status/{session_id}`, `/portal`, and public signature-verified `/api/webhook/stripe`.
- Produces: `StripeBillingService.create_checkout(user, plan_id)`, `create_portal(user)`, `construct_event(raw_body, signature)`, and `apply_event(session, event)`.
- Changes: checkout accepts only `plan_id`; success/cancel/portal URLs come from `APP_URL`; price IDs come from server configuration/plan rows.

- [ ] **Step 1: Write failing checkout and portal tests**

  Cover internal plan-to-price mapping, unknown/free plan rejection, subscription mode, quantity one, stable user metadata, existing customer reuse, configured URLs, ownership-protected status, missing customer portal rejection, and rejection of client-controlled amount/origin/price fields.

- [ ] **Step 2: Run tests and verify RED**

  Run: `python -m pytest backend/tests/test_billing.py -q`

  Expected: FAIL because the official Stripe service does not exist.

- [ ] **Step 3: Implement Checkout and portal through the official Stripe SDK**

  Invoke blocking SDK operations in `asyncio.to_thread`. Never accept arbitrary redirect origins or write API keys into `app_settings`.

- [ ] **Step 4: Write failing webhook tests**

  Cover invalid/missing signatures, unique event IDs, duplicate success, checkout completion, subscription update/cancellation, invoice payment failure, wrong-user metadata, out-of-order events, and atomic transaction/plan updates.

- [ ] **Step 5: Run webhook tests and verify RED**

  Run: `python -m pytest backend/tests/test_stripe_webhooks.py -q`

  Expected: FAIL because webhook application logic is missing.

- [ ] **Step 6: Implement verified idempotent webhook handling**

  Store event processing state before acknowledging success. Grant access only for verified active/trialing/paid states, and preserve a recoverable failed state when processing raises.

- [ ] **Step 7: Update web billing calls and tests**

  Remove `origin_url` from Checkout/portal requests and secret-key controls from Admin. Payment success may display status but never performs the grant itself.

- [ ] **Step 8: Run focused and full suites**

  Run: `python -m pytest backend/tests/test_billing.py backend/tests/test_stripe_webhooks.py -q`

  Expected: PASS.

  Run: `python -m pytest backend/tests -q`

  Expected: PASS.

  Run: `yarn --cwd frontend test:run`

  Expected: PASS.

- [ ] **Step 9: Commit**

  Commit: `feat(billing): replace Emergent checkout with Stripe`

### Task 8: Vite migration, route splitting, and unified server-state caching

**Files:**
- Create: `frontend/index.html`
- Modify: `frontend/vite.config.js`
- Create: `frontend/eslint.config.js`
- Modify: `frontend/src/test/setup.js`
- Create: `frontend/src/lib/queryClient.js`
- Create: `frontend/src/lib/queryKeys.js`
- Create: `frontend/src/hooks/useAcademicQueries.js`
- Modify: `frontend/package.json`
- Modify: `frontend/yarn.lock`
- Modify: `frontend/src/index.js`
- Modify: `frontend/src/App.js`
- Modify: `frontend/src/lib/api.js`
- Modify: `frontend/src/lib/auth.jsx`
- Modify: `frontend/src/lib/usage.jsx`
- Modify: `frontend/src/pages/*.jsx`
- Delete: `frontend/craco.config.js`
- Delete: `frontend/public/index.html`
- Delete: `frontend/plugins/health-check/health-endpoints.js`
- Delete: `frontend/plugins/health-check/webpack-health-plugin.js`
- Create: `frontend/src/App.test.jsx`
- Create: `frontend/src/lib/api.test.js`
- Create: `frontend/src/lib/queryClient.test.js`

**Interfaces:**
- Consumes: Tasks 3-7 HTTP contracts, including relative Google start, server-owned Checkout, and cookie authentication.
- Produces: Vite scripts `dev`, `build`, `preview`, `test`, `test:run`, and `lint`.
- Produces: `http` with `baseURL = import.meta.env.VITE_API_BASE_URL || "/api"` and credentials enabled.
- Produces: stable query keys and route modules loaded through `React.lazy`; Today/auth shell remains the smallest practical initial graph.

- [ ] **Step 1: Add failing API, route, and query behavior tests**

  Assert relative API default, explicit local override, protected routing, lazy fallback, shared subject/profile/usage cache keys, mutation invalidation, and auth cache updates.

- [ ] **Step 2: Run tests and verify RED**

  Run: `yarn --cwd frontend test:run`

  Expected: FAIL because the Vite/Vitest setup and new modules do not exist.

- [ ] **Step 3: Replace CRA/CRACO/Emergent tooling with Vite**

  Remove `react-scripts`, CRACO, Emergent packages, SWR, and unused date/component dependencies confirmed by an import audit. Add Vite React, Vitest, jsdom, Testing Library, and ESLint dependencies. The new HTML contains Syllo metadata only and no Emergent or embedded analytics scripts.

- [ ] **Step 4: Add route-level lazy loading**

  Lazy-load admin, analytics/charting, billing, settings, notebooks, Study Companion, planner, and secondary academic routes with one accessible loading boundary.

- [ ] **Step 5: Move server state to TanStack Query**

  Replace page-local duplicate fetch effects with shared queries/mutations; keep form/editor/timer state local. Set conservative stale times and invalidate only changed domains.

- [ ] **Step 6: Run tests, lint, and build**

  Run: `yarn --cwd frontend test:run`

  Expected: PASS.

  Run: `yarn --cwd frontend lint`

  Expected: PASS without errors.

  Run: `yarn --cwd frontend build`

  Expected: Vite production build succeeds and emits route chunks under `frontend/dist`.

- [ ] **Step 7: Commit**

  Commit: `build(web): migrate to Vite and reduce initial work`

### Task 9: Environment contract, Docker images, Nginx, and Coolify Compose

**Files:**
- Create: `.env.example`
- Create: `.dockerignore`
- Create: `compose.yaml`
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`
- Create: `backend/docker-entrypoint.sh`
- Modify: `backend/.env.example`
- Create: `frontend/Dockerfile`
- Create: `frontend/.dockerignore`
- Create: `frontend/nginx.conf`
- Modify: `frontend/.env.example`
- Create: `docs/deployment/coolify.md`
- Create: `scripts/verify_docker_context.ps1`
- Create: `backend/tests/test_production_startup.py`

**Interfaces:**
- Consumes: Task 1 settings contract, Task 2 Alembic migration, Tasks 3-7 routes, and Task 8 Vite build output.
- Produces: Compose services `web` and `api`; only `web:80` is public and `api:8000` stays private.
- Produces: backend startup `alembic upgrade head` followed by one Uvicorn worker.
- Produces: Nginx `/api/` proxy, SPA fallback, immutable asset caching, non-cached HTML, gzip, and `/health`.
- Produces: Coolify environment variables marked required with `${VARIABLE:?}` and safe defaults only for non-secret settings.

- [ ] **Step 1: Write failing production startup tests**

  Assert production fails on missing mandatory values, migration failure prevents app startup, disabled bootstrap creates no user, enabled bootstrap creates only the configured admin, and no `/api/seed` route exists in production.

- [ ] **Step 2: Run tests and verify RED**

  Run: `python -m pytest backend/tests/test_production_startup.py -q`

  Expected: FAIL until final startup wiring is present.

- [ ] **Step 3: Create production images and environment examples**

  Use a Python slim backend image and Node build/Nginx runtime frontend image. Run as non-root where the base image permits it, copy lockfiles before source for cache reuse, and include health-check tools in final stages.

- [ ] **Step 4: Create Compose and Nginx configuration**

  The API has no host port. `web` depends on API health. Hosted MySQL is not declared. Compose has no bind mounts or production source volumes.

- [ ] **Step 5: Verify configuration before building**

  Run: `docker compose --env-file .env.example config`

  Expected: renders exactly `web` and `api` with all required variable references resolved from a safe temporary validation environment.

  Run: `powershell -ExecutionPolicy Bypass -File scripts/verify_docker_context.ps1`

  Expected: PASS and prove `mobile/`, `.env`, `.git`, `.local-backups`, tests, caches, and development metadata are absent from both image contexts.

- [ ] **Step 6: Build and inspect containers**

  Run: `docker compose build`

  Expected: both images build with cached dependency layers.

  Run: `docker compose up -d`

  Expected: API becomes healthy after migration, then web becomes healthy; no MySQL container is created.

  Run: `docker compose ps`

  Expected: `web` and `api` are healthy.

- [ ] **Step 7: Verify runtime proxy behavior**

  Confirm `/health`, SPA fallback, `/api/health/live`, `/api/health/ready`, compression, cache headers, and absence of mobile files in both images.

- [ ] **Step 8: Run startup tests and commit**

  Run: `python -m pytest backend/tests/test_production_startup.py -q`

  Expected: PASS.

  Commit: `build(deploy): add Coolify production stack`

### Task 10: Remove legacy runtime, run regression/security checks, and document operations

**Files:**
- Replace: `backend/server.py` with a compatibility import from `backend.app.main` after updating all deployment and development entry points.
- Replace: `backend/tests/test_syllo_backend.py`
- Replace: `backend/tests/test_syllo_iter2.py`
- Modify: `README.md`
- Modify: `docs/deployment/coolify.md`
- Modify: `docs/superpowers/specs/2026-09-27-coolify-mysql-migration-design.md` only if implementation rulings changed the contract.

**Interfaces:**
- Consumes: every preceding task and the legacy acceptance behaviors being preserved.
- Produces: one documented local workflow, one production workflow, a Coolify variable checklist, Google Console redirect instructions, Stripe webhook event list, migration/rollback commands, and secret-rotation guidance.
- Produces: no imports or runtime references to Motor, PyMongo, Emergent auth/payment packages, CRA, CRACO, Emergent frontend scripts, or preview hosts.

- [ ] **Step 1: Convert legacy tests into in-process regression tests**

  Preserve meaningful API behavior from both existing suites while removing external preview URL, sample-user, and `/seed` assumptions.

- [ ] **Step 2: Run full backend and frontend suites**

  Run: `python -m pytest backend/tests -q`

  Expected: PASS with no live preview dependency.

  Run: `yarn --cwd frontend test:run && yarn --cwd frontend lint && yarn --cwd frontend build`

  Expected: PASS.

- [ ] **Step 3: Run dependency and source audits**

  Run filename/import scans for `emergent`, `motor`, `pymongo`, `MONGO_URL`, `react-scripts`, `craco`, `auth.emergentagent.com`, and `preview.emergentagent.com`.

  Expected: no runtime/package/config matches; historical documentation may mention the migration only.

  Run: `python -m pip check`

  Expected: no incompatible backend packages.

  Run: `yarn --cwd frontend audit --groups dependencies`

  Expected: no unresolved high/critical production vulnerability; any registry advisory that cannot be fixed without a breaking upgrade is documented with package path and mitigation.

- [ ] **Step 4: Run complete container verification**

  Run: `docker compose --env-file .env.example config`, `docker compose build`, `docker compose up -d`, health/proxy checks, and `docker compose down`.

  Expected: clean startup from an empty test database with only the configured admin, healthy services, working SPA/API routing, and no mobile content in images.

- [ ] **Step 5: Review runtime resource posture**

  Record image sizes, idle container memory, API pool settings, worker count, frontend bundle/chunk sizes, and the initial recommendation of 2 vCPU/2 GB when Coolify is external or 2 vCPU/4 GB when Coolify and builds share the server.

- [ ] **Step 6: Commit**

  Commit: `chore: finalize production migration`

## Completion Gate

- MySQL is the only application database dependency and a blank database migrates cleanly.
- Production startup creates only the configured admin and configuration rows; it never creates student/demo content.
- Google web and mobile login operate without Emergent and pass state/replay tests.
- Stripe Checkout, verified webhooks, plan state, and Customer Portal operate through the official SDK.
- The web client builds with Vite, loads secondary routes lazily, and uses TanStack Query as its server-state cache.
- Coolify can deploy `compose.yaml` with only `web` public, using environment variables and an external MySQL database.
- `mobile/` remains in Git but is absent from every Docker build context and image.
- All backend/frontend tests, lint, builds, container health checks, and secret/dependency scans pass.
