import React from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, LockKeyhole, UnlockKeyhole } from "lucide-react";
import { assetById, expandSelection } from "./document";

export const objectName = obj => obj.name || (obj.type === "asset" ? assetById[obj.assetId]?.name || "Unavailable asset" : obj.type === "text" ? obj.text.split("\n")[0] : obj.type === "arrow" ? "Directional arrow" : obj.type === "connector" ? "Connector" : "Annotation");

export default function StudioLayers({ document: doc, selected, setSelected, onLayer, onReorder }) {
  return <section className="sci-layers" aria-label="Canvas layers">
    <div className="sci-library-intro"><h3>Layers & arrangement</h3><p>Top layers appear in front. Hide, lock or select any object.</p></div>
    <label className="sci-label-toggle"><input type="checkbox" checked={doc.showLabels !== false} onChange={event => onLayer(null, { showLabels: event.target.checked })} />Show prepared labels</label>
    {!doc.objects.length && <p className="sci-no-results">Your illustrations and annotations will appear here.</p>}
    <ol>{[...doc.objects].reverse().map((obj, i) => <li key={obj.id} className={`${selected.includes(obj.id) ? "is-selected" : ""} ${obj.hidden ? "is-hidden" : ""}`}>
      <button className="sci-layer-select" title={objectName(obj)} aria-label={`Select layer ${objectName(obj)}`} aria-pressed={selected.includes(obj.id)} onClick={() => setSelected(expandSelection(doc.objects, [obj.id]))}><span>{objectName(obj)}</span><small>{obj.groupId ? "Grouped · " : ""}{obj.type}{obj.isLabel ? " · label" : ""}</small></button>
      <div className="sci-layer-actions">
        <button aria-label={`${obj.hidden ? "Show" : "Hide"} layer ${objectName(obj)}`} title={obj.hidden ? "Show layer" : "Hide layer"} onClick={() => onLayer([obj.id], { hidden: !obj.hidden })}>{obj.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
        <button aria-label={`${obj.locked ? "Unlock" : "Lock"} layer ${objectName(obj)}`} title={obj.locked ? "Unlock layer" : "Lock layer"} onClick={() => onLayer([obj.id], { locked: !obj.locked })}>{obj.locked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}</button>
        <button aria-label={`Raise layer ${objectName(obj)}`} title="Bring forward" disabled={i === 0 || obj.locked} onClick={() => onReorder(obj.id, 1)}><ArrowUp size={13} /></button>
        <button aria-label={`Lower layer ${objectName(obj)}`} title="Send backward" disabled={i === doc.objects.length - 1 || obj.locked} onClick={() => onReorder(obj.id, -1)}><ArrowDown size={13} /></button>
      </div>
    </li>)}</ol>
  </section>;
}
