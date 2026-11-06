import { assetById, boundsOf, createDocument, createObject, usedAssets } from "../document";
import { synchronizeBindings } from "../composition";
import { buildAnatomy } from "../builders";
import { labelLines } from "../IllustrationSvg";

const biology = (section, title) => ({ title: `OpenStax Biology 2e · ${title}`, url: `https://openstax.org/books/biology-2e/pages/${section}` });
const anatomyReference = (section, title) => ({ title: `OpenStax Anatomy and Physiology 2e · ${title}`, url: `https://openstax.org/books/anatomy-and-physiology-2e/pages/${section}` });

function composition(id, name, category, description, references, reviewNotes, build) {
  const document = { ...createDocument(name), id: `template-${id}-v1`, width: 1600, height: 1000 };
  const add = (type, props) => { const object = createObject(type, props); document.objects.push(object); return object; };
  const text = (value, x, y, width = 350, fontSize = 23, extra = {}) => add("text", { text: value, x, y, width, height: Math.max(42, labelLines({ text: value, width, fontSize }).length * fontSize * 1.32 + 8), fontSize, color: "#334155", ...extra });
  const asset = (assetId, x, y, maxWidth, maxHeight, extra = {}) => {
    if (!assetById[assetId]) throw new Error(`Template ${id} requires approved artwork: ${assetId}`);
    const ratio = assetById[assetId].aspectRatio || 1, width = Math.min(maxWidth, maxHeight * ratio), height = width / ratio;
    return add("asset", { assetId, name: assetById[assetId].name, x: x + (maxWidth - width) / 2, y: y + (maxHeight - height) / 2, width, height, ...extra });
  };
  const arrow = (from, to, startAnchor = "right", endAnchor = "left", extra = {}) => {
    const anchor = (object, side) => ({ left: [object.x, object.y + object.height / 2], right: [object.x + object.width, object.y + object.height / 2], top: [object.x + object.width / 2, object.y], bottom: [object.x + object.width / 2, object.y + object.height], center: [object.x + object.width / 2, object.y + object.height / 2] })[side];
    const [ax, ay] = anchor(from, startAnchor), [bx, by] = anchor(to, endAnchor);
    return add("arrow", { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.max(1, Math.abs(bx - ax)), height: Math.max(1, Math.abs(by - ay)), flipX: bx < ax, flipY: by < ay, color: "#59847d", strokeWidth: 3, startBinding: { objectId: from.id, anchor: startAnchor }, endBinding: { objectId: to.id, anchor: endAnchor }, role: "reaction", ...extra });
  };
  const label = (value, target, x, y, width = 320, extra = {}) => text(value, x, y, width, 21, { isLabel: true, labelFor: target.id, ...extra });
  const landmarkLabel = (landmark, target, x, y, width = 190) => {
    const caption = label(landmark.name, target, x, y, width);
    add("connector", { color: "#849990", strokeWidth: 2, isLabel: true, labelFor: target.id, startBinding: { objectId: caption.id, anchor: x < target.x ? "right" : "left" }, endBinding: { objectId: target.id, anchor: "point", u: landmark.u, v: landmark.v } });
  };
  text(name, 65, 40, 1470, 42, { bold: true, color: "#263c36", role: "title" });
  text(description, 67, 105, 1460, 22, { color: "#708179", role: "subtitle" });
  build({ document, text, asset, arrow, label, landmarkLabel, add });
  text("DRAFT · Subject matter review required · Artwork and reaction notation are independently editable", 66, 945, 1460, 17, { color: "#8a795f", role: "review-status" });
  document.objects = synchronizeBindings(document).objects;
  return { id, name, subject: "Biology", category, description, version: 1, reviewStatus: "draft", document, canvas: { width: document.width, height: document.height }, attribution: usedAssets(document), reviewNotes, references };
}

