import React from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import { assetUrl } from "./document";

export default function StudioPacks({ packs, selectedId, onSelect }) {
  const featured = packs[0];
  return <section className="sci-packs" aria-label="Curriculum packs">
    {featured && <button className="sci-pack-featured" aria-label={`Browse ${featured.name} pack`} aria-pressed={selectedId === featured.id} onClick={() => onSelect(featured.id)}>
      <span className="sci-pack-art"><img src={assetUrl(featured.coverAssetId)} alt="" /></span>
      <span className="sci-pack-copy"><small><BookOpen size={12} /> FEATURED PACK</small><strong>{featured.name}</strong><span>{featured.assetCount} illustrations · {featured.templateCount} templates</span></span><ArrowRight size={16} />
    </button>}
    <div className="sci-pack-navigation"><button className="sci-pack-all" aria-pressed={!selectedId} onClick={() => onSelect("")}>All packs</button><details className="sci-pack-more"><summary>More curriculum packs</summary><div className="sci-pack-options" aria-label="Choose curriculum pack">{packs.slice(1).map(pack => <button key={pack.id} aria-label={`Browse ${pack.name} pack`} aria-pressed={selectedId === pack.id} onClick={() => onSelect(pack.id)}>{pack.name}<small>{pack.assetCount} illustrations · {pack.templateCount} templates</small></button>)}</div></details></div>
  </section>;
}
