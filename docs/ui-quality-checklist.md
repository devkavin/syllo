# Web UI quality pass

The approved overhaul keeps Syllo's existing routes, academic data, plan prices,
theme sync, Companion limits and payment gating. No mobile-native code, backend,
environment files or deployment configuration changed.

## Shared rules

- One calm neutral/sage palette, with subject colours used as small indicators.
- Buttons and standard inputs share a 44px control height. Icon controls have a
  44px square target. Forms use 16px input text to avoid mobile browser auto-zoom.
- Headers, toolbars, segmented controls, notices, empty states and action links
  share reusable classes in `frontend/src/index.css`. Existing component-library
  buttons/inputs now use the same foundation.
- UI actions are buttons or identifiable navigation links, not scattered
  underlined text. Legal and study-response prose retains identifiable hyperlinks.
- Light/dark palettes have automated checks for secondary text, primary button
  text and input boundary contrast. These checks do not certify every rendered
  combination or constitute a WCAG audit.
- Search, setup dialogs, mobile navigation and Companion use existing Radix
  primitives for focus containment, Escape dismissal and background isolation.
  Mobile drawer handoffs restore focus to the persistent menu trigger when their
  original opener disappears; exhausted Companion allowances still focus inside.
  Navigation retains a usable minimum height in short, scrollable sidebars.
- Reduced-motion preferences suppress nonessential motion. A skip link targets
  the main workspace.

## Screen changes

- Planner: primary Add activity, segmented Day/Week view, labelled date with
  previous/next navigation, secondary timetable action, useful empty agenda.
- Today: aligned header and consistent section actions; schedule rows stack
  naturally on narrow screens.
- Subjects: neutral subject surfaces with visible navigation affordances;
  accessible subject/unit/lesson creation dialogs instead of browser prompts.
- Tasks and Reviews: simple divided rows, usable completion/delete controls,
  wrapping metadata and actions.
- Timetable: readable day sections instead of seven cramped columns inside the
  app sidebar. Date/time fields and activity-kind controls wrap on mobile.
- Notes: named, readable editors and wrapping toolbars; notebook list is bounded
  on mobile so it does not bury the editor.
- Focus: configuration hidden while running; existing pause/resume, persistence,
  context and session recording behavior retained.
- Progress: a next action before any study history, simpler chart grouping and
  an accessible text summary of daily study values.
- Circles, onboarding, settings, pricing, authentication and admin share the same
  control/heading system; credential fields support password managers.

## Verification

Run frontend tests with `VITE_API_BASE_URL=/api` in the test process. A local
development env pointing at localhost otherwise conflicts with the existing
API-default assertion. Do not edit the user's env files to run this check.

The test suite checks behavior and the theme palette, not rendered geometry.
No build, app server, live API, migration or deployment was run during this pass.

Final automated verification: 122 tests passed across 34 files; frontend ESLint
and `git diff --check` passed. The focused review findings about exhausted-help
autofocus, mobile overlay handoffs and short-height navigation were addressed.

## Browser QA still required

After the user starts the app, review at 320, 390, 768, 1024 and 1440 CSS pixels
in both themes, with browser zoom at 200% and keyboard-only navigation:

1. Visit Today, Subjects, subject details, lesson notes, Planner, Timetable,
   Tasks, Reviews, Focus, Progress, Circles, Notebooks and Settings.
2. Check populated, empty, loading and failed-request states. Long titles and
   email addresses must wrap without widening the page.
3. Check credential/onboarding pages, plan previews, the admin-only sandbox
   screens and admin tables without making payments or altering live records.
4. Open each setup dialog, Search, Companion and mobile navigation. Tab and
   Shift+Tab must stay inside; Escape closes; focus returns to a useful opener.
5. Check mobile navigation → Search/Companion transitions, virtual-keyboard
   layouts, and date/time controls in Safari as well as Chrome.
6. Confirm reduced-motion behavior, input boundaries, focus outlines, disabled
   states and screen-reader names in the actual browser.
7. Complete a task, write/recover notes, pause/resume Focus, schedule a review
   and inspect a Circle invitation. No functionality should be lost.

Full WCAG 2.2 AA compliance and visual quality are not claimed until that
rendered/manual audit is completed.
