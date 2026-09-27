# Syllo — Product Requirements Document

## Original Problem Statement
Build Syllo, a polished personal academic workspace for students. Originally spec'd for Laravel 12 + MySQL, adapted to available FastAPI + React + MongoDB stack per user choice. Premium, minimal Notion-inspired interface with warm neutrals, subject color coding, calm light and dark modes. No AI jargon. No em dashes in user-facing copy.

## Architecture
- Backend: FastAPI (Python 3.11), Motor (async MongoDB), JWT httpOnly cookies for auth
- Frontend: React 19 + React Router + Tailwind + shadcn primitives (Radix under the hood)
- Storage: MongoDB, single database (`test_database`); collections: users, subjects, units, lessons, notebooks, tasks, sessions, streaks
- Auth: email/password (bcrypt + JWT cookies) AND Emergent Google OAuth (issues same JWT cookies)
- Design system: warm neutrals, Newsreader serif for headings, Plus Jakarta Sans for UI, JetBrains Mono for timer; 8 calm subject accent colors

## User Personas
- Student who wants a quiet, focused study space. Cares about a simple daily plan, notes, and gentle progress tracking.

## Core Requirements (static)
- Today is the primary screen
- Subjects → Units → Lessons hierarchy with cascade delete
- Notebooks with autosave (800ms debounce)
- Tasks with subject, due date, priority
- Client-side focus timer (Pomodoro + stopwatch), persisted in localStorage, saves session on log
- Study sessions auto-update lesson totals + streak
- Analytics: 14-day activity, total time, subject allocation, streak stats
- Light and dark modes, user selectable, persisted
- Per-user data isolation, JWT cookie auth
- No em dashes, no AI jargon in copy

## Implemented (2026-09-27)
- Backend: full API surface (auth, subjects, units, lessons, notebooks, tasks, sessions, today, analytics, seed) with 22/22 tests passing
- Frontend: routes for /login, /register, /today, /subjects, /subjects/:id, /notebooks, /tasks, /timer, /analytics, /settings + Google OAuth callback flow
- Realistic demo user auto-seeded on startup (demo@syllo.app / syllo123)
- Automated backend + frontend test suite passing 100%

## Implemented (2026-09-27, iteration 2)
- Onboarding: 3-step wizard (name, subject picker with color coding, daily goal) redirects fresh users automatically
- Weekly Timetable: 7-day grid, class + study block kinds, per-subject color, /api/timetable CRUD, demo user seeded with 3 blocks
- Global Search: Cmd/Ctrl+K dialog, sidebar button, debounced /api/search across subjects, lessons, notebooks, tasks
- Spaced Reviews: lessons marked done auto-queue a review; interval ladder [1,3,7,14,30,60,120] days; Good advances, Again resets
- Daily goal on Today: progress ring toward daily_goal_minutes; Settings slider persists it
- 34/34 backend tests pass; all new frontend flows verified

## Prioritized Backlog
- P1: Onboarding flow for brand-new users (name, subjects, daily goal)
- P1: Timetable and planner (recurring class blocks)
- P1: Global search across subjects, lessons, notebooks, tasks
- P2: Reviews (spaced repetition) queue
- P2: Goals (weekly hours per subject) tied to streak/analytics
- P2: Rich-text notebook (blocks + slash menu)
- P2: Reminders and notifications
- P3: Coolify / Docker production deployment config
- P3: Mobile bottom-nav polish and iOS PWA icon

## Next Tasks
- Ship onboarding, search, and timetable in the next iteration
