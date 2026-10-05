import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import Today from "./Today";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, formatError: String }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { name: "Student", timezone: "Asia/Colombo" } }) }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/lib/usage", () => ({ useUsage: () => ({ usage: null, setRemaining: vi.fn() }) }));
const emptyDay = { today: "2026-10-06", seconds_today: 0, subjects_count: 0, agenda: [], tasks: [], reviews_due: [], timetable: [], sessions: [], upcoming_deadlines: [], circle_invitations: [], schedule_warnings: [] };
let day, timetable, sessions;
beforeEach(() => {
  day = { ...emptyDay }; timetable = []; sessions = [];
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/today" ? day : url === "/timetable" ? timetable : url === "/sessions?limit=10" ? sessions : [] }));
  http.post.mockReset(); http.patch.mockReset();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-06T06:00:00Z"));
});
afterEach(() => vi.restoreAllMocks());
it("makes focus and due work visible without analytics cards", async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/today" ? { today: "2026-10-05", agenda: [], tasks: [{ task_id: "t", title: "Physics worksheet", due_date: "2026-10-05" }], reviews_due: [] } : [] }));
  render(<MemoryRouter><Today /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Start Focus" })).toHaveAttribute("href", "/timer");
  expect(screen.getAllByRole("link", { name: "Physics worksheet" })[0]).toHaveAttribute("href", "/tasks?task=t");
  expect(screen.queryByTestId("streak-calendar")).not.toBeInTheDocument();
  expect(http.get).not.toHaveBeenCalledWith("/analytics");
});

it("offers a single useful starting state instead of several empty modules", async () => {
  render(<MemoryRouter><Today /></MemoryRouter>);
  const start = await screen.findByRole("region", { name: "Suggested next step" });
  expect(within(start).getByRole("link", { name: "Start Focus" })).toHaveAttribute("href", "/timer");
  expect(screen.queryByText("No reviews due. Your next review will appear here.")).not.toBeInTheDocument();
  expect(screen.queryByText("Nothing due today.")).not.toBeInTheDocument();
  expect(screen.queryByText("Reflect on my week")).not.toBeInTheDocument();
});

