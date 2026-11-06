# Scientific Studio Phase 2

Phase 2 extends the existing Notes studio after the Phase 1 completion gate. It reuses React/native SVG, BlockNote, authentication, notebook autosave, and the application's database/API conventions. No runtime dependency or paid service was added. Manual editing, templates, personal libraries, saving, previews and export consume zero AI credits.

## Student workflow

- **Library → Assets** searches the bundled catalog by scientific tags, subject, category, name and author. Star artwork for Favorites; Recent records up to 24 inserted assets across devices.
- **Insert → Cell membrane** configures length, orientation, number of proteins and approved channels, receptors or membrane complexes. The bilayer and biological components use genuine bundled vector artwork.
- **Insert → Biochemical process** arranges two to six chosen illustrations, editable labels and directional interactions. Connections follow their targets. This composition aid does not validate an arbitrary user-created biological mechanism.
- **Insert → Anatomy & labels** uses inspected landmarks for heart, digestive and respiratory artwork, with prepared independent labels and pointers, optional initial visibility and annotation color. The heart's source lettering is baked into its vector artwork and cannot be hidden; the UI explicitly discloses this. Source labels were removed from the two new anatomical derivatives, preserving credits and modification notices.
- **Library → Components** saves selected objects together. Reinserting creates independent IDs and bindings. Ungroup to edit each part.
- **Library → Presets** saves the current canvas for reuse. Loading a preset or template asks inline before replacing a nonempty figure and remains undoable.
- **Layers** selects, renames, hides, locks and orders objects. Hidden artwork remains stored and is excluded from previews and exports. Locking protects against direct canvas transforms and keyboard/inspector changes. Alignment and distribution preserve each selected group's internal offsets.
- Select an arrow/connector to choose its start/end targets and anchors. Choose free endpoints to detach. Attached geometry comes from target positions; its inspector explains how to reposition it. Deleting a target retains a detached endpoint at its last position.
- Prepared labels can be hidden globally while retaining them as editable objects. Individually hidden layers remain hidden. Two-finger pinching zooms and pans the canvas; single-finger pointer manipulation and larger touch handles support tablets.

Library failures display retry controls and retain queued commands while the studio remains open. A failed command can be discarded so other library operations can proceed. Leaving with an unsynced library warns explicitly; the figure itself remains in the existing Notes draft system. Library availability never gates ordinary scientific editing.

## Portable schema and backward compatibility

New figures use document **version 2**. Both frontend and backend continue accepting version 1. Opening a v1 figure upgrades its version in memory without changing IDs, labels or transformations; it is persisted through the ordinary next save.

Optional v2 fields are additive:

| Location | Fields |
| --- | --- |
| Document | `showLabels` |
| Object | `name`, `role`, `hidden`, `locked`, `isLabel`, `labelFor` |
| Arrow/connector | `startBinding`, `endBinding` |
| Binding | `objectId`, `anchor`; normalized `u`/`v` for inspected point landmarks |

Bindings reference existing non-line objects. Anchors are left/right/top/bottom/center or a normalized point transformed with target rotation. Unknown fields, invalid types, dangling references, nonfinite coordinates and unapproved assets are rejected. Duplication remaps internal object/label/binding references and detaches references outside the copied selection. The shared resolver drives canvas rendering, previews, SVG and PNG export. Artwork stays catalog-referenced rather than embedded repeatedly in notes.

## Account-owned persistence and deployment

Notebook figures still use `Notebook.rich_content` and all existing ownership/revision/draft protections. Personal collections use the new **`scientific_libraries`** table, keyed by the authenticated `users.user_id`, with cascading deletion, JSON data, revision and timestamps.

Deploy the backend migration before serving the new personal-library API:

```powershell
# From the repository root, with DATABASE_URL exported by the deployment environment:
.venv/Scripts/python.exe -m alembic -c backend/alembic.ini upgrade head
```

