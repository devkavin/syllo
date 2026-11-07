import React, { useEffect, useRef } from "react";
import { CaseSensitive, Circle, Link2, MousePointer2, MoveRight, Square } from "lucide-react";
import { creditsFor, usedAssets } from "./document";
import { downloadFile } from "./export";
import StudioInspector from "./StudioInspector";
import StudioLibrary from "./StudioLibrary";
import StudioTemplates from "./StudioTemplates";
import StudioBuilders from "./StudioBuilders";

export default function StudioSidebar({ document: doc, selected, setSelected, patch, command, onAsset, onAdd, onTemplate, creditsOpen, tab, setTab, onLayer, onReorder, onBundle, onError, library, accountId, onSaveItem, onUseItem }) {
  const scroll = useRef(null), selectionKey = selected.join(",");
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [tab, selectionKey, creditsOpen]);
  return <aside className="sci-sidebar" aria-label="Scientific library and properties">
    <div className="sci-tabs" role="tablist" aria-label="Scientific resources">{["Library", "Templates", "Properties", "Insert"].map((name, i, tabs) => <button key={name} role="tab" tabIndex={tab === name ? 0 : -1} aria-selected={tab === name} aria-controls={`sci-panel-${name}`} id={`sci-tab-${name}`} onClick={() => setTab(name)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? tabs[(i + 1) % tabs.length] : event.key === "ArrowLeft" ? tabs[(i + tabs.length - 1) % tabs.length] : null;
      if (next) { event.preventDefault(); event.stopPropagation(); setTab(next); event.currentTarget.parentElement.querySelector(`#sci-tab-${next}`)?.focus(); }
    }}>{name === "Library" ? "Assets" : name}</button>)}</div>
    <div className="sci-sidebar-body" ref={scroll}>
      {creditsOpen && <section className="sci-credits" aria-label="Asset credits"><h3>Credits & licenses</h3><p>PNG and SVG exports retain credits in their metadata. Download this text to credit artwork when publishing your figure.</p><button className="sci-text-button" onClick={() => downloadFile(creditsFor(doc), "scientific-illustration-credits.txt", "text/plain;charset=utf-8")}>Download credits</button>
        {usedAssets(doc).length ? usedAssets(doc).map(asset => <article key={asset.id}><strong>{asset.name}</strong><span>{asset.author}</span><a href={asset.sourceUrl} target="_blank" rel="noreferrer">Source artwork</a> · <a href={asset.licenseUrl} target="_blank" rel="noreferrer">{asset.license}</a><small>{asset.modifications}</small></article>) : <p>No library assets in this figure yet.</p>}
      </section>}
      <section role="tabpanel" id="sci-panel-Library" aria-labelledby="sci-tab-Library" hidden={tab !== "Library"}>
        <StudioLibrary onAsset={onAsset} onTemplate={onTemplate} library={library} accountId={accountId} onSaveItem={onSaveItem} onUseItem={onUseItem} selectedCount={selected.length} />
      </section>
      {tab !== "Library" && <section role="tabpanel" id={`sci-panel-${tab}`} aria-labelledby={`sci-tab-${tab}`}>
        {tab === "Properties" && (selected.length ? <StudioInspector document={doc} objects={doc.objects.filter(o => selected.includes(o.id))} patch={patch} command={command} onLayer={onLayer} /> : <div className="sci-properties-empty"><MousePointer2 size={28} /><h3>Make it your own</h3><p>Select an illustration, label or arrow to edit its position, appearance and connections.</p><button className="sci-text-button" onClick={() => setTab("Library")}>Browse illustrations</button></div>)}
        {tab === "Templates" && <StudioTemplates document={doc} onTemplate={onTemplate} onLayer={onLayer} />}
        {tab === "Insert" && <><StudioBuilders onBundle={onBundle} onError={onError} /><div className="sci-library-intro"><h3>Labels & annotations</h3><p>Keep every explanation independently editable.</p></div><div className="sci-insert-grid">{[
          ["text", "Add label", CaseSensitive, {}], ["arrow", "Directional arrow", MoveRight, {}], ["connector", "Connector", Link2, {}],
          ["shape", "Rectangle", Square, { shape: "rect" }], ["shape", "Ellipse", Circle, { shape: "ellipse" }], ["highlight", "Highlighter", Square, {}],
        ].map(([type, name, Icon, props]) => <button key={name} onClick={() => onAdd(type, props)}><Icon size={24} strokeWidth={1.5} /><span>{name}</span></button>)}</div><div className="sci-notation-note"><strong>Made for scientific notation</strong><p>Labels support H₂O, NAD⁺, α, Δψ, arrows and mathematical Unicode. Select a label to insert symbols or edit its text.</p></div></>}
      </section>}
    </div>
  </aside>;
}
