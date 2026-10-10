# Syllo

Syllo is a student-focused academic workspace for subjects, lessons, notes, tasks,
focus sessions, reviews, planning, and study progress.

## Architecture

- `frontend/`: React 19 + Vite + Tailwind CSS 4.3.3, served by Nginx in production
- `backend/`: FastAPI + SQLAlchemy + Alembic API
- `mobile/`: Expo application, versioned here but excluded from production Docker contexts
- Database: externally hosted MySQL
- Authentication: email/password and Google OAuth
- Billing: launch-safe feature flag with paid plans visible as coming soon; checkout remains disabled until Paddle is integrated
- Study Companion: server-metered calls to Google Gemini; no AI model runs locally

Production traffic enters through the web container. Nginx serves the application
and proxies `/api/` to the private API container, so browsers use one origin.

Notebooks use BlockNote's free community editor with local slash commands, headings,
lists, text colors, and highlights. These editor features need no API key or AI
service. Rich blocks are stored alongside plain text for search and summaries;
existing text notes open as literal paragraphs. Paper and font preferences are
saved per notebook. Deploy the backend migration `20261010_0010` with the web update.

Web focus timers are saved per account on the server, using server timestamps and
pause-aware elapsed time. The same signed-in account can start on a phone browser
and pause, resume, reset, or log on another device. Closing the browser does not
stop elapsed time. Countdowns cap study time at their configured duration and
record completion when Focus next syncs; no background alarm runs while the
browser is closed. Controls require a connection, and retrying a request does not
duplicate study logs. Deploy migration `20261010_0011` before serving the updated
frontend (the production API entrypoint applies it automatically). Older unsaved
local sessions can be logged or reset before switching to the shared timer.

The web study workflow connects notebooks, Focus, Reviews, Planner and Progress:

- Notebooks retain account-scoped browser drafts, detect conflicting edits, keep
  the last 30 saved versions, and support Trash/restore and rich JSON export.
  Unsaved recovery drafts stay on that browser; saved notes sync through the API.
- A compact notebook focus bar controls the same server timer as the Focus page.
  Page appearance, academic links and recovery tools remain expandable.
- Notebook Practice supports manually written recall questions and mistakes with
  a corrected method. Answers stay hidden until revealed. Again, Hard and Good
  schedule the next review; these are self-ratings, not automatically graded results.
  Selected note text can become a question without calling an AI service.
- Planner's Revision plans distribute chosen lessons across selected study days
  before an exam, within the plan's daily capacity. Generated work uses ordinary
  tasks, so it appears in Today, Tasks and the agenda. Dates can be rescheduled.
- Progress shows recall attempts and topics to revisit separately from study time.
  Lessons open their linked rich notebook and preserve the original lesson text.

Apply migration `20261010_0012` before serving this frontend. The production API
entrypoint upgrades automatically. These features introduce no paid package,
AI/API key requirement, or media uploads. Existing Study Companion calls retain
their existing Gemini configuration and metering.

The web frontend uses Tailwind 4's Vite plugin and CSS theme configuration.
Browser requirements follow the [Tailwind 4 compatibility guide](https://tailwindcss.com/docs/upgrade-guide#browser-requirements).
The separate Expo app keeps NativeWind 4's supported Tailwind 3 dependency.

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
for environment variables, Google and Gemini setup, capacity guidance, health
checks, and the mobile-source isolation model.

Production never seeds student or sample data. The optional create-only admin
bootstrap reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the environment and can be
disabled after the first successful deployment.

Do not commit `.env` files, provider secrets, database credentials, private keys,
or exported production data.
