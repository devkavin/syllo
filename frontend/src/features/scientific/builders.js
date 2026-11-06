import { assetById, createObject, uid } from "./document";

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const proteinChoices = ["calcium-channel", "membrane-receptor", "etc-complex-i", "etc-complex-ii", "etc-complex-iii", "etc-complex-iv", "etc-atp-synthase"];
export const membraneProteinIds = proteinChoices.filter(id => assetById[id]);

function approved(id) {
  if (typeof id !== "string" || !assetById[id]) throw new Error("Choose artwork from the approved library");
  return assetById[id];
}

function shortLabel(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > 120 || value.includes("\n")) throw new Error("Builder labels must be a single line of at most 120 characters");
  return value;
}

function fitArtwork(assetId, x, y, boxWidth, boxHeight, extra = {}) {
  const ratio = approved(assetId).aspectRatio || 1;
  const width = Math.min(boxWidth, boxHeight * ratio), height = width / ratio;
  return createObject("asset", { assetId, name: assetById[assetId].name, x: x + (boxWidth - width) / 2, y: y + (boxHeight - height) / 2, width, height, ...extra });
}

function label(text, target, x, y, groupId, extra = {}) {
  return createObject("text", { text, name: text.slice(0, 120), x, y, width: 230, height: 52, fontSize: 20, color: "#334155", groupId, isLabel: true, labelFor: target.id, ...extra });
}

const point = (object, anchor, u, v) => anchor === "point" ? { x: object.x + object.width * u, y: object.y + object.height * v } : ({
  left: { x: object.x, y: object.y + object.height / 2 }, right: { x: object.x + object.width, y: object.y + object.height / 2 },
  top: { x: object.x + object.width / 2, y: object.y }, bottom: { x: object.x + object.width / 2, y: object.y + object.height },
  center: { x: object.x + object.width / 2, y: object.y + object.height / 2 },
})[anchor];

function boundLine(from, to, startAnchor, endAnchor, extra = {}, targetPoint) {
  const a = point(from, startAnchor), b = point(to, endAnchor, targetPoint?.[0], targetPoint?.[1]);
  return createObject("arrow", { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(1, Math.abs(b.x - a.x)), height: Math.max(1, Math.abs(b.y - a.y)), flipX: b.x < a.x, flipY: b.y < a.y,
    startBinding: { objectId: from.id, anchor: startAnchor }, endBinding: { objectId: to.id, anchor: endAnchor, ...(targetPoint ? { u: targetPoint[0], v: targetPoint[1] } : {}) }, ...extra });
}

/** A schematic membrane arrangement. The approved source is actual bilayer artwork. */
export function buildMembrane({ length = 900, orientation = "horizontal", proteinId = "calcium-channel", proteinCount = 2 } = {}) {
  if (!Number.isFinite(length) || !Number.isFinite(proteinCount)) throw new Error("Membrane dimensions and protein count must be finite numbers");
  if (!["horizontal", "vertical"].includes(orientation)) throw new Error("Choose a horizontal or vertical membrane");
  if (!proteinChoices.includes(proteinId) || !assetById[proteinId]) throw new Error("Choose an approved membrane protein");
  const span = clamp(length, 240, 1800), count = clamp(Math.round(proteinCount), 0, 8), groupId = uid();
  // Repeat a source strip for longer membranes instead of stretching the bilayer's thickness.
  const tileCount = Math.ceil(span / 900), tileWidth = span / tileCount;
  const membrane = { x: 120, y: 230, width: span, height: tileWidth / approved("etc-bilayer").aspectRatio };
  const objects = Array.from({ length: tileCount }, (_, index) => createObject("asset", { assetId: "etc-bilayer", name: "Phospholipid bilayer", x: membrane.x + index * tileWidth, y: membrane.y, width: tileWidth, height: membrane.height, groupId, role: "membrane" }));
  objects.push(label("Phospholipid bilayer", objects[0], 120, 145, groupId));
  for (let i = 0; i < count; i++) {
    const height = Math.max(110, membrane.height * 1.3), width = height * approved(proteinId).aspectRatio;
    const protein = fitArtwork(proteinId, membrane.x + span * (i + 1) / (count + 1) - width / 2, membrane.y + membrane.height / 2 - height / 2, width, height, { groupId, role: "membrane-protein" });
    objects.push(protein, label(assetById[proteinId].name, protein, protein.x - 40, membrane.y + membrane.height + 55 + (i % 2) * 52, groupId, { width: 200 }));
  }
  if (orientation === "vertical") {
    // Rotate positions around the membrane's upper-left origin; keep text upright.
    const cx = membrane.x + membrane.width / 2, cy = membrane.y + membrane.height / 2;
    for (const object of objects) {
      const dx = object.x + object.width / 2 - cx, dy = object.y + object.height / 2 - cy;
      object.x = 420 - dy - object.width / 2;
      object.y = 120 + span / 2 + dx - object.height / 2;
      if (object.type === "asset") object.rotation = 90;
    }
  }
  return objects;
}

