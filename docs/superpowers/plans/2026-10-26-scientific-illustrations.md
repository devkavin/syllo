# Scientific Illustrations Studio implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. The user explicitly requested inspection followed by implementation in this session.

**Goal:** An editable, no-AI scientific illustration workspace embedded in existing Notes.

**Architecture:** Extend BlockNote with a `scientificIllustration` block. Store a versioned, framework-independent JSON document and generated preview in its props, through the existing revision-checked notebook autosave and recovery system. Render vectors with React and native SVG, without a paid or redundant canvas dependency. Bundle curated, sanitized SVG files through Vite, sharing an immutable license catalog with backend validation.

**Tech stack:** React 19, BlockNote 0.55, Radix Dialog, Lucide, SVG, FastAPI, Pydantic, SQLAlchemy JSON, Vitest, pytest.

**Spec:** User's Phase 1 brief and attached UI reference. Phase 2/3 are excluded.

## Constraints and decisions

- No AI endpoints, inference, keys, credits, or paid dependencies.
- Keep the existing Notes editor, permissions, revision conflict handling, history, and recovery.
- Work in the supplied clean checkout; do not move the user's workspace or commit/push without a request.
- No schema migration: the existing JSON field can carry the additional block.
- Individual license verification; reject ShareAlike and unverified/restricted assets. Bundle files, author/source/license/modification records, checksums, and license texts.
- Native SVG is preferred over Konva's raster canvas and a second editor framework because the library and exports are vector based. Internal artwork paths remain one object; labels and arrows are independent.
- Templates are explicitly drafts until scientific review. Cite biology sources and list limits.
- Reference artwork guides layout only. Correct scientific flow takes precedence.

## Review focus

- Malicious document, SVG, URL, oversized payload, and unsupported version must fail safely.
- Network or revision-conflict save failures must retain the document and offer retry.
- Figure duplication must isolate object/document IDs; undo/redo and keyboard input must not intercept normal typing.
- Export must contain self-contained vectors, scientific Unicode, and license credits.
- Read-only Notes and legacy rich content must continue working.

## Tasks

### 1. Catalog and document model

Files: `tools/scientific-assets/ingest.py`, `frontend/src/features/scientific/{catalog.json,assets/*,document.js,document.test.js}`, `backend/app/schemas/illustrations.py`, `backend/tests/test_illustrations.py`.

- [x] Verify and ingest at least 20 useful assets where available; record pinned sources and licenses.
- [x] Test and implement schema bounds, object IDs, editing operations, copy/duplicate/group, history, and safe catalog lookup.
- [x] Extend backend notebook block validation without loosening other block validation; prove rejection and persistence/ownership with pytest.

### 2. SVG rendering, templates, and export

Files: `frontend/src/features/scientific/{IllustrationSvg.jsx,export.js,templates.js,export.test.js}`.

- [x] Render objects consistently in editor, note, thumbnail, and SVG/PNG exports.
- [x] Create ETC with authentic component derivatives, separately editable labels and arrows, correct I/III/IV pumping, II entry, Q/Cyt c, water, and ATP synthesis.
- [x] Test vector embedding, escaped labels, attribution, unavailable assets, and editable template copying.

### 3. Fullscreen studio

Files: `frontend/src/features/scientific/{ScientificStudio.jsx,StudioCanvas.jsx,StudioSidebar.jsx,studio.css,ScientificStudio.test.jsx}`.

- [x] Toolbar, searchable category library, template chooser, object inspector, credit panel.
- [x] Selection/multiselection, pointer drag/resize/rotation, keyboard move/copy/paste/delete, undo/redo, arrangement/group/alignment, zoom/pan/fit/grid.
- [x] Debounced autosave, truthful server save state, retry, unload/close guard, and accessible dialog.
- [x] Test library insertion, labels, transforms, history, and failed save recovery.

### 4. Notes integration and verification

Files: `frontend/src/features/scientific/ScientificIllustrationBlock.jsx`, `frontend/src/components/{NotebookEditor.jsx,notebookSchema.jsx}`, `frontend/src/pages/Notebooks.jsx`, integration tests, `docs/scientific-illustrations.md`.

- [x] Insert menu and slash command; embedded preview, caption, display sizing, reopen, duplicate, remove, continuation paragraph.
- [x] Pass existing notebook autosave flush/state into studio through context, preserving recovery semantics.
- [x] Run targeted then full frontend tests, notebook/backend tests, lint, production build, and actual browser workflow where supported.
- [x] Document provenance, schema, review limits, operation shortcuts, Phase 2/3 extension points, and evidence.

## Progress

Repository inspection completed: React/Vite + BlockNote; FastAPI/SQLAlchemy JSON; notebook autosave/revisions/device recovery; Radix/Lucide design conventions. No existing illustration canvas. No applicable root AGENTS.md. User supplied screenshot after initial inspection.


Final verification (2026-10-27): 408 frontend tests / 63 files passed with a 15-second UI-test timeout; 56 backend and ingestion tests passed; lint and production build passed. Browser save/reload, previews, exports, transforms and responsive layout verified against a disposable local SQLite instance. Screenshots and implementation documentation saved. Independent review findings addressed with regression coverage. ETC remains explicitly draft pending scientific review. Changes left in the supplied working tree; no commits or deployment requested. Local QA servers stopped after verification.
