# Scientific Illustration Studio workspace redesign

The approved “after” mockup is implemented in the existing Notes studio. This release changes the workspace and learning interactions; the collection remains 174 individually licensed assets and 35 scientific template drafts.

## Implemented behavior

- A fullscreen workspace with a compact Syllo header, shared drawing/arrangement toolbar, larger fitted scientific canvas and dedicated resources pane. The existing grid is optional; all zoom values reflect the actual rendering scale.
- A persistent, collapsible Figure outline. Prepared groups are collapsed into meaningful rows; title, legend and review objects are available under Figure details. Expand a group and choose a member to edit its text or properties independently. Groups retain visibility, locking and member ordering controls.
- Assets, Templates, Properties and Insert tabs. Selecting an object opens Properties; returning to Assets retains the search and selected curriculum pack. Existing personal components, presets, favorites, recent items, builders and source credits remain available.
- Four curated curriculum packs: Gene expression, Cell biology, Energy and metabolism, and Laboratory workflows. All counts derive from real canonical asset/template IDs. Browsing a pack does not replace or insert anything. Applying a template to a populated figure retains the existing inline confirmation and undo behavior.
- Explicit artwork previews with a larger local image, source URL, author, license, attribution requirement, modification information and insert action. Previewing works without an account.
- A functional Arrange menu using the existing forward/backward, grouping, alignment and distribution commands.
- Read-only label practice: numbered masks, typed answers, checking, reveal, next, completion and retry. Case and extra spaces are ignored; scientific notation remains significant. Practice uses a detached document copy and never writes answers into Notes, undo history or drafts. Explicitly hidden layers are excluded; the editor's global label visibility preference is preserved. Source lettering inside artwork cannot be masked and is disclosed.
- The transcription-strand template now has a stronger title hierarchy, genuine DNA artwork, separate pastel strand-name chips, readable sequence notation, bound direction arrow and legend. It is version 2; existing saved version-1 user figures are not rewritten. It remains a draft with its scientific references and review limits.
- The tablet layout keeps the canvas above the resource browser. The outline can be opened as a side panel, and entering practice hides that panel so it cannot obscure the exercise. Practice has a sticky return control; leaving through Notes returns to editing before any save confirmation.

## Significant files

The studio shell and integration are in `frontend/src/features/scientific/ScientificStudio.jsx`, `StudioSidebar.jsx` and `workspace.css`. `StudioOutline.jsx`, `StudioLayerOutline.jsx`, `StudioArrange.jsx` and `layerNames.js` provide the workspace controls. `packs.js`, `StudioPacks.jsx`, `StudioAssetPreview.jsx`, `StudioLibrary.jsx` and `packs.css` provide discovery and provenance. `practice.js`, `StudioPractice.jsx` and `practice.css` provide the isolated practice session; `IllustrationSvg.jsx` has an optional descriptive-title switch for its masked preview. The template is in `templates/library/geneticInformation.js`.

React, BlockNote, native SVG, version-2 illustration documents and current Notes permissions/persistence remain in use. There are no new runtime dependencies, migrations, backend changes, AI services or paid runtime requirements. Generated mockup pixels were not imported as scientific artwork.

## Verification

- Full frontend suite: **736 tests passed across 82 files** with one worker. The final targeted integration run also passed **19 tests**, including independent member editing, practice/save separation, Notes leave confirmation and retained pack/search state.
- Existing template tests validate portable SVG exports, source references, attribution, geometry and scientific direction. New template-specific tests check the exact complementary sequences, group independence and prepared-template version.
- Lint and production build passed. Vite retains its large-chunk warning for the existing Notes/editor dependency bundle.
- Independent code review found two practice navigation issues; both were fixed and covered before completion. Review of the grouped outline and compact packs found no additional blocker.
- Browser inspection used the actual production Studio component in an ignored frontend-only harness with account APIs disabled. Checks included the desktop workspace, curriculum filtering, explicit source preview, independent RNA-label editing and undo, a correct practice answer, return to the unchanged editor, and the 740px tablet breakpoint. No login or live database save endpoint was used.

Actual UI screenshots:

- `docs/screenshots/scientific-studio-redesign-desktop.jpg`
- `docs/screenshots/scientific-studio-redesign-tablet.jpg`
- `docs/screenshots/scientific-studio-label-practice.jpg`

All database-mutating verification remains subject to the user's standing operation-specific confirmation requirement. No database changes, migrations or backend database tests were executed for this redesign. Template subject-matter approval remains a separate human review step; the UI does not claim that drafts have been scientifically verified.
