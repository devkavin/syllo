import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import select

from backend.app.models import StudyAttempt, base
from backend.tests.test_academic_crud import register
from backend.tests.test_study_workflow import concurrent_app, curriculum  # noqa: F401


@pytest.mark.asyncio
async def test_question_formats_marks_retries_and_filtered_due_search(sql_app):
    app, factory = sql_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as owner, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as other:
        await register(owner, "daily-practice@example.com")
        await register(other, "daily-practice-other@example.com")
        subject, lessons = await curriculum(owner, 2)
        cards = []
        for format_, prompt, answer in [
            ("basic", "Cell recall", "Cell"),
            ("cloze", "A {{cell}} divides", ""),
            ("reverse", "Cell definition", "Building block"),
            ("exam", "Cell essay", "Model answer"),
        ]:
            made = await owner.post(
                "/api/study/questions",
                json={
                    "format": format_,
                    "prompt": prompt,
                    "answer": answer,
                    "lesson_id": lessons[0]["lesson_id"],
                    "time_limit_seconds": 90 if format_ == "exam" else None,
                    "max_marks": 5 if format_ == "exam" else None,
                },
            )
            assert made.status_code == 200, made.text
            cards.append(made.json())
        mistake = (
            await owner.post(
                "/api/study/questions",
                json={
                    "prompt": "Cell mistake",
                    "kind": "mistake",
                    "lesson_id": lessons[1]["lesson_id"],
                },
            )
        ).json()
        assert mistake["format"] == "basic"
        due = await owner.get("/api/study/due-summary")
        assert due.json() == {"questions_count": 4, "mistakes_count": 1, "due_count": 5}
        assert (await other.get("/api/study/due-summary")).json()["due_count"] == 0
        filtered = (
            await owner.get(
                "/api/study/questions",
                params={"lesson_id": lessons[1]["lesson_id"], "q": "mistake"},
            )
        ).json()
        assert [q["question_id"] for q in filtered] == [mistake["question_id"]]
        assert (
            len(
                (
                    await owner.get(
                        "/api/study/questions",
                        params={"subject_id": subject["subject_id"]},
                    )
                ).json()
            )
            == 5
        )
        assert (
            await other.get(
                "/api/study/questions", params={"lesson_id": lessons[0]["lesson_id"]}
            )
        ).status_code == 404
        results = (await owner.get("/api/search", params={"q": "building"})).json()
        assert [q["question_id"] for q in results["questions"]] == [
            cards[2]["question_id"]
        ]
        assert (await other.get("/api/search", params={"q": "cell"})).json()[
            "questions"
        ] == []
        exam = cards[-1]
        url = f"/api/study/questions/{exam['question_id']}"
        payload = {
            "quality": "hard",
            "expected_revision": 1,
            "request_id": str(uuid4()),
            "elapsed_seconds": 95,
            "earned_marks": 3,
        }
        rated = await owner.post(url + "/attempt", json=payload)
        assert rated.status_code == 200, rated.text
        assert rated.json()["successes"] == 0
        assert (await owner.post(url + "/attempt", json=payload)).json()[
            "attempts"
        ] == 1
        assert (
            await owner.post(url + "/attempt", json={**payload, "earned_marks": 4})
        ).status_code == 409
        assert (await other.post(url + "/attempt", json=payload)).status_code == 404
        for invalid in [
            {"earned_marks": 6},
            {"earned_marks": -1},
            {"elapsed_seconds": -1},
        ]:
            bad = await owner.post(
                url + "/attempt",
                json={
                    **payload,
                    "request_id": str(uuid4()),
                    "expected_revision": 2,
                    **invalid,
                },
            )
            assert bad.status_code == 422
        assert (
            await owner.post(
                f"/api/study/questions/{cards[0]['question_id']}/attempt",
                json={**payload, "request_id": str(uuid4())},
            )
        ).status_code == 422
        assert (
            await owner.patch(url, json={"expected_revision": 1, "format": "basic"})
        ).status_code == 409
        changed = await owner.patch(
            url,
            json={
                "expected_revision": 2,
                "time_limit_seconds": None,
                "max_marks": None,
                "format": "basic",
            },
        )
        assert (
            changed.status_code == 200 and changed.json()["time_limit_seconds"] is None
        )
        assert (await owner.post(url + "/attempt", json=payload)).status_code == 200
        async with factory() as session:
            attempt = await session.scalar(select(StudyAttempt))
            assert (
                attempt.elapsed_seconds,
                attempt.earned_marks,
                attempt.max_marks,
            ) == (95, 3, 5)
        assert (await owner.get("/api/study/due-summary")).json()[
            "questions_count"
        ] == 3


