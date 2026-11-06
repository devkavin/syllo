from copy import deepcopy
import json

import httpx
import pytest
from pydantic import ValidationError

from backend.app.schemas.academics import NotebookCreate
from backend.app.schemas.illustrations import validate_illustration
from backend.tests.test_academic_crud import register


def document():
    return {
        "version": 1,
        "id": "figure-1",
        "title": "Respiration",
        "width": 1400,
        "height": 850,
        "background": "#fffdf9",
        "objects": [
            {
                "id": "mito",
                "type": "asset",
                "assetId": "mitochondrion",
                "x": 100,
                "y": 100,
                "width": 200,
                "height": 100,
                "rotation": 12,
                "opacity": 1,
            },
            {
                "id": "label",
                "type": "text",
                "text": "H₂O + NAD⁺",
                "x": 100,
                "y": 300,
                "width": 220,
                "height": 40,
                "rotation": 0,
                "opacity": 1,
                "color": "#334155",
                "fontSize": 24,
            },
        ],
    }


def block(doc=None):
    return {
        "type": "scientificIllustration",
        "props": {
            "document": json.dumps(doc or document()),
            "caption": "Mitochondrion",
            "displayWidth": 100,
            "preview": "",
        },
    }


def test_accepts_structured_figure_inside_existing_notes():
    content = [
        {"type": "paragraph", "content": []},
        block(),
        {"type": "paragraph", "content": []},
    ]
    assert NotebookCreate(title="Biology", rich_content=content).rich_content == content


@pytest.mark.parametrize(
    "change",
    [
        {"version": 99},
        {"width": 90000},
        {
            "objects": [
                {"id": "a", "type": "asset", "assetId": "https://evil.test/image.svg"}
            ]
        },
        {"objects": [{"id": "a", "type": "script", "text": "alert(1)"}]},
        {"objects": [{**document()["objects"][0], "width": -2}]},
        {"objects": [{**document()["objects"][1], "color": "url(https://evil.test)"}]},
        {"objects": [document()["objects"][0], document()["objects"][0]]},
        {"objects": [{**document()["objects"][0], "type": ["asset"]}]},
        {
            "objects": [
                {
                    **document()["objects"][1],
                    "type": "shape",
                    "shape": {"invalid": True},
                }
            ]
        },
        {"objects": [{**document()["objects"][0], "x": 10**400}]},
    ],
)
def test_rejects_malformed_or_external_figure_content(change):
    with pytest.raises(ValidationError):
        NotebookCreate(title="Unsafe", rich_content=[block({**document(), **change})])


@pytest.mark.parametrize(
    "props",
    [
        {"document": "not-json"},
        {"document": "{}"},
        {
            "document": json.dumps(document()),
            "preview": "data:image/svg+xml,<svg onload='alert(1)'/>",
        },
        {"document": json.dumps(document()), "displayWidth": 200},
    ],
)
def test_rejects_unsafe_block_properties(props):
    with pytest.raises(ValidationError):
        NotebookCreate(
            title="Unsafe",
            rich_content=[{"type": "scientificIllustration", "props": props}],
        )


def composed_document(version=2):
    doc = document()
    doc.update(
        version=version, showLabels=False, templateId="respiration", templateVersion=2
    )
    doc["objects"][0].update(
        name="Mitochondrion", role="organelle", hidden=False, locked=True
    )
    doc["objects"][1].update(isLabel=True, labelFor="mito")
    doc["objects"].append(
        {
            "id": "interaction",
            "type": "arrow",
            "x": 200,
            "y": 200,
            "width": 100,
            "height": 2,
            "rotation": 0,
            "opacity": 1,
            "color": "#334155",
            "strokeWidth": 3,
            "startBinding": {"objectId": "mito", "anchor": "right"},
            "endBinding": {"objectId": "label", "anchor": "point", "u": 0.25, "v": 1},
        }
    )
    return doc


@pytest.mark.parametrize("version", [1, 2])
def test_portable_versions_round_trip_layers_labels_and_bindings_without_changes(
    version,
):
    doc = composed_document(version)
    assert validate_illustration({"document": json.dumps(doc)}) == doc
    content = [block(doc)]
    assert (
        NotebookCreate(title="Composition", rich_content=content).rich_content
        == content
    )


@pytest.mark.parametrize(
    "change",
    [
        {"showLabels": 1},
        {"showLabels": None},
        {"templateId": "https://evil.test"},
        {"templateVersion": True},
        {"templateVersion": 1.5},
        {"templateVersion": 10001},
        {"templateVersion": 10**400},
        {"src": "https://evil.test/art.svg"},
    ],
)
def test_rejects_invalid_optional_document_fields_in_legacy_and_new_documents(change):
    for version in (1, 2):
        with pytest.raises(ValidationError):
            NotebookCreate(
                title="Unsafe",
                rich_content=[block({**document(), "version": version, **change})],
            )


