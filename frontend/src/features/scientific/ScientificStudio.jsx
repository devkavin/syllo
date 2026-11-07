import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowUpRight, CaseSensitive, Check, ChevronDown, Download, Expand, Grid2X2, Hand, Highlighter, ImagePlus, Info, Link2, Loader2, Maximize, Minus, MousePointer2, PanelLeft, Plus, Redo2, Save, Shapes, Undo2, X } from "lucide-react";
import { alignSelection, assetById, boundsOf, createObject, documentReducer, duplicateObjects, expandSelection, initialHistory, parseDocument, rotateSelection, scaleSelection, transformObjects, uid, validateDocument } from "./document";
import { deleteSelection, distributeSelection, synchronizeBindings, visibleObjects } from "./composition";
import { createLibraryItem, placeComposition } from "./reusable";
import { useStudioLibrary } from "./useStudioLibrary";
import { exportFigure } from "./export";
import { instantiateTemplate, templates } from "./templates";
import StudioCanvas from "./StudioCanvas";
import StudioSidebar from "./StudioSidebar";
import StudioOutline from "./StudioOutline";
import StudioArrange from "./StudioArrange";
import StudioPractice from "./StudioPractice";
import { practiceLabels } from "./practice";
import AppIcon from "../../components/AppIcon";
import "./studio.css";
import "./workspace.css";

const tools = [["select", "Select", MousePointer2], ["pan", "Pan", Hand], ["text", "Text", CaseSensitive], ["arrow", "Arrow", ArrowUpRight], ["connector", "Connector", Link2], ["shape", "Shapes", Shapes], ["highlight", "Highlighter", Highlighter]];
const toolButton = (name, Icon, action, disabled = false) => <button key={name} type="button" className="sci-icon-button" title={name} aria-label={name} onClick={action} disabled={disabled}><Icon size={18} strokeWidth={1.7} /></button>;

