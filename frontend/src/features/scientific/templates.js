import { createDocument, createObject, duplicateDocument, usedAssets } from "./document";
import { advancedTemplates } from "./templates/advancedTemplates";
import { libraryTemplates } from "./templates/libraryTemplates";
import { validateTemplate } from "./templateReview";

const doc = { ...createDocument("Electron Transport Chain"), id: "template-etc-v1", width: 1600, height: 900 };
const add = (type, props) => { const obj = createObject(type, props); doc.objects.push(obj); return obj; };
const text = (text, x, y, width = 250, fontSize = 23, color = "#334155", extra = {}) => add("text", { text, x, y, width, height: fontSize * 2.8, fontSize, color, ...extra });
const asset = (assetId, x, y, width, height) => add("asset", { assetId, x, y, width, height });
const arrow = (x, y, width, height, color, extra = {}) => add("arrow", { x, y, width, height, color, strokeWidth: 3.5, ...extra });

text("Electron transport chain", 65, 42, 1200, 40, "#263c36", { bold: true });
text("Oxidative phosphorylation · Inner mitochondrial membrane", 66, 100, 1300, 23, "#708179");
add("shape", { x: 45, y: 176, width: 1510, height: 234, color: "#edf4f7" });
add("shape", { x: 45, y: 550, width: 1510, height: 254, color: "#eff5eb" });
text("INTERMEMBRANE\nSPACE", 70, 223, 220, 21, "#557281", { bold: true });
text("Higher H⁺ concentration", 70, 292, 210, 17, "#70818a");
text("MITOCHONDRIAL\nMATRIX", 70, 610, 220, 21, "#57704c", { bold: true });
text("Lower H⁺ concentration", 70, 679, 210, 17, "#7b8873");
asset("etc-bilayer", 260, 395, 1255, 160);
text("Inner membrane", 65, 435, 190, 20, "#8d7a54");
asset("etc-complex-i", 335, 353, 115, 204);
asset("etc-complex-ii", 566, 445, 70, 156);
asset("etc-complex-iii", 802, 349, 137, 209);
asset("etc-complex-iv", 1052, 350, 133, 204);
asset("etc-atp-synthase", 1335, 384, 149, 267);
text("I", 368, 450, 45, 30, "#87495c", { bold: true });
text("II", 585, 500, 45, 27, "#315c82", { bold: true });
text("III", 844, 455, 65, 29, "#69438e", { bold: true });
text("IV", 1094, 452, 65, 29, "#3f783e", { bold: true });
text("Complex I\nNADH dehydrogenase", 295, 701, 235, 20, "#a4526d", { bold: true });
text("Complex II\nSuccinate dehydrogenase", 542, 701, 240, 20, "#386e99", { bold: true });
text("Complex III\nCytochrome bc₁", 784, 701, 240, 20, "#79529d", { bold: true });
text("Complex IV\nCytochrome c oxidase", 1032, 701, 245, 20, "#477d42", { bold: true });
text("ATP synthase\nComplex V", 1310, 701, 220, 20, "#79529d", { bold: true });
// Protons travel from matrix (bottom) to intermembrane space (top) at I/III/IV.
for (const [x, n, role] of [[394, "4 H⁺", "pump-i"], [877, "4 H⁺", "pump-iii"], [1121, "2 H⁺", "pump-iv"]]) {
  arrow(x, 285, 1, 130, "#d15f67", { flipY: true, role });
  text(n, x - 25, 242, 110, 24, "#bf5360", { bold: true });
}
arrow(1413, 270, 1, 365, "#d15f67", { role: "proton-return" });
text("H⁺", 1396, 227, 80, 27, "#bf5360", { bold: true });
text("Proton gradient", 670, 185, 350, 22, "#bf5360");
arrow(515, 227, 800, 1, "#d15f67");
text("NADH → NAD⁺", 300, 610, 270, 24, "#a4526d", { bold: true });
arrow(380, 560, 1, 40, "#3b64b5", { flipY: true });
text("FADH₂ → FAD", 535, 647, 250, 23, "#386e99", { bold: true });
arrow(600, 607, 1, 32, "#3b64b5", { flipY: true, role: "fad-entry" });
text("No proton pumping at II", 534, 680, 240, 16, "#75808d");
// Mobile CoQ lies in the bilayer; cytochrome c lies on its outer surface.
add("shape", { x: 682, y: 432, width: 80, height: 62, shape: "ellipse", color: "#f5d987" });
text("CoQ", 697, 444, 80, 21, "#856923", { bold: true });
// Route I directly to Q above II so the drawing never implies I → II → Q.
add("connector", { x: 450, y: 413, width: 267, height: 1, color: "#3b64b5", strokeWidth: 3.5, role: "electron-i-to-q-horizontal" });
arrow(717, 414, 1, 18, "#3b64b5");
text("2 e⁻", 510, 376, 100, 18, "#3b64b5");
arrow(636, 507, 46, 36, "#3b64b5", { flipY: true });
arrow(764, 464, 40, 1, "#3b64b5");
add("shape", { x: 965, y: 324, width: 90, height: 48, shape: "ellipse", color: "#bedfef" });
text("Cyt c", 977, 332, 80, 19, "#386e99", { bold: true });
arrow(931, 365, 32, 1, "#3b64b5");
arrow(1056, 364, 28, 31, "#3b64b5");
text("½ O₂ + 2 H⁺ + 2 e⁻\n→ H₂O", 1005, 600, 300, 22, "#477d42");
text("ADP + Pᵢ → ATP", 1289, 657, 280, 23, "#79529d", { bold: true });
text("Electron flow", 310, 822, 210, 19, "#3b64b5"); arrow(263, 835, 34, 1, "#3b64b5");
text("Proton movement", 642, 822, 260, 19, "#bf5360"); arrow(595, 835, 34, 1, "#d15f67");
text("Draft · scientific review required", 1100, 824, 430, 17, "#8a795f");
doc.objects.forEach((obj, index) => { obj.id = `etc-object-${index + 1}`; });

const registry = [{
  id: "electron-transport-chain", name: "Electron Transport Chain", subject: "Biology", category: "Cellular respiration",
  description: "Trace electron transfer, proton pumping and ATP synthesis across the inner mitochondrial membrane.",
  version: 1, reviewStatus: "draft", document: doc, canvas: { width: doc.width, height: doc.height },
  attribution: usedAssets(doc),
  reviewNotes: "Source-derived schematic protein silhouettes, not molecular surface models. Requires subject-matter review of biological presentation and species-specific stoichiometry before verification. Membrane and complexes are independent vector objects; their internal paths are not individually editable.",
  references: [
    { title: "Biochemistry, Electron Transport Chain", url: "https://www.ncbi.nlm.nih.gov/books/NBK526105/" },
    { title: "Structure and function of mitochondrial membrane protein complexes", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4625866/" },
  ],
}, ...advancedTemplates, ...libraryTemplates];

// A template cannot enter the editor with broken references or uncredited artwork.
export const templates = registry.map(template => {
  const result = validateTemplate(template);
  if (!result.valid) throw new Error(`Invalid scientific template ${template.id}: ${result.issues.join("; ")}`);
  return template;
});

export function instantiateTemplate(id) {
  const template = templates.find(item => item.id === id);
  if (!template) throw new Error("Template unavailable");
  return { ...duplicateDocument(template.document), templateId: template.id, templateVersion: template.version };
}