const photosynthesis = composition("photosynthesis", "Photosynthesis", "Plant biology", "Plant context and the exchange of energy carriers between two photosynthetic stages.", [
  biology("8-2-the-light-dependent-reactions-of-photosynthesis", "Light-dependent reactions"), biology("8-3-using-light-energy-to-make-organic-molecules", "The Calvin cycle"),
], "Draft requiring subject matter review. The licensed plant-cell and source-isolated chloroplast artwork supply biological context; stage names and arrows are abstract reaction notation. No photosystem or Calvin-cycle enzyme artwork is substituted with generic shapes. The overview omits electron carriers, cyclic electron flow, enzyme steps and exact stoichiometry. Internal organelle paths remain part of each source SVG.", ({ text, asset, arrow, label }) => {
  const plant = asset("plant-cell-detailed", 70, 185, 390, 310);
  label("Photosynthetic plant cell", plant, 75, 510, 440);
  const chloroplast = asset("chloroplast", 90, 600, 350, 225);
  label("Chloroplast · envelope and thylakoids", chloroplast, 65, 850, 470);
  const light = text("Light-dependent reactions\nThylakoid membrane", 610, 245, 430, 29, { bold: true });
  const calvin = text("Calvin cycle\nChloroplast stroma", 1060, 600, 425, 29, { bold: true });
  text("Light + H₂O", 610, 175, 400, 24, { color: "#a27837" });
  text("O₂ released", 610, 360, 330, 24);
  arrow(light, calvin, "right", "top");
  text("ATP + NADPH", 1080, 355, 400, 25, { color: "#59847d", bold: true });
  arrow(calvin, light, "left", "bottom", { color: "#a27c58" });
  text("ADP + Pᵢ + NADP⁺", 575, 550, 425, 24, { color: "#a27c58" });
  text("CO₂ enters", 1100, 520, 330, 24);
  text("G3P exported\nCarbon used to build carbohydrates", 1050, 745, 470, 25);
  text("Stage overview · arrows indicate carrier exchange\nNot a spatial model of chloroplast membranes", 580, 855, 900, 20, { color: "#708179" });
});

const krebs = composition("krebs-cycle", "Krebs cycle", "Cellular respiration", "The citric acid cycle in eukaryotic mitochondrial context; one turn per acetyl-CoA.", [biology("7-3-oxidation-of-pyruvate-and-the-citric-acid-cycle", "Citric acid cycle")], "Draft requiring subject matter review. Metabolite text and arrows are conventional pathway notation, not molecular structures. Mitochondrion artwork is context, not an enzyme location map. Succinate dehydrogenase is in the inner membrane; most other cycle enzymes act in the matrix. Enzymes, cofactor inputs and reaction reversibility are omitted; arrowheads show the net oxidative direction. GTP/ATP production depends on isoenzyme and tissue.", ({ text, asset, arrow, label }) => {
  const context = asset("mitochondrion", 80, 360, 350, 300);
  label("Eukaryotic mitochondrion\nMatrix pathway; succinate\ndehydrogenase is membrane-bound", context, 75, 700, 450);
  const positions = [[920, 205], [1225, 280], [1245, 455], [1200, 630], [930, 755], [625, 660], [575, 470], [625, 280]];
  const sequence = ["Citrate", "Isocitrate", "α-Ketoglutarate", "Succinyl-CoA", "Succinate", "Fumarate", "Malate", "Oxaloacetate"];
  const nodes = sequence.map((name, i) => text(name, positions[i][0], positions[i][1], 275, 25, { bold: true, role: "metabolite" }));
  nodes.forEach((node, i) => {
    const next = nodes[(i + 1) % nodes.length];
    const dx = next.x - node.x, dy = next.y - node.y;
    arrow(node, next, Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "bottom" : "top", Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "left" : "right" : dy > 0 ? "top" : "bottom");
  });
  const entry = text("Acetyl-CoA", 605, 165, 245, 25, { color: "#9c7050", bold: true }); arrow(entry, nodes[0]);
  text("NADH + CO₂", 1230, 392, 300, 20, { color: "#a16b79" });
  text("NADH + CO₂", 1240, 570, 300, 20, { color: "#a16b79" });
  text("GTP / ATP", 1105, 720, 200, 20, { color: "#a16b79" });
  text("FADH₂", 745, 760, 200, 20, { color: "#a16b79" });
  text("NADH", 565, 365, 200, 20, { color: "#a16b79" });
  text("Per acetyl-CoA: 2 CO₂ · 3 NADH · 1 FADH₂ · 1 GTP or ATP", 565, 875, 950, 24, { color: "#59847d", bold: true });
});

