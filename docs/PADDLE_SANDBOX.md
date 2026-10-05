# Paddle sandbox handoff

This release deliberately cannot accept live Paddle payments. Public paid plans
remain Coming soon. Only an authenticated Syllo admin can open sandbox checkout.
Never enter real card details in sandbox. No live catalog was modified.

## Coolify variables

Keep existing database, Google sign-in, Gemini and admin settings. Add these as
**runtime-only** variables on the Syllo Compose resource, not build arguments:

```dotenv
BILLING_ENABLED=false
BILLING_PROVIDER=paddle
PADDLE_SANDBOX_ENABLED=true
PADDLE_API_KEY=pdl_sdbx_apikey_...
PADDLE_WEBHOOK_SECRET=...
PADDLE_CLIENT_TOKEN=test_...
PADDLE_PRICE_SCHOLAR=pri_...
PADDLE_PRICE_DEANS_LIST=pri_...
PADDLE_INTRO_DISCOUNT_ID=dsc_...
```

Leave `PADDLE_SANDBOX_ENABLED=false` until all six values are available. The public
client token is intentionally returned to authenticated admins; API/webhook secrets
never reach the browser. Do not paste secrets into chats or commit `.env` files.

Sandbox catalog was created and verified on October 5, 2026. These non-secret IDs
are ready to copy into Coolify (sandbox only):

Product references: Scholar `pro_01m45nk2jww6xx838kp26th25m`;
Dean's List `pro_01m45nk3s5njwdqhp40ptx4hsd`. Product IDs are catalog references,
not required runtime environment variables.

```dotenv
PADDLE_PRICE_SCHOLAR=pri_01m45nk31ayb8n2rmh1asm3f6h
PADDLE_PRICE_DEANS_LIST=pri_01m45nk44b6be8y90ytfyqwwdx
PADDLE_INTRO_DISCOUNT_ID=dsc_01m45nk55jdq27g4sysbw694fr
```

Still needed locally: the sandbox client-side token and notification webhook
secret. The existing API key was used without exposing it in logs.

## Catalog

Only the live Paddle MCP connection was available during implementation, so it was
not used for sandbox writes. The isolated Node SDK tool follows the Paddle catalog
skill and does not add a dependency to either production container:

```powershell
cd tools/paddle-catalog
npm install --ignore-scripts
# Put the sandbox API key in backend/.env first.
npm run setup -- --create
```

Running without `--create` is read-only. Setup reuses matching products/prices and
prints the three non-secret IDs to copy into Coolify. It creates two SaaS products:

| Plan | First three months | Renewal | Monthly helps |
| --- | --- | --- | --- |
| Scholar | $6.99 | $8.99 | 250 |
| Dean's List | $11.99 | $13.99 | 800 |

Prices are USD excluding applicable tax, shown by Paddle before payment. The
server applies a restricted $2 recurring discount for three billing intervals,
once per account. It checks the catalog amount, currency, billing cycle and
discount before creating a transaction. Do not create a trial for these prices.

Create a sandbox API key in Developer tools → Authentication with product/price/
discount read/write for setup; the runtime key needs price/discount read,
transaction read/write and customer portal session write. Use a separate,
least-privileged runtime key after setup. Generate a **sandbox client-side token**.

## Notifications and test checkout

Set a sandbox notification destination to:
`https://syllo.kavinhq.com/api/webhooks/paddle`.
Enable transaction.completed, transaction.canceled and subscription.created,
subscription.activated, subscription.updated, subscription.past_due,
subscription.paused, subscription.resumed and subscription.canceled. Copy that
destination's webhook secret into Coolify. Allow `/checkout` as a sandbox checkout
URL and configure the default payment link to the same URL in Paddle.

After your own build/deployment, log in as admin and open Plans. Choose a paid
plan. Use [Paddle's sandbox test cards](https://developer.paddle.com/concepts/payment-methods/test-payment-details).
The success screen polls the owned transaction; client-side checkout events do not
grant a plan. Wait for webhook delivery to succeed before expecting paid helps.
Manage cancellation via the test customer portal on Plans.

If an API timeout leaves a transaction without an ID, do not blindly retry or
delete the reservation. Inspect sandbox transactions by its `syllo_reference`,
cancel any unfinished transaction in Paddle, then have an administrator reconcile
the local `paddle_payments` row. A matching completed webhook can recover its ID.

## Must pass before live billing is enabled in a separate release

- Real sandbox successful, declined and 3DS checkout tests.
- Correct intro price and renewal price including applicable tax.
- Real renewal delivery, scheduled cancellation, paused, past-due and canceled tests.
- Duplicate/out-of-order webhook deliveries and cross-account ownership checks.
- Portal cancellation and refund workflow; refund/chargeback access policy.
- Subscription plan-change preview/proration; not part of this sandbox release.
- Paddle account/domain approval, live catalog, live credentials, live notification
  destination and explicit public launch authorization.

The current sandbox supports one subscription per test account; canceling is
terminal and a new sandbox test uses a fresh test admin. Access expires at the last
verified paid period if payment fails or webhook renewal never arrives. A scheduled
cancellation leaves access intact until its paid period ends. There is no unlimited
past-due grace. Helps still renew by Syllo's disclosed calendar-month cycle.

Automated tests use fake provider responses and signed local webhook payloads.
Actual Paddle end-to-end testing was not run without sandbox credentials and a
deployed notification endpoint.
