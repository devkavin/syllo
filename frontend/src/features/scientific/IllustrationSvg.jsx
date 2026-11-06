import React, { useState } from "react";
import { assetById, assetUrl } from "./document";
import { visibleObjects } from "./composition";

export function labelLines(obj) {
  const max = Math.max(1, Math.floor(obj.width / (obj.fontSize * 0.56)));
  return obj.text.split("\n").flatMap(line => {
    if (!line) return [""];
    const lines = []; let current = "";
    for (const word of line.split(" ")) {
      if (current && `${current} ${word}`.length > max) { lines.push(current); current = ""; }
      current = current ? `${current} ${word}` : word;
    }
    lines.push(current); return lines;
  });
}

function AssetImage({ obj }) {
  const [failed, setFailed] = useState(false);
  const url = assetUrl(obj.assetId);
  return !url || failed ? <g><rect width={obj.width} height={obj.height} fill="#fff3dc" stroke="#b57b21" strokeDasharray="5 4" /><text x="8" y="24" fontSize="16" fill="#815b1d">Asset unavailable</text><text x="8" y="46" fontSize="12" fill="#815b1d">{obj.assetId}</text></g>
    : <image href={url} width={obj.width} height={obj.height} preserveAspectRatio="xMidYMid meet" onError={() => setFailed(true)} />;
}

export function ObjectContents({ obj, prefix = "figure" }) {
  if (obj.type === "asset") return <AssetImage key={obj.assetId} obj={obj} />;
  if (obj.type === "text") return <text fill={obj.color} fontSize={obj.fontSize} fontFamily="Arial, Helvetica, sans-serif" fontWeight={obj.bold ? 700 : 400}>
    {labelLines(obj).map((line, index) => <tspan key={index} x="0" y={obj.fontSize + index * obj.fontSize * 1.32}>{line}</tspan>)}
  </text>;
  if (["shape", "highlight"].includes(obj.type)) return obj.shape === "ellipse"
    ? <ellipse cx={obj.width / 2} cy={obj.height / 2} rx={obj.width / 2} ry={obj.height / 2} fill={obj.color} />
    : <rect width={obj.width} height={obj.height} rx="5" fill={obj.color} />;
  const marker = `${prefix}-arrow-${obj.id}`;
  return <>
    {obj.type === "arrow" && <defs><marker id={marker} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M 1 1 L 11 6 L 1 11" fill="none" stroke={obj.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></marker></defs>}
    <line x1={obj.flipX ? obj.width : 0} y1={obj.flipY ? obj.height : 0} x2={obj.flipX ? 0 : obj.width} y2={obj.flipY ? 0 : obj.height} stroke={obj.color} strokeWidth={obj.strokeWidth} strokeLinecap="round" markerEnd={obj.type === "arrow" ? `url(#${marker})` : undefined} />
  </>;
}

export function objectTransform(obj) { return `translate(${obj.x} ${obj.y}) rotate(${obj.rotation} ${obj.width / 2} ${obj.height / 2})`; }

export default function IllustrationSvg({ document: doc, children, prefix = doc.id, ...props }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${doc.width} ${doc.height}`} aria-label={doc.title} role="img" {...props}>
    <title>{doc.title}</title>
    <rect width={doc.width} height={doc.height} fill={doc.background} />
    {visibleObjects(doc).map(obj => <g key={obj.id} transform={objectTransform(obj)} opacity={obj.opacity}><title>{obj.type === "asset" ? assetById[obj.assetId]?.name || "Unavailable asset" : obj.type === "text" ? obj.text : obj.type}</title><ObjectContents obj={obj} prefix={prefix} /></g>)}
    {children}
  </svg>;
}
