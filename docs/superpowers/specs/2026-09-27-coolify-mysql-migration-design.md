# Syllo Production Migration Design

Date: 2026-09-27

## Objective

Move Syllo from its Emergent-specific preview runtime to a self-contained, production-oriented deployment on Coolify. Replace MongoDB with an empty hosted MySQL database, preserve the React web application and the locally developed Expo mobile application, and replace Emergent authentication, billing, development, analytics, and deployment integrations with application-owned equivalents.

The first production deployment creates only an administrator account when explicitly enabled through Coolify environment variables. It must never seed demo students, subjects, lessons, tasks, sessions, or other sample content.

## Scope

This migration includes:

- MySQL persistence through SQLAlchemy 2 and Alembic.
- A relational schema covering all currently implemented backend features.
- Direct Google OAuth owned by the Syllo backend.
- Direct Stripe Checkout, webhook verification, subscription status, and Customer Portal integration.
- Removal of Emergent development packages, scripts, preview URLs, analytics injection, and backend integration packages.
- Migration of the web client from Create React App and CRACO to Vite.
- Route-level code splitting and TanStack Query-based server-state caching.
- Production Docker images, Nginx configuration, health checks, and a Coolify-compatible Compose definition.
- Safe environment examples and Git ignore rules.
- Continued local Expo development without copying `mobile/` into deployed images.

This migration does not include:

- Importing existing MongoDB data. MySQL starts empty.
- Completing unfinished product features such as first-class goals, exercises, reminders, or the mobile product.
- Deploying the Expo mobile application through Coolify.
- Changing the product design.

## Target Architecture

Public traffic uses one origin:

```text
https://syllo.kavinhq.com
        |
        v
Nginx web container
  /              -> built React SPA
  /api/*         -> FastAPI container on the private Compose network
  /health        -> lightweight web-container health response
                         |
                         v
                   Hosted MySQL over TLS
```

Only the Nginx service is public. FastAPI is reachable from Nginx on the private Compose network. MySQL is hosted externally and is not part of the Compose deployment.

The web client uses relative `/api` URLs. Mobile uses an explicit public `EXPO_PUBLIC_API_BASE=https://syllo.kavinhq.com/api` value during local development and mobile builds.

## MySQL Persistence

### Technology

- SQLAlchemy 2 async ORM
- `asyncmy` as the MySQL async driver
- Alembic for versioned schema migrations
- MySQL 8-compatible schema and queries

The async engine uses a deliberately small pool appropriate for a hosted database:

- `pool_size=5`
- `max_overflow=5`
- `pool_pre_ping=True`
- configurable `pool_recycle`, defaulting to 1800 seconds

All timestamps are stored in UTC. Application responses continue to use ISO-8601 timestamps.

### Initial Tables

The initial migration creates:

1. `users`
   - Identity, password hash, Google subject ID, profile, role, plan, credit state, appearance, timezone, onboarding state, daily target, referral code, and Stripe customer ID.
   - Unique indexes on normalized email, user ID, Google subject ID when present, and referral code when present.

2. `subjects`
   - Owner, name, description, color, focus preset, sort order, and timestamps.

3. `units`
   - Owner, subject, name, sort order, and timestamps.

4. `lessons`
   - Owner, subject, unit, title, notes, status, sort order, study totals, and last-studied timestamp.

5. `notebooks`
   - Owner, optional subject, title, content, and timestamps.

6. `tasks`
   - Owner, optional subject, optional unit, optional lesson, title, notes, due date/time, priority, completion state, and timestamps.

7. `study_sessions`
   - Owner, optional subject/lesson, mode, duration, start time, note, and timestamp.

8. `streaks`
   - One row per user containing current streak, longest streak, and last qualifying day.

9. `timetable_entries`
   - Owner, optional subject, title, weekday, start/end time, location, kind, recurrence metadata, and timestamps.

10. `reviews`
    - Owner, lesson, interval step, next review, last review, and timestamps.

11. `app_settings`
    - Administrative application settings stored as typed JSON values.

12. `plans`
    - Plan identifier, presentation fields, credit allowance, Stripe price ID, enabled state, and sort order.

13. `payment_transactions`
    - User, Stripe session/customer/subscription identifiers, plan, amount, currency, status, and timestamps.

14. `stripe_events`
    - Unique Stripe event ID, type, processing state, and timestamp for webhook idempotency.

15. `referrals`
    - Referrer, referred user, credit award state, and timestamp.

16. `ai_usage_log`
    - User, feature, success state, and timestamp if Study Companion features remain enabled.

17. `oauth_login_codes`
    - Hashed one-time code, user, expiry, used timestamp, and client kind for secure mobile OAuth handoff.

Foreign keys enforce ownership relationships. Deletes cascade for curriculum descendants where that is safe. Historical study sessions and payment records are retained or null their optional content references rather than being silently deleted.

### Database Users

Production should ideally use two credentials:

