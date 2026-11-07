import { anatomy, compose } from "./compose";

const heart = anatomy("19-1-heart-anatomy", "Heart anatomy");

const circulation = compose({ id: "pulmonary-systemic-circuits", name: "Pulmonary and systemic circuits", category: "Anatomy", description: "A closed route map distinguishes the right-heart pulmonary circuit from the left-heart systemic circuit.", references: [heart], notes: "The authentic heart SVG provides anatomical context while independent text shows flow order. Arrow colors indicate relative oxygenation in the adult route, not artery versus vein identity. Arrows are a route map rather than pointers to heart chambers. Pulmonary arteries carry relatively deoxygenated blood and pulmonary veins carry oxygenated blood. Valves, coronary flow, fetal circulation and physical vessel geometry are omitted.", tags: ["heart", "circulation", "pulmonary", "systemic"] }, ({ text, asset, arrow, label, note }) => {
  const image = asset("human-heart", 610, 335, 360, 280); label("Human heart · anatomical context", image, 555, 650, 530, 22);
  const ra = text("Right atrium", 75, 260, 350, 27, { bold: true, color: "#4b83a2" });
  const rv = text("Right ventricle", 75, 500, 370, 27, { bold: true, color: "#4b83a2" });
  const lungs = text("Lungs\nPulmonary capillaries", 500, 765, 590, 27, { bold: true });
  const la = text("Left atrium", 1190, 500, 340, 27, { bold: true, color: "#b27270" });
  const lv = text("Left ventricle", 1190, 260, 340, 27, { bold: true, color: "#b27270" });
  const body = text("Body tissues\nSystemic capillaries", 600, 185, 490, 26, { bold: true });
  arrow(ra, rv, "bottom", "top", { color: "#4b83a2" }); arrow(rv, lungs, "bottom", "left", { color: "#4b83a2", role: "pulmonary-outflow" }); arrow(lungs, la, "right", "bottom", { color: "#b27270" }); arrow(la, lv, "top", "bottom", { color: "#b27270" }); arrow(lv, body, "left", "right", { color: "#b27270", role: "systemic-outflow" }); arrow(body, ra, "left", "right", { color: "#4b83a2" });
  note("Adult circulation route · Right side → lungs → left side → body → right side", 90, 890, 1430);
});

const oxygen = compose({ id: "oxygen-loading-unloading", name: "Oxygen loading and unloading", category: "Physiology", description: "Partial-pressure gradients connect lung exchange, hemoglobin binding and oxygen release to tissues.", references: [anatomy("22-5-transport-of-gases", "Transport of gases"), anatomy("22-4-gas-exchange", "Gas exchange")], notes: "The red-blood-cell and respiratory-system assets are context rather than a microscopic alveolar-capillary drawing. Hemoglobin binding is written as reversible occupancy notation; the four-site stoichiometry is not reduced to a single irreversible bond. Dissolved O₂ determines its partial pressure while most total O₂ is hemoglobin-bound. Dissociation curves, cooperativity, the Bohr effect and quantitative saturation are omitted.", tags: ["oxygen", "hemoglobin", "gas exchange"] }, ({ text, asset, arrow, label, heading, note }) => {
  const lungs = asset("respiratory-system", 80, 245, 330, 350); label("Lung context", lungs, 70, 650, 380);
  const rbc = asset("red-blood-cell", 650, 300, 330, 300); label("Erythrocyte", rbc, 645, 655, 410);
  heading("Loading in lungs", 70, 185, 500); heading("Unloading in tissues", 1110, 185, 430);
  const alveoli = text("Alveolar O₂\nHigher Pₒ₂ than incoming blood", 70, 755, 530, 25, { bold: true });
  const blood = text("Blood O₂", 650, 755, 340, 27, { bold: true });
  const tissue = text("Tissue O₂\nLower Pₒ₂ than arterial blood", 1100, 755, 430, 25, { bold: true });
  arrow(alveoli, blood); arrow(blood, tissue);
  text("Hb + n O₂ ⇌ Hb(O₂)ₙ\n0 ≤ n ≤ 4", 1100, 340, 435, 30, { bold: true, color: "#b27270" });
  text("Loading and release are reversible;\nlocal conditions change occupancy", 1100, 550, 435, 24);
  note("Concept overview · O₂ diffuses down its partial-pressure gradient; hemoglobin greatly increases transport capacity", 90, 890, 1430);
});

