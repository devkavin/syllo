import React, { useRef, useState } from "react";
import { Clock3, Eye, Search, Star, Trash2 } from "lucide-react";
import { assetUrl, catalog, parseDocument } from "./document";
import IllustrationSvg from "./IllustrationSvg";
import { filterAssets, filterTemplates, libraryTopics } from "./librarySearch";
import { curriculumPacks, resolvePack } from "./packs";
import StudioPacks from "./StudioPacks";
import StudioAssetPreview from "./StudioAssetPreview";
import "./packs.css";

const emptyLibrary = { state: { favorites: [], recent: [], items: [] }, loading: false, busy: false, error: "" };
const PAGE_SIZE = 30;
const topics = libraryTopics(catalog);
const packs = curriculumPacks.map(pack => resolvePack(pack.id));
function SavedPreview({ item }) {
  try { return <IllustrationSvg document={parseDocument(item.document)} prefix={`saved-${item.id}`} />; }
  catch { return <p className="sci-inline-note">Preview unavailable. Your saved item is retained.</p>; }
}
export default function StudioLibrary({ onAsset, onTemplate, library = emptyLibrary, accountId, onSaveItem, onUseItem, selectedCount }) {
  const [query, setQuery] = useState(""), [category, setCategory] = useState("All categories"), [scope, setScope] = useState("All");
  const [view, setView] = useState("Assets"), [name, setName] = useState(""), [message, setMessage] = useState(""), [removing, setRemoving] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [packId, setPackId] = useState(""), [previewAsset, setPreviewAsset] = useState(null);
  const previewTrigger = useRef(null);
  const closePreview = () => { setPreviewAsset(null); previewTrigger.current?.focus(); };
  const { state, loading, busy, error } = library;
  const selectedPack = packs.find(pack => pack.id === packId);
  const filtered = filterAssets(selectedPack ? selectedPack.assets : catalog, { query, category: category === "All categories" ? "" : category, scope, favorites: state.favorites, recent: state.recent });
  const packTemplates = selectedPack ? filterTemplates(selectedPack.templates, { query }) : [];
  const visible = filtered.slice(0, visibleCount);
  const save = async kind => { setMessage(""); if (await onSaveItem(kind, name)) { setName(""); setMessage("Saved to your library."); } };
  return <><div className="sci-library-intro"><h3>Scientific illustrations</h3><p>Beautiful science, ready to arrange.</p></div>
    <div className="sci-segments" aria-label="Library collections">{["Assets", "Components", "Presets"].map(label => <button key={label} aria-pressed={view === label} onClick={() => { setView(label); setMessage(""); }}>{label}</button>)}</div>
    {error && <div className="sci-library-error" role="alert">{error}<button onClick={library.retry} disabled={busy || loading}>Retry library sync</button>{library.canDiscard && <button onClick={library.discardFailed} disabled={busy || loading}>Discard unsynced library change</button>}</div>}
    {loading && <p className="sci-inline-note" role="status">Loading your library…</p>}
    {view === "Assets" ? <><label className="sci-search"><Search size={16} /><input aria-label="Search scientific assets" placeholder="Search cells, proteins, equipment…" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} /></label>
      <div className="sci-topic-chips" aria-label="Popular science topics">{["Genetics", "Cell Biology", "Laboratory"].map(topic => <button key={topic} aria-pressed={category === topic} onClick={() => { setCategory(category === topic ? "All categories" : topic); setPackId(""); setVisibleCount(PAGE_SIZE); }}>{topic}</button>)}</div>
      <StudioPacks packs={packs} selectedId={packId} onSelect={id => { setPackId(id); setCategory("All categories"); setVisibleCount(PAGE_SIZE); }} />
      {selectedPack && <details key={selectedPack.id} className="sci-pack-templates" aria-label={`${selectedPack.name} templates`}><summary>{packTemplates.length} prepared templates</summary><h4>{selectedPack.name}</h4><p>{selectedPack.description}</p><p>Drafts for scientific review</p>{packTemplates.map(template => <button key={template.id} aria-label={`Use template ${template.name}`} disabled={!onTemplate} onClick={() => onTemplate(template.id)}><span>{template.name}</span><small>Use template</small></button>)}{!packTemplates.length && <p>No templates match this search.</p>}</details>}
      <select aria-label="Asset category" className="sci-category" value={category} onChange={event => { setCategory(event.target.value); setVisibleCount(PAGE_SIZE); }}><option>All categories</option>{topics.map(({ name, count }) => <option key={name} value={name}>{name} ({count})</option>)}</select>
      <div className="sci-filter-chips" aria-label="Asset collections">{[["All", null], ["Favorites", Star], ["Recent", Clock3]].map(([label, Icon]) => <button key={label} aria-pressed={scope === label} onClick={() => { setScope(label); setVisibleCount(PAGE_SIZE); }}>{Icon && <Icon size={12} />}{label}</button>)}</div>
      <div className="sci-result-count" role="status">{visible.length < filtered.length ? `Showing ${visible.length} of ${filtered.length}` : filtered.length} illustrations <span>SVG vectors</span></div>
      {previewAsset && <StudioAssetPreview asset={previewAsset} onInsert={onAsset} onClose={closePreview} />}
      <div className="sci-asset-grid">{visible.map(asset => <article className="sci-asset-wrap" key={asset.id}><button className="sci-asset-card" aria-label={`Insert ${asset.name}`} title={`${asset.name} · ${asset.author} · ${asset.license}`} draggable onDragStart={event => { event.dataTransfer.setData("application/x-syllo-scientific", asset.id); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => onAsset(asset.id)}><span><img src={assetUrl(asset.id)} alt="" loading="lazy" decoding="async" draggable={false} /></span><strong>{asset.name}</strong><small>{asset.license.replace("-1.0", "").replace("-4.0", "")}</small></button>
        <button className="sci-preview-button" aria-label={`Preview ${asset.name}`} title="Preview artwork and credits" onClick={event => { previewTrigger.current = event.currentTarget; setPreviewAsset(asset); }}><Eye size={13} /></button>
        <button className={`sci-favorite ${state.favorites.includes(asset.id) ? "is-favorite" : ""}`} aria-label={`${state.favorites.includes(asset.id) ? "Unfavorite" : "Favorite"} ${asset.name}`} aria-pressed={state.favorites.includes(asset.id)} title={accountId ? "Favorite illustration" : "Sign in to keep favorites"} disabled={!accountId || loading} onClick={() => library.toggleFavorite(asset.id)}><Star size={12} fill={state.favorites.includes(asset.id) ? "currentColor" : "none"} /></button></article>)}</div>
      {visible.length < filtered.length && <button className="sci-load-more" aria-label="Show more illustrations" onClick={() => setVisibleCount(count => count + PAGE_SIZE)}>Show more illustrations<span>{filtered.length - visible.length} more</span></button>}
      {!filtered.length && <p className="sci-no-results">{scope === "All" ? "No matches. Try “cell”, “DNA”, or another category." : scope === "Favorites" ? "Star illustrations to keep your favorites here." : "Recently inserted illustrations will appear here."}</p>}
      <div className="sci-library-footer">Curated from Bioicons & Wikimedia Commons.<br />Individually licensed. Always available without AI.</div>
    </> : <><div className="sci-save-composition"><h4>{view === "Components" ? "Reuse a selection" : "Keep this canvas"}</h4><p>{view === "Components" ? "Save selected objects together, with labels and connections." : "Save your entire figure as a starting point for another note."}</p>
        <label className="sci-field"><span>Saved item name</span><input aria-label="Saved item name" maxLength={120} placeholder={view === "Components" ? "e.g. Labeled mitochondrion" : "e.g. My respiration notes"} value={name} onChange={event => setName(event.target.value)} /></label>
        <button className="sci-primary" disabled={!accountId || busy || loading || !name.trim() || (view === "Components" && !selectedCount)} onClick={() => save(view === "Components" ? "component" : "preset")}>{busy ? "Syncing library…" : view === "Components" ? "Save selected component" : "Save canvas preset"}</button>
        {!accountId && <small>Sign in to save your personal library.</small>}{message && <small role="status">{message}</small>}</div>
      <p className="sci-inline-note">Your library · {state.items.length}/20 saved items. Editable copies retain their artwork credits.</p>
      {state.items.filter(item => item.kind === (view === "Components" ? "component" : "preset")).map(item => <article className="sci-saved-card" key={item.id}><button aria-label={`Use saved ${item.name}`} onClick={() => onUseItem(item)}><SavedPreview item={item} /><strong>{item.name}</strong><small>{item.kind === "preset" ? "Open as a new canvas" : "Insert editable group"}</small></button>
        {removing === item.id ? <div className="sci-inline-remove"><span>Remove from your library?</span><button disabled={busy} onClick={async () => { if (await library.removeItem(item.id)) setRemoving(null); }}>Remove</button><button onClick={() => setRemoving(null)}>Keep</button></div> : <button className="sci-remove-saved" aria-label={`Remove saved ${item.name}`} onClick={() => setRemoving(item.id)}><Trash2 size={13} /></button>}</article>)}
    </>}
  </>;
}