export default function ScientificStudio({ initialDocument, onSave, onDraft, onClose, saveState = "idle", saveError = "", accountId }) {
  const [history, dispatch] = useReducer(documentReducer, initialDocument, value => initialHistory(parseDocument(value)));
  const doc = history.present;
  const library = useStudioLibrary(accountId);
  const [selected, setSelectedState] = useState([]), [tool, setTool] = useState("select"), [tab, setTab] = useState("Library");
  const [practicing, setPracticing] = useState(false);
  const practiceMode = useRef(false); practiceMode.current = practicing;
  const [outlineOpen, setOutlineOpen] = useState(() => window.matchMedia?.("(min-width: 1100px)").matches ?? true);
  const setSelected = useCallback(ids => { setSelectedState(ids); if (Array.isArray(ids) && ids.length) setTab("Properties"); }, []);
  const [grid, setGrid] = useState(false), [snap, setSnap] = useState(true), [zoom, setZoom] = useState(0.65), [credits, setCredits] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [exporting, setExporting] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(null), [leaving, setLeaving] = useState(false);
  const saving = useRef(false);
  const canvas = useRef(null), clipboard = useRef([]), current = useRef(doc), lastDraft = useRef(JSON.stringify(initialDocument)), saved = useRef(JSON.stringify(initialDocument));
  const onDraftRef = useRef(onDraft); onDraftRef.current = onDraft;
  current.current = doc;
  const publishDraft = useCallback(next => {
    if (onDraftRef.current) { onDraftRef.current(next); lastDraft.current = JSON.stringify(next); }
  }, []);
  // Notes already debounce server writes and synchronously retain device drafts.
  // Publish every completed transaction before navigation can unmount the studio.
  const commit = useCallback(next => { if (saving.current || practiceMode.current) return false; try { next = synchronizeBindings(next); validateDocument(next, { allowMissingAssets: true }); dispatch({ type: "commit", document: next }); publishDraft(next); setError(""); return true; } catch (e) { setError(e.message); return false; } }, [publishDraft]);
  const editable = selected.filter(id => doc.objects.some(obj => obj.id === id && !obj.locked));
  const patch = props => commit(transformObjects(doc, editable, props));
  const layer = (ids, props) => commit(ids ? { ...doc, objects: doc.objects.map(obj => ids.includes(obj.id) ? { ...obj, ...props } : obj) } : { ...doc, ...props });
  const reorder = (id, direction) => {
    const objects = [...doc.objects], i = objects.findIndex(obj => obj.id === id), j = i + direction;
    if (i < 0 || objects[i].locked || j < 0 || j >= objects.length) return;
    [objects[i], objects[j]] = [objects[j], objects[i]]; commit({ ...doc, objects });
  };
  const travel = type => {
    if (saving.current || practiceMode.current) return;
    const next = documentReducer(history, { type });
    if (next === history) return;
    dispatch({ type });
    try { publishDraft(next.present); setError(""); } catch (e) { setError(e.message); }
  };
  useEffect(() => {
    const warn = event => { if (JSON.stringify(current.current) !== saved.current || library.busy || library.canDiscard || ["failed", "conflict", "saving"].includes(saveState)) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState, library.busy, library.canDiscard]);
  useEffect(() => { setSelected(ids => ids.filter(id => doc.objects.some(obj => obj.id === id))); }, [doc]);
  useEffect(() => { if (saveState === "saved" && JSON.stringify(doc) === lastDraft.current) saved.current = lastDraft.current; }, [saveState, doc]);

  const add = (type, props = {}) => {
    const obj = createObject(type, { ...canvas.current?.center(), ...props });
    if (commit({ ...doc, objects: [...doc.objects, obj] })) { setSelected([obj.id]); setTool("select"); }
  };
  const addAsset = (id, point) => {
    const asset = assetById[id]; if (!asset || practiceMode.current) return;
    const width = Math.min(260, asset.aspectRatio * 220), height = width / asset.aspectRatio;
    add("asset", { assetId: id, width, height, ...point });
    library.recordRecent(id);
  };
  const addBundle = objects => {
    let placed = placeComposition(objects, { x: 40, y: 40 });
    const box = boundsOf(placed), scale = Math.min(1, (doc.width - 80) / box.width, (doc.height - 80) / box.height);
    if (scale < 1) placed = scaleSelection({ ...doc, objects: placed }, placed.map(obj => obj.id), scale).objects;
    if (commit({ ...doc, objects: [...doc.objects, ...placed] })) { setSelected(placed.map(obj => obj.id)); setTool("select"); }
  };
  const saveItem = async (kind, name) => {
    if (practiceMode.current) return false;
    try { return await library.saveItem(createLibraryItem(doc, selected, kind, name)); }
    catch (e) { setError(e.message); return false; }
  };
  const useItem = item => {
    try {
      const next = parseDocument(item.document);
      if (item.kind === "component") { addBundle(next.objects); return; }
      const copy = { ...next, id: uid(), objects: duplicateObjects(next.objects, 0) };
      if (doc.objects.length) setPendingTemplate(copy);
      else { commit(copy); setSelected([]); setTool("select"); }
    } catch (e) { setError(e.message); }
  };

  const command = name => {
    if (practiceMode.current) return;
    const objects = doc.objects.filter(obj => selected.includes(obj.id));
    if (name === "copy") { clipboard.current = structuredClone(objects); return; }
    if (name === "paste" || name === "duplicate") {
      const copies = duplicateObjects(name === "paste" ? clipboard.current : objects).map(obj => ({ ...obj, locked: false }));
      if (!copies.length) return;
      commit({ ...doc, objects: [...doc.objects, ...copies] }); setSelected(copies.map(obj => obj.id)); return;
    }
    if (!editable.length) return;
    if (name === "scale-up" || name === "scale-down") commit(scaleSelection(doc, editable, name === "scale-up" ? 1.1 : 1 / 1.1));
    if (name === "rotate-left" || name === "rotate-right") commit(rotateSelection(doc, editable, name === "rotate-left" ? -15 : 15));
    if (name === "delete") { commit(deleteSelection(doc, editable)); setSelected(ids => ids.filter(id => !editable.includes(id))); }
    if (name === "group") patch({ groupId: uid() });
    if (name === "ungroup") commit({ ...doc, objects: doc.objects.map(obj => { if (!editable.includes(obj.id)) return obj; const { groupId, ...rest } = obj; return rest; }) });
    if (["forward", "backward"].includes(name)) {
      const list = [...doc.objects];
      if (name === "forward") for (let i = list.length - 2; i >= 0; i--) { if (editable.includes(list[i].id) && !editable.includes(list[i + 1].id)) [list[i], list[i + 1]] = [list[i + 1], list[i]]; }
      else for (let i = 1; i < list.length; i++) { if (editable.includes(list[i].id) && !editable.includes(list[i - 1].id)) [list[i], list[i - 1]] = [list[i - 1], list[i]]; }
      commit({ ...doc, objects: list });
    }
    if (name.startsWith("align-")) {
      commit(alignSelection(doc, editable, name.slice(6)));
    }
    if (name.startsWith("distribute-")) commit(distributeSelection(doc, editable, name.slice(11)));
  };

  const save = async () => {
    if (busy || library.busy || practiceMode.current) return;
    saving.current = true; setBusy(true); setError("");
    try {
      validateDocument(doc);
      lastDraft.current = JSON.stringify(doc);
      const result = await onSave(doc);
      if (result === false) { setError("Illustration not saved. Your editable draft is still here. Retry saving, or return to Notes to resolve a revision conflict."); return; }
      saved.current = JSON.stringify(doc); if (library.canDiscard) setLeaving(true); else onClose();
    } catch (e) { setError(e.message || "Illustration not saved. Please retry."); }
    finally { saving.current = false; setBusy(false); }
  };
  const close = () => {
    if (busy) return;
    setPracticing(false);
    const pending = JSON.stringify(doc) !== saved.current || library.busy || library.canDiscard || ["failed", "conflict", "saving"].includes(saveState);
    if (pending) { setLeaving(true); return; }
    finishClose();
  };
  const finishClose = () => {
    try { if (JSON.stringify(doc) !== lastDraft.current) publishDraft(doc); } catch (e) { setError(e.message); return; }
    onClose();
  };
  const keyboard = event => {
    if (practiceMode.current) return;
    if (saving.current) { event.preventDefault(); return; }
    if (event.target.matches?.("input, textarea, select, [contenteditable=true]")) return;
    const mod = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (mod && key === "z") { event.preventDefault(); travel(event.shiftKey ? "redo" : "undo"); }
    else if (mod && key === "y") { event.preventDefault(); travel("redo"); }
    else if (mod && key === "a") { event.preventDefault(); setSelected(expandSelection(doc.objects, visibleObjects(doc).map(obj => obj.id)).filter(id => !doc.objects.find(obj => obj.id === id).locked)); }
    else if (mod && ["c", "v", "d"].includes(key)) { event.preventDefault(); command({ c: "copy", v: "paste", d: "duplicate" }[key]); }
    else if (["delete", "backspace"].includes(key)) { event.preventDefault(); command("delete"); }
    else if (key === "escape") { event.preventDefault(); setSelected([]); setTool("select"); }
    else if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key) && selected.length) {
      event.preventDefault(); const distance = event.shiftKey ? 10 : 1;
      patch(obj => ({ x: obj.x + (key === "arrowleft" ? -distance : key === "arrowright" ? distance : 0), y: obj.y + (key === "arrowup" ? -distance : key === "arrowdown" ? distance : 0) }));
    }
  };
  const exportAs = async format => {
    setExporting(true); setError("");
    try { await exportFigure(doc, format); } catch (e) { setError(e.message); } finally { setExporting(false); }
  };
  const template = templates.find(t => t.id === doc.templateId);
  const status = busy || saveState === "saving" ? "Saving…" : JSON.stringify(doc) !== lastDraft.current ? "Editing…" : saveState === "conflict" ? "Revision conflict · draft retained" : saveState === "failed" ? "Not saved · draft retained" : saveState === "saved" ? "Saved to Notes" : onDraft ? "Editable draft in Notes" : "Ready to save";

  return <Dialog.Root open onOpenChange={open => { if (!open) close(); }}><Dialog.Portal><Dialog.Overlay className="sci-overlay" /><Dialog.Content className="sci-studio sci-studio-next" onEscapeKeyDown={event => { event.preventDefault(); if (practicing) setPracticing(false); else if (!selected.length) close(); else setSelected([]); }} onPointerDownOutside={event => event.preventDefault()} onKeyDown={keyboard}>
    <header className="sci-header"><span className="sci-brand"><AppIcon className="sci-brand-icon" /><span>Syllo</span></span><button className="sci-back" aria-label="Return to Notes" onClick={close}><ArrowLeft size={18} /><span>Notes</span></button><span className="sci-header-divider" /><div className="sci-heading"><Dialog.Title>Scientific Illustration Studio</Dialog.Title><Dialog.Description>A little clarity for your next big idea.</Dialog.Description></div><span className="sci-free-badge">No AI credits</span><span className="sci-save-status" role="status">{busy || saveState === "saving" ? <Loader2 size={14} className="animate-spin" /> : saveState === "saved" ? <Check size={14} /> : <span className="sci-status-dot" />}{status}</span><button className="sci-primary sci-save-button" aria-label="Save and return to Notes" onClick={save} disabled={busy || exporting || library.busy || practicing}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Insert into Notes</button></header>
    <div className="sci-document-bar" inert={busy || practicing}><div><input aria-label="Illustration title" value={doc.title} maxLength={240} onChange={event => commit({ ...doc, title: event.target.value })} /><p>{template ? template.category : "Your scientific canvas"}<span>·</span>{doc.width} × {doc.height} px{template && <span className="sci-draft-badge">Draft · scientific review required</span>}</p></div><button className="sci-credits-button" aria-label="Asset credits" aria-pressed={credits} onClick={() => setCredits(v => !v)}><Info size={16} />Credits & licenses</button></div>
    <div className="sci-toolbar" role="toolbar" aria-label="Illustration tools" inert={busy || practicing}><button className="sci-icon-button sci-outline-toggle" aria-label="Toggle figure outline" aria-expanded={outlineOpen} aria-controls="sci-figure-outline" title="Figure outline" onClick={() => setOutlineOpen(value => !value)}><PanelLeft size={19} /></button><span className="sci-toolbar-divider" />
      {tools.map(([key, label, Icon]) => <button key={key} className={`sci-tool-button ${tool === key ? "is-active" : ""}`} title={key === "pan" ? "Pan · also Alt + drag" : `${label} · click or drag on canvas`} aria-pressed={tool === key} onClick={() => setTool(key)}><Icon size={20} strokeWidth={1.6} /><span>{label}</span></button>)}
      <button className="sci-tool-button" onClick={() => { setTab("Library"); }}><ImagePlus size={20} strokeWidth={1.6} /><span>Illustration</span></button><StudioArrange count={editable.length} command={command} /><span className="sci-toolbar-divider" />
      {toolButton("Undo", Undo2, () => travel("undo"), busy || !history.past.length)}{toolButton("Redo", Redo2, () => travel("redo"), busy || !history.future.length)}
      <div className="sci-toolbar-right"><button className="sci-icon-button" aria-label="Dot grid" aria-pressed={grid} onClick={() => setGrid(v => !v)} title="Dot grid"><Grid2X2 size={17} /></button><details className="sci-export"><summary aria-label="Export figure" className={exporting ? "is-busy" : ""}>{exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}Export<ChevronDown size={12} /></summary><div><button disabled={exporting} onClick={() => exportAs("png")}>PNG · high resolution</button><button disabled={exporting} onClick={() => exportAs("svg")}>SVG · editable vectors</button><small>Credits embedded · text in Credits</small></div></details></div>
    </div>
    <div className={`sci-workspace ${practicing ? "is-practicing" : ""}`} inert={busy} aria-busy={busy}><StudioOutline document={doc} selected={selected} setSelected={setSelected} onLayer={layer} onReorder={reorder} open={outlineOpen} onToggle={() => setOutlineOpen(value => !value)} onPractice={() => setPracticing(true)} practiceCount={practiceLabels(doc).length} disabled={practicing} /><main className="sci-main">
      {(error || saveState === "failed" || saveState === "conflict") && <div className="sci-error" role="alert">{error || saveError || "Not saved to the server. Your draft is retained."}<button disabled={busy} onClick={save}>Retry save</button></div>}
      {pendingTemplate && <div className="sci-confirm" role="status"><span>Replace this canvas with the selected composition? You can undo this change.</span><button onClick={() => { commit(typeof pendingTemplate === "string" ? instantiateTemplate(pendingTemplate) : pendingTemplate); setPendingTemplate(null); setSelected([]); setTool("select"); }}>Replace canvas</button><button onClick={() => setPendingTemplate(null)}>Keep current figure</button></div>}
      {leaving && <div className="sci-confirm" role="status"><span>{library.canDiscard || library.busy ? "Personal library changes may still need to sync. Your figure stays editable in Notes." : onDraft ? "Some changes may still need to sync. Your editable draft stays in Notes." : "Save your illustration before leaving."}</span>{library.canDiscard && <button onClick={library.retry} disabled={library.busy}>Retry library sync</button>}<button onClick={save} disabled={library.busy}>Save and return</button><button onClick={finishClose} disabled={library.busy}>{library.canDiscard ? "Return without library sync" : onDraft ? "Return with draft" : "Leave without saving"}</button><button onClick={() => setLeaving(false)}>Keep editing</button></div>}
      <div className="sci-canvas-stage">{practicing ? <StudioPractice document={doc} onClose={() => setPracticing(false)} /> : <><StudioCanvas ref={canvas} document={doc} selected={selected} setSelected={setSelected} tool={tool} setTool={setTool} grid={grid} snap={snap} commit={commit} onAdd={add} onAsset={addAsset} onZoom={setZoom} /><button className="sci-floating-add" aria-label="Add label" title="Add label" disabled={busy} onClick={() => add("text")}><CaseSensitive size={16} />Add label</button></>}</div>
      <footer className="sci-canvas-footer" inert={practicing}><label><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} />Snap to grid</label><span>{doc.objects.length} objects{selected.length ? ` · ${selected.length} selected` : ""}</span><div className="sci-zoom">{toolButton("Zoom out", Minus, () => canvas.current.zoom(zoom / 1.15))}<button aria-label="Reset zoom" onClick={() => canvas.current.zoom(1)}>{Math.round(zoom * 100)}%</button>{toolButton("Zoom in", Plus, () => canvas.current.zoom(zoom * 1.15))}{toolButton("Fit canvas", Expand, () => canvas.current.fit())}{toolButton("Fit to content", Maximize, () => canvas.current.fit(true))}</div></footer>
    </main><div className="sci-resource-pane" inert={practicing}><StudioSidebar document={doc} selected={selected} setSelected={setSelected} patch={patch} command={command} onAsset={addAsset} onAdd={add} tab={tab} setTab={setTab} creditsOpen={credits} onLayer={layer} onReorder={reorder} onBundle={addBundle} onError={setError} library={library} accountId={accountId} onSaveItem={saveItem} onUseItem={useItem} onTemplate={id => {
      if (doc.objects.length) { setPendingTemplate(id); return; }
      commit(instantiateTemplate(id)); setSelected([]); setTool("select");
    }} /></div></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