@pytest.mark.asyncio
async def test_formats_reject_invalid_values_without_creating_cards(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "format-validation@example.com")
        for invalid in [
            {"format": "unknown"},
            {"format": "cloze", "prompt": "No hidden words"},
            {"format": "reverse"},
            {"time_limit_seconds": 29},
            {"time_limit_seconds": 7201},
            {"max_marks": 0},
            {"max_marks": 1001},
        ]:
            response = await client.post(
                "/api/study/questions", json={"prompt": "Question", **invalid}
            )
            assert response.status_code == 422
        assert (await client.get("/api/study/questions")).json() == []


def plan_body(subject, lessons, today, **kwargs):
    return {
        "title": "Biology exam",
        "subject_id": subject["subject_id"],
        "exam_date": (today + timedelta(days=5)).isoformat(),
        "study_days": list(range(7)),
        "daily_minutes": 60,
        "minutes_per_lesson": 30,
        "lesson_ids": [lesson["lesson_id"] for lesson in lessons],
        **kwargs,
    }


@pytest.mark.asyncio
async def test_varied_repeat_plans_share_capacity_with_other_plans_and_study(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "varied-plan@example.com")
        subject, lessons = await curriculum(client, 3)
        today = base.utc_now().date()
        await client.post(
            "/api/timetable",
            json={
                "title": "Study slot",
                "date": today.isoformat(),
                "day_of_week": today.weekday(),
                "start_time": "08:00",
                "end_time": "08:30",
                "kind": "study",
                "recurrence": "none",
            },
        )
        weak = (
            await client.post(
                "/api/study/questions",
                json={"prompt": "Difficult cell", "lesson_id": lessons[0]["lesson_id"]},
            )
        ).json()
        await client.post(
            f"/api/study/questions/{weak['question_id']}/attempt",
            json={
                "quality": "again",
                "expected_revision": 1,
                "request_id": str(uuid4()),
            },
        )
        body = plan_body(
            subject,
            lessons[:2],
            today,
            lesson_minutes={lessons[0]["lesson_id"]: 20, lessons[1]["lesson_id"]: 40},
            repeat_difficult=True,
        )
        made = await client.post("/api/study/plans", json=body)
        assert made.status_code == 200, made.text
        plan = made.json()
        assert plan["minutes_per_lesson"] == 30
        assert [(item["due_date"], item["minutes"]) for item in plan["items"]] == [
            (today.isoformat(), 20),
            ((today + timedelta(days=1)).isoformat(), 40),
            ((today + timedelta(days=1)).isoformat(), 20),
        ]
        next_plan = await client.post(
            "/api/study/plans", json=plan_body(subject, lessons[2:], today)
        )
        assert next_plan.status_code == 200
        assert (
            next_plan.json()["items"][0]["due_date"]
            == (today + timedelta(days=2)).isoformat()
        )
        item = next_plan.json()["items"][0]
        assert (
            await client.patch(
                f"/api/tasks/{item['task_id']}", json={"due_date": today.isoformat()}
            )
        ).status_code == 422
        assert (
            await client.patch(
                f"/api/tasks/{item['task_id']}",
                json={"due_date": (today + timedelta(days=1)).isoformat()},
            )
        ).status_code == 422
        invalid = await client.post(
            "/api/study/plans", json={**body, "lesson_minutes": {"not-selected": 10}}
        )
        assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_overdue_preview_is_read_only_atomic_and_rejects_stale_or_foreign(
    sql_app, monkeypatch
):
    app, _ = sql_app
    fixed = datetime(2026, 10, 11, 10, tzinfo=timezone.utc)
    monkeypatch.setattr(base, "utc_now", lambda: fixed)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as owner, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as other:
        await register(owner, "reschedule-owner@example.com")
        await register(other, "reschedule-other@example.com")
        subject, lessons = await curriculum(owner, 3)
        plan = (
            await owner.post(
                "/api/study/plans",
                json=plan_body(subject, lessons, fixed.date(), daily_minutes=30),
            )
        ).json()
        completed = plan["items"][0]
        await owner.patch(
            f"/api/tasks/{completed['task_id']}", json={"completed": True}
        )
        monkeypatch.setattr(base, "utc_now", lambda: fixed + timedelta(days=2))
        url = f"/api/study/plans/{plan['plan_id']}/reschedule"
        assert (await other.post(url + "/preview")).status_code == 404
        preview = await owner.post(url + "/preview")
        assert preview.status_code == 200, preview.text
        preview = preview.json()
        assert [
            (m["task_id"], m["to_date"], m["minutes"]) for m in preview["moves"]
        ] == [(plan["items"][1]["task_id"], "2026-10-14", 30)]
        original = (await owner.get("/api/study/plans")).json()[0]
        assert original["items"][1]["due_date"] == "2026-10-12"
        body = {
            "fingerprint": preview["fingerprint"],
            "moves": [
                {"task_id": m["task_id"], "due_date": m["to_date"]}
                for m in preview["moves"]
            ],
        }
        assert (await other.post(url, json=body)).status_code == 404
        assert (
            await owner.post(
                url,
                json={
                    **body,
                    "moves": [
                        {"task_id": completed["task_id"], "due_date": "2026-10-14"}
                    ],
                },
            )
        ).status_code == 422
        assert (
            await owner.post(
                url,
                json={
                    **body,
                    "moves": [
                        {
                            "task_id": body["moves"][0]["task_id"],
                            "due_date": "2026-10-13",
                        }
                    ],
                },
            )
        ).status_code == 422
        await owner.patch(
            f"/api/tasks/{plan['items'][2]['task_id']}", json={"completed": True}
        )
        assert (await owner.post(url, json=body)).status_code == 409
        fresh = (await owner.post(url + "/preview")).json()
        body = {
            "fingerprint": fresh["fingerprint"],
            "moves": [
                {"task_id": m["task_id"], "due_date": m["to_date"]}
                for m in fresh["moves"]
            ],
        }
        applied = await owner.post(url, json=body)
        assert applied.status_code == 200, applied.text
        final = (await owner.get("/api/study/plans")).json()[0]
        kept = next(i for i in final["items"] if i["task_id"] == completed["task_id"])
        assert kept["completed"] and kept["due_date"] == "2026-10-11"
        assert (
            next(
                i for i in final["items"] if i["task_id"] == body["moves"][0]["task_id"]
            )["due_date"]
            == "2026-10-14"
        )
        assert (await owner.post(url, json=body)).status_code == 409