Migration `20261027_0014_scientific_library.py` follows `20261011_0013`. Its upgrade/downgrade, metadata drift and cascade behavior are covered by tests. It does not rewrite notebook data. Migration files are supplied; no production database has been changed during implementation.

`GET /api/illustrations/library` returns `{revision,favorites,recent,items}`. `PATCH` sends an expected revision and one strict `favorite`, `recent`, `save` or `remove` command. The server derives ownership from the authenticated session and serializes writes with the application's owner lock. Conflicts return 409 plus the current state. The client serializes commands and safely reapplies idempotent desired actions; conflicting changes to the same saved item require explicit retry. The library is bounded to 20 saved items and 2,000,000 UTF-8 bytes; each document retains the 600-object/350 KB limit.

## Scientific assets and review

The catalog has **46 locally bundled SVG vectors**: 30 CC0, 14 CC BY 4.0 and two public-domain works. Phase 2 adds 17: detailed animal/plant cells, bacterium, restriction enzyme, RNA hairpin, folded protein ribbon, amino-acid backbone, nuclear pore, motor/inter/sensory neurons, bacterial ribosome with mRNA, membrane receptor, nucleus, chloroplast, digestive system and respiratory system.

Licenses are individually verified CC0, CC BY 4.0, or public domain. Sources are pinned Bioicons works and specific Wikimedia originals by LadyofHats/Jmarchn. SwissBioPics organelles are extracted from named source groups. Every record retains author, source, revision, license, verification date, modifications and checksums. Public-domain source evidence is bundled in `licenses/public-domain-ladyofhats.txt`. Attribution stays available in the editor and embedded in exports, including reused personal components. Raster-only “SVG” protein wrappers and ShareAlike alternatives were excluded. Source-baked sequence/atom lettering is flagged honestly.

`tools/scientific-assets/expand_phase2.py` reproduces the allowlisted additions and merges catalog IDs rather than replacing older entries. Run ingestion tests and the frontend catalog tests after any update; backend and frontend catalog copies must remain identical. Sanitization rejects active content, external references, embedded raster images and unsupported XML/styles. Normalization preserves safe gradient definitions and original license metadata.

## Templates and scientific review gate

Ten editable templates are available: Electron Transport Chain, Photosynthesis, Krebs cycle, Glycolysis, Neuron and synapse, Cell structure, DNA replication, Protein synthesis, Digestive system and Respiratory system.

All are explicitly **drafts requiring scientific review**. Biology references, intended scope and artwork limitations are included with every template. Some are concept or pathway overviews rather than detailed spatial molecular mechanisms; they say so. Exact replication-fork and synapse ultrastructure artwork is not fabricated from generic shapes.

`validateTemplate` checks document integrity, dimensions, references and complete current attribution. Marking a template `verified` additionally requires a named reviewer, an ISO review date, an approved decision and a matching `templateVersion`. Automated validation is structural/provenance validation, not expert scientific approval. No human review or approval is fabricated. Before publishing a verified template, a qualified reviewer must check arrow direction, compartments, notation, species context, stoichiometry and educational presentation, then record approval for that exact version.

## Significant implementation files

| Files | Purpose |
| --- | --- |
| `document.js`, `composition.js`, `geometry.js`, `reusable.js` | Portable v2 validation, reference-safe transforms, grouping and reusable copies |
| `ScientificStudio.jsx`, `StudioCanvas.jsx`, `touch.js` | Editor transactions, protected editing, pinch/pan, library integration |
| `StudioSidebar.jsx`, `StudioInspector.jsx`, `StudioLayers.jsx`, `StudioLibrary.jsx`, `StudioTemplates.jsx`, `StudioBuilders.jsx` | Working composition, property, catalog and personal-library controls |
| `builders.js`, `templates/advancedTemplates.js`, `templateReview.js` | Prepared scientific compositions and review-gated templates |
| `useStudioLibrary.js`, `libraryApi.js` | Account-scoped serialized requests, conflicts and recoverable errors |
| `backend/app/api/routes/illustrations.py`, `schemas/illustration_library.py`, `models/illustrations.py` | Owned library API and bounded persistence |
| `backend/app/schemas/illustrations.py`, `backend/alembic/versions/20261027_0014_scientific_library.py` | Backward-compatible server validation and additive migration |

