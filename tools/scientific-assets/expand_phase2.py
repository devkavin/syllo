"""Manual, checksum-pinned Phase 2 biological artwork curation.

Usage: python tools/scientific-assets/expand_phase2.py [source-cache-directory]
The optional cache permits downloads through a trusted OS HTTPS client when the
Python trust store is unavailable. Cached sources still require exact checksums.
This pass merges stable IDs; it never discards existing catalog records.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

from ingest import BASE, LICENSES, OUT, REVISION, SVG, download, sanitize, write_catalog

# Specific upstream name + author + license are verified against the pinned index.
SELECTION = [
    ("Animal_cells", "SwissBioPics", "cc-by-4.0", "animal-cell-detailed", "Animal cell, detailed", "Cell Biology", ["Cell Biology"], ["eukaryote", "organelles", "cytoskeleton"]),
    ("Plant_cells", "SwissBioPics", "cc-by-4.0", "plant-cell-detailed", "Plant cell, detailed", "Plant Biology", ["Plant Biology", "Cell Biology"], ["chloroplast", "vacuole", "cell wall", "organelles"]),
    ("generic-bacterium", "Pauline Franz", "cc-0", "bacterium", "Bacterium", "Microbiology", ["Microbiology", "Cell Biology"], ["prokaryote", "flagellum", "bacterial cell"]),
    ("restriction_enzyme", "Simon Dürr", "cc-0", "restriction-enzyme", "Restriction enzyme", "Genetics", ["Genetics", "Biochemistry"], ["endonuclease", "DNA", "protein"]),
    ("RNA_hairpin_loop", "DBCLS", "cc-by-4.0", "rna-hairpin", "RNA hairpin", "Genetics", ["Genetics", "Biochemistry"], ["RNA", "nucleic acid", "secondary structure"]),
    ("Protein_colored", "DBCLS", "cc-by-4.0", "folded-protein", "Folded protein ribbon", "Biochemistry", ["Biochemistry"], ["protein", "folding", "ribbon", "tertiary structure"]),
    ("amino_acid_backbone", "B--Gideon-Bergheim", "cc-0", "amino-acid-backbone", "Amino acid backbone", "Biochemistry", ["Biochemistry"], ["amino acid", "chemical structure", "protein"]),
    ("Nuclear_pore_complex", "DBCLS", "cc-by-4.0", "nuclear-pore-complex", "Nuclear pore complex", "Cell Biology", ["Cell Biology", "Genetics"], ["nucleus", "nuclear envelope", "transport"]),
    ("Motor_neuron", "DBCLS", "cc-by-4.0", "motor-neuron", "Motor neuron", "Neuroscience", ["Neuroscience", "Human Physiology"], ["axon", "dendrite", "nervous system"]),
    ("Interneuron", "DBCLS", "cc-by-4.0", "interneuron", "Interneuron", "Neuroscience", ["Neuroscience", "Human Physiology"], ["neuron", "dendrite", "nervous system"]),
    ("Sensory_neuron", "DBCLS", "cc-by-4.0", "sensory-neuron", "Sensory neuron", "Neuroscience", ["Neuroscience", "Human Physiology"], ["axon", "sensory", "nervous system"]),
    ("Bacterial_Ribosomes_with_mRNA", "Rahel-Khdhr", "cc-by-4.0", "bacterial-ribosome-mrna", "Bacterial ribosome with mRNA", "Microbiology", ["Microbiology", "Genetics", "Biochemistry"], ["translation", "ribosome", "mRNA"]),
    ("simple_receptor_2", "Helicase 11", "cc-by-4.0", "membrane-receptor", "Membrane receptor", "Biochemistry", ["Biochemistry", "Cell Biology", "Human Physiology"], ["receptor", "signaling", "membrane"]),
]

# Filled with reviewed upstream bytes, never automatically advanced to a revision.
SOURCE_SHA256 = {
    "Animal_cells": "9a8280ab46a28c0be147902274f597cd7b05303b57dfd1efd589d6e362643523",
    "Plant_cells": "82655ed0d6e66b82d84c5b128f670a114bf17c39afc8c4cc31942d84a9688f71",
    "generic-bacterium": "2984b266eedfad88aed6701fb0f5d3d1a11dbbdc88326a0f160e170d32df21bf",
    "restriction_enzyme": "941c505894ab674c58c173125491eee3c4cfab7d123c78ac6aa3ec62590026d2",
    "RNA_hairpin_loop": "da41b621ebabd30d659780554f0776df1511d6d7e4718639d6d7af319321b53b",
    "Nuclear_pore_complex": "c7d8d01a295f86d0f7e602d0dab1c4dcae1a4298e475f85f116de5b7d9cb0352",
    "Motor_neuron": "43af216ca57b504842a8cac2c3f26e90e085cc618948fc9fefd62a666f14f6df",
    "Interneuron": "d1663a0377c2f3aa8604c8ac7014073df5585380c33c0750f8aee940064ade1d",
    "Sensory_neuron": "a29334ca7c361e8fd41fe5662365486b72768e5dd1879255e8a0209232525569",
    "Bacterial_Ribosomes_with_mRNA": "4c842539fdd07b823ead39756dd1467aa69ea59cf8c0529062ff921e9835295c",
    "simple_receptor_2": "18fd91a243537313e52f908ad0dbf341e8f82b20a64ce28dd0e9884d41654eaf",
    "icons.json": "985b7ca5ce9e367886274cb04ff028497c1b0603691fddfd0106b688003078e1",
    "authors.json": "48f909cf5592bad890a2145fac0244870dde398fe1dbbce4ef246161c0261da6",
    "Protein_colored": "46091fdfab2f2b511843d5c158b467dcf6bcc3197c67bed9e23eff6b83196701",
    "amino_acid_backbone": "b5e54c6f63a39b151763038889d532435ea634c19189092f13fb38709b7abe08"
}

ANATOMY = [
    dict(id="digestive-system", name="Human digestive system", file="digestive-original.svg", sourceUrl="https://commons.wikimedia.org/wiki/File:Digestive_system_diagram_en.svg", downloadUrl="https://upload.wikimedia.org/wikipedia/commons/c/c5/Digestive_system_diagram_en.svg", revision="2025-03-29T15:01:24Z", sourceSha256="dea8b480a212d90b484603737a1e90bd98714d80c1eb3b0395c43b6936eaa127", tags=["digestive tract", "gastrointestinal", "liver", "stomach", "intestine"], removal="Removed only explicit source layers layer2 (Text) and layer3 (Arrows, including label panels); anatomy paths retained unchanged."),
    dict(id="respiratory-system", name="Human respiratory system", file="respiratory-original.svg", sourceUrl="https://commons.wikimedia.org/wiki/File:Respiratory_system_complete_en.svg", downloadUrl="https://upload.wikimedia.org/wikipedia/commons/5/5e/Respiratory_system_complete_en.svg", revision="2023-03-06T16:18:05Z", sourceSha256="2544b2013ada84edff87c9d16475da335a1a4161440e5bfb48925b3394f20909", tags=["lungs", "airway", "alveoli", "diaphragm", "gas exchange"], removal="Removed only the explicit final text group and 31 annotation leader/panel paths (zero-based source root children 153–183); retained anatomical paths and the source alveolar magnification inset unchanged."),
]

LANDMARKS = {
    # Coordinates use reviewed original leader endpoints; lung centers and the
    # cell vacuole are explicit visual centers. They are annotation guides.
    "digestive-system": [("Liver", .378, .551), ("Stomach", .629, .552), ("Gallbladder", .402, .589), ("Pancreas", .488, .643), ("Esophagus", .5165, .3417), ("Transverse colon", .502, .711), ("Ascending colon", .367, .803), ("Descending colon", .680, .826), ("Rectum", .512, .918)],
    "respiratory-system": [("Nasal cavity", .35823, .15008), ("Trachea", .45676, .42042), ("Main bronchi", .44214, .53789), ("Diaphragm", .27228, .82209), ("Alveoli", .90961, .34863), ("Capillary beds", .83835, .17692), ("Right lung", .375, .631), ("Left lung", .606, .631)],
    "animal-cell-detailed": [("Nucleus", .48150, .53312), ("Golgi apparatus", .65494, .26271), ("Lysosome", .41289, .27530)],
    "plant-cell-detailed": [("Nucleus", .67549, .49962), ("Golgi apparatus", .61269, .29484), ("Chloroplast", .34913, .31735), ("Central vacuole", .39954, .49221)],
}


def add_landmarks(record):
    if record["id"] in LANDMARKS:
        record["landmarks"] = [dict(name=name, u=u, v=v) for name, u, v in LANDMARKS[record["id"]]]
        record["landmarkNotes"] = "Annotation guides from reviewed source geometry and organelle group centers; schematic, not diagnostic measurements."
    return record


def read_source(filename, url, expected):
    path = Path(sys.argv[1]) / filename if len(sys.argv) > 1 else None
    data = path.read_bytes() if path and path.exists() else download(url)
    if len(data) > 2_000_000 or hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"Source bytes changed; review license and artwork: {filename}")
    return data


def retain_source_metadata(source, target):
    """Keep all original metadata, including SwissBioPics' RDFa text and links."""
    metadata = ET.SubElement(target, f"{{{SVG}}}metadata")
    metadata.text = json.dumps({
        "originalRootMetadata": {k: v for k, v in source.attrib.items() if k in {"vocab", "typeof", "property"}},
        "originalMetadata": [ET.tostring(n, encoding="unicode") for n in source.iter()
                             if n.tag.split("}")[-1] == "metadata" or
                             (n.tag.split("}")[-1] in {"text", "a"} and n.get("property"))],
    }, ensure_ascii=False)


