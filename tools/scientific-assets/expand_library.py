"""Explicit, pinned biology pack. File operations only; never accesses a database.

Review: python expand_library.py --review .cache/scientific/library-sources
Replay: python expand_library.py .cache/scientific/library-sources
Review establishes source checksums; inspect its rejection report and rendered
contact sheets before shipping. Replay requires the committed checksum lock.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from ingest import BASE, LICENSES, OUT, REVISION, ROOT, download, sanitize, write_catalog
from expand_phase2 import SOURCE_SHA256, prepare_illustrator_fallback, prepare_swissbiopics

HERE = Path(__file__).resolve().parent
SELECTION = HERE / "library-selection.json"
LOCK = HERE / "library-source-lock.json"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_source(data, row, expected=None):
    if len(data) > 2_000_000 or (expected and digest(data) != expected):
        raise ValueError("Source size/checksum differs from reviewed bytes")
    if re.search(br"<!ENTITY", data, re.I):
        raise ValueError("XML entities forbidden")
    root = ET.fromstring(re.sub(br"<!DOCTYPE[^>]*>", b"", data, flags=re.I))
    if any(n.tag.split("}")[-1] == "image" for n in root.iter()):
        raise ValueError("Embedded raster wrapper is not vector artwork")
    # A collection folder license never overrides conflicting individual metadata.
    licenses = set(re.findall(r"creativecommons\.org/(licenses/[a-z-]+/[\d.]+|publicdomain/zero/[\d.]+)", data.decode("utf-8"), re.I))
    expected_license = "publicdomain/zero/1.0" if row["license"] == "cc-0" else "licenses/by/4.0"
    if any(value.lower().rstrip(".") != expected_license for value in licenses):
        raise ValueError("Conflicting individual license metadata")
    return root


def normalize(data, row, authors, url):
    root = verify_source(data, row)
    if row["author"] == "SwissBioPics":
        root = prepare_swissbiopics(root)
    elif row["author"] == "DBCLS":
        root = prepare_illustrator_fallback(root)
    if row.get("viewBox"):
        root.set("viewBox", row["viewBox"])
    license_id, license_url, attribution = LICENSES[row["license"]]
    record = dict(id=row["id"], name=row["title"], category=row["topic"], subjects=[row["topic"], "Biology"],
                  tags=row["tags"], author=row["author"], authorUrl=authors.get(row["author"], ""),
                  source="Bioicons", sourceUrl=url.replace("raw.githubusercontent.com/duerrsimon/bioicons/", "github.com/duerrsimon/bioicons/blob/"),
                  downloadUrl=url, license=license_id, licenseUrl=license_url, attributionRequired=attribution,
                  verifiedAt="2026-11-08", revision=REVISION, sourceSha256=digest(data), file=row["id"] + ".svg",
                  internalLabels=any(n.tag.split("}")[-1] in {"text", "tspan"} for n in root.iter()),
                  modifications="Normalized source SVG and local definition IDs; original metadata retained as escaped metadata. Internal artwork/lettering remains a single object.")
    if row["author"] == "SwissBioPics":
        record["author"] = "SwissBioPics / Philippe Le Mercier (SIB Swiss Institute of Bioinformatics)"
        record["modifications"] += " Removed semantic text/RDFa links; retained source credits/descriptions and biological geometry. Disambiguated unreferenced semantic IDs."
    if row["author"] == "DBCLS":
        record["modifications"] += " Selected source SVG fallback where present; discarded Adobe-only editor references."
    if row.get("viewBox"):
        record["modifications"] += " Cropped empty source page margins using reviewed viewBox bounds; scientific vector paths unchanged."
    result = sanitize(ET.tostring(root), record)
    tree = ET.fromstring(result)
    ids = [n.get("id") for n in tree.iter() if n.get("id")]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate source definition IDs")
    for node in tree.iter():
        for key, value in node.attrib.items():
            refs = re.findall(r"url\(['\"]?#([^)'\"\s]+)", value)
            if key.split("}")[-1] == "href":
                refs.append(value.removeprefix("#"))
            if any(ref not in ids for ref in refs):
                raise ValueError("Unresolved local source reference")
    if not any(n.tag.split("}")[-1] == "path" for n in tree.iter()):
        raise ValueError("No scientific vector paths")
    record["sha256"] = digest(result)
    return record, result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache", type=Path)
    parser.add_argument("--review", action="store_true")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    selection = json.loads(SELECTION.read_text(encoding="utf-8"))
    if selection["revision"] != REVISION:
        raise ValueError("Unreviewed upstream revision")
    index_path = ROOT / ".cache/scientific/bioicons-pinned.json"
    author_path = ROOT / ".cache/scientific/authors-pinned.json"
    index_data = index_path.read_bytes() if index_path.exists() else download(BASE + "static/icons/icons.json")
    author_data = author_path.read_bytes() if author_path.exists() else download(BASE + "static/icons/authors.json")
    if digest(index_data) != SOURCE_SHA256["icons.json"] or digest(author_data) != SOURCE_SHA256["authors.json"]:
        raise ValueError("Source index/author evidence changed")
    index, authors = json.loads(index_data), json.loads(author_data)
    lock = json.loads(LOCK.read_text(encoding="utf-8")) if LOCK.exists() else {"revision": REVISION, "sources": {}, "rejected": []}
    if lock["revision"] != REVISION:
        raise ValueError("Source lock revision mismatch")
    original = json.loads((OUT / "catalog.json").read_text(encoding="utf-8"))
    existing = {a["id"]: a for a in original}

    def prepare(row):
        key = row["id"]
        try:
            matches = [item for item in index if all(item.get(k) == row[k] for k in ["name", "author", "license", "category"])]
            if len(matches) != 1 or row["license"] not in LICENSES:
                raise ValueError("Individual license/index evidence mismatch")
            path = urllib.parse.quote(f"static/icons/{row['license']}/{row['category']}/{row['author'].replace(' ', '_')}/{row['name']}.svg")
            url = BASE + path
            cache_path = args.cache / (key + ".svg")
            data = cache_path.read_bytes() if cache_path.exists() else download(url)
            if not cache_path.exists():
                cache_path.write_bytes(data)
            expected = lock["sources"].get(key, {}).get("sha256")
            if not args.review and not expected:
                raise ValueError("Asset lacks reviewed source checksum")
            verify_source(data, row, expected)
            record, normalized = normalize(data, row, authors, url)
            if key in existing and existing[key].get("sourceSha256") != record["sourceSha256"]:
                raise ValueError("Stable asset ID would change source")
            return record, normalized, dict(sha256=digest(data), url=url, author=row["author"], license=record["license"])
        except Exception as error:
            return key, str(error)

    records, rejected = [], []
    candidates = selection["assets"] if args.review else [row for row in selection["assets"] if row["id"] in lock["sources"]]
    with ThreadPoolExecutor(max_workers=6) as pool:
        for result in pool.map(prepare, candidates):
            if len(result) == 2:
                rejected.append(dict(id=result[0], reason=result[1]))
                print("REJECT", result[0], result[1], flush=True)
                continue
            record, normalized, evidence = result
            # Normalize only this approved pack; unrelated existing catalog entries stay untouched.
            if record["id"] not in existing or record["id"] in lock["sources"]:
                (OUT / "assets" / record["file"]).write_bytes(normalized)
                records.append(record)
            lock["sources"][record["id"]] = evidence
            print("APPROVED", record["id"], record["license"], flush=True)
    if not args.review and rejected:
        raise ValueError("Reviewed source replay failed; catalog was not changed: " + json.dumps(rejected))
    if args.review:
        lock["rejected"] = rejected
        LOCK.write_text(json.dumps(lock, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_catalog(records)
    added = sum(record["id"] not in existing for record in records)
    print(f"Added {added}; refreshed pack records {len(records) - added}; rejected {len(rejected)}; total {len(original) + added}", flush=True)


if __name__ == "__main__":
    main()
