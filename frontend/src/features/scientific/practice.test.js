import { expect, it } from "vitest";
import { createDocument, createObject } from "./document";
import { answerMatches, practiceLabels, practicePreview } from "./practice";

it("practises only visible prepared labels including independently grouped labels", () => {
  const label = createObject("text", { text: "RNA polymerase", isLabel: true, groupId: "transcription" });
  const doc = { ...createDocument(), objects: [
    label,
    createObject("text", { text: "Hidden answer", isLabel: true, hidden: true }),
    createObject("text", { text: "Unprepared text" }),
    createObject("text", { text: "  \n ", isLabel: true }),
    createObject("text", { text: "Figure title", isLabel: true, role: "title" }),
    createObject("text", { text: "Review required", isLabel: true, role: "review-status" }),
    createObject("text", { text: "Review notes", isLabel: true, role: "scope-note" }),
  ] };
  expect(practiceLabels(doc).map(obj => obj.text)).toEqual(["RNA polymerase"]);
  expect(practiceLabels({ ...doc, showLabels: false }).map(obj => obj.text)).toEqual(["RNA polymerase"]);
});

it("masks answer text and names in a separate preview without changing any original nested state", () => {
  const target = createObject("asset", { assetId: "dna-double-helix" });
  const label = createObject("text", { text: "Template strand 3′ → 5′", name: "Template strand", isLabel: true, labelFor: target.id });
  const arrow = createObject("arrow", { startBinding: { objectId: target.id, anchor: "point", u: 0.5, v: 0.5 } });
  const doc = { ...createDocument("Template strand"), showLabels: false, objects: [target, label, arrow] };
  const original = JSON.parse(JSON.stringify(doc));
  const preview = practicePreview(doc);
  expect(preview.title).toBe("Label practice figure");
  expect(preview.showLabels).toBe(true);
  expect(preview.objects[1]).toMatchObject({ text: "1 ?", name: "Label 1", x: label.x, y: label.y });
  preview.objects[2].startBinding.u = 1;
  expect(doc).toEqual(original);
  expect(doc.objects[1].text).toBe("Template strand 3′ → 5′");
});

it("ignores case and whitespace while preserving meaningful scientific notation", () => {
  expect(answerMatches("  rna   Polymerase\nII ", "RNA polymerase II")).toBe(true);
  expect(answerMatches(" h₂o + ΔΨ ", "H₂O + Δψ")).toBe(true);
  expect(answerMatches("H2O + Δψ", "H₂O + Δψ")).toBe(false);
  expect(answerMatches("Template 5′ → 3′", "Template 3′ → 5′")).toBe(false);
  expect(answerMatches("", "RNA")).toBe(false);
});
