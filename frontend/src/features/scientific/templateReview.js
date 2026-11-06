import { assetById, usedAssets, validateDocument } from "./document";

const nonempty = (value, max = 2000) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const https = value => { try { return typeof value === "string" && new URL(value).protocol === "https:"; } catch { return false; } };
const licenses = new Set(["CC0-1.0", "Public-Domain", "CC-BY-4.0", "MIT"]);

/** Automated checks establish structural/provenance readiness, never scientific approval. */
export function validateTemplate(template) {
  const issues = [];
  if (!template || typeof template !== "object" || Array.isArray(template)) return { valid: false, issues: ["Template metadata is required"] };
  for (const key of ["id", "name", "subject", "category", "description", "reviewNotes"]) if (!nonempty(template[key], key === "reviewNotes" ? 4000 : 1000)) issues.push(`Template ${key} is required`);
  if (!/^[a-z\d_-]{1,100}$/i.test(template.id || "")) issues.push("Template ID is invalid");
  if (!Number.isInteger(template.version) || template.version < 1) issues.push("Template version must be a positive integer");
  if (!["draft", "verified"].includes(template.reviewStatus)) issues.push("Template review status is invalid");
  let documentValid = true;
  try { validateDocument(template.document); } catch (error) { issues.push(`Document: ${error.message}`); documentValid = false; }
  if (!template.canvas || template.canvas.width !== template.document?.width || template.canvas.height !== template.document?.height) issues.push("Template canvas must match its document");
  if (!Array.isArray(template.references) || !template.references.length || template.references.some(ref => !ref || !nonempty(ref.title, 500) || !https(ref.url))) issues.push("At least one complete HTTPS scientific reference is required");
  if (!Array.isArray(template.attribution)) issues.push("Asset attribution is required");
  else if (documentValid) {
    const actual = usedAssets(template.document), actualIds = new Set(actual.map(a => a.id)), creditedIds = new Set();
    for (const credit of template.attribution) {
      if (!credit || !assetById[credit.id] || !actualIds.has(credit.id) || creditedIds.has(credit.id)) { issues.push("Attribution must identify each used approved asset exactly once"); continue; }
      creditedIds.add(credit.id);
      const canonical = assetById[credit.id];
      for (const key of ["name", "author", "license", "licenseUrl", "sourceUrl", "modifications", "sha256"]) if (!nonempty(credit[key], 5000) || credit[key] !== canonical[key]) issues.push(`Asset attribution ${credit.id} has missing or stale ${key}`);
      if (!licenses.has(credit.license) || !https(credit.licenseUrl) || !https(credit.sourceUrl)) issues.push(`Asset ${credit.id} has incomplete license provenance`);
    }
    if (actual.some(a => !creditedIds.has(a.id))) issues.push("Complete attribution is required for every used asset");
    if (!actual.length) issues.push("Educational templates require approved scientific artwork");
    // Check explicit targets even when an older document validator accepts v1 fields.
    const targets = new Map(template.document.objects.map(o => [o.id, o]));
    for (const obj of template.document.objects) for (const key of ["startBinding", "endBinding"]) {
      const binding = obj[key];
      if (binding && (!["arrow", "connector"].includes(obj.type) || !targets.has(binding.objectId) || ["arrow", "connector"].includes(targets.get(binding.objectId)?.type))) issues.push(`Object ${obj.id} has an invalid ${key} target`);
    }
  }
  if (template.reviewStatus === "verified") {
    const review = template.review;
    if (!review || !nonempty(review.reviewer, 240) || review.decision !== "approved" || typeof review.reviewedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(review.reviewedAt) || !Number.isFinite(Date.parse(review.reviewedAt))) issues.push("Verified templates require a named reviewer, ISO review date and approved decision");
    if (!review || review.templateVersion !== template.version) issues.push("Reviewer approval must match the current template version");
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}
