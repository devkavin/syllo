import { describe, expect, it } from "vitest";
import { createDocument, createObject, usedAssets } from "./document";
import { validateTemplate } from "./templateReview";
import { advancedTemplates } from "./templates/advancedTemplates";

const template = () => {
  const document = { ...createDocument("Reviewed composition"), objects: [createObject("asset", { assetId: "mitochondrion" })] };
  return { id: "review-fixture", name: "Reviewed composition", subject: "Biology", category: "Respiration", description: "An editable mitochondrion composition.", version: 2, reviewStatus: "draft", document, canvas: { width: document.width, height: document.height }, attribution: usedAssets(document), reviewNotes: "Requires scientific review.", references: [{ title: "Biology", url: "https://openstax.org/books/biology-2e/pages/7-3-oxidation-of-pyruvate-and-the-citric-acid-cycle" }] };
};

describe("scientific template review", () => {
  it("uses inspected independently editable point labels in cell and anatomy compositions", () => {
    for (const id of ["cell-structure", "digestive-system", "respiratory-system"]) {
      const document = advancedTemplates.find(t => t.id === id).document;
      const index = new Map(document.objects.map(obj => [obj.id, obj]));
      const pointers = document.objects.filter(obj => obj.endBinding?.anchor === "point");
      expect(pointers.length, id).toBeGreaterThanOrEqual(7);
      for (const pointer of pointers) {
        expect(pointer.isLabel).toBe(true);
        expect(index.get(pointer.startBinding.objectId).type).toBe("text");
        expect(index.get(pointer.endBinding.objectId).type).toBe("asset");
      }
    }
  });
  it("rejects verification without an approved reviewer record for this template version", () => {
    const item = { ...template(), reviewStatus: "verified" };
    expect(validateTemplate(item).valid).toBe(false);
    item.review = { reviewer: "Subject reviewer", reviewedAt: "2026-10-26T10:00:00Z", templateVersion: 1, decision: "approved" };
    expect(validateTemplate(item).issues.join(" ")).toMatch(/version/i);
    item.review.templateVersion = 2;
    expect(validateTemplate(item)).toEqual({ valid: true, issues: [] });
  });
  it("requires complete asset attribution and a scientific reference", () => {
    const item = template(); item.attribution = [];
    expect(validateTemplate(item).issues.join(" ")).toMatch(/attribution/i);
    item.attribution = usedAssets(item.document).map(a => ({ ...a, licenseUrl: "" }));
    expect(validateTemplate(item).valid).toBe(false);
    item.attribution = usedAssets(item.document); item.references = [{ title: "Untrusted", url: "javascript:alert(1)" }];
    expect(validateTemplate(item).issues.join(" ")).toMatch(/reference/i);
  });
  it("rejects invalid bindings and an unsupported canvas without throwing", () => {
    const item = template(); item.document.objects.push(createObject("arrow", { endBinding: { objectId: "missing", anchor: "center" } }));
    expect(validateTemplate(item).valid).toBe(false);
    expect(validateTemplate(null).valid).toBe(false);
    expect(validateTemplate({ ...template(), canvas: { width: 40, height: 40 } }).valid).toBe(false);
  });
  it("ships the requested compositions as valid, sourced drafts without fabricated human review", () => {
    expect(advancedTemplates.map(t => t.id)).toEqual(["photosynthesis", "krebs-cycle", "glycolysis", "neuron-synapse", "cell-structure", "dna-replication", "protein-synthesis", "digestive-system", "respiratory-system"]);
    for (const item of advancedTemplates) {
      expect(validateTemplate(item), item.id).toEqual({ valid: true, issues: [] });
      expect(item.reviewStatus).toBe("draft"); expect(item.review).toBeUndefined();
      expect(item.reviewNotes).toMatch(/review/i);
      expect(item.attribution.length).toBeGreaterThan(0);
    }
  });
  it("preserves the ordered glycolytic intermediates, triose branch and pyruvate direction", () => {
    const doc = advancedTemplates.find(t => t.id === "glycolysis").document;
    const byText = text => doc.objects.find(o => o.type === "text" && o.text === text);
    const edges = doc.objects.filter(o => o.type === "arrow" && o.role === "reaction");
    const hasEdge = (from, to) => edges.some(e => e.startBinding?.objectId === byText(from)?.id && e.endBinding?.objectId === byText(to)?.id);
    for (const [from, to] of [["Glucose", "Glucose-6-phosphate"], ["Glucose-6-phosphate", "Fructose-6-phosphate"], ["Fructose-6-phosphate", "Fructose-1,6-bisphosphate"], ["Fructose-1,6-bisphosphate", "Glyceraldehyde-3-phosphate"], ["Dihydroxyacetone phosphate", "Glyceraldehyde-3-phosphate"], ["Glyceraldehyde-3-phosphate", "1,3-Bisphosphoglycerate"], ["1,3-Bisphosphoglycerate", "3-Phosphoglycerate"], ["3-Phosphoglycerate", "2-Phosphoglycerate"], ["2-Phosphoglycerate", "Phosphoenolpyruvate"], ["Phosphoenolpyruvate", "Pyruvate"]]) expect(hasEdge(from, to), `${from} → ${to}`).toBe(true);
    expect(doc.objects.some(o => o.text?.includes("Net per glucose: 2 pyruvate"))).toBe(true);
  });
  it("closes the Krebs cycle from oxaloacetate through citrate and back", () => {
    const doc = advancedTemplates.find(t => t.id === "krebs-cycle").document;
    const names = new Map(doc.objects.filter(o => o.type === "text").map(o => [o.text, o.id]));
    const sequence = ["Citrate", "Isocitrate", "α-Ketoglutarate", "Succinyl-CoA", "Succinate", "Fumarate", "Malate", "Oxaloacetate", "Citrate"];
    for (let i = 0; i < sequence.length - 1; i++) expect(doc.objects.some(o => o.type === "arrow" && o.startBinding?.objectId === names.get(sequence[i]) && o.endBinding?.objectId === names.get(sequence[i + 1]))).toBe(true);
  });
});
