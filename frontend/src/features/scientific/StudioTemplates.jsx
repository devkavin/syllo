import React, { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import IllustrationSvg from "./IllustrationSvg";
import { templates } from "./templates";
import { filterTemplates } from "./librarySearch";

const PAGE_SIZE = 8;

export default function StudioTemplates({ onTemplate, document: doc, onLayer }) {
  const [query, setQuery] = useState(""), [category, setCategory] = useState("All subjects");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const categories = [...new Set(templates.map(t => t.category))];
  const filtered = filterTemplates(templates, { query, category: category === "All subjects" ? "" : category });
  const visible = filtered.slice(0, visibleCount);
  return <><div className="sci-library-intro"><h3>A head start for your next idea</h3><p>Editable scientific compositions. Sources and review notes included.</p></div>
    <label className="sci-search"><Search size={15} /><input aria-label="Search scientific templates" placeholder="Search templates…" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} /></label>
    <select className="sci-category" aria-label="Template topic" value={category} onChange={event => { setCategory(event.target.value); setVisibleCount(PAGE_SIZE); }}><option>All subjects</option>{categories.map(c => <option key={c} value={c}>{c} ({templates.filter(t => t.category === c).length})</option>)}</select>
    {doc.objects.some(obj => obj.isLabel) && <label className="sci-label-toggle"><input type="checkbox" checked={doc.showLabels !== false} onChange={event => onLayer(null, { showLabels: event.target.checked })} />Show prepared labels</label>}
    <div className="sci-result-count" role="status">{visible.length < filtered.length ? `Showing ${visible.length} of ${filtered.length}` : filtered.length} templates <span>Editable copies</span></div>
    {visible.map(template => <article className="sci-template" key={template.id}><IllustrationSvg document={template.document} prefix={`template-${template.id}`} />
      <span className="sci-badge">{template.subject} · {template.category}</span><h3>{template.name}</h3><p>{template.description}</p><div className="sci-draft-badge">{template.reviewStatus === "verified" ? "Scientifically reviewed" : "Draft · scientific review required"}</div><details><summary>Scientific notes & sources</summary><p>{template.reviewNotes}</p>{template.references.map(reference => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer">{reference.title}<ChevronRight size={12} /></a>)}</details><button className="sci-primary" aria-label={`Use ${template.name}`} onClick={() => onTemplate(template.id)}>Use template<ChevronRight size={16} /></button></article>)}
    {!filtered.length && <p className="sci-no-results">No matching templates. Try another subject.</p>}
    {visible.length < filtered.length && <button className="sci-load-more" aria-label="Show more templates" onClick={() => setVisibleCount(count => count + PAGE_SIZE)}>Show more templates<span>{filtered.length - visible.length} more</span></button>}
  </>;
}
