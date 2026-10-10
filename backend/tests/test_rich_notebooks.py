from __future__ import annotations

import httpx
import pytest
from pydantic import ValidationError

from backend.app.schemas.academics import NotebookCreate
from backend.tests.test_academic_crud import register


DOCUMENT = [
    {"id": "heading", "type": "heading", "props": {"level": 2}, "content": [{"type": "text", "text": "Cell division", "styles": {"textColor": "blue"}}], "children": []},
    {"id": "note", "type": "paragraph", "props": {}, "content": [{"type": "text", "text": "Prophase", "styles": {"backgroundColor": "yellow"}}], "children": []},
]


@pytest.mark.parametrize("block", [
    {"type": "unsupported-block"},
    {"type": "paragraph", "children": [{"type": "unsupported-block"}]},
    {"type": "paragraph", "content": [{"type": "unsupported-inline"}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "Note", "styles": {"unsupported-style": True}}]},
    {"type": "paragraph", "id": []},
    {"type": "paragraph", "content": [{"type": "text", "text": 42}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "Note", "styles": []}]},
    {"type": "paragraph", "content": [{"type": "link", "href": 42, "content": []}]},
    {"type": "table", "content": {"type": "tableContent", "rows": [{"cells": [42]}]}},
])
def test_notebook_rejects_malformed_editor_content(block):
    with pytest.raises(ValidationError):
        NotebookCreate(title="Malformed", rich_content=[block])


@pytest.mark.asyncio
async def test_rich_notebook_round_trip_and_legacy_updates(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        await register(client, "notes@example.com")
        created = await client.post("/api/notebooks", json={"title": "Biology", "content": "Original <text>\n\nLast line"})
        assert created.status_code == 200
        notebook = created.json()
        assert notebook["rich_content"] is None
        assert notebook["paper_style"] == "plain"
        assert notebook["font_style"] == "sans"
        url = f"/api/notebooks/{notebook['notebook_id']}"
        patch = {"title": "Cells", "content": "Cell division\nProphase", "rich_content": DOCUMENT, "paper_style": "ruled", "font_style": "serif"}
        saved = await client.patch(url, json=patch)
        assert saved.status_code == 200
        reopened = (await client.get(url)).json()
        for key, value in patch.items():
            assert reopened[key] == value
        # A title-only edit must leave the formatting untouched.
        await client.patch(url, json={"title": "Revision"})
        assert (await client.get(url)).json()["rich_content"] == DOCUMENT
        # An older/plain-text client must not leave stale rich content visible.
        await client.patch(url, json={"content": "New plain notes"})
        reopened = (await client.get(url)).json()
        assert reopened["rich_content"] is None
        assert reopened["content"] == "New plain notes"
        listing = (await client.get("/api/notebooks")).json()[0]
        assert "rich_content" not in listing


@pytest.mark.asyncio
async def test_rich_notebook_creation_validation_and_ownership(sql_app):
    app, _ = sql_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as owner, httpx.AsyncClient(transport=transport, base_url="http://testserver") as other:
        await register(owner, "owner-notes@example.com")
        await register(other, "other-notes@example.com")
        created = await owner.post("/api/notebooks", json={"title": "Rich", "content": "Cell division\nProphase", "rich_content": DOCUMENT, "paper_style": "dotted", "font_style": "mono"})
        assert created.status_code == 200
        assert created.json()["rich_content"] == DOCUMENT
        url = f"/api/notebooks/{created.json()['notebook_id']}"
        assert (await other.get(url)).status_code == 404
        assert (await other.patch(url, json={"rich_content": DOCUMENT})).status_code == 404
        for patch in ({"paper_style": "unknown"}, {"font_style": "unknown"}, {"paper_style": None}, {"font_style": None}, {"rich_content": []}, {"rich_content": "not blocks"}, {"rich_content": [{}]}, {"rich_content": [{"type": "paragraph", "children": "bad"}]}, {"rich_content": [{"type": "paragraph", "props": []}]}, {"rich_content": [{"type": "paragraph", "content": [42]}]}):
            assert (await owner.patch(url, json=patch)).status_code == 422
            assert (await owner.post("/api/notebooks", json={"title": "Invalid", **patch})).status_code == 422
        cleared = await owner.patch(url, json={"rich_content": None})
        assert cleared.status_code == 200
        assert cleared.json()["rich_content"] is None


@pytest.mark.asyncio
async def test_rich_notebook_preserves_nested_blocks_and_tables(sql_app):
    app, _ = sql_app
    document = [
        {"type": "bulletListItem", "content": [{"type": "text", "text": "Parent", "styles": {"bold": True}}], "children": [{"type": "paragraph", "content": [{"type": "link", "href": "https://example.com", "content": [{"type": "text", "text": "Reference", "styles": {}}]}]}]},
        {"type": "table", "content": {"type": "tableContent", "rows": [{"cells": [[{"type": "text", "text": "Cell", "styles": {}}]]}]}},
        {"type": "codeBlock", "props": {"language": "python"}, "content": [{"type": "text", "text": "print('Hello')\n", "styles": {}}]},
        {"type": "image", "props": {"url": "https://example.com/image.png", "caption": "Diagram", "previewWidth": 512}},
        {"type": "audio", "props": {"url": "https://example.com/audio.mp3", "name": "Lecture"}},
        {"type": "video", "props": {"url": "https://example.com/video.mp4", "caption": "Experiment"}},
        {"type": "file", "props": {"url": "https://example.com/notes.pdf", "name": "Reference"}},
        {"type": "paragraph", "content": [{"type": "text", "text": "Styled", "styles": {"bold": True, "italic": True, "underline": True, "strike": True, "code": True, "textColor": "blue", "backgroundColor": "yellow"}}]},
    ]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        await register(client, "nested-notes@example.com")
        created = await client.post("/api/notebooks", json={"title": "Structured notes", "rich_content": document})
        assert created.status_code == 200
        url = f"/api/notebooks/{created.json()['notebook_id']}"
        assert (await client.get(url)).json()["rich_content"] == document
