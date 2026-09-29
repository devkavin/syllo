# Deploying Syllo on Coolify

Syllo ships as two containers: `web` (Vite assets served by Nginx) and `api`
(FastAPI). MySQL is a separate Coolify database resource, not created by this Compose file. Only the
web service should receive a public Coolify domain; the API is reachable privately
as `api:8000` and Nginx proxies `/api/` to it.

## 1. Prepare MySQL

Create an empty UTF-8 database and a least-privilege application user. The user
needs normal schema migration and application CRUD privileges on that database,
not global server privileges.

For a MySQL resource on the same Coolify server:

1. Stop MySQL, enable SSL in its Configuration > General page, then restart it.
2. Confirm `/data/coolify/ssl/coolify-ca.crt` exists on the server. The `api`
   service mounts this file read-only at `/etc/ssl/certs/coolify-ca.crt`.
3. In the Syllo application, enable Configuration > Advanced > Connect To
   Predefined Network. Use the same Coolify server and destination as MySQL.
   Do not add a custom Compose network just for this connection.
4. Copy the host, port, user, password, and database from MySQL's **Internal URL**.
   Set Coolify's `DATABASE_URL` using those values and the `mysql+asyncmy` driver:

```text
mysql+asyncmy://USER:PASSWORD@INTERNAL_HOST:3306/DATABASE?charset=utf8mb4&ssl_ca=/etc/ssl/certs/coolify-ca.crt
```

Keep the `mysql+asyncmy://` prefix in Coolify's `DATABASE_URL`. A
`mysql+pymysql://` or plain `mysql://` URL selects a synchronous driver; this
app's migrations and API both require the installed async driver.

URL-encode reserved characters in the username or password. Do not paste an
`ssl-mode` parameter from Coolify's MySQL URL into this SQLAlchemy URL; the
`ssl_ca` parameter enables TLS with CA and hostname verification for `asyncmy`.
This Compose deployment also sets `DB_TLS_ALLOW_LEGACY_CERT=true` for Coolify
certificates that lack an Authority Key Identifier. Python 3.13 otherwise
rejects those certificates with `Missing Authority Key Identifier` during the
TLS handshake. This compatibility setting disables only Python's strict X.509
extension check for MySQL; it does **not** disable CA validation, hostname
validation, or TLS. Outside this Coolify deployment the setting defaults to
`false`. A correctly generated certificate is preferable: after replacing or
regenerating the database certificate with a compliant one, set
`DB_TLS_ALLOW_LEGACY_CERT=false` and redeploy. Do not regenerate the server CA
casually: doing so can invalidate certificates used by other databases.

The API entrypoint runs `alembic upgrade head` before Uvicorn, so a failed
connection or migration prevents the service from accepting traffic. Once the
private connection works, MySQL's public access can be disabled if no external
client needs it.

## 2. Create the Coolify resource

1. Connect the Git repository and choose Docker Compose.
2. Set the Compose file to `/compose.yaml`.
3. Attach `https://syllo.kavinhq.com` to the `web` service on port `80`.
4. Do not attach a domain or public port to `api`.
5. Add the environment variables below in Coolify. Treat all values as runtime
   variables; no secret is needed while building the static web image.

Required variables:

- `APP_URL=https://syllo.kavinhq.com`
- `DATABASE_URL`
- `JWT_SECRET` (independent random value, at least 32 bytes)
- `OAUTH_STATE_SECRET` (different independent random value)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=https://syllo.kavinhq.com/api/auth/google/callback`
- `GEMINI_API_KEY` (required to enable Study Companion)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Recommended values:

- `ADMIN_BOOTSTRAP_ENABLED=true`
- `COOKIE_SECURE=true`
- `COOKIE_SAMESITE=lax`
- `BILLING_ENABLED=false` (launch mode: paid plans are visible but cannot be purchased)
- `DB_POOL_SIZE=5`
- `DB_MAX_OVERFLOW=5`
- `DB_POOL_RECYCLE=1800`
- `DB_TLS_ALLOW_LEGACY_CERT=true` (Coolify certificate compatibility; see above)
- `LOG_LEVEL=INFO`
- `GEMINI_FRESHMAN_MODEL=gemini-3.1-flash-lite`
- `GEMINI_TUTOR_MODEL=gemini-3.8-flash`
- `GEMINI_UTILITY_MODEL=gemini-3.5-flash-lite`
- `GEMINI_TIMEOUT_SECONDS=30`
- `GEMINI_USER_REQUESTS_PER_MINUTE=10`
- `GEMINI_PROJECT_REQUESTS_PER_MINUTE=10` (shared across all students; lower this to fit the active Google API tier)
- `GEMINI_MONTHLY_BUDGET_CENTS=2500`
- `FREE_PLAN_START_CREDITS=10`
- `FREE_PLAN_MILESTONE_MAX_CREDITS=40` (10 starting helps plus 30 one-time milestone helps)
- `REFERRAL_BONUS_CREDITS=10` (awarded to both students for a successful referral)
- `REFERRAL_MONTHLY_LIMIT=5` (maximum rewarded distinct new signups per referrer per UTC month)
- `FREE_PLAN_MAX_CREDITS=100` (maximum Freshman balance)

