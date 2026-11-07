import { expect, it } from "vitest";
import { filterAssets, filterTemplates, libraryTopics, normalizeSearch } from "./librarySearch";

const assets = [
  { id: "mitochondrion", name: "Mitochondrion", category: "Cell Biology", tags: ["respiration"], author: "A" },
  { id: "er", name: "Endoplasmic reticulum", category: "Cell Biology", tags: ["protein trafficking"], aliases: ["ER"] },
  { id: "membrane", name: "Cell membrane", category: "Cell Biology", tags: ["bilayer", "transport"] },
  { id: "rna", name: "Transfer RNA", category: "Molecular Biology", tags: ["tRNA", "translation"] },
  { id: "heart", name: "Heart", category: "Anatomy", subjects: ["Human physiology"], tags: ["circulation"], author: "Dürr" },
];

it("normalizes scientific notation, punctuation and accents without losing searchable words", () => {
  expect(normalizeSearch("H₂O · α-helix / Dürr")).toBe("h2o α helix durr");
  expect(filterAssets(assets, { query: "human durr" }).map(a => a.id)).toEqual(["heart"]);
});
it("matches all query words across names, tags, subjects and aliases", () => {
  expect(filterAssets(assets, { query: "respiration mito" }).map(a => a.id)).toEqual(["mitochondrion"]);
  expect(filterAssets(assets, { query: "protein ER" }).map(a => a.id)).toEqual(["er"]);
  expect(filterAssets(assets, { query: "respiration heart" })).toEqual([]);
});
it("finds common biological synonyms and abbreviations", () => {
  expect(filterAssets(assets, { query: "mitochondria" }).map(a => a.id)).toEqual(["mitochondrion"]);
  expect(filterAssets(assets, { query: "plasma membrane" }).map(a => a.id)).toEqual(["membrane"]);
  expect(filterAssets(assets, { query: "trna" }).map(a => a.id)).toEqual(["rna"]);
});
it("filters the full collection before paging and preserves recent-use order", () => {
  expect(filterAssets(assets, { scope: "Favorites", favorites: ["heart"] }).map(a => a.id)).toEqual(["heart"]);
  expect(filterAssets(assets, { scope: "Recent", recent: ["heart", "er"] }).map(a => a.id)).toEqual(["heart", "er"]);
  expect(filterAssets(assets, { category: "Human Anatomy" }).map(a => a.id)).toEqual(["heart"]);
});
it("merges legacy anatomy taxonomy and exposes only populated topics with counts", () => {
  const topics = libraryTopics([...assets, { id: "lung", name: "Lung", category: "Human Anatomy" }]);
  expect(topics.find(t => t.name === "Human Anatomy").count).toBe(2);
  expect(topics.some(t => t.name === "Anatomy")).toBe(false);
  expect(topics.reduce((n, t) => n + t.count, 0)).toBe(6);
});
it("searches template topics and tags without depending on an exact phrase", () => {
  const templates = [{ id: "pcr", name: "PCR amplification", category: "Laboratory", subject: "Biology", description: "Denature, anneal and extend DNA", tags: ["polymerase chain reaction"] }];
  expect(filterTemplates(templates, { query: "DNA pcr" })).toHaveLength(1);
  expect(filterTemplates(templates, { query: "polymerase reaction" })).toHaveLength(1);
  expect(filterTemplates(templates, { category: "Cell biology" })).toEqual([]);
});
