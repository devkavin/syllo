# Scientific template coverage

The expanded library targets school/A-level and introductory university biology. Each composition teaches a distinct relationship, route, mechanism or experimental decision. None is counted simply because of a color, label, art style or layout change. The 25 additions below complement the original 10 templates.

All additions remain **drafts requiring subject matter review**. Structural checks and visual inspection establish portability and layout readiness, not scientific approval. There is no invented reviewer, approval date or expert sign-off.

| Template ID | Teaching composition | Real artwork used | Main scope limit |
| --- | --- | --- | --- |
| `osmosis-water-potential` | Water crosses a barrier from higher to lower water potential | Source-isolated phospholipid bilayer | Equal pressure; impermeant solute; no invented aquaporin |
| `selective-permeability` | Nonpolar diffusion versus channel-mediated ion flux | Bilayer and calcium channel | Electrochemical direction is contextual; no pump assigned |
| `transport-energy-accounting` | Passive, directly powered and coupled transport energetics | Plasma-membrane context | Thermodynamic notation; no fabricated transporter structure |
| `nuclear-cytoplasmic-exchange` | Mature mRNA export and nuclear-protein import | Nucleus, nuclear pore, ribosome | Transport factors and individual RNA routes omitted |
| `ubiquitin-proteasome-route` | Protein targeting, degradation and ubiquitin recycling | Protein structure example and proteasome | No specific substrate, ligase or chain linkage assigned |
| `prokaryote-eukaryote-organization` | Gene-expression compartments in bacteria and animal cells | Bacterium and detailed animal cell | Generalized examples; organelle genomes omitted |
| `chromatin-accessibility` | DNA accessibility precedes transcriptional control | Histone complex | No invented closed/open conformations or universal on/off marks |
| `transcription-strand-direction` | Complementary template, coding and RNA sequence directions | DNA helix | Invented short sequence is explicitly teaching notation |
| `eukaryotic-mrna-processing` | Exon joining, terminal processing and export | Nucleus | No universal chronological order or physical spliceosome model |
| `codon-anticodon-decoding` | Antiparallel AUG/UAC pairing and methionine delivery | tRNA and ribosome | Generic tRNA drawing; no unsupported ribosomal sites |
| `bacterial-expression-coupling` | Translation of RNA whose transcription is ongoing | Bacterial ribosome–mRNA and bacterium | Functional timing, not a fabricated polymerase assembly |
| `transcription-factor-regulation` | Sequence-specific binding influences transcription | Zinc-finger fold and DNA | Fold example is not a named signaling pathway |
| `pyruvate-metabolic-branches` | Oxidation, lactate formation and alcoholic fermentation | Mitochondrion | Species-dependent alternatives; no complete reaction balancing |
| `lactate-nad-recycling` | Glycolytic ATP and NAD⁺ regeneration | Mature mammalian erythrocyte | Lactate step adds no ATP; proton balance omitted |
| `atp-production-mechanisms` | Direct phosphate transfer versus proton-gradient coupling | ATP synthase | No universal H⁺/ATP ratio or total ATP yield |
| `peptide-bond-chemistry` | Formal amino-acid condensation and peptide linkage | Amino-acid backbone | Explicitly distinguishes formal condensation from activated-tRNA synthesis |
| `plant-photosynthesis-respiration` | Photosynthetic cells also carry out respiration | Chloroplast and mitochondrion | Exchange overview; no transporter or photorespiration model |
| `pulmonary-systemic-circuits` | Adult double circulation in correct route order | Human heart | Route map rather than chamber-pointer geometry; fetal flow omitted |
| `oxygen-loading-unloading` | Lung/tissue pressure gradients and reversible Hb occupancy | Respiratory system and erythrocyte | No fabricated dissociation data or clinical values |
| `polysynaptic-reflex-arc` | Sensory → interneuron → motor → skeletal muscle | Three neuron classes | Functional relay; no fake spinal anatomy or smooth-muscle effector |
| `cardiac-cycle-valve-states` | Filling, isovolumetric phases, ejection and valve states | Human heart | No measured pressure/ECG traces or timings |
| `pcr-thermal-cycle` | Denaturation → annealing → extension → repeat | Thermal-cycler context | Assay-specific settings and exact yields omitted |
| `restriction-digest-recognition` | EcoRI staggered cuts, cohesive pairing and ligase requirement | Generic restriction-enzyme source diagram | Source enzyme artwork is not relabeled as an EcoRI structure |
| `light-microscopy-planning` | Preparation, focusing, magnification and resolving power | Light microscope and erythrocyte | Illustrated specimen is not a generated micrograph or calibration |
| `pcr-experimental-controls` | Parallel sample, positive, no-template and conditional no-RT controls | Pipette and qPCR instrument | No fabricated curves/Cq values or diagnostic conclusions |

## Scientific references and review boundaries

Each template carries complete HTTPS references in its own metadata. Primary educational references were checked against [OpenStax Biology 2e](https://openstax.org/books/biology-2e/pages/1-introduction) and [OpenStax Anatomy and Physiology 2e](https://openstax.org/books/anatomy-and-physiology-2e/pages/1-introduction). Experimental sources include [NHGRI's PCR fact sheet](https://www.genome.gov/about-genomics/fact-sheets/Polymerase-Chain-Reaction-Fact-Sheet), [Addgene's PCR protocol](https://www.addgene.org/protocols/pcr/), [MIQE précis](https://pmc.ncbi.nlm.nih.gov/articles/PMC2955025/) and [MIQE 2.0](https://academic.oup.com/clinchem/article/71/6/634/8119148). Proteasome routing also cites [26S proteasome activity methods](https://pubmed.ncbi.nlm.nih.gov/30242717/).

Molecules, membrane proteins, cells, organelles and instruments use approved licensed artwork. Editable text supplies conventional sequence notation, chemical equations, thermodynamic relationships and process names. Rectangles, generic blobs or arbitrary icon strings do not substitute for missing anatomical or molecular components. The original SVG artwork remains one asset object; only annotations added by these templates are separate layers. Some existing source artwork retains source lettering, which is explicitly disclosed in review notes.

Mitosis/meiosis chromosome mechanics, replication forks, detailed vesicle fusion, nephron microanatomy, stomatal/root anatomy and immune molecular assemblies require suitable art and have not been fabricated from unrelated icons. Their omission is a coverage boundary, not a claim that every foundational topic is complete.

## Validation

`frontend/src/features/scientific/templates/libraryTemplates.test.js` checks canonical provenance, draft metadata, v2 schema, unique IDs across documents, proportional artwork dimensions, canvas bounds, labels and nonline binding targets, independent duplication, key route directions and portable SVG exports with embedded vectors and credits. This test is pure frontend/file work and does not access or mutate a database.

Optional `SYLLO_TEMPLATE_QA=1` writes the exact exported SVGs into the checkout's `.cache/scientific-library-qa` directory. Render those SVGs to PNG for visual inspection. Visual QA checks actual final output rather than reconstructed mockups.
