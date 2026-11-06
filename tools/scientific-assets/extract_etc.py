"""Extract independent, credited schematic components from a verified CC0 SVG.

Do not import the source's reaction arrows or text: the application template owns
editable annotations and correct proton/electron flow. This is schematic artwork,
not a molecular surface model. The resulting template requires scientific review.
"""
import copy
import hashlib
import json
import sys
from pathlib import Path
import xml.etree.ElementTree as ET
from ingest import OUT, SVG, download, sanitize, write_catalog

URL = "https://upload.wikimedia.org/wikipedia/commons/8/8b/Electron_transport_chain.svg"
SOURCE = "https://commons.wikimedia.org/wiki/File:Electron_transport_chain.svg"
SELECTION = [
    ("etc-complex-i", "Complex I", ["path3845"], "59 93 96 170"),
    ("etc-complex-ii", "Complex II", ["path3849"], "194 93 76 171"),
    ("etc-complex-iii", "Complex III", ["path3847"], "351 77 116 177"),
    ("etc-complex-iv", "Complex IV", ["path4479"], "522 77 107 164"),
    ("etc-atp-synthase", "ATP synthase", ["g4614"], "665 93 147 262"),
    ("etc-bilayer", "Phospholipid bilayer", ["g3241", "g3543"], "28 93 780 133"),
]


def main():
    original = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else download(URL)
    if hashlib.sha1(original).hexdigest() != "0e5afb40a9dac14f1e163521b028457d5e2eaf2d":
        raise ValueError("ETC source revision changed; review the new license and artwork before ingesting")
    source = ET.fromstring(original)
    index = {node.get("id"): node for node in source.iter() if node.get("id")}
    records = [a for a in json.loads((OUT / "catalog.json").read_text(encoding="utf-8")) if not a["id"].startswith("etc-")]
    for asset_id, name, ids, box in SELECTION:
        root = ET.Element(f"{{{SVG}}}svg", {"viewBox": box})
        # Retain gradient definitions (including those placed outside <defs> by
        # the source tool) so extracted components retain their vector appearance.
        defs = ET.SubElement(root, f"{{{SVG}}}defs")
        for node in source.iter():
            if node.tag.split("}")[-1] in {"linearGradient", "radialGradient"}:
                defs.append(copy.deepcopy(node))
        for node_id in ids:
            root.append(copy.deepcopy(index[node_id]))
        for node in source:
            if node.tag.split("}")[-1] == "metadata":
                root.append(copy.deepcopy(node))
        palette = {"#ffb380": "#efbac5", "#aa4400": "#a4526d", "#e9ddaf": "#a9d2e9", "#504416": "#386e99", "#80ffe6": "#c9b4eb", "#008066": "#79529d", "#00ff00": "#aed3a4", "#165016": "#477d42", "#beb7c8": "#d8c7ed", "#e5d5ff": "#e9dcf6", "#000000": "#514766"}
        for node in root.iter():
            for key in ("style", "fill", "stroke"):
                if key in node.attrib:
                    value = node.attrib[key]
                    for old, new in palette.items():
                        value = value.replace(old, new)
                    node.set(key, value)
        record = dict(id=asset_id, name=name, category="Cell Biology", tags=["electron transport chain", "ETC", "respiration", "mitochondria", "schematic"],
                      author="Mariana Ruiz (LadyofHats); T-Fork", authorUrl="https://commons.wikimedia.org/wiki/User:LadyofHats",
                      source="Wikimedia Commons", sourceUrl=SOURCE, downloadUrl=URL,
                      license="CC0-1.0", licenseUrl="https://creativecommons.org/publicdomain/zero/1.0/", attributionRequired=False,
                      verifiedAt="2026-10-26", revision="2011-12-06T14:49:00Z", sourceSha256=hashlib.sha256(original).hexdigest(),
                      modifications=f"Isolated source SVG nodes {', '.join(ids)} into an independent vector component; removed original labels and flow arrows; recolored to a muted scientific palette; normalized XML. Schematic artwork, not a molecular structure.",
                      file=f"{asset_id}.svg")
        normalized = sanitize(ET.tostring(root), record)
        record["sha256"] = hashlib.sha256(normalized).hexdigest()
        (OUT / "assets" / record["file"]).write_bytes(normalized)
        records.append(record)
        print(f"{name}: CC0 source-derived vector")
    write_catalog(records)


if __name__ == "__main__":
    main()
