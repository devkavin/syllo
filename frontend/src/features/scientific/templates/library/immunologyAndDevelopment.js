import { anatomy, biology, compose } from "./compose";

const adaptiveImmunity = biology("42-2-adaptive-immune-response", "Adaptive immune response");
const innateImmunity = biology("42-1-innate-immune-response", "Innate immune response");
const development = biology("43-6-fertilization-and-early-embryonic-development", "Fertilization and early embryonic development");
const signaling = biology("9-1-signaling-molecules-and-cellular-receptors", "Signaling molecules and cellular receptors");
const bulkTransport = biology("5-4-bulk-transport", "Bulk transport");

const mhcPresentation = compose({
  id: "antigen-presentation-mhc",
  name: "MHC I and MHC II antigen presentation",
  category: "Immunology",
  description: "Compare endogenous peptide display on MHC class I with exogenous antigen display on MHC class II.",
  references: [adaptiveImmunity, anatomy("21-3-the-adaptive-immune-response-t-lymphocytes-and-their-functional-types", "T lymphocytes and their functional types")],
  notes: "Licensed MHC I, MHC II and T-cell-receptor icons are schematic protein complexes, not atomic crystal structures. Arrows indicate functional recognition relationships rather than physical protein conversion. Cross-presentation, co-stimulatory signals (CD28/B7), CD4/CD8 coreceptor geometry and thymic selection are omitted.",
  tags: ["MHC", "antigen presentation", "T cell receptor", "immunology"],
}, ({ text, asset, arrow, label, heading, note }) => {
  heading("Endogenous route · MHC class I", 80, 185, 480);
  heading("T-cell recognition", 620, 185, 380);
  heading("Exogenous route · MHC class II", 1060, 185, 470);
  const mhc1 = asset("mhc1", 120, 270, 280, 260);
  const tcr = asset("t-cell-receptor", 640, 270, 300, 260);
  const mhc2 = asset("mhc2", 1140, 270, 280, 260);
  label("MHC class I complex\nNucleated-cell context", mhc1, 80, 560, 420);
  label("T-cell receptor (TCR)\nAntigen-specific recognition", tcr, 590, 560, 430);
  label("MHC class II complex\nProfessional APC context", mhc2, 1080, 560, 440);
  const cd8 = text("Cytosolic peptides presented\nto CD8⁺ cytotoxic T cells", 80, 710, 440, 25, { bold: true });
  const activation = text("Peptide–MHC engagement\nrequires co-stimulation", 590, 710, 430, 25, { bold: true, color: "#537e76" });
  const cd4 = text("Endocytosed peptides presented\nto CD4⁺ helper T cells", 1070, 710, 450, 25, { bold: true });
  arrow(cd8, activation, "right", "left", { role: "mhc1-recognition" });
  arrow(cd4, activation, "left", "right", { role: "mhc2-recognition" });
  note("Functional comparison · Cross-presentation by dendritic cells and co-receptor binding sites are omitted", 80, 885, 1440);
});

const complement = compose({
  id: "humoral-complement-activation",
  name: "Antibody binding and classical complement",
  category: "Immunology",
  description: "Antigen-bound antibodies recruit C1q to initiate classical complement tagging and lysis.",
  references: [adaptiveImmunity, innateImmunity],
  notes: "The bacterial cell and antibody–C1q complex are schematic context illustrations, not to a common molecular scale. C1q binding requires multiple Fc regions in close proximity (IgM or clustered IgG). Individual C2–C9 cleavage intermediates, lectin/alternative pathways and regulatory inhibitors are omitted.",
  tags: ["antibody", "complement", "C1q", "opsonization"],
}, ({ text, asset, arrow, label, heading, note }) => {
  const microbe = asset("bacterium", 90, 270, 360, 290);
  const complex = asset("antibody-c1q", 590, 250, 360, 310);
  label("Target microbial surface", microbe, 80, 600, 410);
  label("Antibody–C1q complex\nClassical pathway initiator", complex, 570, 600, 430);
  heading("Downstream effector outcomes", 1070, 195, 450);
  const opsonin = text("C3b opsonization\nEnhances phagocytic uptake", 1070, 295, 450, 25, { bold: true });
  const inflammation = text("Anaphylatoxins (C3a, C5a)\nRecruit inflammatory cells", 1070, 465, 450, 25, { bold: true, color: "#9c7050" });
  const mac = text("Membrane attack complex\nPore formation in target membrane", 1070, 635, 450, 25, { bold: true, color: "#537e76" });
  arrow(microbe, complex);
  arrow(complex, opsonin);
  arrow(complex, inflammation);
  arrow(complex, mac);
  note("Classical complement overview · Lectin and alternative activation routes feed into C3 cleavage separately", 80, 885, 1440);
});

