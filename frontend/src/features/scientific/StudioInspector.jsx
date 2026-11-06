import React, { useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, Copy, Group, LockKeyhole, Trash2, Ungroup, UnlockKeyhole } from "lucide-react";
import { assetById } from "./document";
import { objectName } from "./StudioLayers";

const symbols = ["₂", "₃", "ᵢ", "⁺", "⁻", "²", "α", "β", "Δ", "μ", "π", "ψ", "→", "⇌", "½", "±", "∑", "√"];
export const Numeric = ({ label, value, min, max, onChange, step = 1 }) => <label className="sci-field"><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={step} value={Math.round(value * 100) / 100} onChange={event => { if (event.target.value !== "") { const n = Number(event.target.value); if (Number.isFinite(n) && n >= min && n <= max) onChange(n); } }} /></label>;

export default function StudioInspector({ document: doc, objects, patch, command, onLayer }) {
  const [ratio, setRatio] = useState(true), labelInput = useRef(null);
  const obj = objects[0]; if (!obj) return null;
  const single = objects.length === 1, locked = objects.some(item => item.locked);
  const attached = Boolean(obj.startBinding || obj.endBinding);
  const resize = (key, value) => patch({ [key]: value, ...(ratio && single ? { [key === "width" ? "height" : "width"]: Math.max(1, Math.min(8000, value * (key === "width" ? obj.height / obj.width : obj.width / obj.height))) } : {}) });
  const binding = (end, value) => patch({ [end]: value ? { objectId: value, anchor: end === "startBinding" ? "right" : "left" } : undefined });
  // Undefined fields must be removed, not retained as malformed references.
  const changeBinding = (key, value) => patch({ [key]: value || undefined });
  return <section className="sci-inspector" aria-label="Object properties">
    <div className="sci-section-heading"><span>{single ? objectName(obj) : `${objects.length} objects selected`}</span><button aria-label="Delete selected objects" title="Delete" disabled={locked} onClick={() => command("delete")}><Trash2 size={15} /></button></div>
    <button className="sci-lock-control" onClick={() => onLayer(objects.map(item => item.id), { locked: !locked })}>{locked ? <UnlockKeyhole size={14} /> : <LockKeyhole size={14} />}{locked ? "Unlock selection" : "Lock selection"}</button>
    {locked && <p className="sci-inline-note">Unlock to edit or move this selection.</p>}
    <fieldset disabled={locked}>
    {single && <>
      <label className="sci-field"><span>Layer name</span><input aria-label="Layer name" value={obj.name || ""} placeholder={objectName(obj)} maxLength={120} onChange={event => patch({ name: event.target.value })} /></label>
      {obj.type === "text" && <><label className="sci-field"><span>Label text</span><textarea ref={labelInput} aria-label="Label text" value={obj.text} maxLength={4000} rows={3} onChange={event => patch({ text: event.target.value })} /></label>
        <div className="sci-symbols" aria-label="Scientific notation">{symbols.map(symbol => <button key={symbol} aria-label={`Insert ${symbol}`} onClick={() => { const input = labelInput.current, start = input?.selectionStart ?? obj.text.length, end = input?.selectionEnd ?? start; patch({ text: obj.text.slice(0, start) + symbol + obj.text.slice(end) }); input?.focus(); }}>{symbol}</button>)}</div>
        <div className="sci-field-row"><Numeric label="Font size" value={obj.fontSize} min={8} max={160} onChange={fontSize => patch({ fontSize })} /><button className="sci-toggle" aria-label="Bold label" aria-pressed={!!obj.bold} onClick={() => patch({ bold: !obj.bold })}><b>B</b></button></div>
        <label className="sci-label-toggle"><input type="checkbox" checked={!!obj.isLabel} onChange={event => patch({ isLabel: event.target.checked })} />Include in label visibility</label>
      </>}
      {attached && <p className="sci-inline-note">Endpoints follow their targets. Move the targets or choose a free endpoint to reposition this connection.</p>}
      <fieldset disabled={attached}><div className="sci-field-row"><Numeric label="X position" value={obj.x} min={-8000} max={8000} onChange={x => patch({ x })} /><Numeric label="Y position" value={obj.y} min={-8000} max={8000} onChange={y => patch({ y })} /></div>
      <div className="sci-field-row"><Numeric label="Width" value={obj.width} min={1} max={8000} onChange={n => resize("width", n)} /><button className="sci-ratio" aria-label="Lock aspect ratio" aria-pressed={ratio} onClick={() => setRatio(value => !value)}>{ratio ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}</button><Numeric label="Height" value={obj.height} min={1} max={8000} onChange={n => resize("height", n)} /></div>
      <div className="sci-field-row"><Numeric label="Rotation" value={obj.rotation} min={-3600} max={3600} onChange={rotation => patch({ rotation })} /></div></fieldset><Numeric label="Opacity (%)" value={obj.opacity * 100} min={0} max={100} onChange={n => patch({ opacity: n / 100 })} />
      {obj.color && <label className="sci-field sci-color"><span>Color</span><input aria-label="Object color" type="color" value={obj.color} onChange={event => patch({ color: event.target.value })} /><code>{obj.color}</code></label>}
      {["arrow", "connector"].includes(obj.type) && <><Numeric label="Line width" value={obj.strokeWidth} min={1} max={20} onChange={strokeWidth => patch({ strokeWidth })} />
        <div className="sci-binding-fields"><strong>Follow an object</strong>{[["startBinding", "Start"], ["endBinding", "End"]].map(([key, label]) => <div key={key}>
          <label className="sci-field"><span>{label} target</span><select aria-label={`${label} target`} value={obj[key]?.objectId || ""} onChange={event => event.target.value ? binding(key, event.target.value) : changeBinding(key, null)}><option value="">Free endpoint</option>{doc.objects.filter(item => !["arrow", "connector"].includes(item.type)).map(item => <option key={item.id} value={item.id}>{objectName(item).slice(0, 50)}</option>)}</select></label>
          {obj[key] && <label className="sci-field"><span>{label} anchor</span><select aria-label={`${label} anchor`} value={obj[key].anchor} onChange={event => changeBinding(key, { ...obj[key], anchor: event.target.value })}>{["left", "right", "top", "bottom", "center", ...(obj[key].anchor === "point" ? ["point"] : [])].map(anchor => <option key={anchor}>{anchor}</option>)}</select></label>}
        </div>)}</div>
        <button className="sci-text-button" onClick={() => patch(item => ({ flipX: !item.flipX, flipY: !item.flipY, startBinding: item.endBinding, endBinding: item.startBinding }))}>Reverse direction</button>
      </>}
      {obj.type === "asset" && assetById[obj.assetId] && <p className="sci-mini-credit">{assetById[obj.assetId].author} · <a href={assetById[obj.assetId].licenseUrl} target="_blank" rel="noreferrer">{assetById[obj.assetId].license}</a><br />Artwork moves as one vector object.{assetById[obj.assetId].internalLabels && " Source lettering is part of the artwork; label visibility affects added labels only."}</p>}
    </>}
    <div className="sci-arrange">{[["backward", "Send backward", ArrowDownToLine], ["forward", "Bring forward", ArrowUpToLine], ["duplicate", "Duplicate selection", Copy], [objects.some(item => item.groupId) ? "ungroup" : "group", objects.some(item => item.groupId) ? "Ungroup selection" : "Group selection", objects.some(item => item.groupId) ? Ungroup : Group]].map(([key, label, Icon]) => <button key={key} aria-label={label} title={label} onClick={() => command(key)}><Icon size={15} /></button>)}</div>
    {objects.length >= 2 && <><div className="sci-align"><span>Transform</span><button onClick={() => command("scale-down")}>Scale −10%</button><button onClick={() => command("scale-up")}>Scale +10%</button><button onClick={() => command("rotate-left")}>Rotate −15°</button><button onClick={() => command("rotate-right")}>Rotate +15°</button></div><div className="sci-align"><span>Align</span>{["left", "center", "right", "top", "middle", "bottom"].map(value => <button key={value} onClick={() => command(`align-${value}`)}>{value}</button>)}</div></>}
    {objects.length >= 3 && <div className="sci-align"><span>Distribute</span>{["horizontal", "vertical"].map(value => <button key={value} onClick={() => command(`distribute-${value}`)}>{value}</button>)}</div>}
    </fieldset>
  </section>;
}
