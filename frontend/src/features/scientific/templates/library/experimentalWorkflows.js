import { biology, compose } from "./compose";

const pcr = compose({ id: "pcr-thermal-cycle", name: "PCR thermal cycle", category: "Experimental workflows", description: "A three-stage thermal cycle amplifies a selected DNA interval between two primers.", references: [{ title: "NHGRI · Polymerase Chain Reaction Fact Sheet", url: "https://www.genome.gov/about-genomics/fact-sheets/Polymerase-Chain-Reaction-Fact-Sheet" }, { title: "Addgene · Polymerase Chain Reaction protocol", url: "https://www.addgene.org/protocols/pcr/" }], notes: "The instrument is licensed qPCR-machine artwork used for thermal-cycler context; no fluorescence readout is implied by conventional PCR. Sequence/strand states are editable text rather than fabricated polymerase or primer structures. Primer extension proceeds 5′ to 3′. Temperatures and times must be chosen for the enzyme, primers and target, so universal settings are deliberately omitted. Initial denaturation, final extension, plateau effects, error rates and exact copy number are omitted.", tags: ["PCR", "amplification", "thermal cycling"] }, ({ text, asset, arrow, label, note }) => {
  const machine = asset("qpcr-instrument", 70, 315, 380, 330); label("Thermal-cycler context\nqPCR instrument artwork", machine, 65, 685, 490);
  const denature = text("1  Denaturation\nDouble-stranded DNA separates", 580, 220, 455, 29, { bold: true });
  const anneal = text("2  Primer annealing\nTwo primers bind complementary sites", 1090, 445, 450, 28, { bold: true });
  const extend = text("3  Extension\nDNA polymerase extends each primer\nNew DNA is synthesized 5′ → 3′", 580, 710, 475, 27, { bold: true });
  arrow(denature, anneal, "right", "top"); arrow(anneal, extend, "bottom", "right"); arrow(extend, denature, "top", "bottom", { role: "repeat-cycle" });
  text("Repeat cycles", 590, 505, 440, 27, { color: "#9c7050", bold: true });
  note("Conceptual cycle · Two primers define the target interval; reaction settings are assay-specific", 90, 890, 1430);
});

const restriction = compose({ id: "restriction-digest-recognition", name: "Restriction digest and sticky ends", category: "Experimental workflows", description: "A conventional EcoRI sequence example distinguishes recognition, cleavage and compatible end pairing.", references: [biology("17-1-biotechnology", "Biotechnology"), { title: "OpenStax Microbiology · Tools of genetic engineering", url: "https://openstax.org/books/microbiology/pages/12-1-microbes-and-the-tools-of-genetic-engineering" }], notes: "The restriction-enzyme artwork is generic and is not asserted to be an EcoRI structural model. EcoRI recognition and cleavage are explicit nucleotide notation with antiparallel strand directions. Matching 5′-AATT cohesive ends can anneal; a DNA ligase is needed to seal the backbone. The diagram does not claim all restriction enzymes make sticky ends. Methylation sensitivity, buffers, ligation chemistry and insert orientation are omitted.", tags: ["restriction enzyme", "EcoRI", "sticky ends"] }, ({ text, asset, arrow, label, heading, note }) => {
  const enzyme = asset("restriction-enzyme", 70, 280, 400, 260); label("Restriction enzyme\nGeneric source schematic", enzyme, 75, 595, 440);
  heading("EcoRI recognition and cut notation", 550, 190, 970);
  const recognition = text("5′–G ↓ A A T T C–3′\n3′–C T T A A ↑ G–5′", 550, 300, 950, 32, { bold: true });
  const cut = text("Staggered cleavage\nProduces 5′–AATT cohesive ends", 550, 585, 950, 28, { bold: true, color: "#537e76" }); arrow(recognition, cut, "bottom", "top");
  const pairing = text("Complementary ends anneal\nDNA ligase seals remaining backbone nicks", 550, 770, 950, 26, { bold: true }); arrow(cut, pairing, "bottom", "top");
  note("Sequence example · Arrows within the sequence mark backbone cut sites; vertical flow arrows show process order", 90, 890, 1430);
});