@pytest.mark.asyncio
async def test_exam_overview_reports_selected_topics_and_manual_recall(sql_app):
    app, _ = sql_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as owner, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as other:
        await register(owner, "exam-overview@example.com")
        await register(other, "exam-other@example.com")
        subject, lessons = await curriculum(owner, 3)
        plan = (
            await owner.post(
                "/api/study/plans",
                json=plan_body(subject, lessons[:2], base.utc_now().date()),
            )
        ).json()
        await owner.patch(
            f"/api/tasks/{plan['items'][0]['task_id']}", json={"completed": True}
        )
        for i in [0, 1, 2]:
            question = (
                await owner.post(
                    "/api/study/questions",
                    json={"prompt": "Recall", "lesson_id": lessons[i]["lesson_id"]},
                )
            ).json()
            if i == 0:
                await owner.post(
                    f"/api/study/questions/{question['question_id']}/attempt",
                    json={
                        "quality": "hard",
                        "expected_revision": 1,
                        "request_id": str(uuid4()),
                    },
                )
        exams = (await owner.get("/api/study/exams")).json()
        assert len(exams) == 1
        assert (exams[0]["completed_count"], exams[0]["total_items"]) == (1, 2)
        assert [t["lesson_id"] for t in exams[0]["topics"]] == [
            lesson["lesson_id"] for lesson in lessons[:2]
        ]
        topic = exams[0]["topics"][0]
        assert (
            topic["scheduled_count"],
            topic["completed_count"],
            topic["questions_count"],
            topic["due_count"],
            topic["needs_practice"],
            topic["last_quality"],
        ) == (1, 1, 1, 0, 1, "hard")
        assert (await other.get("/api/study/exams")).json() == []


