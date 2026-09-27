from __future__ import annotations

import pytest


@pytest.fixture
def test_settings_values() -> dict[str, object]:
    return {
        "environment": "test",
        "app_url": "http://testserver",
        "database_url": "sqlite+aiosqlite:///:memory:",
        "jwt_secret": "test-jwt-secret-with-at-least-32-characters",
        "oauth_state_secret": "test-oauth-secret-with-at-least-32-characters",
        "cookie_secure": False,
    }
