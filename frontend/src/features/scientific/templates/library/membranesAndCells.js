import { biology, compose } from "./compose";

const passive = biology("5-2-passive-transport", "Passive transport");

const osmosis = compose({ id: "osmosis-water-potential", name: "Osmosis and water potential", category: "Membrane transport", description: "Net water movement across a selectively permeable membrane, with pressure made explicit.", references: [passive, biology("30-5-transport-of-water-and-solutes-in-plants", "Transport of water and solutes")], notes: "The arrow represents net water flux from higher to lower water potential, not the motion of every water molecule. Comparison assumes equal hydrostatic pressure and a solute that cannot cross the membrane; different pressure can reverse the direction. Water-potential notation is thermodynamic, not an illustration of molecules. No aquaporin structure or cell-volume outcome is fabricated. Temperature, gravity and matric terms are omitted.", tags: ["osmosis", "water potential", "tonicity"] }, ({ text, asset, arrow, label, heading, note }) => {
  heading("Selectively permeable barrier", 65, 185, 430);
  const membrane = asset("etc-bilayer", 500, 405, 600, 130);
  label("Water can cross;\nthis solute cannot", membrane, 1160, 425, 370);
  const source = text("Higher water potential\nLower solute concentration", 530, 220, 650, 29, { bold: true });
  const sink = text("Lower water potential\nHigher solute concentration", 530, 705, 650, 29, { bold: true });
  arrow(source, sink, "bottom", "top", { role: "net-water-flow", color: "#4b83a2", strokeWidth: 5 });
  text("Net H₂O flow", 950, 590, 400, 27, { bold: true, color: "#4b83a2" });
  text("Ψ = Ψₛ + Ψₚ", 90, 725, 400, 32, { bold: true });
  note("Equal pressure in this comparison · Solute lowers Ψₛ · Water still moves in both directions", 100, 840, 1400);
});

const permeability = compose({ id: "selective-permeability", name: "Selective membrane permeability", category: "Membrane transport", description: "Contrast lipid-mediated diffusion with channel-mediated ion passage using actual membrane artwork.", references: [passive], notes: "Oxygen is written as chemical notation rather than a fabricated molecular drawing. Calcium-channel artwork is a generic source schematic; no gating state or channel subtype is assigned. Ca²⁺ net movement follows its electrochemical gradient, which depends on voltage as well as concentration. The two rows compare mechanisms and are not a shared physical membrane cross section. Carrier transport and quantitative flux are omitted.", tags: ["diffusion", "channel", "electrochemical gradient"] }, ({ text, asset, arrow, label, heading, note }) => {
  heading("Small nonpolar molecules", 80, 190, 650); heading("Ions require transport proteins", 840, 190, 680);
  const bilayer = asset("etc-bilayer", 100, 330, 600, 170);
  const channel = asset("calcium-channel", 980, 300, 360, 270);
  label("Phospholipid bilayer", bilayer, 160, 540, 500); label("Calcium-channel schematic", channel, 910, 605, 560);
  const o2high = text("O₂\nHigher concentration", 80, 685, 290, 25, { bold: true });
  const o2low = text("O₂\nLower concentration", 440, 685, 300, 25, { bold: true }); arrow(o2high, o2low);
  const cahigh = text("Ca²⁺\nElectrochemical drive", 835, 725, 315, 24, { bold: true });
  const calow = text("Ca²⁺\nNet passive flux", 1220, 725, 305, 24, { bold: true }); arrow(cahigh, calow);
  note("Mechanism comparison · An open channel permits passive transport; it does not itself pump ions", 110, 870, 1400);
});

const energy = compose({ id: "transport-energy-accounting", name: "Energy in membrane transport", category: "Membrane transport", description: "Distinguish downhill flux, directly powered transport and transport coupled to another solute.", references: [biology("5-3-active-transport", "Active transport"), passive], notes: "This is an energy relationship diagram with genuine membrane context. No generic channel or receptor is relabeled as a pump. Solutes A and B are abstract thermodynamic notation, not molecular structures. The direction of secondary active transport depends on the coupled electrochemical gradients and transporter stoichiometry. Specific pumps, their structures and exact stoichiometry are intentionally omitted.", tags: ["active transport", "coupling", "ATP"] }, ({ text, asset, arrow, label, heading, note }) => {
  const context = asset("cell-membrane", 85, 230, 340, 330); label("Membrane context", context, 95, 590, 360);
  heading("Passive", 550, 190, 400); heading("Primary active", 1060, 190, 450);
  const down = text("A: higher electrochemical\npotential", 535, 280, 445, 25, { bold: true });
  const low = text("A: lower electrochemical\npotential", 535, 455, 445, 25, { bold: true }); arrow(down, low, "bottom", "top");
  const uphill = text("B: lower potential", 1070, 280, 440, 25, { bold: true });
  const high = text("B: higher potential", 1070, 455, 440, 25, { bold: true }); arrow(uphill, high, "bottom", "top", { color: "#a77b4d" });
  text("Direct energy input\ne.g. ATP hydrolysis", 1070, 570, 450, 24, { color: "#a77b4d" });
  heading("Secondary active: coupled flux", 535, 705, 950);
  text("A moves downhill  +  B moves uphill\nCombined free-energy change must favor the coupled direction", 535, 775, 975, 25);
  note("No pump structure implied by the artwork · Electrical and chemical terms both contribute", 90, 890, 1400);
});