@pytest.mark.asyncio
async def test_reminder_digest_is_timezone_scoped_quiet_and_read_only(
    sql_app, monkeypatch
):
    app, factory = sql_app
    fixed = datetime(2026, 10, 11, 18, tzinfo=timezone.utc)  # 23:30 Colombo
    monkeypatch.setattr(base, "utc_now", lambda: fixed)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as owner, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as other:
        await register(owner, "reminder-owner@example.com")
        await register(other, "reminder-other@example.com")
        await owner.patch("/api/auth/me", json={"timezone": "Asia/Colombo"})
        defaults = {
            "enabled": False,
            "quiet_start": "22:00",
            "quiet_end": "07:00",
            "digest_time": "17:00",
        }
        assert (await owner.get("/api/study/reminders")).json() == defaults
        assert (
            await owner.patch("/api/study/reminders", json={"enabled": True})
        ).status_code == 200
        for bad in [
            {"quiet_start": "24:00"},
            {"quiet_end": None},
            {"digest_time": "9:00"},
        ]:
            assert (
                await owner.patch("/api/study/reminders", json=bad)
            ).status_code == 422
        task = (
            await owner.post(
                "/api/tasks", json={"title": "Due today", "due_date": "2026-10-11"}
            )
        ).json()
        await owner.post(
            "/api/tasks", json={"title": "Later", "due_date": "2026-10-13"}
        )
        await other.post(
            "/api/tasks", json={"title": "Foreign", "due_date": "2026-10-11"}
        )
        await owner.post("/api/study/questions", json={"prompt": "Due card"})
        # New cards use the real model timestamp; make their due instant explicit.
        from backend.app.models import StudyQuestion

        async with factory() as session:
            question = await session.scalar(select(StudyQuestion))
            question.next_review_at = fixed - timedelta(seconds=1)
            await session.commit()
        await owner.post(
            "/api/timetable",
            json={
                "title": "Evening study",
                "date": "2026-10-11",
                "day_of_week": 6,
                "start_time": "19:00",
                "end_time": "19:30",
                "kind": "study",
                "recurrence": "none",
            },
        )
        digest = (await owner.get("/api/study/reminders/digest")).json()
        assert digest["date"] == "2026-10-11" and digest["timezone"] == "Asia/Colombo"
        assert digest["quiet"] and not digest["notification_due"]
        assert digest["practice_due"] == {"questions": 1, "mistakes": 0}
        assert [t["task_id"] for t in digest["tasks"]] == [task["task_id"]]
        assert [s["title"] for s in digest["sessions"]] == ["Evening study"]
        assert digest["total_count"] == 3
        await owner.patch(
            "/api/study/reminders", json={"quiet_start": "00:00", "quiet_end": "07:00"}
        )
        assert (await owner.get("/api/study/reminders/digest")).json()[
            "notification_due"
        ]
        assert (await owner.get("/api/study/reminders/digest")).json()[
            "notification_due"
        ]
        assert (await other.get("/api/study/reminders")).json() == defaults
        assert (await other.get("/api/study/reminders/digest")).json()["practice_due"][
            "questions"
        ] == 0


@pytest.mark.asyncio
async def test_varied_minutes_fit_available_days_even_when_selection_order_packs_poorly(
    sql_app,
):
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "varied-packing@example.com")
        subject, lessons = await curriculum(client, 4)
        today = base.utc_now().date()
        response = await client.post(
            "/api/study/plans",
            json=plan_body(
                subject,
                lessons,
                today,
                exam_date=(today + timedelta(days=2)).isoformat(),
                lesson_minutes={
                    lesson["lesson_id"]: minutes
                    for lesson, minutes in zip(lessons, [20, 20, 40, 40])
                },
            ),
        )
        assert response.status_code == 200, response.text
        items = response.json()["items"]
        assert (
            sum(
                item["minutes"]
                for item in items
                if item["due_date"] == today.isoformat()
            )
            == 60
        )
        assert (
            sum(
                item["minutes"]
                for item in items
                if item["due_date"] == (today + timedelta(days=1)).isoformat()
            )
            == 60
        )


