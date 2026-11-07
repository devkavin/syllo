import { biology, compose } from "./compose";

const fermentation = biology("7-5-metabolism-without-oxygen", "Metabolism without oxygen");
const oxidation = biology("7-3-oxidation-of-pyruvate-and-the-citric-acid-cycle", "Pyruvate oxidation");

const pyruvate = compose({ id: "pyruvate-metabolic-branches", name: "Pyruvate metabolic branches", category: "Cellular respiration", description: "Compare pyruvate oxidation with two fermentation routes without equating fermentation to anaerobic respiration.", references: [oxidation, fermentation], notes: "Metabolites are conventional text notation, not invented molecular structures. Mitochondrion artwork contextualizes the eukaryotic oxidation branch; the fermentation routes occur in the cytosol. Species and conditions determine which pathways are available. Lactate formation does not release CO₂; alcoholic fermentation does. Enzymes, proton/water balancing, ATP yields and alternative anaerobic electron acceptors are omitted.", tags: ["pyruvate", "fermentation", "acetyl-CoA"] }, ({ text, asset, arrow, label, heading, note }) => {
  const source = text("Pyruvate", 80, 445, 350, 34, { bold: true, role: "metabolite" });
  const acetyl = text("Acetyl-CoA + CO₂\nNAD⁺ → NADH", 620, 230, 570, 28, { bold: true, role: "metabolite" });
  const lactate = text("Lactate\nNADH → NAD⁺", 620, 460, 570, 28, { bold: true, role: "metabolite" });
  const ethanol = text("Pyruvate → Acetaldehyde + CO₂\nAcetaldehyde → Ethanol; NADH → NAD⁺", 620, 700, 890, 27, { bold: true, role: "metabolite" });
  arrow(source, acetyl); arrow(source, lactate); arrow(source, ethanol);
  const mitochondrion = asset("mitochondrion", 1230, 200, 230, 230); label("Eukaryotic\nmitochondrial route", mitochondrion, 1200, 450, 330, 22);
  heading("Oxidative entry", 620, 175, 550); heading("Lactate fermentation", 620, 400, 600); heading("Alcoholic fermentation", 620, 640, 750);
  note("Biochemical branch map · Fermentation regenerates NAD⁺ without using an electron transport chain", 90, 870, 1430);
});

const lactate = compose({ id: "lactate-nad-recycling", name: "Lactate fermentation and NAD⁺ recycling", category: "Cellular respiration", description: "The NADH-to-NAD⁺ loop allows glycolysis to continue when pyruvate is reduced to lactate.", references: [fermentation, biology("7-2-glycolysis", "Glycolysis")], notes: "The red-blood-cell drawing provides the mature mammalian erythrocyte context, which lacks mitochondria. Text arrows are simplified redox notation, not fully balanced reactions. ATP is generated in glycolysis, not by the pyruvate-to-lactate step. The template omits proton balance, glucose transport, lactate transport, pH effects and subsequent lactate metabolism.", tags: ["lactate", "NAD", "glycolysis"] }, ({ text, asset, arrow, label, note }) => {
  const rbc = asset("red-blood-cell", 80, 300, 330, 300); label("Mature mammalian erythrocyte\nNo mitochondria", rbc, 65, 650, 510, 23);
  const glucose = text("Glucose", 580, 225, 360, 30, { bold: true });
  const pyruvate = text("2 Pyruvate", 1160, 225, 360, 30, { bold: true });
  arrow(glucose, pyruvate); text("Glycolysis: net 2 ATP", 720, 320, 650, 26, { color: "#537e76" });
  const nadh = text("2 NADH", 580, 490, 380, 29, { bold: true, color: "#9c7050" });
  const nad = text("2 NAD⁺", 580, 760, 360, 29, { bold: true, color: "#9c7050" });
  arrow(nadh, nad, "bottom", "top", { color: "#9c7050", role: "nad-regeneration" });
  text("NADH formed in glycolysis\nis oxidized during\npyruvate reduction", 80, 785, 470, 22);
  const lactate = text("2 Lactate", 1140, 760, 380, 30, { bold: true }); arrow(pyruvate, lactate, "bottom", "top", { role: "lactate-formation" });
  text("Regenerated NAD⁺\nreturns to glycolysis", 850, 595, 270, 23, { color: "#9c7050" });
  note("Per glucose · Redox-coupling overview · Lactate formation itself adds no ATP", 90, 890, 1430);
});

