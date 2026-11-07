import React, { useState } from "react";
import { ChevronDown, Layers } from "lucide-react";

export default function StudioArrange({ count, command }) {
  const [open, setOpen] = useState(false);
  const run = name => { command(name); setOpen(false); };
  return <div className="sci-arrange-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
    <button className={`sci-tool-button ${open ? "is-menu-open" : ""}`} aria-label="Arrange selection" aria-expanded={open} aria-controls="sci-arrange-options" onClick={() => setOpen(value => !value)}><Layers size={19} /><span>Arrange <ChevronDown size={10} /></span></button>
    {open && <div id="sci-arrange-options" className="sci-arrange-options" role="group" aria-label="Alignment and arrangement"><strong>Arrange your selection</strong>
      <div>{[["backward", "Send backward"], ["forward", "Bring forward"], ["group", "Group objects"], ["ungroup", "Ungroup objects"]].map(([action, label]) => <button key={action} disabled={!count || (action === "group" && count < 2)} onClick={() => run(action)}>{label}</button>)}</div>
      <span>Align · select two or more</span><div className="sci-arrange-options-grid">{["left", "center", "right", "top", "middle", "bottom"].map(side => <button key={side} disabled={count < 2} aria-label={`Align ${side}`} onClick={() => run(`align-${side}`)}>{side}</button>)}</div>
      <span>Distribute · select three or more</span><div>{["horizontal", "vertical"].map(axis => <button key={axis} disabled={count < 3} onClick={() => run(`distribute-${axis}`)}>{axis}</button>)}</div>
    </div>}
  </div>;
}