Admin bootstrap is create-only. On the first healthy startup it creates one admin
from `ADMIN_EMAIL` and `ADMIN_PASSWORD`; it creates no student, curriculum, task,
or study data. Later changes to these variables do not overwrite or promote an
existing account. After the first deploy, you may set
`ADMIN_BOOTSTRAP_ENABLED=false` and redeploy.

Do not add placeholder Stripe credentials. With `BILLING_ENABLED=false`, the API
rejects checkout and billing-portal requests server-side, while the plan page shows
Scholar and Dean's List as coming soon. Payment-provider credentials will be added
when Paddle billing is implemented.
Coolify's saved environment variables are separate from `backend/.env.example`;
removing a placeholder from that example does not delete an existing Coolify value.

## 3. Configure Google and Gemini

In Google Cloud Console, add the exact authorized redirect URI:

```text
https://syllo.kavinhq.com/api/auth/google/callback
```

The browser begins sign-in at `/api/auth/google/start`; Google secrets remain in the
API container. Mobile uses the same callback and receives a short-lived single-use
code through `syllo://google-callback`.

Create a Gemini API key in Google AI Studio and set `GEMINI_API_KEY`. Freshman
requests use `gemini-3.1-flash-lite`; Scholar and Dean's List use
`gemini-3.8-flash` for chat/explanations and `gemini-3.5-flash-lite` for summaries
and reflections. All inference runs on Google's API. The Syllo container only
sends bounded requests, enforces credits/rate/budget limits, and stores metering
metadata; it does not host an AI model. Set Google Cloud billing alerts as a second
guardrail in addition to `GEMINI_MONTHLY_BUDGET_CENTS`.

Study Companion only charges a help after a successful response. Chat sends at
most six recent completed messages (up to 4,000 characters of prior context),
while keeping the student's current question intact. The app displays an
informational weekly usage pace, not a weekly reset or weekly spending limit;
allowances still refill at the start of each UTC month. Earned Freshman helps
are tracked separately so unspent earned helps can carry into the next month,
subject to the configured Freshman balance cap. The `20260929_0003` migration
adds that balance field automatically at startup.
The referral earning cap resets monthly; unused earned helps continue to carry
over up to the balance cap. The cap does not create automatic monthly invite helps.

Use Gemini's Paid tier with Standard inference for the public production launch.
The Free tier is suitable for private testing, but has lower rate limits and may
use submitted content to improve Google's products; the Paid tier provides higher
production limits and states that submitted content is not used for that purpose.
Keep the application budget at `$25` initially, add Google Cloud budget alerts at
`$10`, `$20`, and `$25`, and raise the cap only after reviewing real per-user cost.

## 4. Mobile workspace isolation

`mobile/` remains tracked so it can be developed and versioned with the product.
The root Docker context is an allow-list containing only `backend/`, while the web
image uses `frontend/` as its own context. The mobile project is therefore never
sent to Docker or copied into either production image.

Coolify still clones the Git repository before building. If the mobile source must
not exist even transiently on the Coolify host, it must live in a separate private
repository (or submodule with no deployment credential). A `.dockerignore` cannot
change what Git pushes; it controls only Docker build context and image contents.

Run the context policy check before deploying:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify_docker_context.ps1
```

## Capacity and scaling

The default stack is deliberately small: one Uvicorn worker, a static Nginx web
container, no local database, and a MySQL pool of 5 connections with up to 5 brief
overflow connections. The minimum practical runtime allocation is 1 shared vCPU and
1 GB RAM. For production, start with 2 vCPU and 2 GB RAM. Use 2 vCPU and 4 GB RAM
when Coolify image builds run on the same small host so build spikes do not compete
with the live containers. Nginx generally uses tens of MB, while the API and image
builds are the main memory consumers.

Scale after observing CPU, memory, API latency, and MySQL connection use. Each API
replica can open up to `DB_POOL_SIZE + DB_MAX_OVERFLOW` connections, so coordinate
replica counts with the hosted database limit. For higher traffic, prefer multiple
API replicas behind the web proxy rather than adding many Uvicorn workers to one
small container.

## Operations

- Liveness: `/api/health/live`
- Database readiness: `/api/health/ready`
- Web health: `/health`
- Manual migration: `python -m backend.app.startup`
- Rollback: restore the prior application image first; apply an Alembic downgrade
  only after reviewing whether the target revision drops data.

Rotate JWT/OAuth/Google/Gemini/admin secrets through Coolify and redeploy. Rotating
`JWT_SECRET` signs all users out. Update the corresponding Google configuration
before or at the same time as rotating provider credentials.
