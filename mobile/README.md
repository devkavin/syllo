# Syllo Mobile — Build Plan and Handoff

Status: not yet scaffolded. This document is the single source of truth. Any developer or AI editor can start from step 1 and reach a working iOS + Android build with the same result.

## 0. Product summary
Syllo Mobile is a calm study companion for iOS and Android. It reuses the Syllo backend at `REACT_APP_BACKEND_URL` and mirrors the web app's design language (warm neutrals, Bricolage Grotesque headings, Manrope body, sage / ochre / dusty blue subject accents).

MVP scope (locked with the user):
1. Auth (email/password + Google)
2. Today screen (streak, daily goal, tasks, quick focus)
3. Subjects → Units → Lessons with inline lesson notes
4. Notebooks with autosave + Summarize
5. Tasks list with priorities and due dates
6. Focus timer with background running + local notification when a block ends
7. Study Companion drawer (chat with Gemini)

Deferred to v1.1: Timetable, Reviews, Analytics, Upgrade page, Referrals card, Admin (admin stays web only).
Deferred to v2: Push notifications for daily reminders.

## 1. Tech stack (locked)
- Expo SDK 51 (or latest stable) with `expo-router` v3
- React Native 0.74 + TypeScript 5
- NativeWind v4 for Tailwind classes on native
- `expo-secure-store` for token storage
- `expo-auth-session` + `expo-web-browser` for Google OAuth via Emergent
- `expo-notifications` for local timer notifications (no server push in v1)
- `expo-keep-awake` while focus timer is running in foreground
- `expo-linking` for deep links (payment success/cancel return, referral `?ref=` URLs)
- `axios` for API
- `zustand` for lightweight global state (auth user, usage, active timer)
- `date-fns` for date maths
- `lucide-react-native` icons (matches web)
- `@expo-google-fonts/manrope`, `@expo-google-fonts/bricolage-grotesque`, `@expo-google-fonts/jetbrains-mono`

No Redux, no React Query in v1. Keep it small.

## 2. Backend prerequisites (already done in this repo)
The FastAPI backend already supports mobile:
- `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/google/callback` all return `access_token` and `refresh_token` in the JSON body (in addition to setting cookies for web).
- `get_current_user` reads `Authorization: Bearer <token>` before falling back to cookies.
- CORS allows the preview origin. For a real mobile build no CORS is needed since we call the origin directly.

Nothing else to change on the backend.

