# Scientific Illustrations Studio

## Using the feature

In an existing notebook, choose **Insert → Scientific Illustration**, or use the `/Scientific Illustration` command. The figure is a BlockNote block between normal paragraphs. Open **Edit illustration** to return to the fullscreen workspace. Caption, display width, duplication, and removal are available on the embedded figure.

The right sidebar has functional Insert, Templates, Library, and Layers tabs. Search by name, author, category, subject, or scientific tags. Click an illustration to insert it, or drag its thumbnail onto the canvas. Each scientific artwork is one vector object; its internal paths are not individually editable. Labels, arrows, connectors, annotations, and other artwork remain separate editable objects. See [Phase 2 composition and personal libraries](scientific-illustrations-phase2.md) for builders, favorites, presets, attached connections, and deployment instructions.

Select an object to edit position, dimensions, rotation, opacity, label text, and supported colors. Aspect ratio locking is available in the inspector; scientific artwork keeps its aspect ratio when resized with the canvas handle. Shape and highlighter objects are annotations, not substitutes for biological illustrations.

### Keyboard and canvas controls

- Shift + click or drag a selection rectangle for multiple objects. Group and ungroup through the inspector. Groups can move, scale, rotate, align, and change stacking order together.
- Drag objects to move; use the corner and rotation handles to transform them. Multi-selection also has shared handles.
- Arrow keys move selected objects by 1 px; Shift + arrow moves by 10 px.
- Ctrl/Cmd + C, V, D copy, paste, and duplicate within the current studio session. This is an internal object clipboard; external image/SVG paste is intentionally unsupported.
- Delete/Backspace removes selected objects. Ctrl/Cmd + Z, Shift + Z, or Y undo and redo. Input fields retain their normal typing shortcuts.
- Alt + drag, middle mouse drag, or the Pan tool pans. Ctrl/Cmd + wheel zooms at the pointer. Footer controls zoom, fit canvas, and fit content.
- Scientific labels use Unicode notation, including H₂O, FADH₂, NAD⁺, Greek letters, reaction arrows, and mathematical symbols. The inspector includes a symbol palette. Full LaTeX typesetting inside figure labels is not included; existing notebook math blocks remain available.

## Architecture and persistence

No additional runtime dependencies, rendering framework, paid service, inference endpoint, or AI credit consumption was introduced. React renders native SVG to preserve vectors. Existing BlockNote, Radix Dialog, Lucide, design tokens, notebook APIs, authentication, and SQLAlchemy persistence are reused.

The new BlockNote block type is `scientificIllustration`, with props:

| Prop | Stored value |
| --- | --- |
| `document` | Versioned illustration JSON, serialized as a string to fit BlockNote's prop model |
| `preview` | Generated PNG thumbnail data URL; blank while editing or if generation fails. Notes render stored vectors for sharp display at any size. |
| `caption` | Optional plain-text caption |
| `displayWidth` | 25–100 percent of note content width |

The structured document contains `version`, stable `id`, `title`, `width`, `height`, `background`, and `objects`. Object types are `asset`, `text`, `arrow`, `connector`, `shape`, and `highlight`. Every object has a stable ID, position, dimensions, rotation, and opacity. Assets reference an approved catalog ID, not arbitrary URLs or repeated copies of SVG source. Text has independent content, size, weight, and color. Optional `groupId` groups objects without flattening them. Lines have color, width, and endpoint direction. Template provenance includes `templateId` and `templateVersion`.

Figures are stored in the existing `Notebook.rich_content` JSON column. Figure persistence needs no new table. Phase 2 adds a separate migrated table for personal libraries, described in the linked Phase 2 document. Existing ownership checks, revision checks, conflict recovery, device drafts, history, trash/restore, and notebook JSON exports apply to the entire note including its figures. Plain-text note content includes figure titles/captions and label text.

### Significant implementation files

| File | Responsibility |
| --- | --- |
| `frontend/src/features/scientific/ScientificStudio.jsx` | Dialog workspace, history, commands, synchronous drafts, save/retry/exit and export actions |
| `frontend/src/features/scientific/StudioCanvas.jsx` | SVG scene, selection, pointer transforms, grouped transforms, panning, zoom, guides |
| `frontend/src/features/scientific/StudioSidebar.jsx` | Searchable asset cards, categories, templates, notation, inspector and credits |
| `frontend/src/features/scientific/ScientificIllustrationBlock.jsx` | BlockNote figure, preview, caption, display size, reopen/duplicate/remove |
| `frontend/src/features/scientific/document.js` | Portable schema, validation, catalog references, IDs, transformations, history and attribution |
| `frontend/src/features/scientific/IllustrationSvg.jsx` | Shared vector/label rendering for note, preview, template and export |
| `frontend/src/features/scientific/export.js`, `pngMetadata.js` | Self-contained SVG, PNG generation, preview and embedded credit metadata |
| `frontend/src/features/scientific/templates.js` | Versioned ETC template, independent objects, review notes and references |
| `frontend/src/features/scientific/catalog.json`, `assets/`, `licenses/` | Verified artwork, provenance records and license texts |
| `frontend/src/components/NotebookEditor.jsx`, `NotebookStudyTools.jsx`, `notebookSchema.jsx` | Existing Notes insertion commands, new block registration and persistence context |
| `frontend/src/pages/Notebooks.jsx`, `frontend/src/lib/notebookContent.js` | Existing autosave bridge and plain-text extraction |
| `backend/app/schemas/illustrations.py`, `academics.py`, `backend/app/data/scientific-assets.json` | Authorized notebook payload validation and deployment-safe approved catalog |
| `tools/scientific-assets/ingest.py`, `extract_etc.py` | Reproducible ingestion, SVG safety, provenance and ETC component extraction |