def prepare_swissbiopics(source):
    root = copy.deepcopy(source)
    retain_source_metadata(source, root)
    for key in ("vocab", "typeof", "property"):
        root.attrib.pop(key, None)
    # All source text is semantic description/credit, except the explicit Spore
    # label. Credits/descriptions move to escaped metadata, not to editable art.
    for parent in list(root.iter()):
        for child in list(parent):
            if child.tag.split("}")[-1] in {"text", "a"}:
                parent.remove(child)
    # SwissBioPics repeats semantic location IDs for repeated structures. No
    # references address those semantic groups; definition IDs remain unchanged.
    seen = set()
    references = {m for n in root.iter() for v in n.attrib.values() for m in re.findall(r"(?:url\(#|^#)([\w:.-]+)", v)}
    for node in root.iter():
        node_id = node.get("id")
        if not node_id:
            continue
        if node_id in seen:
            if node_id in references:
                raise ValueError(f"Ambiguous referenced source ID: {node_id}")
            suffix = 2
            while f"{node_id}-{suffix}" in seen:
                suffix += 1
            node.set("id", f"{node_id}-{suffix}")
        seen.add(node.get("id"))
    return root


def store_asset(root_or_bytes, record):
    add_landmarks(record)
    data = root_or_bytes if isinstance(root_or_bytes, bytes) else ET.tostring(root_or_bytes)
    normalized = sanitize(data, record)
    record["sha256"] = hashlib.sha256(normalized).hexdigest()
    (OUT / "assets" / record["file"]).write_bytes(normalized)
    print(f"{record['id']}: {record['license']} / {len(normalized)} bytes")
    return record