it("creates a task on Today, refreshes it and keeps the student on the page", async () => {
  http.post.mockImplementation((url, body) => {
    if (url !== "/tasks") throw new Error("Unexpected endpoint");
    day = { ...emptyDay, tasks: [{ ...body, task_id: "new", completed: false }] };
    return Promise.resolve({ data: day.tasks[0] });
  });
  render(<MemoryRouter><Today /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Add task" }));
  expect(screen.getByRole("dialog", { name: "New task" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Read chapter 2" } });
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByText("Read chapter 2")).toBeVisible();
  expect(http.post).toHaveBeenCalledWith("/tasks", expect.objectContaining({ title: "Read chapter 2", due_date: "2026-10-06", priority: "normal" }));
  expect(screen.getByTestId("today-page")).toBeVisible();
});

it("keeps a failed task draft open for retry", async () => {
  http.post.mockRejectedValue(new Error("Connection lost"));
  render(<MemoryRouter><Today /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Add task" }));
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Keep my draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
  expect(screen.getByLabelText("Title")).toHaveValue("Keep my draft");
});

it("plans a one-off study session on the student's day without leaving Today", async () => {
  http.post.mockImplementation((url, body) => {
    if (url !== "/timetable") throw new Error("Unexpected endpoint");
    day = { ...emptyDay, agenda: [{ id: "s", source: "timetable", kind: "study", title: body.title, starts_at: "2026-10-06T12:30:00Z", ends_at: "2026-10-06T13:30:00Z", href: "/timetable?edit=s" }] };
    return Promise.resolve({ data: {} });
  });
  render(<MemoryRouter><Today /></MemoryRouter>);
  const add = await screen.findByRole("button", { name: "Add to today" });
  fireEvent.keyDown(add, { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Study time" }));
  expect(await screen.findByRole("dialog", { name: "Plan study time" })).toBeVisible();
  expect(screen.getByLabelText("Date")).toHaveValue("2026-10-06");
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Read chemistry" } });
  fireEvent.change(screen.getByLabelText("Start"), { target: { value: "18:00" } });
  fireEvent.change(screen.getByLabelText("End"), { target: { value: "19:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Add study time" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByText("Read chemistry")).toBeVisible();
  expect(http.post).toHaveBeenCalledWith("/timetable", expect.objectContaining({ kind: "study", recurrence: "none", date: "2026-10-06", start_time: "18:00", end_time: "19:00" }));
});

it("does not mistake a quiet day for a missing timetable and resumes a real recent lesson", async () => {
  timetable = [{ timetable_id: "monday", day_of_week: 0, title: "Physics", recurrence: "weekly" }];
  sessions = [{ session_id: "s", lesson_id: "limits", duration_seconds: 1500, mode: "pomodoro" }];
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/today" ? day : url === "/timetable" ? timetable : url === "/sessions?limit=10" ? sessions : url === "/lessons/limits" ? { lesson_id: "limits", title: "Limits", subject_id: "math", unit_id: "calc" } : [] }));
  render(<MemoryRouter><Today /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Continue studying" })).toHaveAttribute("href", "/timer?lesson=limits");
  expect(screen.getByText("Limits")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Add your timetable" })).not.toBeInTheDocument();
});

it("shows each task and review once, with a direct completion action", async () => {
  day = { ...emptyDay, tasks: [{ task_id: "t", title: "Physics worksheet", due_date: "2026-10-05", completed: false }], reviews_due: [{ review_id: "r", lesson_id: "limits", lesson_title: "Limits", next_review_at: "2026-10-06T05:00:00Z", state: "due" }],
    agenda: [{ id: "r", source: "review", kind: "review", title: "Review Limits", starts_at: "2026-10-06T05:00:00Z", ends_at: null, href: "/lessons/limits" }] };
  http.patch.mockImplementation(() => { day = { ...day, tasks: [] }; return Promise.resolve({ data: {} }); });
  render(<MemoryRouter><Today /></MemoryRouter>);
  expect(await screen.findByText("Physics worksheet")).toBeVisible();
  expect(screen.getAllByText("Physics worksheet")).toHaveLength(1);
  expect(screen.getAllByText("Limits")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Complete Physics worksheet" }));
  await waitFor(() => expect(screen.queryByText("Physics worksheet")).not.toBeInTheDocument());
  expect(http.patch).toHaveBeenCalledWith("/tasks/t", { completed: true });
});

it("keeps a recurring review visible after its previous completion", async () => {
  day = { ...emptyDay, reviews_due: [{ review_id: "r", lesson_id: "limits", lesson_title: "Limits", next_review_at: "2026-10-06T05:00:00Z", completed_at: "2026-10-03T05:00:00Z", state: "due" }] };
  render(<MemoryRouter><Today /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Review lesson" })).toHaveAttribute("href", "/lessons/limits");
});

it("hands keyboard focus from Add to the study dialog and restores Add on Escape", async () => {
  render(<MemoryRouter><Today /></MemoryRouter>);
  const add = await screen.findByRole("button", { name: "Add to today" });
  await waitFor(() => expect(add).toBeEnabled());
  add.focus(); fireEvent.keyDown(add, { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Study time" }));
  const dialog = await screen.findByRole("dialog", { name: "Plan study time" });
  await waitFor(() => expect(dialog).toContainElement(document.activeElement));
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(add).toHaveFocus());
});

it("confirms a saved future task even when it is not due in today's plan", async () => {
  http.post.mockResolvedValue({ data: { task_id: "later", title: "Read later", due_date: "2026-10-09" } });
  render(<MemoryRouter><Today /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Add task" }));
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Read later" } });
  fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-10-09" } });
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("status")).toHaveTextContent("Task added");
});

it("does not describe today as empty when a review is scheduled for later", async () => {
  day = { ...emptyDay, reviews_due: [{ review_id: "r", lesson_id: "limits", lesson_title: "Limits", next_review_at: "2026-10-06T16:00:00Z", state: "upcoming" }] };
  render(<MemoryRouter><Today /></MemoryRouter>);
  expect(await screen.findByText("Limits")).toBeVisible();
  expect(screen.queryByText(/Nothing planned today/)).not.toBeInTheDocument();
});

it("explains a failed subject load and lets the student retry without losing the study draft", async () => {
  let failed = true;
  http.get.mockImplementation(url => url === "/subjects" && failed ? Promise.reject(new Error("Subject service unavailable")) : Promise.resolve({ data: url === "/today" ? day : url === "/subjects" ? [{ subject_id: "math", name: "Mathematics" }] : [] }));
  render(<MemoryRouter><Today /></MemoryRouter>);
  const add = await screen.findByRole("button", { name: "Add to today" });
  fireEvent.keyDown(add, { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Study time" }));
  fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Math practice" } });
  const retry = await screen.findByRole("button", { name: "Retry subjects" });
  expect(screen.getByRole("alert")).toHaveTextContent(/without a subject/);
  failed = false; fireEvent.click(retry);
  expect(await screen.findByRole("option", { name: "Mathematics" })).toHaveValue("math");
  expect(screen.getByLabelText("Title")).toHaveValue("Math practice");
});