@pytest.mark.asyncio
async def test_concurrent_plan_creation_reserves_shared_allowance_once(
    concurrent_app,  # noqa: F811
):
    transport = httpx.ASGITransport(app=concurrent_app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as first, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as second:
        await register(first, "concurrent-daily-plan@example.com")
        second.cookies.update(first.cookies)
        subject, lessons = await curriculum(first, 1)
        today = base.utc_now().date()
        body = plan_body(
            subject,
            lessons,
            today,
            daily_minutes=30,
            exam_date=(today + timedelta(days=1)).isoformat(),
        )
        results = await asyncio.gather(
            first.post("/api/study/plans", json=body),
            second.post("/api/study/plans", json=body),
        )
        assert sorted(result.status_code for result in results) == [200, 422]
        assert len((await first.get("/api/tasks")).json()) == 1
        assert len((await first.get("/api/study/plans")).json()) == 1


@pytest.mark.asyncio
async def test_task_delete_waits_for_reschedule_account_lock_before_reading(
    concurrent_app,  # noqa: F811
    monkeypatch,
):
    from backend.app.api.routes import revision_plans, tasks

    fixed = datetime(2026, 10, 11, 10, tzinfo=timezone.utc)
    monkeypatch.setattr(base, "utc_now", lambda: fixed)
    transport = httpx.ASGITransport(app=concurrent_app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as first, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as second:
        await register(first, "delete-reschedule-lock@example.com")
        second.cookies.update(first.cookies)
        subject, lessons = await curriculum(first, 1)
        plan = (
            await first.post(
                "/api/study/plans",
                json=plan_body(subject, lessons, fixed.date(), daily_minutes=30),
            )
        ).json()
        monkeypatch.setattr(base, "utc_now", lambda: fixed + timedelta(days=1))
        url = f"/api/study/plans/{plan['plan_id']}/reschedule"
        preview = (await first.post(url + "/preview")).json()
        body = {
            "fingerprint": preview["fingerprint"],
            "moves": [
                {
                    "task_id": preview["moves"][0]["task_id"],
                    "due_date": preview["moves"][0]["to_date"],
                }
            ],
        }
        context_ready, finish_apply, delete_read = (
            asyncio.Event(),
            asyncio.Event(),
            asyncio.Event(),
        )
        original_context, original_owned_task = (
            revision_plans.reschedule_context,
            tasks.owned_task,
        )

        async def pause_after_context(session, user, current_plan):
            result = await original_context(session, user, current_plan)
            context_ready.set()
            await finish_apply.wait()
            return result

        async def observe_delete_read(session, user_id, task_id):
            delete_read.set()
            return await original_owned_task(session, user_id, task_id)

        monkeypatch.setattr(revision_plans, "reschedule_context", pause_after_context)
        monkeypatch.setattr(tasks, "owned_task", observe_delete_read)
        apply = asyncio.create_task(first.post(url, json=body))
        await asyncio.wait_for(context_ready.wait(), timeout=2)
        delete = asyncio.create_task(
            second.delete(f"/api/tasks/{plan['items'][0]['task_id']}")
        )
        try:
            # The SQLite final write lock masks MySQL's read/delete race. Observe
            # the real task read to prove DELETE acquires the same account lock
            # before it can read state that rescheduling is about to change.
            try:
                await asyncio.wait_for(delete_read.wait(), timeout=0.1)
                read_while_applying = True
            except TimeoutError:
                read_while_applying = False
        finally:
            finish_apply.set()
            results = await asyncio.gather(apply, delete)
        assert not read_while_applying
        assert [response.status_code for response in results] == [200, 200]
        assert (await first.get("/api/tasks")).json() == []


@pytest.mark.asyncio
async def test_plan_packing_balances_two_days_with_three_sessions_each(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "balanced-duration-plan@example.com")
        subject, lessons = await curriculum(client, 6)
        today = base.utc_now().date()
        response = await client.post(
            "/api/study/plans",
            json=plan_body(
                subject,
                lessons,
                today,
                daily_minutes=70,
                exam_date=(today + timedelta(days=2)).isoformat(),
                lesson_minutes={
                    lesson["lesson_id"]: minutes
                    for lesson, minutes in zip(lessons, [30, 30, 20, 20, 20, 20])
                },
            ),
        )
        assert response.status_code == 200, response.text
        items = response.json()["items"]
        assert [
            sum(
                item["minutes"] for item in items if item["due_date"] == day.isoformat()
            )
            for day in [today, today + timedelta(days=1)]
        ] == [70, 70]


@pytest.mark.asyncio
async def test_preview_becomes_stale_when_planned_study_capacity_changes(
    sql_app, monkeypatch
):
    app, _ = sql_app
    fixed = datetime(2026, 10, 11, 10, tzinfo=timezone.utc)
    monkeypatch.setattr(base, "utc_now", lambda: fixed)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "preview-study-change@example.com")
        subject, lessons = await curriculum(client, 1)
        plan = (
            await client.post(
                "/api/study/plans",
                json=plan_body(subject, lessons, fixed.date(), daily_minutes=30),
            )
        ).json()
        monkeypatch.setattr(base, "utc_now", lambda: fixed + timedelta(days=1))
        url = f"/api/study/plans/{plan['plan_id']}/reschedule"
        preview = (await client.post(url + "/preview")).json()
        await client.post(
            "/api/timetable",
            json={
                "title": "New study",
                "date": "2026-10-12",
                "day_of_week": 0,
                "start_time": "08:00",
                "end_time": "08:30",
                "kind": "study",
                "recurrence": "none",
            },
        )
        payload = {
            "fingerprint": preview["fingerprint"],
            "moves": [
                {
                    "task_id": preview["moves"][0]["task_id"],
                    "due_date": preview["moves"][0]["to_date"],
                }
            ],
        }
        assert (await client.post(url, json=payload)).status_code == 409
        fresh = (await client.post(url + "/preview")).json()
        assert fresh["moves"][0]["to_date"] == "2026-10-13"


@pytest.mark.asyncio
async def test_reminder_digest_local_day_boundaries_and_disabled_delivery(
    sql_app, monkeypatch
):
    app, _ = sql_app
    fixed = datetime(2026, 10, 11, 20, tzinfo=timezone.utc)  # Next local day, 01:30
    monkeypatch.setattr(base, "utc_now", lambda: fixed)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "digest-day-boundary@example.com")
        await client.patch("/api/auth/me", json={"timezone": "Asia/Colombo"})
        await client.post(
            "/api/tasks", json={"title": "Overdue", "due_date": "2026-10-11"}
        )
        await client.post(
            "/api/tasks", json={"title": "Today", "due_date": "2026-10-12"}
        )
        later = (
            await client.post(
                "/api/tasks", json={"title": "Next day", "due_date": "2026-10-13"}
            )
        ).json()
        digest = (await client.get("/api/study/reminders/digest")).json()
        assert digest["date"] == "2026-10-12" and digest["quiet"]
        assert len(digest["tasks"]) == 2 and later["task_id"] not in {
            row["task_id"] for row in digest["tasks"]
        }
        await client.patch(
            "/api/study/reminders",
            json={"quiet_start": "12:00", "quiet_end": "13:00", "digest_time": "01:00"},
        )
        digest = (await client.get("/api/study/reminders/digest")).json()
        assert not digest["quiet"] and not digest["notification_due"]
        await client.patch("/api/study/reminders", json={"enabled": True})
        assert (await client.get("/api/study/reminders/digest")).json()[
            "notification_due"
        ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "digest_time,quiet_start,quiet_end,clock,want_quiet,want_due",
    [
        ("23:00", "22:00", "07:00", "06:59", True, False),
        ("23:00", "22:00", "07:00", "07:00", False, True),
        ("23:00", "22:00", "07:00", "21:59", False, True),
        ("23:00", "22:00", "07:00", "22:00", True, False),
        ("22:00", "22:00", "07:00", "07:00", False, True),
        ("07:00", "22:00", "07:00", "06:59", True, False),
        ("07:00", "22:00", "07:00", "07:00", False, True),
        ("12:30", "12:00", "13:00", "12:59", True, False),
        ("12:30", "12:00", "13:00", "13:00", False, True),
        ("23:00", "22:00", "22:00", "22:00", False, False),
        ("23:00", "22:00", "22:00", "23:00", False, True),
        ("21:00", "22:00", "07:00", "20:59", False, False),
        ("21:00", "22:00", "07:00", "21:00", False, True),
    ],
)
async def test_digest_waits_until_quiet_end_when_digest_clock_is_suppressed(
    sql_app,
    monkeypatch,
    digest_time,
    quiet_start,
    quiet_end,
    clock,
    want_quiet,
    want_due,
):
    app, _ = sql_app
    fixed = datetime.fromisoformat(f"2026-10-11T{clock}:00+00:00")
    monkeypatch.setattr(base, "utc_now", lambda: fixed)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "quiet-delayed-digest@example.com")
        await client.patch("/api/auth/me", json={"timezone": "UTC"})
        await client.post(
            "/api/tasks", json={"title": "Today's work", "due_date": "2026-10-11"}
        )
        await client.patch(
            "/api/study/reminders",
            json={
                "enabled": True,
                "digest_time": digest_time,
                "quiet_start": quiet_start,
                "quiet_end": quiet_end,
            },
        )
        digest = (await client.get("/api/study/reminders/digest")).json()
        assert digest["date"] == "2026-10-11"
        assert (digest["quiet"], digest["notification_due"]) == (want_quiet, want_due)


