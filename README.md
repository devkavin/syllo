# Syllo

Syllo is a student-focused academic workspace for subjects, lessons, notes, tasks,
focus sessions, reviews, planning, and study progress.

## Architecture

- `frontend/`: React 19 + Vite single-page application, served by Nginx in production
- `backend/`: FastAPI + SQLAlchemy + Alembic API
- `mobile/`: Expo application, versioned here but excluded from production Docker contexts
- Database: externally hosted MySQL
- Authentication: email/password and Google OAuth
- Billing: server-created Stripe Checkout sessions and verified Stripe webhooks

Production traffic enters through the web container. Nginx serves the application
and proxies `/api/` to the private API container, so browsers use one origin.

## Local development

Copy the example environment files and replace every placeholder:

```powershell
Copy-Item .env.example .env
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
Copy-Item mobile\.env.example mobile\.env
```

The API requires a reachable MySQL database. Apply migrations before starting it:

```powershell
python -m pip install -r backend\requirements-dev.txt
python -m alembic -c backend\alembic.ini upgrade head
python -m uvicorn backend.app.main:app --reload --port 8000
```

Run the web app in another terminal:

```powershell
Set-Location frontend
npm install
npm run dev
```

The web app uses `/api` by default. Set `VITE_API_BASE_URL` only when the API is on
a different origin during development.

The mobile workspace remains independently runnable and is not part of the Coolify
deployment:

```powershell
Set-Location mobile
npm install
npm start
```

## Verification

```powershell
python -m pytest backend\tests -q
Set-Location frontend; npm test -- --run; npm run lint; npm run build
Set-Location ..\mobile; npm test -- --runInBand
Set-Location ..; docker compose --env-file .env.example config
powershell -ExecutionPolicy Bypass -File scripts\verify_docker_context.ps1
```

## Production

Deployment uses `compose.yaml` with two deliberately small containers. MySQL stays
external, secrets are supplied by Coolify at runtime, and database migrations run
before the API starts. See [the Coolify deployment guide](docs/deployment/coolify.md)
for environment variables, Google and Stripe setup, capacity guidance, health
checks, and the mobile-source isolation model.

Production never seeds student or sample data. The optional create-only admin
bootstrap reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the environment and can be
disabled after the first successful deployment.

Do not commit `.env` files, provider secrets, database credentials, private keys,
or exported production data.
