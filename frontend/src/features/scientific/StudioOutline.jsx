import React from "react";
import { ChevronLeft, Layers, PencilLine } from "lucide-react";
import StudioLayers from "./StudioLayers";

export default function StudioOutline({ document: doc, selected, setSelected, onLayer, onReorder, open, onToggle, onPractice, practiceCount, disabled }) {
  return <aside id="sci-figure-outline" className={`sci-outline ${open ? "is-open" : "is-closed"}`} aria-label="Figure outline" inert={disabled}>
    <div className="sci-outline-heading"><h3><Layers size={16} />Figure outline</h3><button aria-label="Collapse figure outline" title="Collapse outline" onClick={onToggle}><ChevronLeft size={16} /></button></div>
    <p className="sci-outline-subtitle">{doc.objects.length} editable objects</p>
    <div className="sci-outline-scroll"><StudioLayers compact document={doc} selected={selected} setSelected={setSelected} onLayer={onLayer} onReorder={onReorder} /></div>
    <div className="sci-outline-footer">
      <label className="sci-outline-label-toggle"><span>Show labels</span><input aria-label="Show prepared labels" type="checkbox" role="switch" checked={doc.showLabels !== false} disabled={!doc.objects.some(obj => obj.isLabel)} onChange={event => onLayer(null, { showLabels: event.target.checked })} /></label>
      <button className="sci-practice-launch" onClick={onPractice} disabled={!practiceCount}><PencilLine size={15} />Practice labels</button>
      <small>{practiceCount ? `${practiceCount} prepared ${practiceCount === 1 ? "label" : "labels"} · your figure stays unchanged` : "Mark text as a prepared label in Properties to practice it."}</small>
    </div>
  </aside>;
}
