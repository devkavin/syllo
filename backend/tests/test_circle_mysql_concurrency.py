"""Opt-in only: a disposable MySQL database, never DATABASE_URL.

Set SYLLO_TEST_MYSQL_URL to mysql+asyncmy://.../syllo_test_* and
SYLLO_TEST_MYSQL_ALLOW_SCHEMA_RESET=1 to explicitly permit fixture table resets.
"""
import asyncio
import os
from datetime import timedelta
import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import Base, Plan, CircleMember, CircleParticipation
from backend.tests.test_circle_scheduling import setup_circle
from backend.tests.test_student_launch import headers


@pytest_asyncio.fixture
async def mysql_app(test_settings_values):
    value = os.environ.get("SYLLO_TEST_MYSQL_URL")
    if not value or os.environ.get("SYLLO_TEST_MYSQL_ALLOW_SCHEMA_RESET") != "1":
        pytest.skip("No explicitly authorized disposable MySQL test database supplied")
    url = make_url(value)
    if url.drivername != "mysql+asyncmy" or not (url.database or "").startswith("syllo_test_"):
        pytest.fail("Test database must use mysql+asyncmy and a syllo_test_ database name")
    engine = create_async_engine(url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    async with factory() as session:
        session.add(Plan(plan_id="freshman", name="Freshman", price_cents=0, credits=10)); await session.commit()
    app = create_app(Settings(**test_settings_values, _env_file=None), session_factory=factory)
    try: yield app, factory
    finally:
        async with engine.begin() as connection: await connection.run_sync(Base.metadata.drop_all)
        await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("race", ["two_accepts", "removal", "timetable"])
async def test_mysql_schedule_races(mysql_app, race):
    app, factory, owner, friend, _, cid, day = await setup_circle(mysql_app)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        a, b = headers(app, owner), headers(app, friend)
        path = f"/api/circles/{cid}/sessions"
        proposal = {"topic": "Study", "participants": [owner.user_id, friend.user_id], "start": day.isoformat(), "end": (day + timedelta(hours=1)).isoformat()}
        event = (await c.post(path, headers=a, json=proposal)).json()
        accept = c.post(f"{path}/{event['id']}/respond", headers=b, json={"status": "accepted", "revision": 1})
        if race == "two_accepts":
            # Organizer declines its first event so it can propose another overlap.
            await c.post(f"{path}/{event['id']}/respond", headers=a, json={"status": "declined", "revision": 1})
            second = (await c.post(path, headers=a, json=proposal)).json()
            competing = c.post(f"{path}/{second['id']}/respond", headers=b, json={"status": "accepted", "revision": 1})
        elif race == "removal": competing = c.delete(f"/api/circles/{cid}/members/{friend.user_id}", headers=a)
        else: competing = c.post("/api/timetable", headers=b, json={"title": "Class", "day_of_week": day.weekday(), "start_time": "09:30", "end_time": "10:30", "date": day.date().isoformat(), "recurrence": "none"})
        result = await asyncio.gather(accept, competing)
        if race == "removal":
            assert result[1].status_code == 204 and result[0].status_code in (200, 404)
            async with factory() as s:
                assert await s.get(CircleMember, (cid, friend.user_id)) is None
                assert await s.scalar(select(CircleParticipation).where(CircleParticipation.user_id == friend.user_id)) is None
        else: assert sorted(r.status_code for r in result) == [200, 409]