const nuclearExchange = compose({ id: "nuclear-cytoplasmic-exchange", name: "Nuclear and cytoplasmic exchange", category: "Cell biology", description: "Two-way traffic through nuclear pores connects RNA production with cytoplasmic protein synthesis.", references: [biology("4-3-eukaryotic-cells", "Eukaryotic cells"), biology("15-4-rna-processing-in-eukaryotes", "RNA processing")], notes: "Pore artwork supplies structural context; arrows between text annotations describe cargo routes rather than literal pore channels. Mature mRNA export is represented separately from protein import. Not all RNA classes follow the same route. Importins, exportins, Ran nucleotide states, cargo-size limits and transport kinetics are omitted.", tags: ["nucleus", "nuclear pore", "mRNA export"] }, ({ text, asset, arrow, label, heading, note }) => {
  heading("Nucleus", 100, 185); heading("Nuclear pore complex", 580, 185, 600); heading("Cytoplasm", 1160, 185, 350);
  const nucleus = asset("nucleus", 130, 290, 340, 300); label("Transcription and RNA processing", nucleus, 70, 640, 510);
  const pore = asset("nuclear-pore-complex", 630, 300, 310, 300); label("Selective transport gateway", pore, 580, 650, 520);
  const ribosome = asset("ribosome", 1175, 320, 290, 250); label("Cytoplasmic ribosome", ribosome, 1120, 640, 430);
  const nuclear = text("Nuclear mature mRNA", 100, 740, 510, 26, { bold: true });
  const cytoplasmic = text("Cytoplasmic mRNA", 1050, 740, 480, 26, { bold: true }); arrow(nuclear, cytoplasmic, "right", "left", { role: "mrna-export" });
  const importProtein = text("Nuclear-destined proteins", 1000, 840, 530, 23, { color: "#9c7050" });
  const destination = text("Imported nuclear proteins", 100, 840, 530, 23, { color: "#9c7050" }); arrow(importProtein, destination, "left", "right", { color: "#9c7050", role: "protein-import" });
});

const proteasome = compose({ id: "ubiquitin-proteasome-route", name: "Ubiquitin–proteasome turnover", category: "Cell biology", description: "A selective protein-disposal route and the recycling of its ubiquitin signal.", references: [biology("16-6-eukaryotic-translational-and-post-translational-gene-regulation", "Post-translational regulation"), { title: "Measurement of the Multiple Activities of 26S Proteasomes", url: "https://pubmed.ncbi.nlm.nih.gov/30242717/" }], notes: "The folded-protein artwork is a structural example, not a specific substrate; ubiquitin and peptides are explicit text notation. Arrows show the conceptual route, not a molecular reaction mechanism. The ubiquitin signal is removed and recycled rather than assumed to be degraded with the substrate. Ubiquitin ligases, deubiquitinases, ATPase subunits and chain-linkage specificity are omitted.", tags: ["protein degradation", "proteasome", "ubiquitin"] }, ({ text, asset, arrow, label, note }) => {
  const example = asset("folded-protein", 80, 300, 300, 280); label("Example protein substrate", example, 65, 620, 450);
  const tagged = text("Polyubiquitin-tagged\nprotein", 510, 355, 420, 29, { bold: true });
  const machine = asset("proteasome", 1050, 280, 300, 330); label("Proteasome", machine, 1300, 635, 230, 23, { bold: true });
  arrow(example, tagged); arrow(tagged, machine);
  const peptides = text("Short peptides\nFurther hydrolysis → amino acids", 1050, 760, 480, 25, { bold: true }); arrow(machine, peptides, "bottom", "top");
  const recycle = text("Ubiquitin removed\nand recycled", 520, 755, 405, 25, { color: "#9c7050" }); arrow(machine, recycle, "left", "right", { color: "#9c7050" });
  note("Selective disposal overview · ATP-dependent unfolding and translocation precede peptide production", 70, 875, 1460);
});

const cellComparison = compose({ id: "prokaryote-eukaryote-organization", name: "Prokaryotic and eukaryotic organization", category: "Cell biology", description: "A compartment comparison that connects DNA location with the site of gene expression.", references: [biology("4-2-prokaryotic-cells", "Prokaryotic cells"), biology("4-3-eukaryotic-cells", "Eukaryotic cells")], notes: "Licensed bacterium and animal-cell art are generalized examples, not all prokaryotes and eukaryotes. Bacterial DNA occupies a nucleoid, not a nucleus; animal nuclear transcription and cytoplasmic translation are separated. The arrows mean functional relationships rather than physical transport of DNA. Organelle genomes and variation in bacterial internal membranes are omitted.", tags: ["bacteria", "eukaryote", "compartment"] }, ({ text, asset, arrow, label, heading, note }) => {
  heading("Bacterial example", 100, 180, 600); heading("Animal-cell example", 900, 180, 650);
  const bacterium = asset("bacterium", 130, 275, 500, 350), animal = asset("animal-cell-detailed", 940, 275, 450, 350);
  label("DNA in nucleoid · no nuclear envelope", bacterium, 80, 650, 650);
  label("Nuclear DNA · membrane-bound organelles", animal, 840, 650, 700);
  const bacterial = text("Transcription", 100, 760, 280, 26, { bold: true }), translation = text("Translation", 480, 760, 280, 26, { bold: true }); arrow(bacterial, translation);
  const nuclear = text("Nuclear RNA", 880, 760, 280, 26, { bold: true }), cytosolic = text("Cytoplasmic protein", 1250, 760, 280, 26, { bold: true }); arrow(nuclear, cytosolic);
  note("Functional comparison · Separate artwork scales · Bacterial transcription and translation can overlap in time", 90, 870, 1430);
});

export const membraneAndCellTemplates = [osmosis, permeability, energy, nuclearExchange, proteasome, cellComparison];