const mastCell = compose({
  id: "mast-cell-degranulation-response",
  name: "Mast cell activation and degranulation",
  category: "Immunology",
  description: "Antigen cross-linking of surface-bound IgE triggers rapid granule exocytosis and mediator release.",
  references: [innateImmunity, anatomy("21-6-diseases-associated-with-depressed-or-overactive-immune-responses", "Hypersensitivity responses")],
  notes: "Resting and degranulating mast-cell illustrations show cellular state context rather than individual FcεRI receptors. Histamine and lipid mediators are represented as editable text notation. Sensitization by prior IgE production, calcium influx kinetics and late-phase cytokine synthesis are omitted.",
  tags: ["mast cell", "degranulation", "histamine", "allergy"],
}, ({ text, asset, arrow, label, heading, note }) => {
  heading("Sensitized resting state", 90, 190, 460);
  heading("Cross-linking & exocytosis", 610, 190, 460);
  heading("Immediate tissue effects", 1100, 190, 430);
  const resting = asset("mast-cell-1", 110, 280, 320, 290);
  const active = asset("mast-cell-degranulation-1", 620, 280, 340, 290);
  label("Granule-rich mast cell\nSurface FcεRI-bound IgE", resting, 80, 610, 440);
  label("Degranulating mast cell\nGranule fusion with membrane", active, 590, 610, 450);
  const trigger = text("Multivalent antigen\ncross-links bound IgE", 80, 745, 440, 25, { bold: true });
  const mediators = text("Histamine, proteases &\npro-inflammatory mediators", 1090, 330, 430, 26, { bold: true, color: "#b27270" });
  const response = text("Vasodilation, increased\nvascular permeability & smooth\nmuscle contraction", 1090, 560, 430, 25, { bold: true });
  arrow(resting, active, "right", "left", { role: "degranulation-step" });
  arrow(trigger, active);
  arrow(active, mediators);
  arrow(mediators, response, "bottom", "top");
  note("Immediate hypersensitivity overview · Initial IgE sensitization by B cells and helper T cells precedes this step", 80, 885, 1440);
});

const cleavage = compose({
  id: "preimplantation-embryo-cleavage",
  name: "Pre-implantation cleavage to blastocyst",
  category: "Developmental biology",
  description: "Early mitotic divisions partition the zygote into blastomeres, a compacted morula and a cavitated blastocyst.",
  references: [development, anatomy("28-2-embryonic-development", "Embryonic development")],
  notes: "Zygote, cleavage-stage, morula and blastocyst artworks are sequential developmental schematics. Early cleavage divisions increase cell number without increasing total embryo volume inside the zona pellucida. Implantation, gastrulation, species-specific timing and gene-activation waves are omitted.",
  tags: ["embryo", "cleavage", "morula", "blastocyst", "zygote"],
}, ({ text, asset, arrow, label, note }) => {
  const zygote = asset("1cell-pn4-zygote", 65, 260, 220, 220);
  const twoCell = asset("2c-embryo", 370, 260, 220, 220);
  const eightCell = asset("8c-embryo", 675, 260, 220, 220);
  const morula = asset("morula-embryo", 980, 260, 220, 220);
  const blastocyst = asset("early-blastocyst-embryo", 1285, 260, 230, 220);
  label("1-cell zygote\nPronuclear stage", zygote, 55, 520, 260, 21);
  label("2-cell embryo\nFirst cleavage", twoCell, 360, 520, 260, 21);
  label("8-cell embryo\nBlastomere division", eightCell, 665, 520, 260, 21);
  label("Morula\nCompaction", morula, 970, 520, 260, 21);
  label("Early blastocyst\nBlastocoel cavity", blastocyst, 1265, 520, 265, 21);
  arrow(zygote, twoCell, "right", "left", { role: "cleavage-1" });
  arrow(twoCell, eightCell, "right", "left", { role: "cleavage-2" });
  arrow(eightCell, morula, "right", "left", { role: "compaction" });
  arrow(morula, blastocyst, "right", "left", { role: "cavitation" });
  text("Cleavage divisions partition cytoplasm without net embryo growth", 70, 720, 720, 25, { bold: true });
  text("Inner cell mass + outer trophoblast lineages diverge at blastocyst stage", 830, 720, 700, 25, { bold: true, color: "#537e76" });
  note("Mammalian pre-implantation overview · Exact cleavage timing and implantation mechanics vary by species", 80, 885, 1440);
});