## 3. Environment variables
Create `/app/mobile/.env` with:
```
EXPO_PUBLIC_API_BASE=https://<your-syllo-backend-host>/api
EXPO_PUBLIC_GOOGLE_AUTH_URL=https://auth.emergentagent.com/
```
The API base must match whatever the web app uses (see `frontend/.env`'s `REACT_APP_BACKEND_URL`). Do not hardcode.

## 4. Full folder structure
```
mobile/
  app/                              expo-router file-based routes
    _layout.tsx                     root providers (fonts, auth, usage, theme, safearea)
    index.tsx                       redirect to /today or /(auth)/login
    (auth)/
      _layout.tsx                   stack
      login.tsx
      register.tsx
      google-callback.tsx           parses ?session_id and exchanges via /auth/google/callback
      onboarding.tsx                3-step wizard (name / subjects / goal)
    (tabs)/
      _layout.tsx                   bottom tab bar (Today, Subjects, Notebooks, Tasks, Focus)
      today.tsx
      subjects/
        index.tsx
        [id].tsx                    subject detail with units + lessons + preset + notes
      notebooks/
        index.tsx                   list + editor split (stack push into editor on tap)
        [id].tsx                    editor with autosave and Summarize
      tasks.tsx
      focus.tsx                     focus timer with background support
    companion.tsx                   modal route for Study Companion (opened from FAB)
    upgrade.tsx                     plans list, opens Stripe Checkout in browser
    settings.tsx                    profile, theme, daily goal, invite card, sign out
  components/
    Screen.tsx                      screen wrapper with SafeArea + scroll + padding
    HeroTitle.tsx                   the "hero glow + section-title + h1" pattern
    SubjectDot.tsx
    StatCard.tsx
    GoalRing.tsx                    svg progress ring
    StreakHeatmap.tsx               30-day heatmap (react-native-svg)
    LessonRow.tsx                   with status icon + status pill + notes toggle
    ExplainSelection.tsx            renders "Explain this" pill above the TextInput selection
    FAB.tsx                         floating Study Companion button
    UsageBar.tsx                    plan + credits remaining bar
    Empty.tsx                       empty state
    Loading.tsx                     spinner + skeleton
    Toast.tsx                       thin toast wrapper (using react-native-root-toast)
  lib/
    api.ts                          axios instance with Bearer + refresh interceptor
    auth.ts                         Zustand store: user, login, register, google, logout
    usage.ts                        Zustand store: plan + credits (polled)
    theme.ts                        Zustand store for light/dark, persisted
    palette.ts                      port of frontend/src/lib/palette.js
    format.ts                       formatSeconds, formatTimer, greeting
    storage.ts                      expo-secure-store thin wrapper
    fonts.ts                        expo-google-fonts loader
    types.ts                        Subject, Lesson, Task, Notebook, User, Plan
    timer.ts                        Focus timer state machine with wall-clock (survives sleep)
    ai.ts                           chat/summarize/explain/reflection helpers
  hooks/
    useProtectedRoute.ts            redirects to /(auth)/login if not signed in
    useApi.ts                       tiny wrapper adding useEffect fetching
  constants/
    colors.ts                       hsl tokens for light + dark, subject palette
    plans.ts                        default plan ids, prices (fetched from server)
  assets/
    icon.png                        1024x1024 app icon (warm sage background, white "S")
    splash.png                      2048x2048 splash (paper cream + serif "Syllo")
    adaptive-icon.png               Android adaptive
  app.json                          Expo config (name, slug, scheme "syllo", icons)
  eas.json                          build profiles (development, preview, production)
  babel.config.js                   NativeWind + expo-router plugins
  tailwind.config.js                mirrors web tailwind.config.js + native flags
  metro.config.js                   Expo default + NativeWind
  tsconfig.json                     strict TS
  global.css                        NativeWind base
  package.json
  .env.example
  README.md
```

## 5. Setup steps (fresh checkout)

Run these from `/app`:
```
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npx expo install expo-router expo-linking expo-constants expo-status-bar expo-secure-store expo-web-browser expo-auth-session expo-notifications expo-keep-awake react-native-safe-area-context react-native-screens react-native-gesture-handler react-native-reanimated react-native-svg
npm i axios zustand date-fns lucide-react-native
npm i -D nativewind@^4 tailwindcss@^3.4 @types/react
npm i @expo-google-fonts/manrope @expo-google-fonts/bricolage-grotesque @expo-google-fonts/jetbrains-mono expo-font
```

Enable expo-router (in `package.json`):
```json
"main": "expo-router/entry"
```

`app.json` important fields:
```jsonc
{
  "expo": {
    "name": "Syllo",
    "slug": "syllo",
    "scheme": "syllo",
    "version": "0.1.0",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "ios": { "supportsTablet": true, "bundleIdentifier": "app.syllo.mobile" },
    "android": { "package": "app.syllo.mobile", "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png" } },
    "plugins": ["expo-router", "expo-secure-store", "expo-notifications"]
  }
}
```

## 6. Design system port (mobile)

`tailwind.config.js` — same tokens as web but exposed as safe-list colors so NativeWind works in production builds:
```js
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // solid values (RN NativeWind cannot resolve hsl(var())):
        background: { light: "#F5F1E9", dark: "#161513" },
        foreground: { light: "#232019", dark: "#EDE7DA" },
        card: { light: "#FFFFFF", dark: "#1D1B18" },
        border: { light: "#E5DED0", dark: "#2A2723" },
        primary: { light: "#2D3A2C", dark: "#B9C7B4" },
        muted:  { light: "#8A8577", dark: "#8E8778" },
        // subject accents (see lib/palette.ts for the full map)
        sage: "#4A7C59", ochre: "#D9822B", terracotta: "#C85A5A",
        dustyBlue: "#4C7DA7", lavender: "#7E5EA6", rosewood: "#A84B73",
        oliveMuted: "#6B753B", slate: "#5F666D",
      },
      fontFamily: {
        sans: ["Manrope_400Regular"],
        display: ["BricolageGrotesque_600SemiBold"],
        mono: ["JetBrainsMono_500Medium"],
      },
    },
  },
};
```

`lib/palette.ts` — exact copy of the web version, but expressed as hex + light/dark pairs. Subject color ids stay identical to server (`sage`, `ochre`, `terracotta`, `dusty_blue`, `lavender`, `rosewood`, `muted_olive`, `slate`).

## 7. Auth architecture

Storage helpers (`lib/storage.ts`):
```ts
import * as SecureStore from "expo-secure-store";
export const store = {
  get: (k: string) => SecureStore.getItemAsync(k),
  set: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  del: (k: string) => SecureStore.deleteItemAsync(k),
};
```

Axios instance (`lib/api.ts`):
```ts
import axios from "axios";
import { store } from "./storage";

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_BASE!,
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  const t = await store.get("access_token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});
```

Auth store (`lib/auth.ts`) — Zustand:
- `login(email, password)` → POST `/auth/login` → save `access_token`, `refresh_token`, set `user`
- `register(...)` similar
- `googleSignIn()` → open `https://auth.emergentagent.com/?redirect=<deep-link>` via WebBrowser, capture the `session_id` fragment on return, POST to `/auth/google/callback`
- `logout()` → clear tokens + user
- `hydrate()` → on app boot, read token, GET `/auth/me`

Deep link scheme: `syllo://google-callback#session_id=xxxx` handled by the `google-callback.tsx` route.

## 8. Screens (contract by screen)

### Today (`app/(tabs)/today.tsx`)
Loads `/today` + `/subjects` + `/analytics.heatmap`. Renders:
- HeroTitle "Good morning, {name}." with Goal Met badge when reached
- Stat row: Studied today, Streak, Daily Goal ring
- StreakHeatmap (30 days)
- Bonus Quests (only on Freshman plan)
- Weekly Reflection card
- Today's Tasks (tappable)
- Quick start (button to open Focus tab)

### Subjects list (`app/(tabs)/subjects/index.tsx`)
List of tinted cards (top border in subject color). Tap → detail.

### Subject detail (`app/(tabs)/subjects/[id].tsx`)
- Header with subject dot + name
- Focus Preset card (two sliders, save button)
- Units accordion. Each lesson row has status icon, status pill, notes toggle.
- Tap notes toggle → inline TextInput with autosave (800ms debounce). Selecting text renders ExplainSelection pill.

### Notebooks list + editor
- List route: notebooks with subject dot + title
- Detail route: full-screen editor. Title (large display font), body (serif-styled Manrope, since RN doesn't have Newsreader for free), Summarize button in header, autosave indicator, ExplainSelection on the body TextInput.

### Tasks (`app/(tabs)/tasks.tsx`)
Segmented control: Open / Done / All. FAB at bottom to create. Task rows show subject dot, due date, priority.

### Focus timer (`app/(tabs)/focus.tsx`)
State machine keyed on real-world timestamps so it survives the app being backgrounded:
```
{ mode, startedAt, plannedSeconds, running }
```
On tick just compute `elapsed = now - startedAt`. When elapsed reaches plannedSeconds, schedule a local notification and mark the block complete.
UI: big timer, mode chips, subject picker (auto-applies subject preset), Start/Pause/Reset/Log.

### Study Companion (`app/companion.tsx`)
Presented as a modal. Same chat surface as web: history array, POST `/ai/chat`, streaming not required for v1. Shows credits remaining. FAB is on every tab layout.

## 9. Focus Timer background-safety details
- Use `expo-keep-awake` `activateKeepAwakeAsync()` while running.
- On app foreground, recompute state from `startedAt` + wall clock (don't trust setInterval).
- On block complete: `Notifications.scheduleNotificationAsync({ content: { title: "Focus block done", body: "Nice. Take a short break." }, trigger: null })`.
- Persist active timer in `SecureStore` so a cold start restores it.

## 10. Stripe payments on mobile
For v1 avoid the native SDK: open `https://checkout.stripe.com/...` in `WebBrowser.openAuthSessionAsync` with `redirect_uri = syllo://payment/success`. Poll `/billing/status/{session_id}` on return. Simple, works today.

Later, swap for `@stripe/stripe-react-native` PaymentSheet if you want in-app checkout.

## 11. Referral link handling
Deep link: `syllo://register?ref=CODE`. Parse with `expo-linking` and prefill the register screen's referral field.

## 12. Testing checklist (manual QA)
- Register email account → lands on onboarding → finishes → Today
- Register with `?ref=DEMOCODE` → both users see +15 credits
- Login → survives app restart
- Google sign-in round-trip
- Create subject → unit → lesson → mark done → review scheduled
- Notebook autosave (edit, kill app, reopen — content persists)
- Focus block completes and shows local notification even when app backgrounded
- Study Companion returns a response
- Notebook Summarize returns 3 bullets + question
- Explain from lesson notes selection
- Sign out clears secure store

## 13. Build and deploy (EAS)

`eas.json`:
```jsonc
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal" },
    "production": {}
  },
  "submit": { "production": {} }
}
```

Preview build for TestFlight and internal Android:
```
npm i -g eas-cli
eas login
eas build:configure
eas build --profile preview --platform all
```

Store submissions (later):
```
eas submit -p ios
eas submit -p android
```

## 14. Continuation checklist (if you switch editors)
Everything needed to resume from zero:

1. Confirm backend is up and `EXPO_PUBLIC_API_BASE` is reachable from your phone.
2. Run the exact `npx create-expo-app` command in section 5.
3. Copy the folder tree from section 4 as empty files first (so imports resolve).
4. Implement in this order (each block is roughly one working session):
   - Session A: fonts, tailwind, Screen wrapper, HeroTitle, StatCard, colors
   - Session B: `lib/storage`, `lib/api`, `lib/auth`, `(auth)/login`, `(auth)/register`, `(auth)/google-callback`, root `_layout` with hydration
   - Session C: bottom tabs shell + Today screen (calls `/today` + `/subjects` + `/analytics`)
   - Session D: Subjects list + Subject detail with LessonRow + inline notes + ExplainSelection
   - Session E: Notebooks list + editor with autosave + Summarize
   - Session F: Tasks list + creation modal
   - Session G: Focus timer with wall-clock state + local notification
   - Session H: Study Companion modal + FAB on every tab
   - Session I: Settings + Upgrade + payment browser flow
   - Session J: polish (empty states, error toasts, dark mode, a11y)
5. Snapshot after each session so you can revert quickly.

## 15. Guardrails (do not skip)
- Never store the JWT in `AsyncStorage`. Always `expo-secure-store`.
- Always use `EXPO_PUBLIC_API_BASE` — no hardcoded URLs anywhere.
- Timer math uses wall-clock deltas, never `setInterval` counters.
- Any change to auth response shape needs a matching backend deploy.
- Do not add em dashes to any user-facing string. Match the web app's calm voice.

## 16. Known limits of v1
- No offline mode. All screens assume a network.
- No native rich text editor. Notebooks use a plain multiline TextInput with autosave. Rich text arrives in v1.1 if needed.
- No push notifications. Local notifications only, tied to the focus timer.
- Admin panel stays web only.

## 17. Handoff notes
If you're picking this up in a new editor:
- This file is the plan of record. Update it as you build.
- The web codebase in `/app/frontend` is the design reference. Reuse strings and structure verbatim where sensible.
- `/app/memory/PRD.md` has the full product state. `/app/memory/test_credentials.md` has demo credentials for testing the backend against your mobile client.
- Backend tokens are already returned in `access_token` for login/register/google-callback. See `/app/backend/server.py`.