/** Arrange licensed artwork as an editable sequence; labels describe the user's process. */
export function buildProcess({ assetIds, labels = [], direction = "horizontal", interactionLabels = [] } = {}) {
  if (!Array.isArray(assetIds) || assetIds.length < 1 || assetIds.length > 8) throw new Error("A process requires between one and eight approved assets");
  if (!Array.isArray(labels) || !Array.isArray(interactionLabels) || labels.length > assetIds.length || interactionLabels.length > assetIds.length - 1) throw new Error("Process labels must match the selected steps");
  if (!["horizontal", "vertical"].includes(direction)) throw new Error("Choose a horizontal or vertical process");
  assetIds.forEach(approved);
  const groupId = uid(), objects = [], art = [];
  assetIds.forEach((assetId, index) => {
    const x = direction === "horizontal" ? 100 + index * 320 : 130, y = direction === "vertical" ? 100 + index * 310 : 140;
    const object = fitArtwork(assetId, x, y, 180, 160, { groupId, role: "process-step" });
    art.push(object); objects.push(object, label(shortLabel(labels[index], assetById[assetId].name), object, x - 10, y + 175, groupId));
  });
  for (let i = 0; i < art.length - 1; i++) {
    const horizontal = direction === "horizontal";
    const arrow = boundLine(art[i], art[i + 1], horizontal ? "right" : "bottom", horizontal ? "left" : "top", { groupId, role: "process-flow" });
    objects.push(arrow);
    const interaction = shortLabel(interactionLabels[i], "");
    if (interaction) objects.push(label(interaction, art[i], horizontal ? 270 + i * 320 : 340, horizontal ? 95 : 290 + i * 310, groupId, { width: 210, fontSize: 16 }));
  }
  return objects;
}

// Coordinates refer to the normalized approved SVG viewBox. Source-internal lettering
// remains part of the licensed vector; showLabels controls the independent additions.
const anatomy = {
  "human-heart": {
    name: "Human heart", notes: "Two-panel diastole/systole source. Original labels are embedded vector paths and remain visible when independent labels are hidden.",
    landmarks: [{ text: "Aorta", u: 0.32, v: 0.16, side: "left", row: 0 }, { text: "Diastole · filling", u: 0.28, v: 0.58, side: "left", row: 2 }, { text: "Systole · ejection", u: 0.80, v: 0.56, side: "right", row: 2 }],
  },
  "digestive-system": {
    name: "Digestive system", notes: "Prepared labels point to original source leader endpoints. Original annotation layers were removed from the licensed artwork; all added labels and pointers are independently editable.",
    landmarks: [{ text: "Esophagus", u: 0.5165, v: 0.3417, side: "right", row: 0 }, { text: "Liver", u: 0.378, v: 0.551, side: "left", row: 1 }, { text: "Stomach", u: 0.629, v: 0.552, side: "right", row: 1 }, { text: "Gallbladder", u: 0.402, v: 0.589, side: "left", row: 2 }, { text: "Pancreas", u: 0.488, v: 0.643, side: "right", row: 2 }, { text: "Ascending colon", u: 0.367, v: 0.803, side: "left", row: 3 }, { text: "Descending colon", u: 0.680, v: 0.826, side: "right", row: 3 }, { text: "Rectum", u: 0.512, v: 0.918, side: "left", row: 4 }],
  },
  "respiratory-system": {
    name: "Respiratory system", notes: "Prepared labels follow the source's airway, lung and magnified alveolar inset landmarks. Original annotation layers were removed; all added labels and pointers are independently editable.",
    landmarks: [{ text: "Nasal cavity", u: 0.35823, v: 0.15008, side: "left", row: 0 }, { text: "Alveoli · magnified inset", u: 0.90961, v: 0.34863, side: "right", row: 0 }, { text: "Trachea", u: 0.45676, v: 0.42042, side: "left", row: 1 }, { text: "Main bronchi", u: 0.44214, v: 0.53789, side: "right", row: 1 }, { text: "Right lung", u: 0.375, v: 0.631, side: "left", row: 2 }, { text: "Left lung", u: 0.606, v: 0.631, side: "right", row: 2 }, { text: "Diaphragm", u: 0.27228, v: 0.82209, side: "left", row: 3 }],
  },
};

export const preparedAnatomy = Object.entries(anatomy).filter(([assetId]) => assetById[assetId]).map(([assetId, entry]) => ({ assetId, name: entry.name, notes: entry.notes }));

export function buildAnatomy({ assetId, showLabels = true } = {}) {
  const preset = anatomy[assetId];
  if (!preset) throw new Error("Choose anatomy with prepared, inspected landmarks");
  if (typeof showLabels !== "boolean") throw new Error("Label visibility must be true or false");
  approved(assetId);
  const groupId = uid(), art = fitArtwork(assetId, 330, 120, 700, 630, { groupId, role: "anatomy" }), objects = [art];
  for (const landmark of preset.landmarks) {
    const text = label(landmark.text, art, landmark.side === "left" ? 40 : 1080, 165 + landmark.row * 135, groupId, { hidden: !showLabels, width: 240, height: 54 });
    const pointer = boundLine(text, art, landmark.side === "left" ? "right" : "left", "point", { type: "connector", groupId, color: "#64748b", strokeWidth: 2, isLabel: true, labelFor: art.id, hidden: !showLabels, role: "anatomy-label-pointer" }, [landmark.u, landmark.v]);
    objects.push(pointer, text);
  }
  return objects;
}
