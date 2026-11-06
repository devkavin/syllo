"""Validation for the portable illustration format stored in notebook JSON.

Only references into the locally curated, license-verified catalog are accepted.
No SVG, HTML, arbitrary URLs, or framework object graphs are accepted from clients.
"""

from __future__ import annotations

import base64
import json
import math
import re
import struct
from pathlib import Path

CATALOG = json.loads(
    (Path(__file__).resolve().parents[1] / "data/scientific-assets.json").read_text(
        encoding="utf-8"
    )
)
ASSET_IDS = frozenset(asset["id"] for asset in CATALOG)
IDENTIFIER = re.compile(r"^[a-zA-Z0-9_-]{1,100}$")
COLOR = re.compile(r"^#[a-fA-F0-9]{6}$")
DOCUMENT_FIELDS = frozenset(
    {
        "version",
        "id",
        "title",
        "width",
        "height",
        "background",
        "objects",
        "templateId",
        "templateVersion",
        "showLabels",
    }
)
COMMON_FIELDS = frozenset(
    {
        "id",
        "type",
        "x",
        "y",
        "width",
        "height",
        "rotation",
        "opacity",
        "groupId",
        "name",
        "role",
        "hidden",
        "locked",
        "isLabel",
        "labelFor",
    }
)
TYPE_FIELDS = {
    "asset": {"assetId"},
    "text": {"text", "fontSize", "color", "bold"},
    "arrow": {"color", "strokeWidth", "flipX", "flipY", "startBinding", "endBinding"},
    "connector": {
        "color",
        "strokeWidth",
        "flipX",
        "flipY",
        "startBinding",
        "endBinding",
    },
    "shape": {"shape", "color"},
    "highlight": {"shape", "color"},
}
BINDING_ANCHORS = frozenset({"left", "right", "top", "bottom", "center", "point"})


def require(condition, message):
    if not condition:
        raise ValueError(message)


def number(value, low, high):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and low <= value <= high
        and math.isfinite(value)
    )


def identifier(value):
    return isinstance(value, str) and bool(IDENTIFIER.fullmatch(value))


def color(value):
    return isinstance(value, str) and bool(COLOR.fullmatch(value))