const glycolysis = composition("glycolysis", "Glycolysis", "Cellular respiration", "Editable metabolite pathway in the cytosol; energy accounting is per glucose.", [biology("7-2-glycolysis", "Glycolysis")], "Draft requiring subject matter review. Approved animal-cell artwork supplies cellular context; metabolites are editable text notation, not biological illustrations. The branch into glyceraldehyde-3-phosphate and dihydroxyacetone phosphate is explicit. Lower-pathway reaction quantities occur twice per glucose. Enzymes, proton/water balancing and reaction reversibility are omitted; arrows show net glycolytic flux.", ({ text, asset, arrow, label }) => {
  const cell = asset("animal-cell", 1100, 215, 350, 280); label("Cell context\nGlycolysis takes place in the cytosol", cell, 1080, 520, 440);
  const sequence = ["Glucose", "Glucose-6-phosphate", "Fructose-6-phosphate", "Fructose-1,6-bisphosphate", "Glyceraldehyde-3-phosphate", "1,3-Bisphosphoglycerate", "3-Phosphoglycerate", "2-Phosphoglycerate", "Phosphoenolpyruvate", "Pyruvate"];
  const positions = [[70, 205], [70, 330], [70, 455], [70, 580], [500, 205], [500, 330], [500, 455], [500, 580], [500, 705], [500, 830]];
  const nodes = sequence.map((name, i) => text(name, positions[i][0], positions[i][1], i < 4 ? 350 : 420, 24, { bold: true, role: "metabolite" }));
  for (let i = 0; i < nodes.length - 1; i++) arrow(nodes[i], nodes[i + 1], i === 3 ? "right" : "bottom", i === 3 ? "left" : "top");
  const dhap = text("Dihydroxyacetone phosphate", 70, 790, 370, 23, { bold: true, role: "metabolite" });
  arrow(nodes[3], dhap, "bottom", "top"); arrow(dhap, nodes[4], "right", "left");
  text("ATP → ADP", 75, 275, 280, 18, { color: "#a16b79" }); text("ATP → ADP", 75, 525, 280, 18, { color: "#a16b79" });
  text("2 triose molecules continue\nthrough each payoff step", 1090, 655, 430, 24, { color: "#59847d" });
  text("Net per glucose: 2 pyruvate\n2 ATP + 2 NADH", 1090, 780, 430, 27, { color: "#59847d", bold: true });
  text("NAD⁺ + Pᵢ → NADH", 705, 280, 340, 17, { color: "#a16b79" }); text("ADP → ATP", 705, 405, 300, 17, { color: "#a16b79" }); text("ADP → ATP", 705, 780, 300, 17, { color: "#a16b79" });
});

const neuron = composition("neuron-synapse", "Neuron and synapse", "Neuroscience", "A chemical synapse sequence with licensed neuron and calcium-channel context artwork.", [biology("35-2-how-neurons-communicate", "How neurons communicate")], "Draft requiring subject matter review. Neuron and calcium-channel SVGs are genuine licensed artwork. Text nodes describe a chemical synapse; they are not spatial drawings of terminals, vesicles or receptors. No synaptic vesicle or neurotransmitter molecular artwork is currently available. Calcium-channel artwork is a generic channel schematic, not an identified presynaptic channel subtype. Electrophysiology and electrical synapses are omitted.", ({ text, asset, arrow, label }) => {
  const n = asset("pyramidal-neuron", 80, 200, 340, 600); label("Pyramidal neuron\nMorphology context", n, 95, 830, 340);
  const ca = asset("calcium-channel", 1110, 210, 300, 260); label("Calcium channel\nSchematic artwork", ca, 1110, 510, 350);
  const steps = ["Action potential reaches\npresynaptic terminal", "Voltage-gated Ca²⁺ channels open\nCa²⁺ enters the terminal", "Vesicles fuse with membrane\nNeurotransmitter is released", "Neurotransmitter activates\npostsynaptic receptors"];
  const nodes = steps.map((value, i) => text(value, 500, 205 + i * 175, 570, 26, { bold: true, role: "process-step" }));
  nodes.slice(0, -1).forEach((node, i) => arrow(node, nodes[i + 1], "bottom", "top"));
  text("Postsynaptic response depends\non the receptor and ion conductance", 1120, 715, 400, 23);
  text("Sequence overview · not a spatial synapse model", 500, 885, 950, 20, { color: "#708179" });
});

