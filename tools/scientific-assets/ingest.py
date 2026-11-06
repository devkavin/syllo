"""Reproducible, allowlisted scientific SVG ingestion. Run manually, never at runtime.

Only explicitly selected public assets are downloaded; per-file licensing evidence
is retained. Reject active content/external resources and preserve original metadata
as escaped text in the derived SVG's metadata, alongside the attribution record.
"""
from __future__ import annotations

import hashlib
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend/src/features/scientific"
REVISION = "d29e766ea7580b8063c4f47b29e872db40a4d979"
BASE = f"https://raw.githubusercontent.com/duerrsimon/bioicons/{REVISION}/"
SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)
TAGS = set("svg g defs path rect circle ellipse line polyline polygon text tspan linearGradient radialGradient stop clipPath mask pattern marker use title desc metadata".split())
LICENSES = {
    "cc-0": ("CC0-1.0", "https://creativecommons.org/publicdomain/zero/1.0/", False),
    "cc-by-4.0": ("CC-BY-4.0", "https://creativecommons.org/licenses/by/4.0/", True),
}
# Explicit names and authors prevent accidentally substituting a similarly named work.
SELECTION = [
    ("mitochondria", "jaiganesh", "Mitochondrion", "Cell Biology", ["organelle", "respiration"]),
    ("ribosome", "jaiganesh", "Ribosome", "Cell Biology", ["translation", "protein"]),
    ("Endoplasmic_Reticulum", "jaiganesh", "Endoplasmic reticulum", "Cell Biology", ["organelle", "ER"]),
    ("proteasome", "jaiganesh", "Proteasome", "Molecular Biology", ["protein", "degradation"]),
    ("Phospholipid", "Cléber-Gomes", "Phospholipid", "Cell Biology", ["membrane", "bilayer", "lipid"]),
    ("simple_cell1", "Marnie-Maddock", "Animal cell", "Cell Biology", ["eukaryote", "cell"]),
    ("Structure_of_Plant_Cell", "Durvesh-Burhade-&-Niliksha-Patel", "Plant cell", "Cell Biology", ["chloroplast", "vacuole", "cell wall"]),
    ("DNA_double_helix", "James-Lloyd", "DNA double helix", "Molecular Biology", ["genetics", "nucleic acid"]),
    ("tRNA_secondary_structure", "James-Lloyd", "Transfer RNA", "Molecular Biology", ["tRNA", "translation"]),
    ("histone_complex", "ASE", "Histone complex", "Molecular Biology", ["chromatin", "DNA"]),
    ("zincfinger", "Simon Dürr", "Zinc finger protein", "Molecular Biology", ["protein", "DNA binding"]),
    ("calcium_channel", "Marcel Tisch", "Calcium channel", "Molecular Biology", ["membrane", "ion", "protein"]),
    ("Human_heart", "Mariana RuizVillareal", "Human heart", "Anatomy", ["cardiovascular", "organ"]),
    ("Pyramidal_Neuron", "Fabian-Mikulasch", "Pyramidal neuron", "Anatomy", ["nervous system", "brain"]),
    ("redbloodcell", "EwaOz", "Red blood cell", "Anatomy", ["erythrocyte", "blood"]),
    ("Smooth_muscle_cell_v2", "Daniel-Marcos", "Smooth muscle cell", "Anatomy", ["tissue", "muscle"]),
    ("microscope-cartoon", "Derek-Croote", "Light microscope", "Laboratory", ["microscopy", "equipment"]),
    ("Pipette", "James-Lloyd", "Micropipette", "Laboratory", ["liquid", "equipment"]),
    ("erlenmeyer_filled", "KeHan", "Erlenmeyer flask", "Laboratory", ["glassware", "solution"]),
    ("Beakers", "Xavax", "Beakers", "Laboratory", ["glassware", "solution"]),
    ("round-bottomed-flask-cartoon", "Derek-Croote", "Round bottom flask", "Laboratory", ["chemistry", "glassware"]),
    ("qpcr_machine", "KeHan", "qPCR instrument", "Laboratory", ["DNA", "PCR", "equipment"]),
    ("cell_membrane", "Helicase 11", "Cell membrane", "Cell Biology", ["phospholipid", "bilayer"]),
]


