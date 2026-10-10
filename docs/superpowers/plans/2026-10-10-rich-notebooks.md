# Rich notebooks implementation plan

**Goal:** Replace the notebook textarea with the free BlockNote editor: slash commands, headings, lists, text colors, and highlights, with a paper-like appearance.

**Design:** Use BlockNote core/react/Shadcn 0.55.0. User explicitly authorized migrating the entire web frontend to the latest Tailwind, verified as 4.3.3. Use its Vite plugin, CSS theme and class-based dark mode; preserve existing colors and component behavior. Keep the existing plain-text `content` for search and summaries, add nullable JSON `rich_content`, and save both in the same autosave patch. Legacy notes open as literal paragraphs. Preserve title editing, failed-save recovery, and notebook-switch protection. Keep Explain available for rich editor selections. Add per-notebook plain/ruled/dotted paper and sans/serif/mono type styles. No XL packages, external editor service, or API keys. The separate Expo app uses NativeWind 4 and stays on its supported Tailwind 3 dependency.

**Execution:** Implement in the current workspace, keeping the existing timer changes. User authorized implementation of the easier free option after reviewing the editor choices. Use tests first, then one independent review. Do not deploy or commit automatically.

## Task 1: Durable storage

- [x] Write API round-trip tests for rich content, preferences, legacy notes, plain-text updates clearing stale formatting, and ownership; run and observe failure.
- [x] Add model/schema/route fields and an additive Alembic migration. Test migration upgrade/downgrade preservation of existing text.
- [x] Run academic and migration tests.

## Task 2: Editor integration

- [x] Install pinned free packages using the existing Yarn lockfile.
- [x] Test literal legacy conversion, plain-text extraction (nested lists and tables), real editor formatting and restoration, slash commands, page autosave, and notebook switching. Existing summaries consume the extracted plain text.
- [x] Add `notebookContent.js` for conversion and extraction; `NotebookEditor.jsx` for the rich editor; adapt `Notebooks.jsx` and Explain selection handling.
- [x] Add scoped paper/font styles and accessible controls. Keep ordinary slash actions independent of AI.
- [x] Run frontend suite, lint, build, backend suite, and browser checks; review the uncommitted diff independently.

## Task 3: Tailwind migration

- [x] Install Tailwind 4.3.3 and its Vite plugin with the existing Yarn lockfile; replace the legacy animation plugin with tw-animate-css.
- [x] Migrate theme configuration to CSS, explicitly scan BlockNote components, update changed utility syntax across all web components, and preserve light/dark tokens.
- [x] Verify compiled CSS behavior and inspect login, Today, notebooks, editor menus and phone layouts in a browser.

## Review focus

Legacy text must stay literal, including HTML-like text and blank lines. Rich content and plain text must not diverge. Switching notes must not leak editor state. Failed saves must preserve formatting in the recovery draft. Mobile menus, selection formatting, and dark-mode ink/highlights must remain usable.

## Execution record

- Complete locally without committing or deploying. Existing timer fix retained and its 43 tests passed again after the CSS migration.
- Frontend: 177 tests passed; ESLint and production build passed. The last utility/prerender edits were verified with 50 focused tests. Disabled unnecessary client scanning in the temporary SSR homepage renderer to remove its shutdown error. The notebook page loads the rich editor lazily; Vite still reports its large chunk warning (312 KB gzipped).
- Backend: 148 tests passed; 3 disposable-MySQL concurrency tests skipped. Additive migration round trips preserve legacy text. Existing Google SDK deprecation warnings remain.
- Independent review identified unsupported document types/styles that could crash reopen; tightened validation against the pinned BlockNote default schema and verified supported headings, tables, code, media and formatting remain accepted.
- Browser check used a disposable in-memory backend and dummy account. Verified literal old notes, slash-to-heading, blue ink, yellow highlight, title/paper/font autosave, switching, and full reload persistence. Inspected light/dark layouts and a 390-pixel phone viewport with a visible slash menu; no browser errors. Preview images saved outside the repository. Test servers and temporary runner removed.
- Release requires deploying frontend and backend together. The existing API entrypoint applies Alembic revision `20261010_0010` before startup.
