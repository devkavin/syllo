from __future__ import annotations

import asyncio
from copy import deepcopy
import json
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
import httpx
import pytest
from sqlalchemy import create_engine, inspect, text

from backend.app.models import User
from backend.app.schemas.illustrations import ASSET_IDS
from backend.tests.test_academic_crud import register
from backend.tests.test_illustrations import document
from backend.tests.test_study_workflow import concurrent_app  # noqa: F401

URL = "/api/illustrations/library"
EMPTY = {"revision": 0, "favorites": [], "recent": [], "items": []}


def saved_item(**changes):
    return {
        "id": str(uuid4()),
        "name": "Respiration component",
        "kind": "component",
        "document": document(),
        **changes,
    }


async def patch(client, revision, action, **values):
    return await client.patch(
        URL, json={"expected_revision": revision, "action": action, **values}
    )


@pytest.mark.asyncio
async def test_library_requires_authentication_and_defaults_to_empty(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        assert (await client.get(URL)).status_code == 401
        assert (
            await patch(client, 0, "recent", asset_id="mitochondrion")
        ).status_code == 401
        await register(client, "library-empty@example.com")
        response = await client.get(URL)
        assert response.status_code == 200, response.text
        assert response.json() == EMPTY


@pytest.mark.asyncio
async def test_favorites_are_desired_state_and_recents_move_to_front(sql_app):
    app, _ = sql_app
    assets = sorted(ASSET_IDS)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "library-assets@example.com")
        first = await patch(client, 0, "favorite", asset_id=assets[0], enabled=True)
        assert first.status_code == 200, first.text
        assert first.json() == {**EMPTY, "revision": 1, "favorites": [assets[0]]}
        repeated = await patch(client, 1, "favorite", asset_id=assets[0], enabled=True)
        assert repeated.json() == first.json()
        removed = await patch(client, 1, "favorite", asset_id=assets[0], enabled=False)
        assert removed.json() == {**EMPTY, "revision": 2}
        revision = 2
        for asset_id in assets:
            response = await patch(client, revision, "recent", asset_id=asset_id)
            assert response.status_code == 200, response.text
            revision = response.json()["revision"]
        recent = (await client.get(URL)).json()["recent"]
        assert recent == list(reversed(assets))[:24]
        reordered = await patch(client, revision, "recent", asset_id=assets[0])
        assert (
            reordered.json()["recent"]
            == [assets[0], *[value for value in recent if value != assets[0]]][:24]
        )


@pytest.mark.asyncio
async def test_saved_items_round_trip_upsert_remove_and_preserve_credits(sql_app):
    app, factory = sql_app
    item = saved_item()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "library-items@example.com")
        before = (await client.get("/api/auth/me")).json()
        async with factory() as session:
            user = await session.get(User, before["user_id"])
            credits_before = (user.ai_credits_remaining, user.bonus_credits_remaining)
        created = await patch(client, 0, "save", item=item)
        assert created.status_code == 200, created.text
        assert created.json() == {**EMPTY, "revision": 1, "items": [item]}
        assert (await client.get(URL)).json() == created.json()
        changed = deepcopy(item)
        changed.update(name="Respiration preset", kind="preset")
        changed["document"]["objects"][0]["rotation"] = 25
        updated = await patch(client, 1, "save", item=changed)
        assert updated.status_code == 200, updated.text
        assert updated.json()["items"] == [changed]
        assert updated.json()["revision"] == 2
        another = saved_item(kind="preset")
        added = await patch(client, 2, "save", item=another)
        assert len(added.json()["items"]) == 2
        removed = await patch(client, 3, "remove", item_id=item["id"])
        assert removed.json() == {**EMPTY, "revision": 4, "items": [another]}
        repeated = await patch(client, 4, "remove", item_id=item["id"])
        assert repeated.json() == removed.json()
        after = (await client.get("/api/auth/me")).json()
        assert after["ai_credits_remaining"] == before["ai_credits_remaining"]
        async with factory() as session:
            user = await session.get(User, before["user_id"])
            assert (
                user.ai_credits_remaining,
                user.bonus_credits_remaining,
            ) == credits_before


