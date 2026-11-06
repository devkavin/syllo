# Scientific Studio Phase 2 implementation plan

> **For agentic workers:** Use superpowers:executing-plans. The user explicitly authorized completing the Phase 1 gate and proceeding directly through Phase 2.

**Goal:** Extend the existing Notes studio with reusable scientific composition, account-owned libraries, advanced arrangement, and a reviewed-template publishing process.

**Architecture:** Keep React/native SVG and BlockNote. Add an explicit version-2 portable document with a lossless v1 migration, optional hidden/locked layers and endpoint bindings. A single owned library table stores favorites/recent use and saved components/presets, using the application's authentication and SQLAlchemy patterns. Templates stay drafts until the scientific-review record and automated validation both pass.

**Constraints:** No AI credit consumption, paid runtime dependencies, asset hotlinks or replacement of biological artwork with generic annotation shapes. Preserve old notes and licensed metadata. New database storage requires an Alembic migration. No deployment, commit or push requested.

## Phase 1 gate (completed before Phase 2 implementation)

- Existing implementation and acceptance criteria independently reviewed.
- Fixed grouped alignment to translate groups as units, oversized numeric validation to reject before float conversion, and preview generation to downsample under the server limit.
- Fresh gate: 41 frontend tests passed, 57 backend/ingestion tests passed; additional preview regression then passed with all 9 export tests. Previous complete suite was 408/408 and real-browser Notes/export/reload verification is documented in `docs/scientific-illustrations.md`.
- ETC remains explicitly draft, with schematic artwork and scientific review requirement disclosed, as permitted by the original Phase 1 acceptance criteria.

## Approach

An additive extension to the existing SVG document/editor preserves vectors and avoids replacing the canvas. A separate canvas framework would add redundant rendering, serialization and license boundaries. Account-owned API storage is preferred over browser-only favorites/presets because students expect the library on their other devices.

## Tasks

### 1. Portable document and arrangement

Files: `frontend/src/features/scientific/{document.js,composition.js,IllustrationSvg.jsx,StudioCanvas.jsx,export.js}`, `backend/app/schemas/illustrations.py` and corresponding tests.

- [x] Test and implement lossless v1 → v2 document migration; validate hidden/locked/name/binding fields and reference integrity on client and server.
- [x] Resolve attached arrows/connectors after transforms, duplication and deletion. Preserve independent objects and vector exports.
- [x] Add group-aware alignment/distribution, visible layer ordering, locking and hide/show.
- [x] Improve touch hit targets, pinch zoom and touch panning while preserving keyboard workflows.

### 2. Owned personal library

Files: `backend/app/{models/illustrations.py,api/routes/illustrations.py,schemas/illustration_library.py}`, migration `20261027_0014_scientific_library.py`, `frontend/src/features/scientific/{useStudioLibrary.js,libraryApi.js}`.

- [x] Test and implement authenticated favorites/recent-use operations and saved component/preset CRUD with revision conflicts, bounded payloads, attribution retained through catalog references and no cross-user access.
- [x] Add migration upgrade/downgrade verification. Keep notebook persistence unchanged.
- [x] Surface loading/save/error/retry states. Manual editing must remain usable if the personal-library service is unavailable.

### 3. Scientific builders and asset catalog

Files: `builders.js`, `StudioBuilders.jsx`, catalog/assets/ingestion tools and tests.

- [x] Expand the individually licensed catalog across additional scientific subjects, preserving pinned sources/checksums and backend catalog synchronization.
- [x] Membrane builder: length, orientation, prepared bilayer, membrane proteins/channels/receptors.
- [x] Process builder: approved scientific artwork, editable labels, directional interactions and attached connectors.
- [x] Anatomy composition: prepared artwork, optional predefined independent labels/pointers, supported annotation colors, label visibility.
- [x] Save selected groups as custom components; save/load canvas presets as independent copies.

### 4. Templates, review process and UI integration

Files: `templates/*`, `templateReview.js`, `StudioLayers.jsx`, `StudioSidebar.jsx`, `ScientificStudio.jsx`, `studio.css`.

- [x] Create available scientifically sourced templates from genuine approved artwork: photosynthesis, Krebs cycle, glycolysis, neuron/synapse, cell structure, DNA replication, protein synthesis, digestive and respiratory composition where suitable art is available.
- [x] Store references, limitations and validation checks. Require version-matched scientific reviewer metadata before marking a template verified. Never fabricate reviewer approval.
- [x] Integrate subject filters/tags, favorites/recent assets, components/presets, builders, layers, smart connector properties and template customization controls into the existing sidebar.
- [x] Run regression tests, full suite, build/lint, migration checks, actual browser workflow and updated screenshots. Document unavailable asset or human scientific-review blockers accurately.

## Review focus

Hidden and locked objects must remain stored but render/edit correctly; bound endpoints must not drift after rotation/group transforms; deleting/duplicating targets must not leave invalid references; personal libraries must not leak between accounts; save failures must not lose components or notes; older notes must preserve their transforms/labels; credit metadata must follow reused artwork and exported diagrams.

## Completion record · 2026-10-28

Phase 2 implementation and review fixes are complete. The catalog contains 46 licensed vectors, and ten draft templates have structural/provenance checks plus a human scientific-review gate. The independent review's hidden-group drift issue is fixed with keyboard/pointer regressions. Capacity failures can be discarded without blocking library management; unavailable personal libraries do not block ordinary Notes saving.

Verification: full frontend suite 459/459 across 71 files; final Notes display polish 11/11 tests, including a new regression. Full backend suite 297 passed/3 skipped; 11 ingestion tests passed. ESLint and the final production build passed (existing large-chunk warning). Browser proof covers personal-library persistence, builders, Notes save/reload, independent anatomy labels and actual self-contained SVG export. Actual desktop/tablet/Notes screenshots and deployment instructions are linked in docs/scientific-illustrations-phase2.md.

No production database, deployment, commit or push was performed. Apply the supplied migration with the deployment DATABASE_URL before enabling personal-library persistence. Scientific expert review remains required before any draft template is marked verified. Phase 3 remains unimplemented.