const atp = compose({ id: "atp-production-mechanisms", name: "Two mechanisms of ATP production", category: "Bioenergetics", description: "Compare direct phosphate transfer with ATP synthesis powered by a transmembrane proton gradient.", references: [biology("6-4-atp-adenosine-triphosphate", "ATP"), biology("7-4-oxidative-phosphorylation", "Oxidative phosphorylation"), biology("7-2-glycolysis", "Glycolysis")], notes: "Substrate and ATP equations are conventional chemical notation. Real ATP-synthase artwork contextualizes oxidative phosphorylation without relabeling a generic protein. H⁺ return is from intermembrane space to matrix in the eukaryotic mitochondrial example. The proton motive force includes electrical and chemical components. The diagram omits electron-chain complexes, ATP transport, proton/ATP ratios and the complete energy balance.", tags: ["ATP", "substrate-level phosphorylation", "chemiosmosis"] }, ({ text, asset, arrow, label, heading, note }) => {
  heading("Substrate-level phosphorylation", 80, 190, 720); heading("Oxidative phosphorylation", 860, 190, 670);
  const donor = text("Phosphorylated substrate + ADP", 80, 330, 650, 27, { bold: true });
  const transfer = text("Product + ATP", 80, 560, 650, 30, { bold: true, color: "#537e76" }); arrow(donor, transfer, "bottom", "top");
  text("Example: phosphoenolpyruvate\ntransfers phosphate to ADP in glycolysis", 80, 710, 670, 25);
  const synthase = asset("etc-atp-synthase", 1110, 310, 230, 330); label("ATP synthase", synthase, 850, 675, 250, 25, { bold: true });
  const ims = text("Intermembrane space: H⁺", 850, 275, 650, 25, { bold: true });
  const matrix = text("Matrix: H⁺ return\nADP + Pᵢ → ATP", 850, 780, 650, 26, { bold: true }); arrow(ims, synthase, "bottom", "top", { color: "#a77b4d" }); arrow(synthase, matrix, "bottom", "top", { color: "#a77b4d" });
  note("Mechanism comparison · Direct phosphate transfer versus energy coupling through a proton gradient", 90, 895, 1430);
});

const peptide = compose({ id: "peptide-bond-chemistry", name: "Peptide bond chemistry", category: "Biochemistry", description: "Formal condensation notation relates amino-acid functional groups to a peptide backbone.", references: [biology("3-4-proteins", "Proteins")], notes: "The amino-acid backbone artwork is authentic source chemistry; the reaction is editable chemical notation. R₁ and R₂ denote side chains. The formal uncharged condensation equation is not a mechanistic model of peptide synthesis in cells, where activated aminoacyl-tRNAs are used. Ionization at physiological pH, stereochemistry, protecting groups, activation chemistry and ribosomal catalysis are omitted.", tags: ["amino acid", "peptide bond", "condensation"] }, ({ text, asset, arrow, label, heading, note }) => {
  const amino = asset("amino-acid-backbone", 95, 260, 410, 300); label("General amino-acid backbone", amino, 80, 610, 550);
  heading("Formal chemical relationship", 580, 190, 900);
  const reactants = text("H₂N–CH(R₁)–COOH\n+ H₂N–CH(R₂)–COOH", 580, 300, 890, 31, { bold: true });
  const product = text("H₂N–CH(R₁)–CO–NH–CH(R₂)–COOH\n+ H₂O", 580, 650, 950, 29, { bold: true, color: "#537e76" });
  arrow(reactants, product, "bottom", "top");
  text("The –CO–NH– linkage is the peptide bond", 580, 800, 930, 26, { color: "#9c7050" });
  note("Formal condensation equation · Cellular translation uses activated tRNAs and additional energy-coupled steps", 80, 890, 1450);
});

const plant = compose({ id: "plant-photosynthesis-respiration", name: "Photosynthesis and respiration in plants", category: "Plant biology", description: "Photosynthetic cells also respire; chloroplasts and mitochondria connect carbon and energy metabolism.", references: [biology("8-1-overview-of-photosynthesis", "Overview of photosynthesis"), biology("7-1-energy-in-living-systems", "Energy in living systems")], notes: "Source-isolated chloroplast and mitochondrion artwork are organelle context, not a literal metabolite-transport map. The overall photosynthesis equation is conventional net notation; actual carbohydrate synthesis first supplies smaller carbon products. Carbon and oxygen exchange is simplified and does not imply that all produced O₂ is used by the same cell. Transporters, photorespiration, exact ATP yield and day/night regulation are omitted.", tags: ["plant", "photosynthesis", "respiration"] }, ({ text, asset, arrow, label, heading, note }) => {
  heading("Chloroplast", 130, 190, 600); heading("Mitochondrion", 1010, 190, 550);
  const chloroplast = asset("chloroplast", 130, 290, 440, 310), mitochondrion = asset("mitochondrion", 1070, 290, 330, 310);
  label("Light energy → chemical energy", chloroplast, 90, 650, 600, 24);
  label("Organic fuels → ATP production", mitochondrion, 950, 650, 600, 24);
  arrow(chloroplast, mitochondrion, "right", "left"); text("Carbon compounds + O₂", 610, 315, 460, 25, { bold: true, color: "#537e76" });
  const returnProducts = text("CO₂ + H₂O", 900, 775, 400, 28, { bold: true });
  const input = text("Photosynthetic inputs", 150, 775, 500, 27, { bold: true }); arrow(returnProducts, input, "left", "right", { color: "#9c7050" });
  note("Plant-cell energy overview · Respiration occurs in living plant cells, including when light is absent", 90, 890, 1430);
});

