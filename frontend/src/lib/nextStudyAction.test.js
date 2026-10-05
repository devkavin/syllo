import { expect, it } from "vitest";
import { nextStudyAction } from "./nextStudyAction";
it("links current activities, upcoming activities, due work and the focus fallback", () => {
  const now = new Date("2026-10-05T09:30:00Z");
  const current = { title: "Limits", starts_at: "2026-10-05T09:00:00Z", ends_at: "2026-10-05T10:00:00Z", href: "/timer?event=e" };
  expect(nextStudyAction({ now, agenda: [current], reviews: [], tasks: [] }).href).toBe(current.href);
  expect(nextStudyAction({ now, agenda: [{ ...current, starts_at: "2026-10-05T11:00:00Z" }], reviews: [], tasks: [] }).kind).toBe("upcoming");
  expect(nextStudyAction({ now, agenda: [], reviews: [{ lesson_id: "l", next_review_at: "2026-10-05T08:00:00Z" }], tasks: [] }).href).toBe("/lessons/l");
  expect(nextStudyAction({ now, agenda: [], reviews: [], tasks: [{ task_id: "t", due_date: "2026-10-04" }] }).href).toBe("/tasks?task=t");
  expect(nextStudyAction({ now, agenda: [], reviews: [], tasks: [] }).href).toBe("/timer");
});
it("uses the student's calendar day near UTC midnight", () => {
  expect(nextStudyAction({ now: new Date("2026-10-05T22:00:00Z"), today: "2026-10-06", tasks: [{ task_id: "t", title: "Worksheet", due_date: "2026-10-06" }] }).href).toBe("/tasks?task=t");
});

it("chooses overdue work before a later class and today's tasks", () => {
  expect(nextStudyAction({ now: new Date("2026-10-06T06:00:00Z"), today: "2026-10-06",
    agenda: [{ id: "c", title: "Physics", starts_at: "2026-10-06T10:00:00Z", ends_at: "2026-10-06T11:00:00Z", href: "/timetable?edit=c" }],
    tasks: [{ task_id: "today", title: "Reading", due_date: "2026-10-06" }, { task_id: "late", title: "Worksheet", due_date: "2026-10-05" }],
  }).href).toBe("/tasks?task=late");
});

it("chooses a due review before a later class", () => {
  expect(nextStudyAction({ now: new Date("2026-10-06T06:00:00Z"), today: "2026-10-06",
    agenda: [{ title: "Physics", starts_at: "2026-10-06T10:00:00Z", ends_at: "2026-10-06T11:00:00Z", href: "/timetable" }],
    reviews: [{ lesson_id: "limits", next_review_at: "2026-10-06T05:00:00Z" }],
  }).href).toBe("/lessons/limits");
});

it("still recommends a renewing review when a previous completion timestamp is present", () => {
  expect(nextStudyAction({ now: new Date("2026-10-06T06:00:00Z"), today: "2026-10-06",
    reviews: [{ review_id: "r", lesson_id: "limits", completed_at: "2026-10-03T05:00:00Z", next_review_at: "2026-10-06T05:00:00Z" }],
  }).href).toBe("/lessons/limits");
});