- Migration credential: schema modification plus CRUD privileges.
- Runtime credential: `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the Syllo schema.

If the database provider makes separate users inconvenient, one schema-scoped user can be used initially. It must not have global MySQL administration privileges. TLS is required when the provider supports it.

### Migration Execution

The backend image contains Alembic. Container startup runs `alembic upgrade head` before starting FastAPI. Migration failure prevents the backend from becoming healthy.

No application endpoint creates or mutates schema objects.

## Authentication

### Email and Password

Existing email/password authentication remains. Passwords continue to use bcrypt-compatible hashes. JWT access and refresh tokens remain Syllo-issued.

Web authentication uses HTTP-only cookies. Production cookie policy:

- `Secure=true`
- `HttpOnly=true`
- `SameSite=Lax`
- explicit path and expiry

Mobile receives access and refresh tokens in the JSON response and stores them in Expo SecureStore.

### Google Web Flow

The backend owns the authorization-code flow:

1. Browser opens `GET /api/auth/google/start`.
2. Backend creates a signed, expiring OAuth state value and redirects to Google.
3. Google redirects to `GOOGLE_REDIRECT_URI`.
4. Backend validates state, exchanges the code with Google, validates the returned identity, and finds or creates the Syllo user.
5. Backend sets Syllo cookies and redirects to the configured safe frontend path.

Only relative, allow-listed frontend return paths are accepted. Arbitrary external return URLs are rejected.

### Google Mobile Flow

Mobile uses the same hosted backend callback:

1. Mobile opens `/api/auth/google/start?client=mobile` in an authentication browser.
2. Google returns to the HTTPS backend callback.
3. Backend creates a short-lived, single-use login code, stores only its hash, and redirects to `syllo://google-callback?code=...`.
4. Mobile posts the code to `/api/auth/google/mobile/exchange`.
5. Backend atomically consumes the code and returns Syllo access and refresh tokens.

Tokens are never placed in a redirect URL.

### Admin Bootstrap

Production startup never seeds student users or demo content.

Admin creation occurs only when all conditions are true:

- `ADMIN_BOOTSTRAP_ENABLED=true`
- `ADMIN_EMAIL` is present
- `ADMIN_PASSWORD` is present and satisfies the configured minimum
- no user with that normalized email exists

The bootstrap is create-only. It never resets an existing password or silently promotes an existing non-admin account. After the first deployment, the operator disables bootstrap and removes `ADMIN_PASSWORD` from Coolify.

The `/api/seed` endpoint is unavailable in production. Development sample data, if retained, is exposed only as an explicit local CLI command guarded by `ENVIRONMENT=development`.

## Stripe

The official Stripe Python SDK replaces `emergentintegrations`.

Checkout behavior:

- Server maps internal plan IDs to configured Stripe Price IDs.
- The client cannot supply an amount or arbitrary price.
- Checkout uses Stripe subscription mode for paid recurring plans.
- Success and cancel URLs are derived from `APP_URL`, not from an arbitrary client origin.
- Existing Stripe customers are reused when available.

Webhook behavior:

- `/api/webhook/stripe` verifies the raw request using `STRIPE_WEBHOOK_SECRET`.
- Processed event IDs are stored uniquely in `stripe_events`.
- Plan access is granted from verified subscription/payment state, not from an unverified success redirect.
- Subscription updates and cancellations update the local plan state.

Customer Portal behavior:

- Portal sessions are created only for authenticated users with a stored Stripe customer ID.
- Return URLs are derived from `APP_URL`.

## Frontend Modernization

### Vite Migration

The React SPA moves from Create React App and CRACO to Vite. The migration preserves React Router and the existing `@` source alias.

Removed tooling:

- `react-scripts`
- `@craco/craco`
- `@emergentbase/overlay`
- `@emergentbase/visual-edits`
- custom preview health plugins that are unnecessary behind Nginx

The HTML entry is owned by the app, branded for Syllo, and contains no Emergent scripts or embedded third-party analytics initialization.

### Loading and Data Efficiency

- Public/auth shell and Today remain in the initial route graph.
- Major authenticated routes use React Router lazy route modules.
- Admin, analytics/charting, billing, settings, notebooks, and Study Companion load on demand.
- TanStack Query becomes the single server-state cache.
- SWR is removed.
- Shared queries use stable keys and conservative stale times.
- Mutations update or invalidate only affected data.
- Duplicate subject/profile/usage requests across routes are eliminated.
- One date library is retained; the unused alternative is removed.
- Unused Radix/shadcn modules and other unused dependencies are removed only after an import audit.

### Static Delivery

The frontend image uses a Node build stage and an Nginx runtime stage. Nginx:

- serves hashed assets with long immutable cache headers;
- serves `index.html` without long-term caching;
- applies gzip compression;
- falls back to `index.html` for SPA routes;
- proxies `/api/` to the backend service;
- forwards standard proxy headers;
- provides a lightweight `/health` response.

## Backend Structure and Efficiency

The current monolithic backend is split into focused modules:

