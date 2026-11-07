import { visibleObjects } from "./composition";

const CONTEXT_ROLES = new Set(["title", "subtitle", "section-heading", "review-status", "review-note", "review-notes", "scope-note"]);

/** The display preference can hide answers in the editor; explicit hidden layers stay excluded. */
export function practiceLabels(document) {
  return visibleObjects({ ...document, showLabels: true }).filter(obj => obj.type === "text" && obj.isLabel === true && obj.text.trim() && !CONTEXT_ROLES.has(obj.role));
}

/** This detached preview is never committed to the editor or its history. */
export function practicePreview(document) {
  const preview = JSON.parse(JSON.stringify(document));
  const numbers = new Map(practiceLabels(document).map((obj, index) => [obj.id, index + 1]));
  preview.title = "Label practice figure";
  preview.showLabels = true;
  preview.objects = preview.objects.map(obj => numbers.has(obj.id)
    ? { ...obj, text: `${numbers.get(obj.id)} ?`, name: `Label ${numbers.get(obj.id)}` }
    : obj);
  return preview;
}

export function answerMatches(answer, expected) {
  const normalize = value => value.trim().replace(/\s+/gu, " ").toLowerCase();
  return Boolean(answer.trim()) && normalize(answer) === normalize(expected);
}
