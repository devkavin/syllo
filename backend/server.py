"""Compatibility entrypoint for hosts still importing ``backend.server:app``."""

from backend.app.main import app

__all__ = ["app"]
