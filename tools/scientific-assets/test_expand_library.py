"""Pure source-policy checks: no database, external endpoints or network."""
import hashlib
import json
import pytest
from expand_library import HERE, OUT, normalize, verify_source


def svg(body="<path d='M0 0L10 10'/>"):
    return f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'>{body}</svg>".encode()


def row():
    return dict(id="policy-fixture", title="Test protein", topic="Biochemistry", tags=["protein"], author="Test artist", license="cc-0")


def test_rejects_conflicting_individual_license_and_changed_source_bytes():
    with pytest.raises(ValueError, match="license"):
        verify_source(svg("<metadata>https://creativecommons.org/licenses/by-sa/4.0/</metadata>"), row())
    with pytest.raises(ValueError, match="checksum"):
        verify_source(svg(), row(), "0" * 64)


def test_raster_wrappers_are_not_counted_as_scientific_vectors():
    with pytest.raises(ValueError, match="raster"):
        verify_source(svg("<image href='data:image/png;base64,AA=='/>"), row())


def test_missing_definitions_and_active_content_rejected():
    for body in ["<path fill='url(#missing)' d='M0 0L10 10'/>", "<path onclick='alert(1)' d='M0 0L10 10'/>"]:
        with pytest.raises(ValueError):
            normalize(svg(body), row(), {}, "https://example.test/art.svg")


def test_normalized_vector_retains_author_license_modifications_and_source():
    record, data = normalize(svg("<metadata>Original artist credit</metadata><path d='M0 0L10 10'/>"), row(), {}, "https://example.test/art.svg")
    assert record["sourceSha256"] == hashlib.sha256(svg("<metadata>Original artist credit</metadata><path d='M0 0L10 10'/>" )).hexdigest()
    assert record["sha256"] == hashlib.sha256(data).hexdigest()
    for value in [b"Original artist credit", b"Test artist", b"CC0-1.0", b"modifications", b"https://example.test/art.svg"]:
        assert value in data


def test_all_pack_assets_have_individual_locked_evidence():
    lock = json.loads((HERE / "library-source-lock.json").read_text(encoding="utf-8"))
    catalog = json.loads((OUT / "catalog.json").read_text(encoding="utf-8"))
    for asset in catalog:
        if asset["id"] not in lock["sources"]:
            continue
        evidence = lock["sources"][asset["id"]]
        assert evidence["sha256"] == asset["sourceSha256"]
        assert evidence["license"] == asset["license"]
        assert evidence["url"] == asset["downloadUrl"]
        assert hashlib.sha256((OUT / "assets" / asset["file"]).read_bytes()).hexdigest() == asset["sha256"]