def prepare_illustrator_fallback(source):
    """Extract reviewed DBCLS SVG fallback art, without accepting foreignObject."""
    root = copy.deepcopy(source)
    for parent in list(root.iter()):
        for child in list(parent):
            if child.tag != f"{{{SVG}}}switch":
                continue
            fallback = [n for n in child if n.tag == f"{{{SVG}}}g"]
            if len(fallback) != 1:
                raise ValueError("Unreviewed Illustrator fallback structure")
            for node in child:
                if node in fallback:
                    continue
                if node.tag != f"{{{SVG}}}foreignObject" or node.get("requiredExtensions") != "http://ns.adobe.com/AdobeIllustrator/10.0/" or any(not n.tag.startswith("{http://ns.adobe.com/AdobeIllustrator/10.0/}") for n in node):
                    raise ValueError("Foreign content is not an Adobe-only editor reference")
            position = list(parent).index(child)
            parent.remove(child)
            parent.insert(position, copy.deepcopy(fallback[0]))
    return root


def main():
    index_data = read_source("bioicons-pinned.json", BASE + "static/icons/icons.json", SOURCE_SHA256["icons.json"])
    author_data = read_source("authors-pinned.json", BASE + "static/icons/authors.json", SOURCE_SHA256["authors.json"])
    index, authors = json.loads(index_data), json.loads(author_data)
    records = []
    sources = {}
    for name, author, license_key, asset_id, title, category, subjects, tags in SELECTION:
        matches = [x for x in index if (x["name"], x["author"], x["license"]) == (name, author, license_key)]
        if len(matches) != 1:
            raise ValueError(f"Individual license verification failed: {name} / {author} / {license_key}")
        item = matches[0]
        path = urllib.parse.quote(f"static/icons/{license_key}/{item['category']}/{author.replace(' ', '_')}/{name}.svg")
        license_id, license_url, attribution = LICENSES[license_key]
        original = read_source(name + ".svg", BASE + path, SOURCE_SHA256[name])
        root = ET.fromstring(original)
        sources[asset_id] = (root, original)
        prepared = prepare_swissbiopics(root) if author == "SwissBioPics" else prepare_illustrator_fallback(root) if author == "DBCLS" else original
        modifications = "Removed editor-specific XML and normalized SVG; original licensing metadata retained as escaped metadata."
        if author == "SwissBioPics":
            modifications += " Removed semantic text, source Spore label and external RDFa links; source credit/descriptions retained in metadata. Disambiguated unreferenced repeated semantic IDs; biological paths unchanged."
        if author == "DBCLS" and any(n.tag == f"{{{SVG}}}switch" for n in root.iter()):
            modifications += " Selected the source Illustrator SVG fallback group; omitted Adobe-only editor references and private editor payload; biological paths unchanged."
        record = dict(id=asset_id, name=title, category=category, subjects=subjects, tags=tags, author=author,
                      authorUrl=authors.get(author, ""), source="Bioicons", sourceUrl=f"https://github.com/duerrsimon/bioicons/blob/{REVISION}/{path}",
                      downloadUrl=BASE + path, license=license_id, licenseUrl=license_url, attributionRequired=attribution,
                      verifiedAt="2026-10-27", revision=REVISION, sourceSha256=hashlib.sha256(original).hexdigest(),
                      modifications=modifications, file=asset_id + ".svg", internalLabels=name in {"amino_acid_backbone", "restriction_enzyme"})
        if author == "SwissBioPics":
            record["author"] = "SwissBioPics / Philippe Le Mercier (SIB Swiss Institute of Bioinformatics)"
        records.append(store_asset(prepared, record))
    for asset_id, title, source_id, node_id, child_index, view_box, tags, subjects in [
        ("nucleus", "Cell nucleus", "animal-cell-detailed", "SL0191", None, "389 353 234 234", ["nucleus", "nuclear envelope", "nucleolus", "organelle"], ["Cell Biology", "Genetics"]),
        ("chloroplast", "Chloroplast", "plant-cell-detailed", "SL0049", 0, "316 235 102 90", ["chloroplast", "photosynthesis", "thylakoid", "organelle"], ["Plant Biology", "Cell Biology", "Biochemistry"]),
    ]:
        source, original = sources[source_id]
        prepared = prepare_swissbiopics(source)
        selected = next(n for n in prepared.iter() if n.get("id") == node_id)
        if child_index is not None:
            selected = [n for n in selected if n.tag == f"{{{SVG}}}g"][child_index]
        root = ET.Element(f"{{{SVG}}}svg", {"viewBox": view_box})
        # Definitions occur inline in SwissBioPics. Preserve every definition so
        # the isolated organelle retains all original gradient/clip references.
        defs = ET.SubElement(root, f"{{{SVG}}}defs")
        for n in prepared.iter():
            if n.tag.split("}")[-1] in {"linearGradient", "radialGradient", "clipPath"}:
                defs.append(copy.deepcopy(n))
        root.append(copy.deepcopy(selected))
        retain_source_metadata(source, root)
        base_record = next(r for r in records if r["id"] == source_id)
        record = {k: v for k, v in base_record.items() if k not in {"aspectRatio", "sha256", "landmarks", "landmarkNotes"}}
        record.update(id=asset_id, name=title, category="Plant Biology" if asset_id == "chloroplast" else "Cell Biology", subjects=subjects, tags=tags, file=asset_id + ".svg",
                      modifications=f"Isolated source organelle group {node_id}" + (f", its first vector child group (index {child_index})" if child_index is not None else "") + "; source-defined geometry and grayscale palette unchanged. Removed semantic text and RDFa links while retaining all source credit/descriptions as escaped metadata. New viewBox bounds isolate the organelle with padding.")
        records.append(store_asset(root, record))
    for source_record in ANATOMY:
        item = dict(source_record)
        original = read_source(item.pop("file"), item["downloadUrl"], item["sourceSha256"])
        root = ET.fromstring(original)
        retain_source_metadata(copy.deepcopy(root), root)
        if item["id"] == "digestive-system":
            for node in list(root):
                if node.get("id") in {"layer2", "layer3"}:
                    root.remove(node)
        else:
            children = list(root)
            if len(children) != 186 or any(n.tag != f"{{{SVG}}}path" for n in children[153:184]):
                raise ValueError("Reviewed respiratory annotation structure changed")
            for node in children[153:185]:
                root.remove(node)
        removal = item.pop("removal")
        item.update(category="Human Anatomy", subjects=["Human Anatomy", "Human Physiology"],
                    author="Mariana Ruiz (LadyofHats); Jmarchn", authorUrl="https://commons.wikimedia.org/wiki/User:LadyofHats",
                    source="Wikimedia Commons", license="Public-Domain", licenseUrl=item["sourceUrl"] + "#Licensing",
                    attributionRequired=False, verifiedAt="2026-10-27", internalLabels=False,
                    modifications=removal + " Normalized XML; original metadata retained as escaped text.", file=item["id"] + ".svg")
        records.append(store_asset(root, item))
    write_catalog(records)


if __name__ == "__main__":
    main()