const rubisco = compose({
  id: "rubisco-carbon-fixation",
  name: "RuBisCO carboxylation and oxygenation",
  category: "Plant biology",
  description: "RuBisCO catalyzes carbon fixation in the Calvin cycle but also reacts with O₂ to initiate photorespiration.",
  references: [biology("8-3-using-light-energy-to-make-organic-molecules", "The Calvin cycle"), biology("30-4-leaves", "C3, C4 and CAM carbon fixation")],
  notes: "RuBisCO and chloroplast illustrations are schematic context, not full catalytic mechanism diagrams. Ribulose-1,5-bisphosphate (RuBP) can react with CO₂ (carboxylation) or O₂ (oxygenation) at the same active site. Peroxisomal/mitochondrial photorespiratory salvage steps and C4/CAM spatial or temporal adaptations are omitted.",
  tags: ["RuBisCO", "Calvin cycle", "photorespiration", "carbon fixation"],
}, ({ text, asset, arrow, label, heading, note }) => {
  const chloroplast = asset("chloroplast", 75, 260, 320, 280);
  const enzyme = asset("rubisco-activity", 550, 250, 350, 300);
  label("Chloroplast stroma context", chloroplast, 70, 585, 410);
  label("RuBisCO active-site competition\nSubstrate: RuBP (5C)", enzyme, 525, 585, 450);
  heading("Competing reactions", 1040, 190, 480);
  const carboxylation = text("Carboxylation (+ CO₂)\nForms two 3-PGA molecules\nProductive Calvin-cycle carbon gain", 1040, 290, 480, 25, { bold: true, color: "#537e76" });
  const oxygenation = text("Oxygenation (+ O₂)\nForms 3-PGA + 2-phosphoglycolate\nInitiates costly photorespiration", 1040, 560, 480, 25, { bold: true, color: "#9c7050" });
  arrow(chloroplast, enzyme);
  arrow(enzyme, carboxylation, "right", "left", { role: "rubisco-carboxylation" });
  arrow(enzyme, oxygenation, "right", "left", { role: "rubisco-oxygenation", color: "#9c7050" });
  note("Carbon-fixation overview · High O₂/CO₂ ratio and elevated temperature increase oxygenation relative to carboxylation", 80, 885, 1440);
});

const rootAnatomy = compose({
  id: "plant-root-transport-anatomy",
  name: "Root anatomy and radial transport",
  category: "Plant biology",
  description: "Water and minerals cross root tissues radially before entering the central vascular cylinder.",
  references: [biology("30-3-roots", "Roots"), biology("30-5-transport-of-water-and-solutes-in-plants", "Transport of water and solutes in plants")],
  notes: "Arabidopsis cross-section and rice root anatomy illustrations provide histological context. Radial movement combines apoplastic and symplastic routes until the endodermal Casparian strip forces selective plasma-membrane passage into the stele. Root-hair membrane transporters and mycorrhizal associations are omitted.",
  tags: ["root", "xylem", "endodermis", "Casparian strip", "plant transport"],
}, ({ text, asset, arrow, label, heading, note }) => {
  const crossSection = asset("arabidopsis-root-cross-section", 85, 255, 340, 310);
  const rootZones = asset("rice-root-anatomy", 1130, 255, 340, 310);
  label("Root cross-section context\nConcentric tissue layers", crossSection, 75, 600, 420);
  label("Comparative root anatomy\nMonocot/dicot organization", rootZones, 1090, 600, 430);
  heading("Radial inward pathway", 540, 190, 520);
  const epidermis = text("1  Epidermis & cortex\nApoplastic and symplastic uptake", 535, 285, 520, 25, { bold: true });
  const endodermis = text("2  Endodermis (Casparian strip)\nSuberized barrier forces membrane entry", 535, 485, 520, 25, { bold: true, color: "#9c7050" });
  const stele = text("3  Vascular cylinder (xylem)\nUpward transpiration stream to shoot", 535, 695, 520, 25, { bold: true, color: "#537e76" });
  arrow(epidermis, endodermis, "bottom", "top", { role: "cortex-to-endodermis" });
  arrow(endodermis, stele, "bottom", "top", { role: "endodermis-to-xylem" });
  note("Radial transport overview · The Casparian strip blocks unregulated apoplastic entry into the vascular stele", 80, 885, 1440);
});

export const metabolismTemplates = [pyruvate, lactate, atp, peptide, plant, rubisco, rootAnatomy];
