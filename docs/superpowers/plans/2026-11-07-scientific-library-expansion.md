# Scientific Library Expansion Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans and bounded independent curation/template tasks. Continue the user's existing request to expand Scientific Studio; use the established architecture and licensing policy.

**Goal:** Turn the 46-asset/10-template starter collection into a much larger, useful biology library: approximately 250–350 individually approved vector assets and 30–40 substantive editable templates, subject to source quality and availability.

**Architecture:** Preserve the version-2 document, stable catalog IDs, existing Notes block and personal library. Curate pinned source artwork into the existing static catalogs. Add topic coverage and source locks, improve search and bounded browsing, and extend the existing review-gated template registry. No new runtime service, rendering dependency or schema migration is needed.

**Audience confirmed by the user:** School/A-level and introductory university biology.

## Constraints

- Every new illustration is genuine scientific source artwork with individual author/license/source/checksum evidence. Existing IDs and asset bytes remain stable.
- Prefer CC0 and CC BY 4.0; exclude unreviewed ShareAlike/restrictive works, BioRender and ambiguous standalone redistribution sources. Embedded raster wrappers do not count as vector assets.
- Count useful structures and workflows, not cosmetic variants, logos or arbitrary color changes.
- All new educational templates remain drafts with citations and specific scientific/artwork limitations until qualified review. No fabricated scientific approval.
- Zero AI credits for core library/template operations. Keep the existing React/native SVG and BlockNote integration.
- The user's standing database rule applies: **do not execute database mutations, migrations, seeds, or DB-writing tests/endpoints without explicit operation-specific confirmation**. This expansion uses files and pure frontend/ingestion verification. Backend database tests and browser saving flows are excluded from this run unless separately approved.

## Approaches considered

Bulk importing the complete upstream catalog would add duplicates, unrelated items and unverified formats/licenses. Runtime federation would introduce availability and licensing dependencies. The selected approach is curated topic packs, bundled artwork, reusable editable compositions and scalable local browsing.

## Tasks

### 1. Licensed asset packs

Files: `tools/scientific-assets/{expand_library.py,library-selection.json,library-source-lock.json,test_expand_library.py}`, `frontend/src/features/scientific/{catalog.json,assets/,licenses/}`, generated `backend/app/data/scientific-assets.json`, `docs/scientific-library-coverage.md`.

- [x] Record useful source selections, individual license evidence, categories/tags, excluded candidates and coverage gaps.
- [x] Implement deterministic curation using existing sanitizer/normalizers; pin approved source bytes and merge stable records.
- [x] Add independent organelles, nucleic-acid/genetic components, immune structures, anatomy, plants/microbes and laboratory equipment where authentic artwork is available.
- [x] Verify actual normalized vectors, local thumbnails, unique definitions, complete credits and frontend/backend catalog parity. Inspect contact sheets visually.

### 2. Large-library discovery and rendering

Files: `frontend/src/features/scientific/{librarySearch.js,librarySearch.test.js,StudioLibrary.jsx,StudioLibrary.test.jsx,StudioTemplates.jsx,StudioTemplates.test.jsx,document.js,studio.css}`.

- [x] Add shared tokenized, accent/punctuation-tolerant search over names, tags, subjects and aliases; use common biological search synonyms.
- [x] Bound the number of mounted asset and template previews, provide working load-more controls, and reset the visible result window when filters change.
- [x] Keep favorites/recent/custom components/presets working through their existing API. No live database operations are needed to verify the UI; use isolated mocks.
- [x] Keep small SVGs as separate built assets rather than embedding the growing collection into the JavaScript bundle. Use Vite's documented explicit no-inline import.

### 3. Substantive educational templates

Files: new `templates/libraryTemplates.js`, topic modules under `templates/library/`, `templates/libraryTemplates.test.js`, registry `templates.js`, `docs/scientific-template-coverage.md`.

- [x] Add approximately 24–30 distinct drafts that complement the existing ten, using genuine artwork plus independent biological labels, arrows and conventional reaction notation.
- [x] Prioritize cell transport/trafficking, molecular/genetic processes, energy metabolism, immunity, plant/physiology and experimental workflows. Adopt only confirmed catalog IDs.
- [x] Store sources, review limits, canvas geometry and current complete attribution. Test important graph direction, label/binding independence and draft review status.
- [x] Visually inspect actual exported compositions, fix clipping/overlap, and retain honest limitations where specialized artwork remains unavailable.

### 4. Integration and release evidence

- [x] Integrate registry and topic browsing; preserve existing notes and stable source references.
- [x] Run pure ingestion tests, catalog/export tests, frontend regressions, lint and production build. Do not run DB-writing test suites under the standing database rule.
- [x] Review licensing/sanitizer boundaries and the larger-library UI for regressions. Record exact counts and remaining gaps rather than claiming comprehensive coverage.
- [x] Document the maintenance workflow, actual content coverage and remaining scientific review. Runtime persistence is unchanged.

## Review focus

Conflicting source license evidence must reject an import; old asset IDs and files must remain stable; duplicate variants must not inflate coverage; search and favorites must operate over all results while only a bounded subset mounts; source definitions and credits must survive export; templates must use actual available artwork and retain correct directional relationships; no database writes may be executed without the user's explicit confirmation.

## Final outcome

Delivered 174 approved assets (128 additions) and 35 template drafts (25 additions). The aspirational 250–350 asset target was reduced after 78 technical exclusions and one visual exclusion. Standalone organelle and specialized structure gaps are documented in `docs/scientific-library-coverage.md`; unavailable art was not fabricated. Fresh validation: 713 frontend tests, 16 pure ingestion tests, lint and production build passed. No database writes or migrations were executed. Desktop/tablet screenshots and actual browser SVG export were inspected. Human scientific review remains outstanding for all draft templates.
