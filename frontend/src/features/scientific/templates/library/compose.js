import { assetById, createDocument, createObject, usedAssets } from "../../document";
import { synchronizeBindings } from "../../composition";
import { labelLines } from "../../IllustrationSvg";

export const biology = (section, title) => ({ title: `OpenStax Biology 2e · ${title}`, url: `https://openstax.org/books/biology-2e/pages/${section}` });
export const anatomy = (section, title) => ({ title: `OpenStax Anatomy and Physiology 2e · ${title}`, url: `https://openstax.org/books/anatomy-and-physiology-2e/pages/${section}` });

/** Labels, molecular notation and arrows are native editable objects; artwork remains licensed SVG. */
export function compose({ id, name, category, description, references, notes, tags = [] }, build) {
  const document = { ...createDocument(name), id: `template-${id}-v1`, width: 1600, height: 1000 };
  const add = (type, props) => {
    const object = createObject(type, { ...props, id: `lt-${id}-${document.objects.length + 1}` });
    document.objects.push(object);
    return object;
  };
  const text = (value, x, y, width = 360, fontSize = 24, props = {}) => add("text", {
    text: value, x, y, width, fontSize, color: "#334155",
    height: Math.max(35, labelLines({ text: value, width, fontSize }).length * fontSize * 1.32 + 8), ...props,
  });
  const asset = (assetId, x, y, maxWidth, maxHeight, props = {}) => {
    const art = assetById[assetId];
    if (!art) throw new Error(`Template ${id} requires approved artwork ${assetId}`);
    const ratio = art.aspectRatio, width = Math.min(maxWidth, maxHeight * ratio), height = width / ratio;
    return add("asset", { assetId, name: art.name, x: x + (maxWidth - width) / 2, y: y + (maxHeight - height) / 2, width, height, ...props });
  };
  const arrow = (from, to, startAnchor = "right", endAnchor = "left", props = {}) => add("arrow", {
    x: 0, y: 0, width: 1, height: 1, color: "#537e76", strokeWidth: 3,
    startBinding: { objectId: from.id, anchor: startAnchor }, endBinding: { objectId: to.id, anchor: endAnchor }, role: "process-flow", ...props,
  });
  const label = (value, target, x, y, width = 360, fontSize = 22, props = {}) => text(value, x, y, width, fontSize, { isLabel: true, labelFor: target.id, ...props });
  const heading = (value, x, y, width = 450) => text(value, x, y, width, 28, { bold: true, color: "#2d5147", role: "section-heading" });
  const note = (value, x = 70, y = 860, width = 1460) => text(value, x, y, width, 20, { color: "#6d7c75", role: "scope-note" });
  text(name, 65, 35, 1470, 42, { bold: true, color: "#263c36", role: "title" });
  text(description, 67, 105, 1460, 22, { color: "#708179", role: "subtitle" });
  build({ document, add, text, asset, arrow, label, heading, note });
  text("DRAFT · Subject matter review required · Editable labels, arrows and scientific notation", 65, 948, 1470, 17, { color: "#8a795f", role: "review-status" });
  document.objects = synchronizeBindings(document).objects;
  return {
    id, name, subject: "Biology", category, description, version: 1, reviewStatus: "draft", tags,
    document, canvas: { width: document.width, height: document.height }, attribution: usedAssets(document),
    reviewNotes: `Draft requiring subject matter review. ${notes} All licensed artwork is schematic and not to a shared scale. Added labels, arrows and notation are independently editable; internal source SVG paths and any source lettering remain a single artwork object.`, references,
  };
}