The adjacent Vitest tests and `backend/tests/test_illustrations.py` cover these boundaries; `tools/scientific-assets/test_ingest.py` covers ingestion safety.

Completed editor transactions synchronously enter the existing notebook draft store. That store debounces server saves, so immediate SPA navigation cannot lose the last completed canvas edit. Pointer movement is previewed locally and committed on release. Save generates a PNG preview and waits for the existing notebook `flush()` result; failed saves keep the editor open. Preview failure preserves the editable structure and falls back to the vector figure. Editing is frozen during explicit save to prevent later edits being discarded when the save closes the workspace. In-app confirmation is used for template replacement and leaving with unsynced changes; browser unload protection remains active where needed.

## Assets and licensing

The initial Phase 1 catalog contained **29 locally bundled SVG assets**. Phase 2 expands it to **46**, including detailed cells, organelles, neurons, proteins, receptors and anatomy:

- 23 individually selected [Bioicons](https://github.com/duerrsimon/bioicons) works pinned to commit `d29e766ea7580b8063c4f47b29e872db40a4d979`.
- Six independent ETC components extracted from [Electron transport chain.svg](https://commons.wikimedia.org/wiki/File:Electron_transport_chain.svg), by Mariana Ruiz (LadyofHats) and T-Fork, under CC0. The downloaded revision is checked against SHA-1 `0e5afb40a9dac14f1e163521b028457d5e2eaf2d`.
- Phase 1 licenses: **CC0-1.0** and **CC-BY-4.0**. Phase 2 adds individually verified public-domain anatomy and additional CC BY/CC0 works. Complete metadata and source evidence are retained per asset. There are no ShareAlike, BioRender, or unverified assets.

Each catalog record includes author, author link, source URL, download URL, license and license link, attribution requirement, verification date, revision, modifications, dimensions, and original/normalized checksums. Original SVG licensing metadata is retained as escaped text in normalized metadata. Full CC0 and CC BY 4.0 license texts are bundled. The backend's generated catalog copy is included in backend-only Docker deployments; tests require exact equality with the frontend catalog.

[SciDraw licensing](https://scidraw.io/licensing) and [Servier terms](https://smart.servier.com/terms-of-use/) were investigated. No files from those services were imported in this release: a blanket library license was not used to assume individual asset or standalone redistribution permission. The catalog can grow only through the explicit ingestion policy below.

### Ingestion policy

1. Select a specific work and author, and verify its individual license and redistribution rights. Prefer CC0, MIT, and CC BY. Do not automatically include ShareAlike or restrictive works; do not import BioRender artwork without permission.
2. Pin the upstream revision and record evidence, author, license, attribution, and modification notices. Never remove existing asset IDs while documents still reference them; use a new ID for a materially changed asset.
3. Use `tools/scientific-assets/ingest.py` for the explicit Bioicons allowlist. Use `extract_etc.py` for the checksum-pinned ETC derivatives. Both are manual maintenance tools, not runtime downloads.
4. Ingestion rejects scripts, event handlers, foreignObject, embedded images, animation, XML entities, external resource references, and unsupported stylesheets. Supported Illustrator class rules are converted to safe inline styles. Editor-specific XML is removed while original licensing metadata is retained.
5. Run catalog tests to verify every file, checksum, metadata record, SVG sanitizer result, and backend catalog synchronization. Run the actual browser thumbnail and vector export checks.

Commands from repository root:

```powershell
python tools/scientific-assets/ingest.py
python tools/scientific-assets/extract_etc.py
```

If a system Python trust store cannot validate Wikimedia's certificate, download the exact HTTPS source with a trusted client and pass its local path to `extract_etc.py`. The checksum check remains mandatory; do not disable TLS verification. Re-run both commands when updating the catalog so the ETC entries are retained after Bioicons ingestion.

## Electron Transport Chain template

The reusable template registry records ID, subject/category, description, version, canvas dimensions, editable document, attribution records, scientific references, and review status. The document itself renders the preview, so thumbnails cannot drift from the template composition. Selecting a template creates a copy with fresh document, object, and group IDs.

The ETC template includes a source-derived phospholipid bilayer, complexes I–IV, ATP synthase, independent CoQ and cytochrome c labels, compartments, donor labels, proton transport, electron transport, oxygen reduction to water, and ADP + Pᵢ → ATP. Complexes I, III, and IV pump upward from matrix to intermembrane space; II does not pump. ATP synthase returns protons into the matrix. I and II enter the Q pool independently; the I route is drawn above II to avoid implying a serial I → II pathway. Cytochrome c is drawn outside the membrane.

The template is visibly **Draft · scientific review required**. The licensed protein artwork is schematic, not a molecular surface or atomic structure. This limitation is shown in the template's scientific notes. Species-specific stoichiometry and the final educational presentation require a qualified scientific reviewer before the template can be marked verified. References include [NCBI's ETC overview](https://www.ncbi.nlm.nih.gov/books/NBK526105/) and the primary review [Structure and function of mitochondrial membrane protein complexes](https://pmc.ncbi.nlm.nih.gov/articles/PMC4625866/). The reference UI screenshot is not used as scientific evidence.

## Export and safety

SVG export loads only bundled catalog files, validates them again, embeds their vector content, namespaces definition IDs per instance, and escapes labels. It is self-contained, with complete credits and modification notices in SVG metadata. PNG export rasterizes the same SVG at 2× document resolution and embeds UTF-8 attribution in a checksum-validated PNG iTXt chunk without altering its pixels. **Credits & licenses → Download credits** provides an explicit text download for publication. Exports do not rely on browser permission for a second automatic download. Use those credits when publishing an attribution-required figure.

Previews use the same SVG rendering path at up to 560 px. Browser PNG generation can fail without preventing structured saves. User-supplied SVG/HTML or arbitrary asset URLs are not accepted. Documents are bounded to 600 objects, 350 KB of UTF-8 JSON, and 200–4000 px canvas dimensions; previews and whole notebooks have separate bounds. Unsupported versions and missing assets show an explicit error/fallback and retain the original stored document. Saving/exporting a document with an unapproved asset reference fails visibly instead of silently omitting scientific artwork.

## Verification

Phase 1 verification (2026-10-27): **408 frontend tests across 63 files passed**, **56 backend/ingestion tests passed**, ESLint passed, and the production build completed successfully. The completion gate additionally fixed grouped alignment, huge-integer validation, and oversized preview handling, with regressions. Current Phase 2 verification is recorded in the linked Phase 2 document. The full frontend run used the command below with a 15-second UI-test timeout. One earlier concurrent-build run timed out in the existing Reviews schedule-retry test at the default 5 seconds; it passed in isolation and in the final complete suite. The only build diagnostic was Vite's large-chunk warning.

Unit/integration coverage includes document round trips and transformations, grouped scaling/rotation, undo/redo branching, Unicode byte limits, SVG active-content rejection, actual bundled SVG integrity and definition references, template scientific direction checks, export metadata, Notes insertion/reopen/duplicate/read-only behavior, immediate-navigation draft retention, save-in-flight mutation protection, malformed backend payload rejection, revision conflicts, ownership, and unchanged AI credits.

Browser verification used a disposable, local SQLite-backed Syllo instance with normal authentication and notebook APIs. It verified insertion through the existing Notes menu, asset search/insertion, aspect-preserving resizing, rotation, duplication, multi-selection, grouped rotation, undo, Unicode label editing, SVG and PNG downloads, explicit save with generated preview, caption/display sizing, and full-page reload followed by reopening 57 independent template objects. The downloaded SVG contained 202 vector paths, zero image elements, unique definition IDs, and complete attribution metadata. The downloaded PNG was 3200 × 1800. PNG metadata insertion was independently checked with Node's CRC implementation and by decoding both images to prove their pixels were identical.

Actual implemented UI screenshots:

- [Desktop studio](screenshots/scientific-studio.jpg)
- [Notes embedding after save/reload](screenshots/scientific-notes.jpg)
- [Narrow responsive layout](screenshots/scientific-studio-narrow.jpg)

The independent implementation review identified save-in-flight edits, immediate-navigation draft retention, malformed set membership in backend validation, a Unicode byte-limit mismatch, and grouped transforms. These were reproduced and addressed with regression coverage. The production build retains Vite's large-chunk warning for the existing BlockNote/Mermaid editor graph; this feature adds no canvas dependency and loads the studio lazily.

```powershell
# In frontend/ (the explicit API value neutralizes workstation-only .env overrides):
$env:VITE_API_BASE_URL='/api'
npm run test:run -- --maxWorkers=2 --testTimeout=15000
npm run lint
npm run build

# From repository root:
.venv/Scripts/python.exe -m pytest backend/tests/test_rich_notebooks.py backend/tests/test_illustrations.py backend/tests/test_academic_crud.py tools/scientific-assets/test_ingest.py -q -n 0 --basetemp=.cache/pytest-studio --tb=short
```

## Phase 2 and Phase 3 boundaries

Phase 2 extends the existing studio with personal libraries, reusable compositions, attached connectors, layers, scientific builders and additional draft templates. Its implementation and scientific review limitations are documented in [Scientific Studio Phase 2](scientific-illustrations-phase2.md).

Phase 3 may produce documents in this same schema through an optional explicit AI action. AI output must pass the same catalog, document, ownership, licensing, and review checks. The existing manual/template editing path must retain zero AI credit consumption. No Phase 3 functionality or paid generation service has been added.