@pytest.mark.asyncio
async def test_revision_conflicts_return_the_current_full_state(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "library-conflict@example.com")
        missing = await patch(client, 1, "recent", asset_id="mitochondrion")
        assert missing.status_code == 409, missing.text
        assert missing.json()["detail"]["current"] == EMPTY
        state = (await patch(client, 0, "save", item=saved_item())).json()
        stale = await patch(
            client, 0, "favorite", asset_id="mitochondrion", enabled=True
        )
        assert stale.status_code == 409, stale.text
        assert stale.json()["detail"]["current"] == state
        assert (await client.get(URL)).json() == state


@pytest.mark.asyncio
async def test_account_libraries_are_isolated_and_body_cannot_choose_an_owner(sql_app):
    app, _ = sql_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as owner, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as other:
        await register(owner, "library-owner@example.com")
        await register(other, "library-other@example.com")
        item = saved_item()
        first = await patch(owner, 0, "save", item=item)
        assert first.status_code == 200, first.text
        assert (await other.get(URL)).json() == EMPTY
        separate = {**item, "name": "Other account component"}
        assert (await patch(other, 0, "save", item=separate)).status_code == 200
        owner_id = (await owner.get("/api/auth/me")).json()["user_id"]
        forbidden = await patch(
            other, 1, "remove", item_id=item["id"], user_id=owner_id
        )
        assert forbidden.status_code == 422
        assert (await owner.get(URL)).json()["items"] == [item]
        assert (await other.get(URL)).json()["items"] == [separate]


@pytest.mark.parametrize(
    "body",
    [
        {"expected_revision": -1, "action": "recent", "asset_id": "mitochondrion"},
        {"expected_revision": True, "action": "recent", "asset_id": "mitochondrion"},
        {"expected_revision": 0, "action": "favorite", "asset_id": "mitochondrion"},
        {
            "expected_revision": 0,
            "action": "recent",
            "asset_id": "https://evil.test/image.svg",
        },
        {
            "expected_revision": 0,
            "action": "favorite",
            "asset_id": "unknown",
            "enabled": True,
        },
        {"expected_revision": 0, "action": "save"},
        {"expected_revision": 0, "action": "remove"},
        {
            "expected_revision": 0,
            "action": "recent",
            "asset_id": "mitochondrion",
            "item_id": str(uuid4()),
        },
    ],
)
@pytest.mark.asyncio
async def test_invalid_actions_do_not_change_the_library(sql_app, body):
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "library-invalid-action@example.com")
        response = await client.patch(URL, json=body)
        assert response.status_code == 422, response.text
        assert (await client.get(URL)).json() == EMPTY


@pytest.mark.parametrize(
    "changes",
    [
        {"id": "not-a-uuid"},
        {"name": " \n "},
        {"name": "x" * 121},
        {"kind": "external"},
        {"document": {}},
        {
            "document": {
                **document(),
                "objects": [
                    {
                        **document()["objects"][0],
                        "assetId": "https://evil.test/image.svg",
                    }
                ],
            }
        },
        {
            "document": {
                **document(),
                "objects": [{**document()["objects"][1], "text": "a" * 4001}],
            }
        },
        {"url": "https://evil.test/image.svg"},
    ],
)
@pytest.mark.asyncio
async def test_invalid_saved_items_are_rejected_without_writes(sql_app, changes):
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "library-invalid-item@example.com")
        response = await patch(client, 0, "save", item=saved_item(**changes))
        assert response.status_code == 422, response.text
        assert (await client.get(URL)).json() == EMPTY


@pytest.mark.asyncio
async def test_item_count_limit_allows_updating_and_reclaims_removed_capacity(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "library-count@example.com")
        items = [saved_item(name=f"Component {i}") for i in range(21)]
        for revision, item in enumerate(items[:20]):
            response = await patch(client, revision, "save", item=item)
            assert response.status_code == 200, response.text
        too_many = await patch(client, 20, "save", item=items[20])
        assert too_many.status_code == 422, too_many.text
        updated = await patch(
            client, 20, "save", item={**items[0], "name": "Updated at capacity"}
        )
        assert updated.status_code == 200 and len(updated.json()["items"]) == 20
        assert (
            await patch(client, 21, "remove", item_id=items[0]["id"])
        ).status_code == 200
        final = await patch(client, 22, "save", item=items[20])
        assert final.status_code == 200 and len(final.json()["items"]) == 20