def download(url):
    if urllib.parse.urlsplit(url).hostname not in {"raw.githubusercontent.com", "upload.wikimedia.org"}:
        raise ValueError("Source host is not approved")
    req = urllib.request.Request(url, headers={"User-Agent": "Syllo-scientific-asset-curation/1.0"})
    with urllib.request.urlopen(req, timeout=45) as response:
        data = response.read(2_000_001)
    if len(data) > 2_000_000:
        raise ValueError("Asset exceeds 2 MB")
    return data


def sanitize(data, record):
    if re.search(br"<!ENTITY|<!DOCTYPE", data, re.I):
        # SVG 1.1 DTD declarations are common, but entities are never permitted.
        if re.search(br"<!ENTITY", data, re.I):
            raise ValueError("XML entities are forbidden")
        data = re.sub(br"<!DOCTYPE[^>]*>", b"", data, flags=re.I)
    root = ET.fromstring(data)
    if root.tag != f"{{{SVG}}}svg":
        raise ValueError("Not an SVG document")
    original_metadata = [ET.tostring(n, encoding="unicode") for n in root.iter() if n.tag.split("}")[-1] == "metadata"]
    # Illustrator's simple class rules become inline declarations to avoid class
    # leakage when vectors are embedded in an exported composition.
    for style in [n for n in root.iter() if n.tag.split("}")[-1] == "style"]:
        css = re.sub(r"/\*.*?\*/", "", style.text or "", flags=re.S)
        if re.search(r"@|expression|javascript", css, re.I):
            raise ValueError("Unsafe stylesheet")
        for reference in re.findall(r"url\s*\((.*?)\)", css, re.I):
            if not re.fullmatch(r"#[\w:.-]+", reference.strip(" '\"")):
                raise ValueError("External stylesheet URL")
        for selectors, declarations in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
            for selector in selectors.split(","):
                selector = selector.strip()
                if not re.fullmatch(r"\.[\w-]+", selector):
                    raise ValueError(f"Unsupported stylesheet selector: {selector}")
                for element in root.iter():
                    if selector[1:] in element.get("class", "").split():
                        element.set("style", declarations + ";" + element.get("style", ""))
        for parent in root.iter():
            if style in list(parent):
                parent.remove(style)
    for parent in list(root.iter()):
        for child in list(parent):
            tag = child.tag.split("}")[-1]
            if tag in {"script", "foreignObject", "image", "animate", "set", "style"}:
                raise ValueError(f"Active or embedded content: {tag}")
            if tag not in TAGS or tag == "metadata":
                parent.remove(child)
    # Export intentionally accepts a conservative ASCII fragment-ID grammar.
    # Illustrator can emit Japanese gradient names; rename both definitions and
    # local references, preserving vector appearance without broadening export.
    existing_ids = {n.get("id") for n in root.iter() if n.get("id")}
    renamed = {}
    for node in root.iter():
        node_id = node.get("id")
        if node_id and not re.fullmatch(r"[A-Za-z0-9_:.-]+", node_id):
            candidate = f"source-definition-{len(renamed) + 1}"
            while candidate in existing_ids:
                candidate += "-safe"
            renamed[node_id] = candidate
            existing_ids.add(candidate)
            node.set("id", candidate)
    if renamed:
        for node in root.iter():
            for key, value in list(node.attrib.items()):
                if key.split("}")[-1] == "href" and value.startswith("#"):
                    node.set(key, "#" + renamed.get(value[1:], value[1:]))
                elif "url(" in value:
                    node.set(key, re.sub(r"url\((.*?)\)", lambda m: "url(#" + renamed.get(m[1].strip(" '\"")[1:], m[1].strip(" '\"")[1:]) + ")" if m[1].strip(" '\"").startswith("#") else m[0], value))
    for element in root.iter():
        for key, value in list(element.attrib.items()):
            local = key.split("}")[-1]
            if local.lower().startswith("on"):
                raise ValueError("Event handler in SVG")
            if key.startswith("{") and not key.startswith(f"{{{SVG}}}") and local != "href":
                del element.attrib[key]
                continue
            if local == "href":
                if not value.startswith("#"):
                    raise ValueError("External SVG reference")
                del element.attrib[key]
                element.set("href", value)
            if re.search(r"(?:https?:|data:|javascript:|@import|expression\s*\()", value, re.I):
                raise ValueError("Unsafe SVG attribute")
            for reference in re.findall(r"url\((.*?)\)", value):
                if not reference.strip(" '\"").startswith("#"):
                    raise ValueError("External CSS URL")
    if "viewBox" not in root.attrib:
        width = re.match(r"[\d.]+", root.get("width", ""))
        height = re.match(r"[\d.]+", root.get("height", ""))
        if not width or not height:
            raise ValueError("Missing SVG dimensions")
        root.set("viewBox", f"0 0 {width[0]} {height[0]}")
    box = [float(v) for v in re.split(r"[ ,]+", root.get("viewBox").strip())]
    record["aspectRatio"] = round(box[2] / box[3], 5)
    metadata = ET.Element(f"{{{SVG}}}metadata")
    metadata.text = json.dumps({"provenance": record, "originalMetadata": original_metadata}, ensure_ascii=False)
    root.insert(0, metadata)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def main():
    catalog = json.loads(download(BASE + "static/icons/icons.json"))
    authors = json.loads(download(BASE + "static/icons/authors.json"))
    (OUT / "assets").mkdir(parents=True, exist_ok=True)
    (OUT / "licenses").mkdir(exist_ok=True)
    for key in LICENSES:
        (OUT / "licenses" / f"{key}.txt").write_bytes(download(BASE + f"static/icons/{key}/LICENSE"))
    records = []
    for name, author, title, category, tags in SELECTION:
        matches = [a for a in catalog if a["name"] == name and a["author"] == author]
        if len(matches) != 1 or matches[0]["license"] not in LICENSES:
            raise ValueError(f"License verification failed: {name} / {author}")
        item = matches[0]
        license_id, license_url, attribution = LICENSES[item["license"]]
        path = f"static/icons/{item['license']}/{item['category']}/{author.replace(' ', '_')}/{name}.svg"
        asset_id = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        record = dict(id=asset_id, name=title, category=category, tags=tags, author=author,
                      authorUrl=authors.get(author, ""), source="Bioicons", sourceUrl=f"https://github.com/duerrsimon/bioicons/blob/{REVISION}/{urllib.parse.quote(path)}",
                      downloadUrl=BASE + urllib.parse.quote(path), license=license_id, licenseUrl=license_url,
                      attributionRequired=attribution, verifiedAt="2026-10-26", revision=REVISION,
                      modifications="Removed editor-specific XML and normalized SVG; original licensing metadata retained in metadata.",
                      file=f"{asset_id}.svg")
        original = download(record["downloadUrl"])
        record["sourceSha256"] = hashlib.sha256(original).hexdigest()
        normalized = sanitize(original, record)
        record["sha256"] = hashlib.sha256(normalized).hexdigest()
        (OUT / "assets" / record["file"]).write_bytes(normalized)
        records.append(record)
        print(f"{title}: {license_id}, {len(normalized)} bytes")
    write_catalog(records)


def write_catalog(records):
    # Independent curation passes (ETC, anatomy, and Bioicons) share this catalog.
    # Upsert by stable ID so rerunning one pass never erases another pass's work.
    existing = json.loads((OUT / "catalog.json").read_text(encoding="utf-8")) if (OUT / "catalog.json").exists() else []
    incoming = {record["id"]: record for record in records}
    if len(incoming) != len(records):
        raise ValueError("Duplicate scientific asset IDs")
    records = [incoming.pop(record["id"], record) for record in existing] + list(incoming.values())
    text = json.dumps(records, indent=2, ensure_ascii=False) + "\n"
    (OUT / "catalog.json").write_text(text, encoding="utf-8")
    # Backend Docker deployments intentionally do not copy frontend sources.
    backend_data = ROOT / "backend/app/data"
    backend_data.mkdir(exist_ok=True)
    (backend_data / "scientific-assets.json").write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