Frontend paths in the table are relative to `frontend/src/features/scientific/`. Existing Notes integration files are listed in the Phase 1 document.

## Verification and remaining work

Verification on 2026-10-28:

- Full frontend regression: **459/459 tests across 71 files passed**. A final display-only polish then switched Notes from enlarged PNG thumbnails to sharp stored vectors; the updated **11/11 Notes tests passed**, including its new regression. The rest of the focused scientific/Notes suite also passed; an initial assertion incorrectly concatenated wrapped SVG text lines and was corrected to compare rendered line content.
- Full backend regression: **297 passed, 3 skipped**. This includes authenticated library ownership, concurrent initial/existing-row writes, 409 conflicts, capacity/UTF-8 bounds, v1/v2 notebook and personal-library round trips, unchanged credits and migration upgrade/downgrade/cascade checks. The only backend warning was an existing `google.genai` deprecation warning.
- **11 ingestion tests passed**. The three frontend catalog tests are included in the frontend total. All 46 actual asset files and synchronized backend catalog records were checked. Curation was verified byte-identical on a repeated run.
- Independent implementation review found hidden group members staying behind on group transforms. Keyboard and pointer regressions now cover the fix while preserving locked objects. New tests cover pinch cancellation, failed-library-command discard, and continuing normal Notes saving when the library cannot load.
- All ten templates export self-contained vectors, complete attribution and unique definition IDs; hiding prepared labels removes them from the exported figure. Review checks retain all templates as drafts and reject incomplete approval records.
- **ESLint and the final production build passed** after vector display polish. The build retains Vite's existing large-chunk warning for the BlockNote/Mermaid graph; no new canvas or paid runtime dependency was added.

The browser workflow used disposable local SQLite databases with normal Syllo authentication and notebook APIs. It verified Notes insertion, actual asset search and favorites, component save/reinsert, preset save/reload, membrane composition, anatomical labels, full-page reload, and reopening all 21 objects in the new respiratory figure. Hiding labels rendered seven objects and restoring them rendered all 21. PNG previews generated successfully. The actual browser SVG download was **1600 × 1000**, contained **120 vector paths and no embedded images**, and retained attribution metadata. Notes now render the saved SVG objects directly, preserving sharpness when the displayed figure is enlarged; the PNG thumbnail is still stored for thumbnail/external HTML uses.

Actual implemented UI screenshots:

- [Desktop ETC studio and expanded library](screenshots/scientific-studio-phase2.jpg)
- [Respiratory template, independent labels and layers](screenshots/scientific-studio-phase2-anatomy.jpg)
- [Crisp vector figure embedded in Notes](screenshots/scientific-notes-phase2.jpg)
- [Narrow tablet workspace](screenshots/scientific-studio-phase2-tablet.jpg)

Re-run the checks from the repository root (the frontend commands run inside `frontend/`):

```powershell
$env:VITE_API_BASE_URL='/api'
npm --prefix frontend run test:run -- --maxWorkers=2 --testTimeout=15000
npm --prefix frontend run lint
npm --prefix frontend run build
.venv/Scripts/python.exe -m pytest backend/tests -q -n 0 --basetemp=.cache/pytest-studio-backend --tb=short
.venv/Scripts/python.exe -m pytest tools/scientific-assets/test_ingest.py -q -n 0 --basetemp=.cache/pytest-studio-ingestion --tb=short
```

Scientific expert review is still required before educational templates can be called verified. Further catalog breadth and more specialized prepared molecular artwork can be added through the same ingestion/review process. Phase 3 remains unimplemented: a future optional AI adapter may emit this schema and must pass the same document, asset, ownership and review checks. It must never introduce AI credits into ordinary composition or editing.
