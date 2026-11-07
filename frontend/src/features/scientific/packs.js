import { catalog } from "./document";
import { templates } from "./templates";

// Curated references only: artwork and editable figures remain in their canonical registries.
export const curriculumPacks = [
  {
    id: "gene-expression", name: "Gene expression", topic: "Genetics", coverAssetId: "dna-double-helix",
    description: "Follow DNA to RNA and protein, with editable sequence and process figures.",
    assetIds: ["dna-double-helix", "histone-complex", "zinc-finger-protein", "rna-hairpin", "transfer-rna", "ribosome", "folded-protein", "nuclear-pore-complex", "bacterial-ribosome-mrna"],
    templateIds: ["transcription-strand-direction", "protein-synthesis", "eukaryotic-mrna-processing", "codon-anticodon-decoding", "chromatin-accessibility", "bacterial-expression-coupling", "transcription-factor-regulation"],
  },
  {
    id: "cell-biology", name: "Cell biology", topic: "Cell Biology", coverAssetId: "animal-cell-detailed",
    description: "Compare cells, organelles and the membranes that organize them.",
    assetIds: ["animal-cell-detailed", "plant-cell-detailed", "nucleus", "mitochondrion", "chloroplast", "endoplasmic-reticulum", "cell-membrane", "phospholipid", "ribosome"],
    templateIds: ["cell-structure"],
  },
  {
    id: "energy-metabolism", name: "Energy and metabolism", topic: "Biochemistry", coverAssetId: "mitochondrion",
    description: "Connect cellular respiration, ATP synthesis and photosynthesis.",
    assetIds: ["mitochondrion", "chloroplast", "plant-cell-detailed", "etc-bilayer", "etc-complex-i", "etc-complex-ii", "etc-complex-iii", "etc-complex-iv", "etc-atp-synthase"],
    templateIds: ["electron-transport-chain", "glycolysis", "krebs-cycle", "photosynthesis"],
  },
  {
    id: "laboratory", name: "Laboratory workflows", topic: "Laboratory", coverAssetId: "light-microscope",
    description: "Plan observations and explain PCR with real laboratory equipment.",
    assetIds: ["light-microscope", "micropipette", "beakers", "centrifuge", "qpcr-instrument", "restriction-enzyme", "pipette-tip-box"],
    templateIds: ["light-microscopy-planning", "pcr-thermal-cycle", "restriction-digest-recognition", "pcr-experimental-controls"],
  },
];

export function resolvePack(id, assets = catalog, registry = templates) {
  const pack = curriculumPacks.find(item => item.id === id);
  if (!pack) return null;
  const availableAssets = pack.assetIds.map(assetId => assets.find(asset => asset.id === assetId)).filter(Boolean);
  const availableTemplates = pack.templateIds.map(templateId => registry.find(template => template.id === templateId)).filter(Boolean);
  return { ...pack, assets: availableAssets, templates: availableTemplates, assetCount: availableAssets.length, templateCount: availableTemplates.length };
}
