const featured = ["animal-cell-detailed", "mitochondrion", "motor-neuron", "chloroplast", "plant-cell-detailed", "nucleus", "dna-double-helix", "ribosome", "folded-protein", "digestive-system", "respiratory-system", "light-microscope"];
const topicOrder = ["Cell Biology", "Molecular Biology", "Genetics", "Biochemistry", "Plant Biology", "Microbiology", "Immunology", "Human Anatomy", "Human Physiology", "Neuroscience", "Ecology", "Laboratory"];
const aliases = {
  mitochondria: ["mitochondri"], mitochondrion: ["mitochondri"], mitochondrial: ["mitochondri"],
  er: ["endoplasmic", "reticulum"], trna: ["transfer", "rna"], mrna: ["messenger", "rna"], rrna: ["ribosomal", "rna"],
  rbc: ["red", "blood", "cell"], wbc: ["white", "blood", "cell"], leukocyte: ["white", "blood", "cell"], erythrocyte: ["red", "blood", "cell"],
  lysosomes: ["lysosome"], ribosomes: ["ribosome"], chloroplasts: ["chloroplast"], neurons: ["neuron"], antibodies: ["antibody"],
  α: ["alpha"], β: ["beta"], γ: ["gamma"],
};

export function normalizeSearch(value = "") {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
const tokens = value => normalizeSearch(value).replace(/\b(?:plasma|cell surface|cytoplasmic) membrane\b/g, "cell membrane").split(" ").filter(Boolean).flatMap(word => aliases[word] || [word]);
const topic = item => item.category === "Anatomy" ? "Human Anatomy" : item.category || "Other";
const searchable = item => [item.name, item.category, topic(item), item.subject, item.description, item.author, ...(item.subjects || []), ...(item.tags || []), ...(item.aliases || [])].filter(value => typeof value === "string").join(" ");
const matches = (item, queryTokens) => {
  if (!queryTokens.length) return true;
  const index = tokens(searchable(item)).join(" ");
  return queryTokens.every(word => index.includes(word));
};

export function libraryTopics(items) {
  const counts = new Map();
  for (const item of items) counts.set(topic(item), (counts.get(topic(item)) || 0) + 1);
  const rank = name => topicOrder.includes(name) ? topicOrder.indexOf(name) : topicOrder.length;
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

export function filterAssets(items, { query = "", category = "", scope = "All", favorites = [], recent = [] } = {}) {
  const wanted = tokens(query), favoriteIds = new Set(favorites), recentOrder = new Map(recent.map((id, index) => [id, index]));
  const filtered = items.filter(item => (!category || topic(item) === category) && matches(item, wanted) && (scope === "All" || (scope === "Favorites" ? favoriteIds.has(item.id) : recentOrder.has(item.id))));
  const q = normalizeSearch(query);
  const rank = item => q && normalizeSearch(item.name) === q ? -1 : featured.includes(item.id) ? featured.indexOf(item.id) : featured.length;
  return filtered.sort(scope === "Recent" ? (a, b) => recentOrder.get(a.id) - recentOrder.get(b.id) : (a, b) => rank(a) - rank(b));
}

export function filterTemplates(items, { query = "", category = "" } = {}) {
  const wanted = tokens(query);
  return items.filter(item => (!category || item.category === category) && matches(item, wanted));
}