const receptorSignaling = compose({
  id: "membrane-receptor-transduction",
  name: "Membrane receptor signal transduction",
  category: "Cell biology",
  description: "Extracellular ligand binding relays a signal across the plasma membrane to regulate gene expression.",
  references: [signaling, biology("9-2-propagation-of-the-signal", "Propagation of the signal")],
  notes: "Membrane-receptor, plasma-membrane and transcription-factor artworks provide structural context; they do not depict a single named receptor family (such as GPCR or RTK). Arrows show information flow rather than movement of the extracellular ligand into the nucleus. Phosphorylation cascades, second messengers and feedback termination are simplified.",
  tags: ["signal transduction", "receptor", "second messenger", "gene regulation"],
}, ({ text, asset, arrow, label, heading, note }) => {
  heading("1  Reception", 80, 185, 420);
  heading("2  Transduction", 580, 185, 440);
  heading("3  Cellular response", 1090, 185, 440);
  const receptor = asset("membrane-receptor", 110, 270, 300, 280);
  const membrane = asset("cell-membrane", 590, 270, 320, 280);
  const tf = asset("transcription-factor-rna", 1120, 270, 320, 280);
  label("Transmembrane receptor\nExtracellular binding site", receptor, 75, 585, 420);
  label("Plasma membrane context\nSignal crosses barrier", membrane, 565, 585, 430);
  label("Nuclear regulator context\nAltered transcription", tf, 1085, 585, 440);
  const step1 = text("Ligand binds receptor;\nconformational change", 75, 725, 430, 25, { bold: true });
  const step2 = text("Intracellular relay via kinases\nor second messengers", 565, 725, 450, 25, { bold: true, color: "#537e76" });
  const step3 = text("Target gene activation,\nrepression or metabolic shift", 1085, 725, 440, 25, { bold: true });
  arrow(step1, step2, "right", "left", { role: "signal-relay" });
  arrow(step2, step3, "right", "left", { role: "signal-response" });
  note("Three-stage signaling overview · Hydrophilic ligands trigger intracellular cascades without crossing the bilayer", 80, 885, 1440);
});

const endocytosis = compose({
  id: "endocytosis-vesicle-internalization",
  name: "Endocytosis and membrane engulfment",
  category: "Membrane transport",
  description: "Plasma-membrane invagination encloses extracellular cargo into an intracellular vesicle.",
  references: [bulkTransport],
  notes: "The engulfing-membrane and cell-membrane illustrations are schematic context for bulk uptake. The diagram summarizes membrane invagination and vesicle formation without assigning clathrin coats, dynamin scission proteins or specific endosomal sorting fates. Energy input and exocytic membrane recycling are omitted.",
  tags: ["endocytosis", "phagocytosis", "vesicle", "bulk transport"],
}, ({ text, asset, arrow, label, heading, note }) => {
  const membrane = asset("cell-membrane", 90, 270, 340, 290);
  const engulfing = asset("engulfing-membrane", 580, 270, 360, 290);
  label("Plasma membrane barrier", membrane, 80, 600, 410);
  label("Membrane invagination\nPocket encloses cargo", engulfing, 560, 600, 430);
  heading("Intracellular vesicle fate", 1070, 195, 450);
  const capture = text("Extracellular macromolecules\nor particles at cell surface", 80, 735, 430, 25, { bold: true });
  const pinch = text("Membrane pinches off to form\nan intracellular vesicle", 560, 735, 440, 25, { bold: true, color: "#537e76" });
  const sorting = text("Endosomal sorting or\nlysosomal digestion", 1070, 340, 450, 26, { bold: true });
  const energyNote = text("Active bulk transport\nRequires ATP and cytoskeleton\nremodeling", 1070, 560, 450, 24, { color: "#9c7050" });
  arrow(membrane, engulfing, "right", "left", { role: "membrane-invagination" });
  arrow(capture, pinch);
  arrow(engulfing, sorting);
  arrow(sorting, energyNote, "bottom", "top");
  note("Bulk uptake overview · Phagocytosis, pinocytosis and receptor-mediated endocytosis differ in cargo specificity", 80, 885, 1440);
});

export const immunologyAndDevelopmentTemplates = [
  mhcPresentation,
  complement,
  mastCell,
  cleavage,
  receptorSignaling,
  endocytosis,
];