const microscopy = compose({ id: "light-microscopy-planning", name: "Light microscopy: scale and resolution", category: "Experimental workflows", description: "Plan a light-microscopy observation by separating magnification, resolving power and sample preparation.", references: [biology("4-1-studying-cells", "Studying cells")], notes: "The microscope and erythrocyte are licensed instrument/specimen context, not a generated micrograph or an optical ray trace. Total magnification is objective magnification multiplied by eyepiece magnification. A typical mature human erythrocyte is used as an approximate size example, not a calibration standard. Resolution depends on numerical aperture, wavelength and preparation. Lens aberrations, oil immersion and microscope-specific operations are omitted.", tags: ["microscope", "resolution", "magnification"] }, ({ text, asset, arrow, label, heading, note }) => {
  const microscope = asset("light-microscope", 80, 260, 390, 360); label("Compound light microscope", microscope, 65, 665, 500);
  const specimen = asset("red-blood-cell", 1180, 290, 280, 260); label("Erythrocyte context\nTypical diameter ≈ 7–8 μm", specimen, 1090, 610, 450);
  heading("Plan the observation", 550, 190, 660);
  const prepare = text("Choose preparation\nLive sample or fixed/stained sample", 550, 285, 530, 26, { bold: true });
  const image = text("Locate and focus specimen\nIncrease magnification as needed", 550, 500, 530, 26, { bold: true });
  const scale = text("Interpret scale and detail\nMagnification alone does not add resolution", 550, 735, 830, 26, { bold: true });
  arrow(prepare, image, "bottom", "top"); arrow(image, scale, "bottom", "top");
  text("Total magnification = objective × eyepiece", 80, 815, 1410, 27, { color: "#9c7050" });
  note("Observation planning · The erythrocyte is illustration context, not an image produced by this microscope", 80, 895, 1450);
});

