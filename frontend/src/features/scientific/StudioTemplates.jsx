import React, { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import IllustrationSvg from "./IllustrationSvg";
import { templates } from "./templates";

export default function StudioTemplates({ onTemplate, document: doc, onLayer }) {
  const [query, setQuery] = useState(""), [category, setCategory] = useState("All subjects");
  const categories = [...new Set(templates.map(t => t.category))];
  const filtered = templates.filter(t => `${t.name} ${t.description} ${t.category} ${t.subject}`.toLowerCase().includes(query.toLowerCase()) && (category === "All subjects" || t.category === category));
  return <><div className="sci-library-intro"><h3>A head start for your next idea</h3><p>Editable scientific compositions. Sources and review notes included.</p></div>
    <label className="sci-search"><Search size={15} /><input aria-label="Search scientific templates" placeholder="Search templates…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <select className="sci-category" aria-label="Template subject" value={category} onChange={event => setCategory(event.target.value)}><option>All subjects</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
    {doc.objects.some(obj => obj.isLabel) && <label className="sci-label-toggle"><input type="checkbox" checked={doc.showLabels !== false} onChange={event => onLayer(null, { showLabels: event.target.checked })} />Show prepared labels</label>}
    <div className="sci-result-count">{filtered.length} templates <span>Editable copies</span></div>
    {filtered.map(template => <article className="sci-template" key={template.id}><IllustrationSvg document={template.document} prefix={`template-${template.id}`} />
      <span className="sci-badge">{template.subject} · {template.category}</span><h3>{template.name}</h3><p>{template.description}</p><div className="sci-draft-badge">{template.reviewStatus === "verified" ? "Scientifically reviewed" : "Draft · scientific review required"}</div><details><summary>Scientific notes & sources</summary><p>{template.reviewNotes}</p>{template.references.map(reference => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer">{reference.title}<ChevronRight size={12} /></a>)}</details><button className="sci-primary" aria-label={`Use ${template.name}`} onClick={() => onTemplate(template.id)}>Use template<ChevronRight size={16} /></button></article>)}
    {!filtered.length && <p className="sci-no-results">No matching templates. Try another subject.</p>}
  </>;
}