const cellStructure = composition("cell-structure", "Cell structure", "Cell biology", "Compare licensed animal- and plant-cell artwork with independently editable explanatory labels.", [biology("4-3-eukaryotic-cells", "Eukaryotic cells")], "Draft requiring subject matter review. Generalized eukaryotic artwork is not to scale; abundance and geometry vary by cell type. Original source labels were removed and independent pointers use inspected source landmarks. Organelle paths remain part of each complete SVG and cannot be individually edited. Not every plant cell contains chloroplasts.", ({ text, asset, label, landmarkLabel }) => {
  const animal = asset("animal-cell-detailed", 250, 250, 450, 450), plant = asset("plant-cell-detailed", 880, 250, 450, 450);
  label("Animal cell", animal, 250, 175, 500, { bold: true, fontSize: 29 }); label("Plant cell", plant, 930, 175, 400, { bold: true, fontSize: 29 });
  assetById[animal.assetId].landmarks.forEach((landmark, i) => landmarkLabel(landmark, animal, 55, 310 + i * 125, 180));
  assetById[plant.assetId].landmarks.forEach((landmark, i) => landmarkLabel(landmark, plant, 1360, 290 + i * 110, 190));
  label("Plasma membrane · nucleus · mitochondria\nEndoplasmic reticulum · ribosomes", animal, 100, 770, 680);
  label("Cell wall · large central vacuole\nChloroplasts in photosynthetic cells", plant, 860, 770, 650);
  text("Generalized artwork · cells and organelles are not to a shared scale", 300, 890, 1200, 20, { color: "#708179" });
});

const replication = composition("dna-replication", "DNA replication", "Molecular biology", "Semiconservative copying shown as a concept overview with authentic double-helix artwork.", [biology("14-3-basics-of-dna-replication", "Basics of DNA replication")], "Draft requiring subject matter review. Double-helix artwork is licensed context, not a replication-fork model. Identical source helix icons do not visually encode old versus new strands; that distinction is expressed by independent text. Helicase, polymerase, primers, leading/lagging strands and Okazaki fragments require suitable artwork and are deliberately omitted. Arrows denote a copying relationship rather than chemical reactions.", ({ text, asset, arrow, label }) => {
  const original = asset("dna-double-helix", 100, 315, 330, 380), daughterA = asset("dna-double-helix", 980, 180, 330, 290), daughterB = asset("dna-double-helix", 980, 560, 330, 290);
  label("Parental double-stranded DNA", original, 75, 760, 500, { bold: true });
  arrow(original, daughterA); arrow(original, daughterB);
  label("Daughter DNA 1\nOne parental + one new strand", daughterA, 955, 475, 560);
  label("Daughter DNA 2\nOne parental + one new strand", daughterB, 955, 855, 560);
  text("Each parental strand serves\nas a complementary template", 490, 400, 440, 28, { bold: true });
  text("Concept overview\nStrand origin is described in text", 490, 600, 450, 22, { color: "#708179" });
});

