import React, { useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Eye, EyeOff, Layers, LockKeyhole, UnlockKeyhole } from "lucide-react";
import { objectName, outlineUnits } from "./layerNames";

export default function StudioLayerOutline({ document: doc, selected, setSelected, onLayer, onReorder }) {
  const [expanded, setExpanded] = useState([]);
  const units = outlineUnits(doc.objects), primary = units.filter(unit => !unit.context), context = units.filter(unit => unit.context);
  const actions = (objects, name, grouped = false) => {
    const hidden = objects.every(obj => obj.hidden), locked = objects.some(obj => obj.locked), ids = objects.map(obj => obj.id), noun = grouped ? "group" : "layer";
    const index = doc.objects.findIndex(obj => obj.id === ids[0]);
    return <div className="sci-layer-actions">
      <button aria-label={`${hidden ? "Show" : "Hide"} ${noun} ${name}`} title={hidden ? "Show" : "Hide"} onClick={() => onLayer(ids, { hidden: !hidden })}>{hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
      <button aria-label={`${locked ? "Unlock" : "Lock"} ${noun} ${name}`} title={locked ? "Unlock" : "Lock"} onClick={() => onLayer(ids, { locked: !locked })}>{locked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}</button>
      {!grouped && <><button aria-label={`Raise layer ${name}`} title="Bring forward" disabled={locked || index === doc.objects.length - 1} onClick={() => onReorder(ids[0], 1)}><ArrowUp size={12} /></button><button aria-label={`Lower layer ${name}`} title="Send backward" disabled={locked || index === 0} onClick={() => onReorder(ids[0], -1)}><ArrowDown size={12} /></button></>}
    </div>;
  };
  const row = unit => {
    const ids = unit.objects.map(obj => obj.id), selectedUnit = ids.some(id => selected.includes(id)), open = expanded.includes(unit.id);
    return <li key={unit.id} className={`${selectedUnit ? "is-selected" : ""} ${unit.objects.every(obj => obj.hidden) ? "is-hidden" : ""}`}>
      <div className="sci-outline-unit-row">{unit.grouped && <button className="sci-group-disclosure" aria-label={`${open ? "Collapse" : "Expand"} group ${unit.name}`} aria-expanded={open} onClick={() => setExpanded(current => open ? current.filter(id => id !== unit.id) : [...current, unit.id])}><ChevronRight size={12} className={open ? "is-open" : ""} /></button>}
        <button className="sci-layer-select" title={unit.name} aria-label={`Select ${unit.grouped ? "group" : "layer"} ${unit.grouped ? unit.name : objectName(unit.objects[0])}`} aria-pressed={selectedUnit} onClick={() => setSelected(ids)}><span>{unit.grouped && <Layers size={12} />}{unit.grouped ? unit.name : objectName(unit.objects[0])}</span><small>{unit.grouped ? `${ids.length} objects` : unit.objects[0].type}</small></button>
        {actions(unit.objects, unit.grouped ? unit.name : objectName(unit.objects[0]), unit.grouped)}
      </div>
      {unit.grouped && open && <ol className="sci-group-children">{unit.objects.map(obj => <li key={obj.id} className={selected.includes(obj.id) ? "is-selected" : ""}><button className="sci-layer-select" aria-label={`Edit layer ${objectName(obj)}`} title={objectName(obj)} onClick={() => setSelected([obj.id])}><span>{objectName(obj)}</span><small>{obj.type}{obj.isLabel ? " · label" : ""}</small></button>{actions([obj], objectName(obj))}</li>)}</ol>}
    </li>;
  };
  return <section className="sci-layers" aria-label="Canvas layers">
    {!doc.objects.length && <p className="sci-no-results">Your illustrations and labels will appear here.</p>}
    <ol className="sci-outline-tree">{primary.map(row)}</ol>
    {context.length > 0 && <details className="sci-outline-details"><summary>Figure details ({context.length})</summary><ol className="sci-outline-tree">{context.map(row)}</ol></details>}
  </section>;
}
