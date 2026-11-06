import React, { useState } from "react";
import { ChevronDown, Plus, Workflow, Trash2 } from "lucide-react";
import { assetById, assetUrl, catalog } from "./document";
import { buildAnatomy, buildMembrane, buildProcess, membraneProteinIds, preparedAnatomy } from "./builders";
import { Numeric } from "./StudioInspector";

export default function StudioBuilders({ onBundle, onError }) {
  const [length, setLength] = useState(900), [orientation, setOrientation] = useState("horizontal"), [proteinId, setProteinId] = useState("calcium-channel"), [count, setCount] = useState(2);
  const [steps, setSteps] = useState([{ assetId: "dna-double-helix", label: "DNA", interaction: "Transcription" }, { assetId: "transfer-rna", label: "RNA", interaction: "Translation" }, { assetId: "zinc-finger-protein", label: "Protein", interaction: "" }]), [direction, setDirection] = useState("horizontal");
  const [anatomy, setAnatomy] = useState(preparedAnatomy[0]?.assetId || "human-heart"), [labels, setLabels] = useState(true), [color, setColor] = useState("#475569");
  const insert = build => { try { onBundle(build()); } catch (error) { onError(error.message); } };
  const updateStep = (index, patch) => setSteps(items => items.map((step, i) => i === index ? { ...step, ...patch } : step));
  return <section className="sci-builders" aria-label="Scientific composition builders"><div className="sci-library-intro"><h3>Build a scientific composition</h3><p>Prepared artwork, arranged in a few clicks.</p></div>
    <details><summary><img src={assetUrl("etc-bilayer")} alt="" /><span>Cell membrane<small>Bilayer, channels & proteins</small></span><ChevronDown size={14} /></summary><div className="sci-builder-fields">
      <Numeric label="Membrane length" value={length} min={240} max={1800} step={10} onChange={setLength} />
      <label className="sci-field"><span>Membrane orientation</span><select aria-label="Membrane orientation" value={orientation} onChange={event => setOrientation(event.target.value)}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
      <label className="sci-field"><span>Membrane protein</span><select aria-label="Membrane protein" value={proteinId} onChange={event => setProteinId(event.target.value)}>{membraneProteinIds.map(id => <option key={id} value={id}>{assetById[id].name}</option>)}</select></label>
      <Numeric label="Protein count" value={count} min={0} max={8} onChange={n => setCount(Math.round(n))} />
      <button className="sci-primary" onClick={() => insert(() => buildMembrane({ length, orientation, proteinId, proteinCount: count }))}><Plus size={15} />Insert membrane</button>
    </div></details>
    <details><summary><Workflow size={24} strokeWidth={1.4} /><span>Biochemical process<small>Components & attached interactions</small></span><ChevronDown size={14} /></summary><div className="sci-builder-fields">
      <label className="sci-field"><span>Process direction</span><select aria-label="Process direction" value={direction} onChange={event => setDirection(event.target.value)}><option value="horizontal">Left to right</option><option value="vertical">Top to bottom</option></select></label>
      {steps.map((step, i) => <div className="sci-process-step" key={i}><div><strong>Step {i + 1}</strong><button aria-label={`Remove process step ${i + 1}`} disabled={steps.length <= 2} onClick={() => setSteps(items => items.filter((_, index) => index !== i))}><Trash2 size={13} /></button></div>
        <label className="sci-field"><span>Illustration</span><select aria-label={`Step ${i + 1} illustration`} value={step.assetId} onChange={event => updateStep(i, { assetId: event.target.value })}>{catalog.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
        <label className="sci-field"><span>Label</span><input aria-label={`Step ${i + 1} label`} maxLength={120} value={step.label} onChange={event => updateStep(i, { label: event.target.value })} /></label>
        {i < steps.length - 1 && <label className="sci-field"><span>Interaction to next step</span><input aria-label={`Step ${i + 1} interaction`} maxLength={120} value={step.interaction} onChange={event => updateStep(i, { interaction: event.target.value })} /></label>}
      </div>)}
      <button className="sci-text-button" disabled={steps.length >= 6} onClick={() => setSteps(items => [...items, { assetId: "ribosome", label: "Ribosome", interaction: "" }])}>+ Add process step</button>
      <p className="sci-inline-note">A composition aid. Check biological relationships before using your figure for study.</p>
      <button className="sci-primary" onClick={() => insert(() => buildProcess({ assetIds: steps.map(step => step.assetId), labels: steps.map(step => step.label), interactionLabels: steps.slice(0, -1).map(step => step.interaction), direction }))}><Plus size={15} />Insert process</button>
    </div></details>
    <details><summary><img src={assetUrl(anatomy)} alt="" /><span>Anatomy & labels<small>Prepared anatomical landmarks</small></span><ChevronDown size={14} /></summary><div className="sci-builder-fields">
      <label className="sci-field"><span>Anatomical illustration</span><select aria-label="Anatomical illustration" value={anatomy} onChange={event => setAnatomy(event.target.value)}>{preparedAnatomy.map(item => <option key={item.assetId} value={item.assetId}>{item.name}</option>)}</select></label>
      <label className="sci-label-toggle"><input aria-label="Include anatomy labels" type="checkbox" checked={labels} onChange={event => setLabels(event.target.checked)} />Include prepared labels</label>
      <label className="sci-field sci-color"><span>Label & pointer color</span><input aria-label="Anatomy annotation color" type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
      <p className="sci-inline-note">{preparedAnatomy.find(item => item.assetId === anatomy)?.notes} Ungroup after insertion to edit each label.</p>
      <button className="sci-primary" onClick={() => insert(() => buildAnatomy({ assetId: anatomy, showLabels: labels }).map(obj => obj.color ? { ...obj, color } : obj))}><Plus size={15} />Insert anatomy</button>
    </div></details>
  </section>;
}
