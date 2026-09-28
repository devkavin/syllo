# Deploying Syllo on Coolify

Syllo ships as two containers: `web` (Vite assets served by Nginx) and `api`
(FastAPI). MySQL is deliberately external and is not created by Compose. Only the
web service should receive a public Coolify domain; the API is reachable privately
as `api:8000` and Nginx proxies `/api/` to it.

## 1. Prepare MySQL

Create an empty UTF-8 database and a least-privilege application user. The user
needs normal schema migration and application CRUD privileges on that database,
not global server privileges. Use an async SQLAlchemy URL:

```text
mysql+asyncmy://USER:PASSWORD@HOST:3306/DATABASE?charset=utf8mb4
```

URL-encode reserved characters in the username or password. Allow the Coolify
server's outbound IP at the database host and require TLS if your provider supports
it. The API entrypoint runs `alembic upgrade head` before Uvicorn, so a failed
connection or migration prevents the service from accepting traffic.

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
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_SCHOLAR`
- `STRIPE_PRICE_DEANS_LIST`
- `STRIPE_DEANS_INTRO_COUPON` (required while the Dean's List launch offer is advertised)
- `GEMINI_API_KEY` (required to enable Study Companion)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Recommended values:

- `ADMIN_BOOTSTRAP_ENABLED=true`
- `COOKIE_SECURE=true`
- `COOKIE_SAMESITE=lax`
- `DB_POOL_SIZE=5`
- `DB_MAX_OVERFLOW=5`
- `DB_POOL_RECYCLE=1800`
- `LOG_LEVEL=INFO`
- `GEMINI_FRESHMAN_MODEL=gemini-3.1-flash-lite`
- `GEMINI_TUTOR_MODEL=gemini-3.8-flash`
- `GEMINI_UTILITY_MODEL=gemini-3.5-flash-lite`
- `GEMINI_TIMEOUT_SECONDS=30`
- `GEMINI_USER_REQUESTS_PER_MINUTE=10`
- `GEMINI_MONTHLY_BUDGET_CENTS=2500`

Admin bootstrap is create-only. On the first healthy startup it creates one admin
from `ADMIN_EMAIL` and `ADMIN_PASSWORD`; it creates no student, curriculum, task,
or study data. Later changes to these variables do not overwrite or promote an
existing account. After the first deploy, you may set
`ADMIN_BOOTSTRAP_ENABLED=false` and redeploy.

## 3. Configure Google and Stripe

In Google Cloud Console, add the exact authorized redirect URI:

```text
https://syllo.kavinhq.com/api/auth/google/callback
```

The browser begins sign-in at `/api/auth/google/start`; Google secrets remain in the
API container. Mobile uses the same callback and receives a short-lived single-use
code through `syllo://google-callback`.

Create a Stripe webhook endpoint at:

```text
https://syllo.kavinhq.com/api/webhook/stripe
```

Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Put Stripe Price IDs—not display prices—in `STRIPE_PRICE_SCHOLAR` and
`STRIPE_PRICE_DEANS_LIST`. Checkout amounts, success/cancel URLs, portal return URLs,
and entitlement changes are server-owned.

Create the recurring prices as Scholar `$5.99/month` and Dean's List
`$12.99/month`. For the launch offer, create a server-owned Stripe coupon for
`$3.00` off, repeating for three months, and put its ID in
`STRIPE_DEANS_INTRO_COUPON`. Syllo only displays `$9.99 for the first 3 months`
when Stripe confirms that coupon is valid, USD `$3.00` off, and repeats for exactly
three months. An invalid coupon is neither advertised nor accepted at checkout.

Create a Gemini API key in Google AI Studio and set `GEMINI_API_KEY`. Freshman
requests use `gemini-3.1-flash-lite`; Scholar and Dean's List use
`gemini-3.8-flash` for chat/explanations and `gemini-3.5-flash-lite` for summaries
and reflections. All inference runs on Google's API. The Syllo container only
sends bounded requests, enforces credits/rate/budget limits, and stores metering
metadata; it does not host an AI model. Set Google Cloud billing alerts as a second
guardrail in addition to `GEMINI_MONTHLY_BUDGET_CENTS`.

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

Rotate JWT/OAuth/Google/Stripe/admin secrets through Coolify and redeploy. Rotating
`JWT_SECRET` signs all users out. Update the corresponding Google or Stripe console
configuration before or at the same time as rotating provider credentials.
