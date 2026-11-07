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
    assetIds: ["animal-cell-detailed", "plant-cell-detailed", "nucleus", "mitochondrion", "chloroplast", "endoplasmic-reticulum", "cell-membrane", "phospholipid", "ribosome", "engulfing-membrane", "membrane-receptor", "proteasome"],
    templateIds: ["cell-structure", "osmosis-water-potential", "selective-permeability", "transport-energy-accounting", "nuclear-cytoplasmic-exchange", "ubiquitin-proteasome-route", "prokaryote-eukaryote-organization", "endocytosis-vesicle-internalization", "membrane-receptor-transduction"],
  },
  {
    id: "energy-metabolism", name: "Energy and metabolism", topic: "Biochemistry", coverAssetId: "mitochondrion",
    description: "Connect cellular respiration, ATP synthesis and photosynthesis.",
    assetIds: ["mitochondrion", "chloroplast", "plant-cell-detailed", "etc-bilayer", "etc-complex-i", "etc-complex-ii", "etc-complex-iii", "etc-complex-iv", "etc-atp-synthase", "rubisco", "rubisco-activity", "amino-acid-backbone"],
    templateIds: ["electron-transport-chain", "glycolysis", "krebs-cycle", "photosynthesis", "pyruvate-metabolic-branches", "lactate-nad-recycling", "atp-production-mechanisms", "peptide-bond-chemistry", "plant-photosynthesis-respiration", "rubisco-carbon-fixation"],
  },
  {
    id: "laboratory", name: "Laboratory workflows", topic: "Laboratory", coverAssetId: "light-microscope",
    description: "Plan observations, separations, pH buffering, CRISPR and PCR with real laboratory equipment.",
    assetIds: ["light-microscope", "micropipette", "beakers", "centrifuge", "qpcr-instrument", "restriction-enzyme", "pipette-tip-box", "ph-meter", "erlenmeyer-flask", "chromatography", "flow-cytometer-cell-sorter", "crispr-cas9", "crispr-plasmid"],
    templateIds: ["light-microscopy-planning", "pcr-thermal-cycle", "restriction-digest-recognition", "pcr-experimental-controls", "acid-base-ph-measurement", "chromatography-flow-sorting", "crispr-cas9-editing"],
  },
  {
    id: "immunology-signaling", name: "Immunology and defense", topic: "Immunology", coverAssetId: "antibody-c1q",
    description: "Explore antigen presentation, complement activation, mast-cell degranulation and receptor signaling.",
    assetIds: ["mhc1", "mhc2", "t-cell-receptor", "antibody-c1q", "mast-cell-1", "mast-cell-degranulation-1", "neutrophil", "eosinophil", "membrane-receptor"],
    templateIds: ["antigen-presentation-mhc", "humoral-complement-activation", "mast-cell-degranulation-response", "membrane-receptor-transduction"],
  },
  {
    id: "development-plants", name: "Development, genome & plants", topic: "Plant Biology", coverAssetId: "arabidopsis-root-cross-section",
    description: "Trace embryonic cleavage, chromatin looping, DNA repair and plant root transport.",
    assetIds: ["1cell-pn4-zygote", "2c-embryo", "8c-embryo", "morula-embryo", "early-blastocyst-embryo", "arabidopsis-root-cross-section", "rice-root-anatomy", "rubisco-activity", "leaf", "chromatin-domain", "promoter-enhancer-loop-tf", "damaged-dna", "snp"],
    templateIds: ["preimplantation-embryo-cleavage", "plant-root-transport-anatomy", "rubisco-carbon-fixation", "plant-photosynthesis-respiration", "enhancer-promoter-looping", "dna-damage-mutagenesis"],
  },
];

export function resolvePack(id, assets = catalog, registry = templates) {
  const pack = curriculumPacks.find(item => item.id === id);
  if (!pack) return null;
  const availableAssets = pack.assetIds.map(assetId => assets.find(asset => asset.id === assetId)).filter(Boolean);
  const availableTemplates = pack.templateIds.map(templateId => registry.find(template => template.id === templateId)).filter(Boolean);
  return { ...pack, assets: availableAssets, templates: availableTemplates, assetCount: availableAssets.length, templateCount: availableTemplates.length };
}