@pytest.mark.asyncio
async def test_revision_horizon_rejects_more_than_two_years_with_weekly_study(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "bounded-plan-horizon@example.com")
        subject, lessons = await curriculum(client, 1)
        today = base.utc_now().date()
        await client.post(
            "/api/timetable",
            json={
                "title": "Weekly study",
                "day_of_week": today.weekday(),
                "start_time": "08:00",
                "end_time": "08:30",
                "kind": "study",
                "recurrence": "weekly",
            },
        )
        response = await client.post(
            "/api/study/plans",
            json=plan_body(
                subject,
                lessons,
                today,
                exam_date=(today + timedelta(days=731)).isoformat(),
            ),
        )
        assert response.status_code == 422, response.text
        assert (await client.get("/api/tasks")).json() == []
        extreme = await client.post(
            "/api/study/plans",
            json=plan_body(subject, lessons, today, exam_date="9999-12-31"),
        )
        assert extreme.status_code == 422 and "two years" in extreme.json()["detail"]
        delayed_start = await client.post(
            "/api/study/plans",
            json=plan_body(
                subject, lessons, today, start_date="9999-12-30", exam_date="9999-12-31"
            ),
        )
        assert delayed_start.status_code == 422


@pytest.mark.asyncio
async def test_legacy_revision_preview_rejects_extreme_horizon_before_expanding(
    sql_app, monkeypatch
):
    from backend.app.models import RevisionPlan

    app, factory = sql_app
    fixed = datetime(2026, 10, 11, 10, tzinfo=timezone.utc)
    monkeypatch.setattr(base, "utc_now", lambda: fixed)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "legacy-plan-horizon@example.com")
        subject, lessons = await curriculum(client, 1)
        plan = (
            await client.post(
                "/api/study/plans", json=plan_body(subject, lessons, fixed.date())
            )
        ).json()
        await client.post(
            "/api/timetable",
            json={
                "title": "Weekly study",
                "day_of_week": 0,
                "start_time": "08:00",
                "end_time": "08:30",
                "kind": "study",
                "recurrence": "weekly",
            },
        )
        async with factory() as session:
            legacy = await session.get(RevisionPlan, plan["plan_id"])
            legacy.exam_date = datetime(9999, 12, 31).date()
            await session.commit()
        monkeypatch.setattr(base, "utc_now", lambda: fixed + timedelta(days=1))
        preview = await client.post(
            f"/api/study/plans/{plan['plan_id']}/reschedule/preview"
        )
        assert preview.status_code == 422 and "two years" in preview.json()["detail"]
        assert (await client.get("/api/study/plans")).json()[0]["items"][0][
            "due_date"
        ] == "2026-10-11"
