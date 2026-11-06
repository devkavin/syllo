"""Bounded actions on a user's portable scientific illustration library."""

from __future__ import annotations

import json
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from backend.app.schemas.illustrations import ASSET_IDS, validate_illustration


def stable_id(value: str) -> str:
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise ValueError("Library items require a stable UUID") from exc


class ScientificLibraryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(strict=True, min_length=1, max_length=36)
    name: str = Field(strict=True, min_length=1, max_length=120)
    kind: Literal["component", "preset"]
    document: dict[str, Any]

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        return stable_id(value)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Library items need a nonblank name")
        return value.strip()

    @field_validator("document")
    @classmethod
    def validate_document(cls, value: dict[str, Any]) -> dict[str, Any]:
        source = json.dumps(
            value, ensure_ascii=False, allow_nan=False, separators=(",", ":")
        )
        return validate_illustration({"document": source})


class ScientificLibraryAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=0, strict=True)
    action: Literal["favorite", "recent", "save", "remove"]
    asset_id: str | None = Field(default=None, strict=True, max_length=100)
    enabled: bool | None = Field(default=None, strict=True)
    item: ScientificLibraryItem | None = None
    item_id: str | None = Field(default=None, strict=True, max_length=36)

    @field_validator("asset_id")
    @classmethod
    def approved_asset(cls, value: str | None) -> str | None:
        if value is not None and value not in ASSET_IDS:
            raise ValueError("Asset is not in the verified catalog")
        return value

    @field_validator("item_id")
    @classmethod
    def validate_item_id(cls, value: str | None) -> str | None:
        return stable_id(value) if value is not None else None

    @model_validator(mode="after")
    def action_fields(self) -> ScientificLibraryAction:
        required = {
            "favorite": {"asset_id", "enabled"},
            "recent": {"asset_id"},
            "save": {"item"},
            "remove": {"item_id"},
        }[self.action]
        supplied = self.model_fields_set - {"expected_revision", "action"}
        if supplied != required or any(
            getattr(self, field) is None for field in required
        ):
            raise ValueError(
                f"{self.action} requires only {', '.join(sorted(required))}"
            )
        return self
