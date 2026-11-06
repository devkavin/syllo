"""Authenticated personal scientific libraries; no generation or credit usage."""

from copy import deepcopy
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.database import get_session
from backend.app.models import ScientificLibrary, User
from backend.app.models.illustrations import empty_library
from backend.app.schemas.illustration_library import ScientificLibraryAction
from backend.app.services.study import lock_student

router = APIRouter(prefix="/illustrations", tags=["illustrations"])
MAX_LIBRARY_BYTES = 2_000_000
MAX_SAVED_ITEMS = 20
MAX_RECENT_ASSETS = 24


def library_state(library: ScientificLibrary | None) -> dict:
    return {
        "revision": library.revision if library is not None else 0,
        **deepcopy(library.data if library is not None else empty_library()),
    }


@router.get("/library")
async def get_library(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    library = await session.get(ScientificLibrary, user.user_id)
    return library_state(library)


@router.patch("/library")
async def update_library(
    body: ScientificLibraryAction,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # Lock the owner before reading: the library itself may not exist yet.
    await lock_student(session, user.user_id)
    library = await session.scalar(
        select(ScientificLibrary)
        .where(ScientificLibrary.user_id == user.user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    current = library_state(library)
    if current["revision"] != body.expected_revision:
        raise HTTPException(
            409,
            detail={
                "message": "The scientific library changed. Retry with its current revision.",
                "current": current,
            },
        )

    original = library.data if library is not None else empty_library()
    data = deepcopy(original)
    if body.action == "favorite":
        if body.enabled and body.asset_id not in data["favorites"]:
            data["favorites"].append(body.asset_id)
        elif not body.enabled:
            data["favorites"] = [
                asset for asset in data["favorites"] if asset != body.asset_id
            ]
    elif body.action == "recent":
        data["recent"] = [
            body.asset_id,
            *[asset for asset in data["recent"] if asset != body.asset_id],
        ][:MAX_RECENT_ASSETS]
    elif body.action == "save":
        saved = body.item.model_dump(mode="json")
        index = next(
            (i for i, item in enumerate(data["items"]) if item["id"] == saved["id"]),
            None,
        )
        if index is None:
            if len(data["items"]) >= MAX_SAVED_ITEMS:
                raise HTTPException(
                    422, "The scientific library supports at most 20 saved items"
                )
            data["items"].append(saved)
        else:
            data["items"][index] = saved
    elif body.action == "remove":
        data["items"] = [item for item in data["items"] if item["id"] != body.item_id]

    serialized = json.dumps(
        data, ensure_ascii=False, allow_nan=False, separators=(",", ":")
    )
    if len(serialized.encode("utf-8")) > MAX_LIBRARY_BYTES:
        raise HTTPException(422, "The scientific library must be at most 2 MB")

    if data != original:
        if library is None:
            library = ScientificLibrary(user_id=user.user_id, revision=1, data=data)
            session.add(library)
        else:
            library.data = data
            library.revision += 1
    await session.commit()
    return library_state(library)