def validate_illustration(props):
    require(isinstance(props, dict), "Figure props must be an object")
    source = props.get("document")
    require(
        isinstance(source, str) and len(source.encode("utf-8")) < 350_000,
        "Figure requires a JSON document under 350 KB",
    )
    try:
        doc = json.loads(source)
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid illustration JSON") from exc
    require(
        isinstance(doc, dict)
        and type(doc.get("version")) is int
        and doc["version"] in (1, 2),
        "Unsupported illustration schema version",
    )
    require(set(doc) <= DOCUMENT_FIELDS, "Unsupported document property")
    require(identifier(doc.get("id")), "Invalid illustration ID")
    require(
        isinstance(doc.get("title"), str) and len(doc["title"]) <= 240,
        "Invalid illustration title",
    )
    require(
        number(doc.get("width"), 200, 4000) and number(doc.get("height"), 200, 4000),
        "Invalid canvas dimensions",
    )
    require(color(doc.get("background")), "Invalid canvas background")
    if "showLabels" in doc:
        require(isinstance(doc["showLabels"], bool), "Invalid label visibility")
    if "templateId" in doc:
        require(identifier(doc["templateId"]), "Invalid template reference")
    if "templateVersion" in doc:
        require(
            type(doc["templateVersion"]) is int
            and 1 <= doc["templateVersion"] <= 10000,
            "Invalid template version",
        )
    objects = doc.get("objects")
    require(
        isinstance(objects, list) and len(objects) <= 600,
        "Figure supports at most 600 objects",
    )
    ids = set()
    for obj in objects:
        require(isinstance(obj, dict), "Invalid figure object")
        require(
            identifier(obj.get("id")) and obj["id"] not in ids,
            "Figure objects need unique IDs",
        )
        ids.add(obj["id"])
        kind = obj.get("type")
        require(
            isinstance(kind, str)
            and kind in {"asset", "text", "arrow", "connector", "shape", "highlight"},
            "Unsupported figure object",
        )
        require(
            set(obj) <= COMMON_FIELDS | TYPE_FIELDS[kind], "Unsupported object property"
        )
        for key in ("x", "y"):
            require(number(obj.get(key), -8000, 8000), "Invalid object position")
        for key in ("width", "height"):
            require(number(obj.get(key), 1, 8000), "Invalid object size")
        require(
            number(obj.get("rotation"), -3600, 3600)
            and number(obj.get("opacity"), 0, 1),
            "Invalid transform",
        )
        if "groupId" in obj:
            require(identifier(obj["groupId"]), "Invalid group")
        for key in ("hidden", "locked", "isLabel"):
            require(key not in obj or isinstance(obj[key], bool), "Invalid layer flag")
        for key in ("name", "role"):
            require(
                key not in obj or (isinstance(obj[key], str) and len(obj[key]) <= 120),
                "Invalid object name",
            )
        if kind == "asset":
            require(
                isinstance(obj.get("assetId"), str) and obj["assetId"] in ASSET_IDS,
                "Asset is not in the verified catalog",
            )
        else:
            require(color(obj.get("color")), "Invalid object color")
        if kind == "text":
            require(
                isinstance(obj.get("text"), str)
                and len(obj["text"]) <= 4000
                and len(obj["text"].split("\n")) <= 40,
                "Invalid label",
            )
            require(number(obj.get("fontSize"), 8, 160), "Invalid font size")
            require(
                "bold" not in obj or isinstance(obj["bold"], bool),
                "Invalid font weight",
            )
        if kind in {"arrow", "connector"}:
            require(number(obj.get("strokeWidth"), 1, 20), "Invalid line width")
            require(
                all(
                    key not in obj or isinstance(obj[key], bool)
                    for key in ("flipX", "flipY")
                ),
                "Invalid line direction",
            )
        if kind in {"shape", "highlight"}:
            require(
                isinstance(obj.get("shape"), str)
                and obj["shape"] in {"rect", "ellipse"},
                "Invalid annotation shape",
            )
    index = {obj["id"]: obj for obj in objects}
    for obj in objects:
        if "labelFor" in obj:
            require(
                identifier(obj["labelFor"])
                and obj["labelFor"] in index
                and obj["labelFor"] != obj["id"],
                "Invalid label target",
            )
        for key in ("startBinding", "endBinding"):
            if key not in obj:
                continue
            binding = obj[key]
            require(
                isinstance(binding, dict)
                and set(binding) <= {"objectId", "anchor", "u", "v"},
                "Invalid connector binding",
            )
            require(
                identifier(binding.get("objectId"))
                and binding["objectId"] in index
                and binding["objectId"] != obj["id"],
                "Invalid connector target",
            )
            target = index[binding["objectId"]]
            require(
                target["type"] not in {"arrow", "connector"}, "Invalid connector target"
            )
            require(
                isinstance(binding.get("anchor"), str)
                and binding["anchor"] in BINDING_ANCHORS,
                "Invalid connector anchor",
            )
            for coordinate in ("u", "v"):
                require(
                    coordinate not in binding or number(binding[coordinate], 0, 1),
                    "Invalid connector anchor",
                )
                if binding["anchor"] == "point":
                    require(coordinate in binding, "Point connectors require u and v")
    require(
        number(props.get("displayWidth", 100), 25, 100),
        "Display width must be 25 to 100 percent",
    )
    require(
        isinstance(props.get("caption", ""), str)
        and len(props.get("caption", "")) <= 1000,
        "Invalid figure caption",
    )
    preview = props.get("preview", "")
    require(
        isinstance(preview, str) and len(preview) <= 180_000, "Preview is too large"
    )
    if preview:
        require(
            preview.startswith("data:image/png;base64,"),
            "Only a generated PNG preview is accepted",
        )
        try:
            binary = base64.b64decode(preview.split(",", 1)[1], validate=True)
            require(
                binary.startswith(b"\x89PNG\r\n\x1a\n")
                and len(binary) >= 33
                and binary[12:16] == b"IHDR",
                "Invalid PNG",
            )
            width, height = struct.unpack(">II", binary[16:24])
            require(
                0 < width <= 1600 and 0 < height <= 1600, "Invalid preview dimensions"
            )
        except (ValueError, TypeError, struct.error) as exc:
            raise ValueError("Invalid PNG preview") from exc
    return doc
