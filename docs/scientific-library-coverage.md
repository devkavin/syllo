# Scientific Illustration Studio: expanded biology library

## Delivered scope

The collection now contains **174 bundled SVG illustrations** (46 existing + 128 additions) and **35 editable template drafts** (10 existing + 25 additions). The audience is school/A-level and introductory university biology, as confirmed by the user. This is a larger curated teaching collection, not comprehensive scientific coverage.

| Populated asset topic | Illustrations |
| --- | ---: |
| Cell Biology | 26 |
| Molecular Biology | 22 |
| Genetics | 10 |
| Biochemistry | 26 |
| Plant Biology | 26 |
| Microbiology | 17 |
| Immunology | 8 |
| Human Anatomy | 7 |
| Neuroscience | 3 |
| Laboratory | 29 |
| **Total** | **174** |

Legacy `Anatomy` records are presented under Human Anatomy without changing their stable IDs or original metadata. Examples of additions include amino-acid structures, nucleobases, RNA loops, chromatin, CRISPR, promoter/enhancer relationships, immune cells and membrane complexes, detailed microbial cells, plant/root anatomy, development stages, centrifuges, thermal cyclers and microscopy equipment. Source schematic symbols remain identified as source artwork; they are not molecular surface models.

## Licensing and ingestion evidence

All 128 additions come from individually selected [Bioicons](https://github.com/duerrsimon/bioicons) entries at immutable revision `d29e766ea7580b8063c4f47b29e872db40a4d979`: **65 CC0-1.0** and **63 CC-BY-4.0**. Authors include B--Gideon-Bergheim, Emmett Leddin, DBCLS, SwissBioPics/Philippe Le Mercier, Marcel Tisch, ChenxinLi and the other authors named in each catalog record. The complete collection also retains two previously bundled public-domain Wikimedia anatomical illustrations.

The repository's software license is not used as an artwork license. Each candidate must match its exact name, author, category and license in the checksum-pinned source index. Each approved file has its own source URL, raw source checksum, normalized checksum, author, license URL, attribution requirement, revision, verification date and modification description. Original licensing metadata is retained as escaped SVG metadata. Existing CC0/BY license texts remain bundled in `frontend/src/features/scientific/licenses/`.

The import retained 128 additions from 207 original candidates. Seventy-eight failed technical review: 34 XML-entity-bearing sources, 22 embedded-raster wrappers, 14 unresolved vector references, three unsupported foreign-content structures, three empty sources, and two sources without usable paths. These are exclusions by the current conservative importer, not declarations that the underlying licenses are invalid. One further source was removed after visual QA because its original title was clipped. Two other proposed names were ambiguous in the allowed-license index and were never downloaded as selections. The initial 250–350 estimate was reduced to the actual approved set instead of padding the collection.

`library-selection.json` retains explicit selected/excluded works; `library-source-lock.json` retains per-file evidence and rejection reasons, including evidence for the visually excluded file. `expand_library.py` reuses the existing sanitizer and reviewed DBCLS/SwissBioPics preparation. It rejects active content, external references, conflicting individual CC metadata, oversized sources, raster wrappers, duplicate IDs and unresolved definitions. Four plant illustrations have reviewed viewBox crops that remove empty page margins; paths remain unchanged and the crops are declared as modifications.

SciDraw and Servier assets were not added in this pass. No blanket license assumption, ShareAlike import, BioRender artwork or generated substitute was used.

## Editor, Notes and export integration

The existing React/native SVG editor, version-2 documents, Notes block, authorization and personal-library API remain in use. New assets use stable catalog IDs. The backend's static catalog is synchronized with the frontend so its document validator recognizes the same assets; deploy both catalogs together. There is no migration, database update or new runtime dependency.

Search matches all query words across names, topics, tags, subjects, aliases and authors, with accent/punctuation normalization and biology aliases such as mitochondria, ER and tRNA. Favorites/recent filtering operates on the full catalog before pagination. The browser mounts 30 asset thumbnails or eight template previews initially, with working load-more controls and resets on each filter transition. SVGs are separate Vite assets through `?url&no-inline`, and thumbnails are lazy-loaded.

Inserting, arranging, labeling, saving and exporting use the existing manual workflow and consume no AI credits. Scientific artwork remains one vector object; independent labels, arrows and connectors remain editable. Source lettering may remain inside an asset and is not represented as independently editable text. Existing Credits and export metadata retain licensing and modification information.

See [template coverage](scientific-template-coverage.md) for the 25 new teaching compositions, citations and specific limitations. All 35 templates remain drafts requiring subject-matter review.

## Maintenance

1. Select a useful named work with individual permissive-license evidence. Avoid cosmetic variants and unrelated catalog padding.
2. Add an explicit row to `tools/scientific-assets/library-selection.json` and inspect its original metadata/license.
3. Run `python tools/scientific-assets/expand_library.py --review .cache/scientific/library-sources` only as an intentional source-review operation. Inspect rejection reasons; never weaken the sanitizer to force a count.
4. Render approved normalized SVGs, check thumbnails/canvas appearance, record any geometry preparation, and inspect source attribution. Review mode establishes source hashes; it does not confer scientific approval.
5. Commit selection, source lock, bundled SVGs and both catalogs together. Replay with `python tools/scientific-assets/expand_library.py .cache/scientific/library-sources`; replay requires locked bytes and fails if reviewed sources change. The source indexes can be fetched from the pinned upstream revision when the local cache is absent.
6. Run pure ingestion, catalog, export and frontend checks. Templates require references and explicit versioned human review before their status can become verified.

## Validation for this expansion

- **713 frontend tests passed** across 76 files, including Notes regressions, complete catalog validation and portable exports for all 35 templates.
- **16 pure ingestion/policy tests passed**. These use files and in-memory SVGs; no database fixtures or endpoints run.
- **Lint and production build passed**. Vite still reports the existing large-chunk warning for the Notes/editor bundle; no new runtime library was installed.
- All 46 original catalog records and SVG byte sequences were compared against Git HEAD and remain unchanged. Every active SVG hash matches, all IDs are unique, and frontend/backend catalogs are identical.
- All 128 normalized new SVGs rendered successfully into five visual contact sheets; source clipping and excessive plant-page margins were addressed during inspection.
- The actual production Studio component was inspected in a frontend-only local harness with account APIs disabled. Browser checks covered new template search/insertion, category filtering, new CRISPR artwork insertion/rotation, undo and a real SVG download. The downloaded figure contains 87 vector paths, embedded credits and no raster image nodes. Desktop and 740px tablet layouts were inspected.
- Screenshots: `docs/screenshots/scientific-library-expanded-genetics.jpg` and `scientific-library-expanded-tablet.jpg`. The harness is ignored under `frontend/.cache/`; it is not a shipped standalone application.
- No database mutations, migrations, seeds or live account/Notes save operations were executed for this expansion, per the user's standing confirmation rule. Persistence code is unchanged; live save/reload was not repeated in this run.

## Remaining coverage and next work

The most useful next step is a qualified biology review of the draft templates, followed by artwork acquisition for standalone Golgi/lysosome/peroxisome structures, replication forks, mitosis/meiosis mechanics, detailed synapses, nephron/stomatal anatomy and additional immune assemblies. Human anatomy and neuroscience remain comparatively small. Source remediation can recover suitable excluded vectors after careful review; raster downloads do not automatically qualify as vector illustrations.

Future packs should map to curriculum objectives and distinct teaching compositions. Review status, citations and source preparation belong alongside the artwork rather than being inferred from asset count. Additional advanced builders can extend the existing structured schema. Optional future AI features must use the same editable documents and remain separate from the zero-credit manual library.