- configuration and security
- database engine/session
- ORM models
- request/response schemas
- auth
- curriculum
- notebooks
- tasks
- sessions/progress
- timetable/reviews/search
- AI, if retained
- billing
- admin

Analytics use SQL aggregate queries and indexed date ranges rather than loading thousands of sessions into Python. User ownership is included in every read and mutation predicate.

FastAPI exposes:

- `/api/health/live` for process liveness
- `/api/health/ready` for database readiness

The backend initially runs one Uvicorn worker. Additional workers increase database connections and memory, so scaling is based on observed traffic rather than enabled by default.

## Docker and Coolify

Repository-owned deployment files:

- `compose.yaml`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- root and service `.dockerignore` files
- production-safe `.env.example` files

Compose contains only:

- `web`: public Nginx/React service
- `api`: private FastAPI service

The hosted MySQL service is addressed through `DATABASE_URL` and is not declared in Compose.

Both services define health checks. The web service depends on a healthy API. Restart policies are appropriate for production, and containers run without bind mounts.

Coolify should use the repository Docker Compose build pack and attach `https://syllo.kavinhq.com` to the web service's internal port 80.

## Mobile Repository Boundary

`mobile/` remains tracked in the same Git repository for local development.

It is excluded from:

- the root Docker build context through `.dockerignore`;
- backend and frontend service-specific contexts;
- production dependency installation;
- Compose services;
- Coolify runtime volumes.

Coolify still clones the repository, but mobile sources are never copied into an image and create no runtime cost. A separate repository is required only if the mobile source must not exist in the deployment checkout at all.

The mobile application receives updated OAuth endpoints and environment examples but is not otherwise expanded in this migration.

## Environment Contract

Required production variables:

```env
ENVIRONMENT=production
APP_URL=https://syllo.kavinhq.com
DATABASE_URL=mysql+asyncmy://USER:PASSWORD@HOST:3306/DATABASE
JWT_SECRET=
OAUTH_STATE_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://syllo.kavinhq.com/api/auth/google/callback
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_SCHOLAR=
STRIPE_PRICE_DEANS_LIST=
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
ADMIN_BOOTSTRAP_ENABLED=false
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

Optional variables:

```env
GEMINI_API_KEY=
MYSQL_SSL_CA=
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=5
DB_POOL_RECYCLE=1800
LOG_LEVEL=INFO
```

Real `.env` files are ignored everywhere. Examples contain names and safe placeholders only. Existing tracked environment files are removed from the Git index without deleting local developer copies, and any exposed production-capable secrets must be rotated.

## Failure Handling

- Missing mandatory production configuration fails startup with a concise list of missing variable names.
- Database readiness fails until a connection and lightweight query succeed.
- OAuth state, token exchange, identity validation, and one-time mobile code failures return generic user-safe errors and structured server logs.
- Stripe webhook signature failures return HTTP 400 without processing data.
- Duplicate Stripe events return success without reapplying changes.
- Failed schema migrations stop deployment before traffic is accepted.
- Optional Gemini features report unavailable when no Gemini key is configured; core study features remain usable.

## Verification

Verification occurs without production credentials by using local test configuration and mocks where appropriate.

Backend verification includes:

- model and migration integrity;
- empty-database migration to head;
- admin bootstrap enabled, disabled, duplicate, and missing-variable behavior;
- no demo data after startup;
- email/password auth;
- Google start, callback, state rejection, and mobile one-time exchange with mocked Google responses;
- Stripe Checkout parameters, signature verification, idempotency, subscription updates, and portal creation with mocked Stripe responses;
- per-user isolation and relational cascade behavior;
- health endpoints and database failure behavior.

Frontend verification includes:

- Vite production build;
- route loading and protected-route behavior;
- relative API requests;
- Google sign-in navigation;
- lazy route chunks;
- removal of Emergent assets and packages;
- existing core user flows.

Container verification includes:

- Compose configuration validation;
- backend and frontend image builds;
- health-check behavior;
- Nginx SPA fallback and `/api` proxying;
- confirmation that `mobile/` is absent from image build contexts and layers.

## Rollout

1. Provision an empty MySQL database and schema-scoped credentials.
2. Configure Google OAuth with the exact production callback URL.
3. Configure Stripe products/prices and the production webhook endpoint.
4. Enter Coolify environment variables with admin bootstrap temporarily enabled.
5. Deploy Compose; Alembic creates the schema and startup creates the admin only.
6. Confirm admin login, OAuth, Checkout test mode, webhook processing, and core academic CRUD.
7. Disable admin bootstrap and remove `ADMIN_PASSWORD` from Coolify.
8. Rotate any credentials previously committed to repository environment files.

## Capacity

With hosted MySQL, normal Syllo runtime is expected to be modest. Start with 2 vCPU and 2 GB RAM for the application when Coolify runs elsewhere. When the same server also runs Coolify and performs frontend image builds, 2 vCPU and 4 GB RAM is the safer baseline. Build-time memory is expected to exceed steady-state runtime memory.
