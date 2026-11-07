import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { assetUrl } from "./document";

export default function StudioAssetPreview({ asset, onInsert, onClose }) {
  const region = useRef(null);
  useEffect(() => { region.current?.focus(); }, [asset.id]);
  return <section ref={region} tabIndex={-1} className="sci-asset-preview" aria-label={`${asset.name} preview`} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <div className="sci-preview-heading"><h4>{asset.name}</h4><button aria-label="Close asset preview" onClick={onClose}><X size={16} /></button></div>
    <div className="sci-preview-art"><img src={assetUrl(asset.id)} alt={asset.name} /></div>
    <dl><div><dt>Source</dt><dd>{asset.sourceUrl ? <a href={asset.sourceUrl} target="_blank" rel="noreferrer">{asset.source || "Original artwork"}</a> : asset.source || "Source unavailable"}</dd></div>
      <div><dt>Author</dt><dd>{asset.author}</dd></div>
      <div><dt>License</dt><dd>{asset.licenseUrl ? <a href={asset.licenseUrl} target="_blank" rel="noreferrer">{asset.license}</a> : asset.license}{asset.attributionRequired && " · Attribution required"}</dd></div>
      <div><dt>Modifications</dt><dd>{asset.modifications || "No modifications recorded."}</dd></div></dl>
    {asset.internalLabels && <p className="sci-inline-note">Source lettering is part of this artwork and cannot be edited separately.</p>}
    <button className="sci-primary" aria-label={`Insert previewed ${asset.name}`} onClick={() => onInsert(asset.id)}>Insert illustration</button>
    <p className="sci-preview-cost">0 AI credits · Artwork credits retained in exports</p>
  </section>;
}
