import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { assetById, boundsOf, expandSelection, rotateSelection, scaleSelection, transformObjects } from "./document";
import { ObjectContents, objectTransform } from "./IllustrationSvg";
import { Microscope, Move, Plus } from "lucide-react";
import { visibleObjects } from "./composition";
import { pinchView } from "./touch";

const StudioCanvas = forwardRef(function StudioCanvas({ document: doc, selected, setSelected, tool, setTool, grid, snap, commit, onAdd, onAsset, onZoom }, ref) {
  const viewport = useRef(null), svg = useRef(null), gesture = useRef(null), contacts = useRef(new Map());
  const [view, setView] = useState({ x: 50, y: 50, zoom: 0.65 });
  const [preview, setPreview] = useState(null), [marquee, setMarquee] = useState(null), [guides, setGuides] = useState([]);
  const [touchMode, setTouchMode] = useState(() => Boolean(window.matchMedia?.("(pointer: coarse)").matches));
  const handle = touchMode ? 26 : 10;
  const rendered = preview || doc;
  const displayed = visibleObjects(rendered), selectedObjects = displayed.filter(obj => selected.includes(obj.id));
  const movable = rendered.objects.filter(obj => selected.includes(obj.id) && !obj.locked);
  const selectionBox = movable.length > 1 ? boundsOf(movable) : null;
  const point = event => { const r = svg.current.getBoundingClientRect(); return { x: (event.clientX - r.left) / view.zoom, y: (event.clientY - r.top) / view.zoom }; };
  const fit = (content = false) => {
    const el = viewport.current; if (!el) return;
    const visible = visibleObjects(doc);
    const box = content && visible.length ? boundsOf(visible) : { x: 0, y: 0, width: doc.width, height: doc.height };
    const zoom = Math.max(0.1, Math.min(2, (el.clientWidth - 80) / box.width, (el.clientHeight - 80) / box.height));
    setView({ zoom, x: (el.clientWidth - box.width * zoom) / 2 - box.x * zoom, y: (el.clientHeight - box.height * zoom) / 2 - box.y * zoom });
  };
  useEffect(() => { fit(); }, [doc.id]);
  useEffect(() => {
    if (!globalThis.ResizeObserver || !viewport.current) return;
    const observer = new ResizeObserver(() => fit()); observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [doc.id, doc.width, doc.height]);
  useEffect(() => {
    const el = viewport.current;
    const wheel = event => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
        setView(previous => {
          const zoom = Math.max(0.1, Math.min(4, previous.zoom * (event.deltaY < 0 ? 1.1 : 0.9)));
          return { zoom, x: x - (x - previous.x) * zoom / previous.zoom, y: y - (y - previous.y) * zoom / previous.zoom };
        });
      } else setView(previous => ({ ...previous, x: previous.x - event.deltaX, y: previous.y - event.deltaY }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => { onZoom(view.zoom); }, [view.zoom, onZoom]);
  useImperativeHandle(ref, () => ({
    fit, center: () => ({ x: Math.max(20, ((viewport.current?.clientWidth || 900) / 2 - view.x) / view.zoom - 90), y: Math.max(20, ((viewport.current?.clientHeight || 600) / 2 - view.y) / view.zoom - 60) }),
    zoom: value => setView(previous => {
      const zoom = Math.max(0.1, Math.min(4, value));
      const cx = (viewport.current?.clientWidth || 900) / 2, cy = (viewport.current?.clientHeight || 600) / 2;
      return { zoom, x: cx - (cx - previous.x) * zoom / previous.zoom, y: cy - (cy - previous.y) * zoom / previous.zoom };
    }),
  }));

  const start = (event, kind, object) => {
    if (contacts.current.size >= 2) return;
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault(); event.stopPropagation();
    viewport.current.focus();
    const p = point(event);
    let ids = selected;
    if (object && object.type !== "selection") {
      const clicked = expandSelection(doc.objects, [object.id]);
      if (event.shiftKey) ids = selected.includes(object.id) ? selected.filter(id => !clicked.includes(id)) : [...new Set([...selected, ...clicked])];
      else if (!selected.includes(object.id)) ids = clicked;
      setSelected(ids);
      if (object.locked && kind === "move") return;
      if ((object.startBinding || object.endBinding) && ids.length === 1 && kind === "move") return;
    }
    ids = expandSelection(doc.objects, ids).filter(id => doc.objects.some(obj => obj.id === id && !obj.locked));
    gesture.current = { kind, object, ids, start: p, doc, view, clientX: event.clientX, clientY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const move = event => {
    const g = gesture.current; if (!g) return;
    if (event.pointerType === "touch") { const r = viewport.current.getBoundingClientRect(); contacts.current.set(event.pointerId, { x: event.clientX - r.left, y: event.clientY - r.top }); }
    if (g.kind === "pinch") { const points = [...contacts.current.values()]; if (points.length === 2) setView(pinchView(g.view, g.points, points)); return; }
    const dx = (event.clientX - g.clientX) / g.view.zoom, dy = (event.clientY - g.clientY) / g.view.zoom;
    if (Math.abs(dx) + Math.abs(dy) < 2 && !g.moved) return;
    g.moved = true;
    if (g.kind === "pan") { setView({ ...g.view, x: g.view.x + event.clientX - g.clientX, y: g.view.y + event.clientY - g.clientY }); return; }
    if (g.kind === "marquee") { setMarquee({ x: Math.min(g.start.x, g.start.x + dx), y: Math.min(g.start.y, g.start.y + dy), width: Math.abs(dx), height: Math.abs(dy) }); return; }
    if (g.kind === "draw") { setMarquee({ x: Math.min(g.start.x, g.start.x + dx), y: Math.min(g.start.y, g.start.y + dy), width: Math.abs(dx), height: Math.abs(dy) }); return; }
    if (g.kind === "move") {
      let tx = dx, ty = dy;
      if (snap && g.ids.length) {
        const first = g.doc.objects.find(o => o.id === g.ids[0]);
        tx = Math.round((first.x + dx) / 10) * 10 - first.x; ty = Math.round((first.y + dy) / 10) * 10 - first.y;
        const lines = [];
        const cx = first.x + tx + first.width / 2, cy = first.y + ty + first.height / 2;
        if (Math.abs(cx - doc.width / 2) < 12) { tx += doc.width / 2 - cx; lines.push({ x: doc.width / 2 }); }
        if (Math.abs(cy - doc.height / 2) < 12) { ty += doc.height / 2 - cy; lines.push({ y: doc.height / 2 }); }
        setGuides(lines);
      }
      setPreview(transformObjects(g.doc, g.ids, obj => ({ x: Math.max(-8000, Math.min(8000, obj.x + tx)), y: Math.max(-8000, Math.min(8000, obj.y + ty)) })));
    } else if (g.kind === "resize-selection") {
      const box = g.object;
      const scale = Math.max(0.05, Math.min(10, 1 + (dx * box.width + dy * box.height) / (box.width ** 2 + box.height ** 2)));
      setPreview(scaleSelection(g.doc, g.ids, scale));
    } else if (g.kind === "rotate-selection") {
      const box = g.object, cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      let degrees = (Math.atan2(g.start.y + dy - cy, g.start.x + dx - cx) - Math.atan2(g.start.y - cy, g.start.x - cx)) * 180 / Math.PI;
      if (snap || event.shiftKey) degrees = Math.round(degrees / 15) * 15;
      setPreview(rotateSelection(g.doc, g.ids, degrees));
    } else if (g.kind === "resize") {
      const obj = g.object, angle = obj.rotation * Math.PI / 180;
      const localX = dx * Math.cos(angle) + dy * Math.sin(angle), localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
      let width = Math.max(10, Math.min(8000, obj.width + localX)), height = Math.max(10, Math.min(8000, obj.height + localY));
      if (obj.type === "asset" || event.shiftKey) { const ratio = obj.width / obj.height; height = width / ratio; }
      // Keep the upper-left anchor fixed even when the object is rotated.
      const dw = width - obj.width, dh = height - obj.height;
      setPreview(transformObjects(g.doc, [obj.id], { width, height, x: obj.x + (dw * Math.cos(angle) - dh * Math.sin(angle) - dw) / 2, y: obj.y + (dw * Math.sin(angle) + dh * Math.cos(angle) - dh) / 2, ...(obj.type === "text" ? { fontSize: Math.max(8, Math.min(160, obj.fontSize * width / obj.width)) } : {}) }));
    } else if (g.kind === "rotate") {
      const obj = g.object, cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2;
      const p = { x: g.start.x + dx, y: g.start.y + dy };
      const a = Math.atan2(p.y - cy, p.x - cx) - Math.atan2(g.start.y - cy, g.start.x - cx);
      let rotation = obj.rotation + a * 180 / Math.PI;
      if (snap || event.shiftKey) rotation = Math.round(rotation / 15) * 15;
      setPreview(transformObjects(g.doc, [obj.id], { rotation }));
    }
  };

  const finish = event => {
    if (event.pointerType === "touch") contacts.current.delete(event.pointerId);
    const g = gesture.current; if (!g) return;
    gesture.current = null;
    if (g.kind === "marquee") {
      if (marquee) setSelected(expandSelection(doc.objects, displayed.filter(obj => { const b = boundsOf([obj]); return !obj.locked && b.x >= marquee.x && b.y >= marquee.y && b.x + b.width <= marquee.x + marquee.width && b.y + b.height <= marquee.y + marquee.height; }).map(obj => obj.id)));
      else if (!event.shiftKey) setSelected([]);
    } else if (g.kind === "draw") {
      const p = point(event), width = Math.max(1, Math.abs(p.x - g.start.x)), height = Math.max(1, Math.abs(p.y - g.start.y));
      onAdd(tool, { x: Math.min(p.x, g.start.x), y: Math.min(p.y, g.start.y), ...(g.moved ? { width, height, ...(["arrow", "connector"].includes(tool) ? { flipX: p.x < g.start.x, flipY: p.y < g.start.y } : {}) } : {}) }); setTool("select");
    } else if (g.kind !== "pinch" && preview) commit(preview);
    setPreview(null); setMarquee(null); setGuides([]);
  };

  const backgroundDown = event => {
    const kind = event.button === 1 || tool === "pan" || event.altKey ? "pan" : tool === "select" ? "marquee" : "draw";
    start(event, kind);
  };

  return <div className={`sci-viewport sci-tool-${tool}`} ref={viewport} tabIndex={0} role="region" aria-label="Scientific illustration canvas" onPointerDownCapture={event => {
    if (event.pointerType !== "touch") return;
    setTouchMode(true);
    const r = viewport.current.getBoundingClientRect(); contacts.current.set(event.pointerId, { x: event.clientX - r.left, y: event.clientY - r.top });
    if (contacts.current.size === 2) { event.preventDefault(); gesture.current = { kind: "pinch", view, points: [...contacts.current.values()] }; setPreview(null); setMarquee(null); setGuides([]); viewport.current.setPointerCapture?.(event.pointerId); }
  }} onPointerDown={backgroundDown} onPointerMove={move} onPointerUp={finish}
    onPointerCancel={event => { contacts.current.delete(event.pointerId); gesture.current = null; setPreview(null); setMarquee(null); setGuides([]); }}
    onDragOver={event => { if (event.dataTransfer.types.includes("application/x-syllo-scientific")) event.preventDefault(); }}
    onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("application/x-syllo-scientific"); if (assetById[id]) onAsset(id, point(event)); }}>
    <svg ref={svg} className="sci-artboard" role="group" aria-label={doc.title} viewBox={`0 0 ${doc.width} ${doc.height}`} style={{ width: doc.width * view.zoom, height: doc.height * view.zoom, left: view.x, top: view.y }}>
      <defs><pattern id="studio-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="#c0c9c7" /></pattern></defs>
      <rect width={doc.width} height={doc.height} fill={doc.background} />
      {grid && <rect width={doc.width} height={doc.height} fill="url(#studio-dots)" pointerEvents="none" />}
      {displayed.map(obj => <g key={obj.id} transform={objectTransform(obj)} opacity={obj.opacity} role="button" tabIndex={0} aria-label={`Canvas ${obj.name || (obj.type === "asset" ? assetById[obj.assetId]?.name || "unavailable asset" : obj.type === "text" ? obj.text : obj.type)}${obj.locked ? " · locked" : ""}`} aria-pressed={selected.includes(obj.id)} data-object-id={obj.id}
        onPointerDown={event => { if (tool !== "select" || event.altKey || event.button === 1) backgroundDown(event); else start(event, "move", obj); }}
        onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setSelected(expandSelection(doc.objects, [obj.id])); } }}>
        <ObjectContents obj={obj} prefix="studio" />
        <rect className="sci-hitbox" width={obj.width} height={Math.max(obj.height, 12)} fill="transparent" stroke="transparent" />
      </g>)}
      {guides.map((guide, i) => <line key={i} x1={guide.x ?? 0} x2={guide.x ?? doc.width} y1={guide.y ?? 0} y2={guide.y ?? doc.height} stroke="#bd8bad" strokeWidth={1 / view.zoom} strokeDasharray="6 4" pointerEvents="none" />)}
      {selectedObjects.map(obj => <g key={`selection-${obj.id}`} transform={objectTransform(obj)} className="sci-selection">
        <rect width={obj.width} height={Math.max(obj.height, 10)} fill="none" stroke="#6d61c5" strokeWidth={1.5 / view.zoom} pointerEvents="none" />
        {selected.length === 1 && !obj.locked && !obj.startBinding && !obj.endBinding && <>
          <line x1={obj.width / 2} y1="0" x2={obj.width / 2} y2={-26 / view.zoom} stroke="#6d61c5" strokeWidth={1 / view.zoom} />
          <circle role="button" aria-label="Rotate selected object" tabIndex={0} cx={obj.width / 2} cy={-26 / view.zoom} r={handle / 2 / view.zoom} fill="#fffdf9" stroke="#6d61c5" strokeWidth={1.5 / view.zoom} onPointerDown={event => start(event, "rotate", obj)} />
          <rect role="button" aria-label="Resize selected object" tabIndex={0} x={obj.width - handle / 2 / view.zoom} y={obj.height - handle / 2 / view.zoom} width={handle / view.zoom} height={handle / view.zoom} fill="#fffdf9" stroke="#6d61c5" strokeWidth={1.5 / view.zoom} onPointerDown={event => start(event, "resize", obj)} />
        </>}
      </g>)}
      {selectionBox && <g transform={`translate(${selectionBox.x} ${selectionBox.y})`} className="sci-selection">
        <rect width={selectionBox.width} height={selectionBox.height} fill="none" stroke="#6d61c5" strokeDasharray="5 4" strokeWidth={1.5 / view.zoom} pointerEvents="none" />
        <line x1={selectionBox.width / 2} y1="0" x2={selectionBox.width / 2} y2={-26 / view.zoom} stroke="#6d61c5" strokeWidth={1 / view.zoom} />
        <circle role="button" aria-label="Rotate selected objects" tabIndex={0} cx={selectionBox.width / 2} cy={-26 / view.zoom} r={handle / 2 / view.zoom} fill="#fffdf9" stroke="#6d61c5" strokeWidth={1.5 / view.zoom} onPointerDown={event => start(event, "rotate-selection", { ...selectionBox, type: "selection" })} />
        <rect role="button" aria-label="Resize selected objects" tabIndex={0} x={selectionBox.width - handle / 2 / view.zoom} y={selectionBox.height - handle / 2 / view.zoom} width={handle / view.zoom} height={handle / view.zoom} fill="#fffdf9" stroke="#6d61c5" strokeWidth={1.5 / view.zoom} onPointerDown={event => start(event, "resize-selection", { ...selectionBox, type: "selection" })} />
      </g>}
      {marquee && <rect {...marquee} fill="#8270cf" fillOpacity="0.12" stroke="#6d61c5" strokeWidth={1 / view.zoom} pointerEvents="none" />}
    </svg>
    {!doc.objects.length && <div className="sci-empty" onPointerDown={event => event.stopPropagation()}><span className="sci-empty-icon"><Microscope size={34} strokeWidth={1.4} /></span><h2>Make science visual.</h2><p>Start with a scientific illustration from the library,<br />or explore an editable template.</p><button className="sci-primary" onClick={() => onAsset("mitochondrion")}><Plus size={16} />Add your first illustration</button><small>Real scientific artwork. Zero AI credits.</small></div>}
    <div className="sci-canvas-hint" onPointerDown={event => event.stopPropagation()}><Move size={13} /> Alt + drag to pan <span>·</span> Shift + click to select more <span>·</span> Ctrl + scroll to zoom</div>
  </div>;
});
export default StudioCanvas;
