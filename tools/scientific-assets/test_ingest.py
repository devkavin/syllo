import xml.etree.ElementTree as ET
import json
import pytest
import ingest
from ingest import sanitize


@pytest.mark.parametrize("content", [
    '<script>alert(1)</script>', '<foreignObject><p>HTML</p></foreignObject>',
    '<image href="https://evil.test/a.png"/>', '<path onclick="alert(1)"/>',
    '<path fill="url(https://evil.test/a.svg)"/>', '<use href="data:image/svg+xml,unsafe"/>',
    '<style>@import url(https://evil.test);</style>',
])
def test_ingestion_rejects_active_or_external_svg(content):
    with pytest.raises(ValueError):
        sanitize(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">{content}</svg>'.encode(), {})


def test_ingestion_retains_original_license_metadata_and_normalizes_safe_css():
    source = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><metadata>Original author CC0</metadata><style>.st0{fill:#ff0000;}</style><path class="st0" d="M0 0L20 10"/></svg>'
    record = {"author": "Test author", "license": "CC0-1.0"}
    result = sanitize(source, record)
    assert b"Original author CC0" in result
    assert b"Test author" in result
    assert b"<style" not in result
    assert ET.fromstring(result).find("{http://www.w3.org/2000/svg}path").get("style").startswith("fill:#ff0000")
    assert record["aspectRatio"] == 2


def test_ingestion_preserves_local_gradient_class_without_allowing_external_css():
    source = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><defs><linearGradient id="local"/></defs><style>.st0{fill:url(#local);}</style><path class="st0" d="M0 0L20 10"/></svg>'
    result = sanitize(source, {})
    assert b"fill:url(#local)" in result
    assert b"<style" not in result


def test_ingestion_normalizes_non_ascii_definition_ids_and_references():
    source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><defs><linearGradient id="色"/><linearGradient id="second" href="#色"/></defs><path fill="url(#色)" d="M0 0L20 10"/></svg>'.encode()
    result = sanitize(source, {})
    assert b'id="source-definition-1"' in result
    assert b'href="#source-definition-1"' in result
    assert b'fill="url(#source-definition-1)"' in result


def test_catalog_pass_merges_stable_ids_and_synchronizes_backend(tmp_path, monkeypatch):
    out = tmp_path / "frontend"
    out.mkdir()
    (tmp_path / "backend/app").mkdir(parents=True)
    original = [{"id": "etc-complex-i", "name": "Keep ETC"}, {"id": "existing", "name": "Old"}]
    (out / "catalog.json").write_text(json.dumps(original), encoding="utf-8")
    monkeypatch.setattr(ingest, "OUT", out)
    monkeypatch.setattr(ingest, "ROOT", tmp_path)
    ingest.write_catalog([{"id": "existing", "name": "Updated"}, {"id": "chloroplast", "name": "New"}])
    merged = json.loads((out / "catalog.json").read_text(encoding="utf-8"))
    assert merged == [original[0], {"id": "existing", "name": "Updated"}, {"id": "chloroplast", "name": "New"}]
    assert (out / "catalog.json").read_bytes() == (tmp_path / "backend/app/data/scientific-assets.json").read_bytes()