@pytest.mark.asyncio
async def test_utf8_library_size_limit_is_atomic(sql_app):
    app, _ = sql_app
    large = document()
    label = large["objects"][1]
    large["objects"] = [
        {**label, "id": f"label-{i}", "text": "μ" * 4000} for i in range(40)
    ]
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "library-bytes@example.com")
        for revision in range(6):
            response = await patch(
                client, revision, "save", item=saved_item(document=large)
            )
            assert response.status_code == 200, response.text
        before = (await client.get(URL)).json()
        too_large = await patch(client, 6, "save", item=saved_item(document=large))
        assert too_large.status_code == 422, too_large.text
        assert (await client.get(URL)).json() == before


@pytest.mark.asyncio
@pytest.mark.parametrize("existing", [False, True])
async def test_concurrent_library_writes_never_lose_a_saved_item(
    concurrent_app, existing
):
    transport = httpx.ASGITransport(app=concurrent_app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as first, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as second:
        await register(first, "library-concurrent@example.com")
        second.cookies.update(first.cookies)
        revision = 0
        if existing:
            made = await patch(
                first, 0, "favorite", asset_id="mitochondrion", enabled=True
            )
            assert made.status_code == 200, made.text
            revision = 1
        items = [saved_item(name="First tab"), saved_item(name="Second tab")]
        results = await asyncio.gather(
            patch(first, revision, "save", item=items[0]),
            patch(second, revision, "save", item=items[1]),
        )
        assert sorted(result.status_code for result in results) == [200, 409]
        current = (await first.get(URL)).json()
        assert len(current["items"]) == 1 and current["revision"] == revision + 1
        conflict = next(result for result in results if result.status_code == 409)
        assert conflict.json()["detail"]["current"] == current
        retry = items[0] if current["items"][0]["id"] == items[1]["id"] else items[1]
        merged = await patch(second, revision + 1, "save", item=retry)
        assert merged.status_code == 200 and len(merged.json()["items"]) == 2


def test_scientific_library_migration_round_trip_and_owner_cascade(tmp_path: Path):
    database_path = tmp_path / "scientific-library.db"
    config = Config(str(Path("backend/alembic.ini").resolve()))
    config.set_main_option("script_location", str(Path("backend/alembic").resolve()))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path.as_posix()}")
    command.upgrade(config, "20261011_0013")
    engine = create_engine(f"sqlite:///{database_path.as_posix()}")
    with engine.begin() as connection:
        connection.execute(
            User.__table__.insert().values(
                user_id="library-migration-owner",
                email="migration@example.com",
                normalized_email="migration@example.com",
                name="Migration Owner",
            )
        )
    command.upgrade(config, "head")
    assert "scientific_libraries" in inspect(engine).get_table_names()
    foreign_keys = inspect(engine).get_foreign_keys("scientific_libraries")
    assert foreign_keys[0]["options"]["ondelete"] == "CASCADE"
    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        connection.execute(
            text(
                "INSERT INTO scientific_libraries (user_id, revision, data, created_at, updated_at) "
                "VALUES ('library-migration-owner', 3, :data, '2026-10-27', '2026-10-27')"
            ),
            {
                "data": json.dumps(
                    {"favorites": ["mitochondrion"], "recent": [], "items": []}
                )
            },
        )
        connection.execute(
            text("DELETE FROM users WHERE user_id='library-migration-owner'")
        )
        assert (
            connection.execute(
                text("SELECT COUNT(*) FROM scientific_libraries")
            ).scalar_one()
            == 0
        )
    command.check(config)
    command.downgrade(config, "20261011_0013")
    assert "scientific_libraries" not in inspect(engine).get_table_names()
    command.upgrade(config, "head")
    assert "scientific_libraries" in inspect(engine).get_table_names()
    engine.dispose()