const reflex = compose({ id: "polysynaptic-reflex-arc", name: "Polysynaptic reflex arc", category: "Neuroscience", description: "Sensory input is relayed through a spinal interneuron to a motor output in a simplified withdrawal route.", references: [anatomy("14-3-motor-responses", "Motor responses")], notes: "Licensed sensory-neuron, interneuron and motor-neuron artwork supplies cell-class examples, not anatomically connected axons. Arrows connect editable functional labels; a complete spinal-cord cross section is not fabricated. This is a polysynaptic somatic route, so the motor effector is skeletal muscle, not smooth muscle. Receptor endings, inhibitory branches, reciprocal inhibition, ganglia and conscious ascending pathways are omitted.", tags: ["reflex", "sensory neuron", "motor neuron"] }, ({ text, asset, arrow, label, heading, note }) => {
  heading("Input", 90, 185, 400); heading("Spinal integration", 625, 185, 600); heading("Output", 1170, 185, 350);
  const sensory = asset("sensory-neuron", 100, 290, 330, 310), interneuron = asset("interneuron", 640, 290, 300, 310), motor = asset("motor-neuron", 1160, 290, 300, 310);
  label("Sensory-neuron example", sensory, 60, 650, 490); label("Interneuron example", interneuron, 590, 650, 500); label("Motor-neuron example", motor, 1100, 650, 440);
  const sense = text("Receptor → sensory neuron", 80, 760, 460, 25, { bold: true });
  const relay = text("Spinal interneuron", 610, 760, 430, 25, { bold: true });
  const response = text("Motor neuron → skeletal muscle", 1110, 760, 440, 25, { bold: true });
  arrow(sense, relay); arrow(relay, response);
  note("Functional relay diagram · Interneuron(s) make this polysynaptic; neuron illustrations are not to a common scale", 90, 890, 1430);
});

const cardiacCycle = compose({ id: "cardiac-cycle-valve-states", name: "Cardiac cycle and valve states", category: "Physiology", description: "Relate ventricular pressure changes to filling, contraction, ejection and relaxation.", references: [anatomy("19-3-cardiac-cycle", "Cardiac cycle")], notes: "The heart asset is anatomy context, not a moving-valve model. The four major phases are conventional functional notation; valve state follows pressure differences rather than an active valve-opening action. Atrial systole contributes near the end of ventricular filling. The template omits ECG timing, pressure curves, valve sounds, right/left pressure differences and quantitative durations.", tags: ["cardiac cycle", "valve", "systole", "diastole"] }, ({ text, asset, arrow, label, note }) => {
  const image = asset("human-heart", 90, 350, 380, 300); label("Heart context", image, 90, 705, 420);
  const filling = text("Ventricular filling\nAV valves open\nSemilunar valves closed", 590, 210, 415, 26, { bold: true });
  const contraction = text("Isovolumetric contraction\nAll valves closed\nVentricular pressure rises", 1100, 210, 435, 26, { bold: true });
  const ejection = text("Ventricular ejection\nSemilunar valves open\nAV valves closed", 1100, 650, 430, 26, { bold: true });
  const relaxation = text("Isovolumetric relaxation\nAll valves closed\nVentricular pressure falls", 590, 650, 435, 26, { bold: true });
  arrow(filling, contraction); arrow(contraction, ejection, "bottom", "top"); arrow(ejection, relaxation, "left", "right"); arrow(relaxation, filling, "top", "bottom");
  text("AV = atrioventricular\nSemilunar = aortic and pulmonary", 80, 775, 470, 23, { color: "#9c7050" });
  note("Simplified phase cycle · Valves open or close passively when pressure differences reverse", 90, 890, 1430);
});

export const physiologyTemplates = [circulation, oxygen, reflex, cardiacCycle];
