import httpx
import pytest
from backend.tests.test_student_launch import person, headers
from backend.tests.test_today_search_reviews import make_lesson

@pytest.mark.asyncio
async def test_review_deletion_is_owned_and_keeps_lesson_and_study_history(sql_app):
    app, factory = sql_app
    owner = await person(factory, "review-delete@example.com")
    other = await person(factory, "review-other@example.com")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver", headers=headers(app, owner)) as client, httpx.AsyncClient(transport=transport, base_url="http://testserver", headers=headers(app, other)) as stranger:
        _, _, lesson = await make_lesson(client)
        response = await client.put(f"/api/lessons/{lesson['lesson_id']}/review", json={"next_review_at": "2026-11-01T08:00:00Z"})
        assert response.status_code == 200
        review = (await client.get("/api/reviews")).json()[0]
        url = f"/api/reviews/{review['review_id']}"
        assert (await stranger.delete(url)).status_code == 404
        assert (await client.delete(url)).status_code == 200
        assert (await client.get("/api/reviews")).json() == []
        assert (await client.get(f"/api/lessons/{lesson['lesson_id']}")).status_code == 200
        assert (await client.delete(url)).status_code == 404