const controls = compose({ id: "pcr-experimental-controls", name: "PCR experimental controls", category: "Experimental workflows", description: "Run samples beside controls so that amplification can be interpreted in the context of assay performance.", references: [{ title: "Bustin et al. · MIQE précis: Practical implementation", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2955025/" }, { title: "MIQE 2.0 · Revised quantitative real-time PCR guidelines", url: "https://academic.oup.com/clinchem/article/71/6/634/8119148" }], notes: "Instrument and pipette artwork are real source drawings, not physical reaction vessels or measured results. This is an experimental-design overview, not a diagnostic protocol. Positive controls test assay function; no-template controls investigate contamination or nonspecific signal. A no-RT control is relevant when starting from RNA and can reveal DNA-derived signal. No amplification curves, fabricated Cq values, pass thresholds, replicates policy or clinical conclusions are supplied.", tags: ["PCR", "controls", "qPCR", "experimental design"] }, ({ text, asset, arrow, label, heading, note }) => {
  const pipette = asset("micropipette", 70, 255, 230, 390); label("Separate reaction setup", pipette, 65, 695, 410);
  heading("Run in parallel", 460, 180, 650);
  const sample = text("Experimental sample\nUnknown target status", 470, 270, 550, 25, { bold: true });
  const positive = text("Positive control\nKnown amplifiable target", 470, 410, 550, 25, { bold: true });
  const negative = text("No-template control\nTemplate replaced with water", 470, 550, 550, 25, { bold: true });
  const noRT = text("No-RT control, for RNA workflows\nReverse transcriptase omitted", 470, 690, 550, 25, { bold: true });
  const machine = asset("qpcr-instrument", 1190, 330, 300, 300); label("Amplification and detection\nInterpret controls before samples", machine, 1070, 700, 480, 23);
  [sample, positive, negative, noRT].forEach(input => arrow(input, machine));
  note("Study-design diagram · A control failure limits interpretation; absence of signal alone does not establish target absence", 90, 890, 1430);
});

const phMeasurement = compose({
  id: "acid-base-ph-measurement",
  name: "pH electrode calibration and buffering",
  category: "Experimental workflows",
  description: "Two-point standard calibration relates electrode potential to hydrogen-ion activity and buffer capacity.",
  references: [biology("2-2-water", "Water, acids, bases and buffers"), { title: "OpenStax Chemistry 2e · Buffers", url: "https://openstax.org/books/chemistry-2e/pages/14-6-buffers" }],
  notes: "The pH meter, beakers and flask are licensed laboratory apparatus illustrations, not calibrated volumetric records. A glass electrode responds to H⁺ activity; two-point calibration sets offset and slope at known buffer standards. Temperature compensation, ionic-strength effects and polyprotic titration curves are omitted.",
  tags: ["pH", "buffer", "Henderson-Hasselbalch", "calibration", "chemistry"],
}, ({ text, asset, arrow, label, heading, note }) => {
  const standards = asset("beakers", 80, 275, 310, 280);
  const meter = asset("ph-meter", 590, 250, 340, 310);
  const sample = asset("erlenmeyer-flask", 1140, 270, 290, 290);
  label("Standard reference buffers\ne.g. pH 7.00 and pH 4.01 / 10.01", standards, 65, 595, 420);
  label("Calibrated pH meter\nRinse electrode between vessels", meter, 565, 595, 430);
  label("Buffered reaction vessel\nResists pH drift near pKₐ", sample, 1090, 595, 430);
  heading("Calibration and buffer relationship", 70, 190, 900);
  const calibrate = text("1  Calibrate slope & offset\nwith two bracketing standards", 70, 730, 440, 25, { bold: true });
  const measure = text("2  Measure sample pH\nat matched temperature", 565, 730, 430, 25, { bold: true, color: "#537e76" });
  const equation = text("pH = pKₐ + log([A⁻] / [HA])\nMaximal buffering when [A⁻] ≈ [HA]", 1050, 730, 480, 24, { bold: true });
  arrow(standards, meter);
  arrow(meter, sample);
  arrow(calibrate, measure, "right", "left", { role: "ph-workflow" });
  note("Analytical workflow overview · Rinse and blot (do not wipe) the glass bulb to avoid static or cross-contamination", 80, 885, 1440);
});

const separationSorting = compose({
  id: "chromatography-flow-sorting",
  name: "Chromatography and flow-cytometric sorting",
  category: "Experimental workflows",
  description: "Compare molecular separation by phase partitioning with single-cell optical sorting in suspension.",
  references: [biology("17-1-biotechnology", "Biotechnology and analytical methods"), { title: "OpenStax Microbiology · Fluorescent antibody and flow cytometry techniques", url: "https://openstax.org/books/microbiology/pages/20-5-fluorescent-antibody-techniques" }],
  notes: "Chromatography and flow-cytometer artworks are schematic instrument illustrations. Chromatography separates dissolved molecules by differential partitioning between mobile and stationary phases; flow cytometry interrogates individual suspended cells by light scatter and fluorescence. Detector calibration, gating strategies and column matrices are omitted.",
  tags: ["chromatography", "flow cytometry", "cell sorting", "separation"],
}, ({ text, asset, arrow, label, heading, note }) => {
  heading("Molecular phase separation", 85, 190, 620);
  heading("Single-cell optical sorting", 860, 190, 640);
  const column = asset("chromatography", 120, 265, 340, 310);
  const sorter = asset("flow-cytometer-cell-sorter", 900, 265, 360, 310);
  label("Chromatography system\nMobile versus stationary phase", column, 85, 605, 460);
  label("Flow cytometer / cell sorter\nHydrodynamic focusing & lasers", sorter, 865, 605, 480);
  const mixture = text("Soluble molecular mixture\ne.g. proteins, pigments or metabolites", 85, 705, 480, 24, { bold: true });
  const fractions = text("Eluted fractions separated\nby affinity, size or charge", 85, 800, 480, 24, { color: "#537e76", bold: true });
  const suspension = text("Single-cell suspension\nlabeled with fluorescent probes", 865, 705, 480, 24, { bold: true });
  const sorted = text("Populations quantified and\nsorted by scatter/fluorescence", 865, 800, 480, 24, { color: "#537e76", bold: true });
  arrow(mixture, fractions, "bottom", "top", { role: "chromatography-elution" });
  arrow(suspension, sorted, "bottom", "top", { role: "cytometry-sorting" });
  note("Method comparison · Choose chromatography for molecular mixtures and flow cytometry for intact cell populations", 80, 890, 1440);
});

export const experimentalTemplates = [pcr, restriction, microscopy, controls, phMeasurement, separationSorting];