@pytest.mark.parametrize(
    "change",
    [
        {"name": "x" * 121},
        {"role": False},
        {"hidden": 0},
        {"locked": "true"},
        {"isLabel": None},
        {"labelFor": "mito"},
        {"labelFor": "missing"},
        {"labelFor": []},
        {"src": "https://evil.test/art.svg"},
        {"startBinding": {"objectId": "label", "anchor": "left"}},
    ],
)
def test_rejects_invalid_layer_metadata_or_type_specific_fields(change):
    for version in (1, 2):
        doc = composed_document(version)
        doc["objects"][0].update(change)
        with pytest.raises(ValidationError):
            NotebookCreate(title="Unsafe", rich_content=[block(doc)])


@pytest.mark.parametrize(
    "binding",
    [
        None,
        [],
        "mito",
        {},
        {"objectId": [], "anchor": "left"},
        {"objectId": "missing", "anchor": "left"},
        {"objectId": "interaction", "anchor": "left"},
        {"objectId": "mito", "anchor": ["left"]},
        {"objectId": "mito", "anchor": "outside"},
        {"objectId": "mito", "anchor": "point"},
        {"objectId": "mito", "anchor": "point", "u": -0.1, "v": 0},
        {"objectId": "mito", "anchor": "point", "u": 0, "v": 1.1},
        {"objectId": "mito", "anchor": "point", "u": True, "v": 0},
        {"objectId": "mito", "anchor": "point", "u": 10**400, "v": 0},
        {"objectId": "mito", "anchor": "point", "u": float("nan"), "v": 0},
        {"objectId": "mito", "anchor": "left", "u": {"url": "https://evil.test"}},
        {"objectId": "mito", "anchor": "left", "url": "https://evil.test"},
    ],
)
def test_rejects_invalid_connector_targets_and_anchor_payloads(binding):
    for version in (1, 2):
        doc = composed_document(version)
        doc["objects"][-1]["startBinding"] = binding
        with pytest.raises(ValidationError):
            NotebookCreate(title="Unsafe", rich_content=[block(doc)])


@pytest.mark.parametrize("target_kind", ["arrow", "connector"])
def test_connector_bindings_cannot_target_other_lines(target_kind):
    doc = composed_document(1)
    doc["objects"].append(
        {
            **doc["objects"][-1],
            "id": "another-line",
            "type": target_kind,
            "startBinding": {"objectId": "interaction", "anchor": "center"},
        }
    )
    with pytest.raises(ValidationError):
        NotebookCreate(title="Unsafe", rich_content=[block(doc)])


@pytest.mark.asyncio
async def test_version_two_document_round_trips_in_notes_and_personal_library(sql_app):
    app, _ = sql_app
    doc = composed_document()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "scientist-composition@example.com")
        created = await client.post(
            "/api/notebooks",
            json={"title": "Composition", "rich_content": [block(doc)]},
        )
        assert created.status_code == 200, created.text
        assert json.loads(created.json()["rich_content"][0]["props"]["document"]) == doc
        saved = await client.patch(
            "/api/illustrations/library",
            json={
                "expected_revision": 0,
                "action": "save",
                "item": {
                    "id": "42a9f2d1-9bb7-4b08-bd6c-98a6b7f5d221",
                    "kind": "preset",
                    "name": "Composition",
                    "document": doc,
                },
            },
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["items"][0]["document"] == doc


@pytest.mark.asyncio
async def test_figure_round_trip_revision_history_ownership_and_no_credits(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as owner:
        await register(owner, "scientist@example.com")
        before = (await owner.get("/api/auth/me")).json()
        created = await owner.post(
            "/api/notebooks",
            json={
                "title": "Respiration",
                "rich_content": [block()],
                "content": "Mitochondrion",
            },
        )
        assert created.status_code == 200, created.text
        url = f"/api/notebooks/{created.json()['notebook_id']}"
        saved = (await owner.get(url)).json()
        assert json.loads(saved["rich_content"][0]["props"]["document"]) == document()
        edited = deepcopy(document())
        edited["objects"][1]["text"] = "FADH₂ → FAD"
        updated = await owner.patch(
            url,
            json={
                "expected_revision": saved["revision"],
                "rich_content": [block(edited)],
            },
        )
        assert updated.status_code == 200, updated.text
        assert (
            json.loads(
                (await owner.get(url)).json()["rich_content"][0]["props"]["document"]
            )
            == edited
        )
        assert (
            await owner.patch(
                url,
                json={
                    "expected_revision": saved["revision"],
                    "rich_content": [block()],
                },
            )
        ).status_code == 409
        history = (await owner.get(url + "/history")).json()
        assert history
        after = (await owner.get("/api/auth/me")).json()
        assert after["ai_credits_remaining"] == before["ai_credits_remaining"]
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as stranger:
            await register(stranger, "stranger-scientist@example.com")
            assert (
                await stranger.patch(url, json={"rich_content": [block()]})
            ).status_code == 404
            assert (await stranger.get(url)).status_code == 404