const protein = composition("protein-synthesis", "Protein synthesis", "Molecular biology", "From genetic information to polypeptide: an editable transcription and translation overview.", [biology("15-5-ribosomes-and-protein-synthesis", "Ribosomes and protein synthesis"), biology("15-2-prokaryotic-transcription", "Transcription"), biology("3-4-proteins", "Proteins")], "Draft requiring subject matter review. DNA, ribosome, transfer-RNA and example folded-protein artwork is licensed. Text represents mRNA and polypeptide products as biochemical notation. The folded protein is a structural example, not the product of a specified sequence. The ribosome schematic does not assign species-specific subunits or binding sites. RNA processing, transport, translation factors and folding mechanisms are omitted. Arrows indicate information/process flow, not mass conversion of DNA into protein.", ({ text, asset, arrow, label }) => {
  const dna = asset("dna-double-helix", 80, 230, 260, 290); label("DNA template", dna, 85, 550, 300, { bold: true });
  const mrna = text("mRNA\n5′ → 3′", 500, 350, 260, 31, { bold: true, role: "process-step" });
  const ribosome = asset("ribosome", 910, 245, 350, 280); label("Ribosome · translation", ribosome, 890, 550, 450, { bold: true });
  arrow(dna, mrna); arrow(mrna, ribosome);
  text("Transcription", 345, 250, 330, 23, { color: "#59847d" }); text("mRNA decoded 5′ → 3′", 700, 185, 550, 24, { color: "#59847d" });
  const product = text("Polypeptide\nN terminus → C terminus", 905, 765, 355, 25, { bold: true }); arrow(ribosome, product, "bottom", "top");
  const folded = asset("folded-protein", 1350, 720, 180, 140); arrow(product, folded);
  label("Folded protein\nStructural example", folded, 1280, 870, 285);
  const trna = asset("transfer-rna", 420, 635, 260, 230); label("tRNA adapts codons to amino acids", trna, 360, 880, 620);
  text("Ribosomal peptide-bond formation\nextends the growing chain", 965, 650, 540, 23);
});

function systemTemplate(id, name, description, reference, route, notes) {
  return composition(id, name, "Anatomy", description, [reference], `Draft requiring subject matter review. Original annotation layers were removed from the licensed source; prepared independent labels and pointers use inspected source landmarks. The route panel describes order rather than physical distance. ${notes} Histology, relative scale and physiological regulation are omitted. Ungroup to edit each anatomical annotation.`, ({ document, text }) => {
    const prepared = buildAnatomy({ assetId: id }), box = boundsOf(prepared), factor = Math.min(1040 / box.width, 690 / box.height);
    document.objects.push(...prepared.map(obj => ({ ...obj, x: 55 + (obj.x - box.x) * factor, y: 205 + (obj.y - box.y) * factor, width: Math.max(1, obj.width * factor), height: Math.max(1, obj.height * factor), ...(obj.type === "text" ? { fontSize: Math.max(8, obj.fontSize * factor) } : {}) })));
    text("Route overview", 1120, 205, 410, 29, { bold: true });
    text(route, 1120, 285, 410, 24, { role: "anatomical-route" });
    text(notes, 1120, 730, 410, 22, { color: "#708179" });
  });
}

const digestive = systemTemplate("digestive-system", "Digestive system", "Licensed human digestive anatomy with an editable alimentary-canal route.", anatomyReference("23-1-overview-of-the-digestive-system", "Overview of the digestive system"), "Mouth\n↓\nPharynx → Esophagus\n↓\nStomach → Small intestine\n↓\nLarge intestine → Rectum → Anus", "Liver, gallbladder and pancreas supply secretions; food does not pass through these accessory organs.");
const respiratory = systemTemplate("respiratory-system", "Respiratory system", "Licensed respiratory anatomy with an editable airflow and gas-exchange overview.", anatomyReference("22-1-organs-and-structures-of-the-respiratory-system", "Organs of the respiratory system"), "Nasal cavity\n↓\nPharynx → Larynx → Trachea\n↓\nBronchi → Bronchioles\n↓\nRespiratory bronchioles → Alveoli", "Gas exchange occurs in the respiratory zone, including alveoli. Air can also enter through the mouth.");

export const advancedTemplates = [photosynthesis, krebs, glycolysis, neuron, cellStructure, replication, protein, digestive, respiratory];
