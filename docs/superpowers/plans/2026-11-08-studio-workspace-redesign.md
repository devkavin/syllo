# Scientific Studio workspace redesign

> **For agentic workers:** Use executing-plans or bounded parallel development, with pure frontend tests and final code review.

**Goal:** Implement the approved after mockup as a functional extension of the existing Notes illustration studio.

**Architecture:** Keep React, native SVG, current document schema and Notes persistence. Add a persistent collapsible outline beside the canvas, explicit properties/resources tabs, curriculum packs referencing canonical catalog/template IDs, and a read-only label-practice view. Improve prepared transcription geometry using existing artwork and objects. No new runtime dependency or database schema.

**Approved design:** User's “Implement this” refers to the generated after design in this chat: larger canvas, figure outline, scientific label hierarchy, topic packs, credits preview and practice action. The mockup supplies layout direction; counts, saved state, scientific review and licensing must reflect actual data.

## Constraints

- Preserve the user's staged library expansion; work in place without resetting or committing it.
- No database mutations, application write endpoints, migrations, seeds or backend database tests without operation-specific confirmation. Test Notes save callbacks with mocks and inspect the production component without an account/backend.
- All artwork remains the approved bundled source SVGs. No generated mockup pixels become application artwork.
- Manual editing and practice use zero AI credits. Keep credits, source/review status and existing save errors.
- Practice must never change the user's document, draft, label visibility preference, history or saved content.
- Every visible control has an action. Retain insertion/builders, grouping, properties, library sync and exports.

## Tasks

- [x] Add curated curriculum pack data and browser using real asset/template IDs. Pack selection filters both views; counts are derived. Add selected-asset preview with insertion and credits. Test empty search/filter transitions and unknown IDs.
- [x] Add read-only label practice with independent typed answers, checking/reveal/retry, visible prepared-label masks, source-lettering disclosure and an empty state. Test document immutability and hidden labels.
- [x] Restructure the studio into compact header, shared toolbar, persistent outline, central canvas and right resources. Keep accessible keyboard tab controls, visibility/locks/order and an outline toggle. Selected objects make Properties available without duplicating the inspector.
- [x] Improve the transcription template's hierarchy, scientific notation, contrast and independent grouped annotation objects; keep correct complementary strands and references.
- [x] Integrate pack/practice/preview actions and add meaningful integration regressions for selection, editing, save payload and practice isolation.
- [x] Verify focused and full frontend tests, lint, production build, actual browser desktop/tablet interactions and screenshots. Review changes and record remaining limits.

## Review focus

No loss of existing Notes/save/library behavior; no auto insertion/replacement from browsing a pack; practice cannot leak edits into drafts; large groups and hidden/locked objects stay manageable; narrow viewports keep canvas and controls reachable; no false saved/review/license status; template exports retain all scientific text and provenance.

