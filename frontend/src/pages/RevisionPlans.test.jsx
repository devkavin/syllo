import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import Planner from "./Planner";
import { http } from "@/lib/api";

vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, formatError: e => e.message }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { timezone: "Asia/Colombo" } }) }));

const plan = {
  plan_id: "plan-1", title: "Physics revision", subject_id: "physics", exam_date: "2099-11-01", daily_minutes: 60, study_days: [0, 2, 4],
  items: [
    { task_id: "task-1", title: "Revise Forces", lesson_id: "forces", due_date: "2020-01-01", completed: false },
    { task_id: "task-2", title: "Revise Energy", lesson_id: "energy", due_date: "2099-10-20", completed: false },
  ],
};
let plans;
beforeEach(() => {
  vi.resetAllMocks();
  plans = [structuredClone(plan)];
  http.get.mockImplementation(async url => {
    if (url === "/agenda") return { data: { items: [], warnings: [] } };
    if (url === "/study/plans") return { data: structuredClone(plans) };
    if (url === "/subjects") return { data: [{ subject_id: "physics", name: "Physics", color: "blue" }] };
    if (url === "/subjects/physics/units") return { data: [{ unit_id: "mechanics", name: "Mechanics" }] };
    if (url === "/units/mechanics/lessons") return { data: [{ lesson_id: "forces", unit_id: "mechanics", title: "Forces" }, { lesson_id: "energy", unit_id: "mechanics", title: "Energy" }] };
    throw new Error(`Unexpected request ${url}`);
  });
});
const mount = () => render(<MemoryRouter><Planner /></MemoryRouter>);
const openPlans = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Revision plans" }));
  await screen.findByRole("heading", { name: "Physics revision" });
};

it("keeps revision planning collapsed and shows overdue and upcoming real task work when opened", async () => {
  mount();
  expect(screen.queryByRole("heading", { name: "Physics revision" })).not.toBeInTheDocument();
  expect(http.get).not.toHaveBeenCalledWith("/study/plans");
  await openPlans();
  expect(screen.getByText(/1 overdue/)).toBeVisible();
  expect(screen.getByText(/1 upcoming/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Forces lesson" })).toHaveAttribute("href", "/lessons/forces");
  expect(screen.getByRole("link", { name: "View all tasks" })).toHaveAttribute("href", "/tasks");
});

it("creates a capacity-guided plan with selected lessons and Monday-based study days", async () => {
  http.post.mockImplementation(async (url, body) => {
    if (url !== "/study/plans") throw new Error("Wrong route");
    const created = { ...plan, plan_id: "new-plan", title: body.title, study_days: body.study_days, items: [plan.items[0]] };
    plans = [...plans, created];
    return { data: created };
  });
  mount(); await openPlans();
  fireEvent.click(screen.getByRole("button", { name: "New revision plan" }));
  fireEvent.change(screen.getByLabelText("Plan title"), { target: { value: "Exam preparation" } });
  await screen.findByRole("option", { name: "Physics" });
  fireEvent.change(screen.getByLabelText("Revision subject"), { target: { value: "physics" } });
  fireEvent.click(await screen.findByLabelText("Forces"));
  fireEvent.change(screen.getByLabelText("Exam date"), { target: { value: "2099-11-01" } });
  fireEvent.change(screen.getByLabelText("Daily study minutes"), { target: { value: "45" } });
  ["Tuesday", "Wednesday", "Thursday", "Friday"].forEach(day => fireEvent.click(screen.getByLabelText(day)));
  fireEvent.click(screen.getByLabelText("Sunday"));
  fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
  expect(await screen.findByRole("heading", { name: "Exam preparation" })).toBeVisible();
  expect(http.post).toHaveBeenCalledWith("/study/plans", expect.objectContaining({ title: "Exam preparation", subject_id: "physics", exam_date: "2099-11-01", daily_minutes: 45, study_days: [0, 6], lesson_ids: ["forces"], minutes_per_lesson: 30 }));
  expect(screen.queryByLabelText("Plan title")).not.toBeInTheDocument();
  await waitFor(() => expect(http.get.mock.calls.filter(([url]) => url === "/agenda").length).toBeGreaterThan(1));
});

it("retains the creation form after a capacity error and allows a corrected retry", async () => {
  http.post.mockRejectedValueOnce(new Error("Not enough study capacity before the exam"));
  http.post.mockResolvedValueOnce({ data: { ...plan, plan_id: "new-plan", title: "Exam preparation" } });
  mount(); await openPlans();
  fireEvent.click(screen.getByRole("button", { name: "New revision plan" }));
  fireEvent.change(screen.getByLabelText("Plan title"), { target: { value: "Exam preparation" } });
  await screen.findByRole("option", { name: "Physics" });
  fireEvent.change(screen.getByLabelText("Revision subject"), { target: { value: "physics" } });
  fireEvent.click(await screen.findByLabelText("Forces"));
  fireEvent.change(screen.getByLabelText("Exam date"), { target: { value: "2099-11-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Not enough study capacity");
  expect(screen.getByLabelText("Plan title")).toHaveValue("Exam preparation");
  expect(screen.getByLabelText("Forces")).toBeChecked();
  fireEvent.change(screen.getByLabelText("Daily study minutes"), { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
  expect(await screen.findByRole("heading", { name: "Exam preparation" })).toBeVisible();
});

it("saves completion and rescheduled dates and retains a rejected reschedule for retry", async () => {
  http.patch.mockImplementation(async (url, body) => {
    const item = plans[0].items.find(item => url.endsWith(item.task_id));
    Object.assign(item, body);
    return { data: structuredClone(item) };
  });
  mount(); await openPlans();
  fireEvent.click(screen.getByRole("button", { name: "Complete Revise Forces" }));
  expect(await screen.findByRole("button", { name: "Reopen Revise Forces" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Reschedule Revise Energy" }));
  const date = screen.getByLabelText("New date for Revise Energy");
  fireEvent.change(date, { target: { value: "2099-10-21" } });
  http.patch.mockRejectedValueOnce(new Error("Choose a selected study day before the exam"));
  fireEvent.click(screen.getByRole("button", { name: "Save date" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Choose a selected study day");
  expect(date).toHaveValue("2099-10-21");
  fireEvent.click(screen.getByRole("button", { name: "Save date" }));
  await waitFor(() => expect(screen.queryByLabelText("New date for Revise Energy")).not.toBeInTheDocument());
  expect(screen.getByText("Due 2099-10-21")).toBeVisible();
  expect(http.patch).toHaveBeenCalledWith("/study/plans/plan-1/items/task-1", { completed: true });
  expect(http.patch).toHaveBeenCalledWith("/study/plans/plan-1/items/task-2", { due_date: "2099-10-21" });
});

it("requires explicit deletion of the plan and its generated tasks", async () => {
  http.delete.mockResolvedValue({ data: null });
  mount(); await openPlans();
  fireEvent.click(screen.getByText("Plan options"));
  fireEvent.click(screen.getByRole("button", { name: "Delete Physics revision" }));
  expect(http.delete).not.toHaveBeenCalled();
  const confirmation = screen.getByRole("group", { name: "Delete Physics revision?" });
  expect(confirmation).toHaveTextContent(/generated tasks/);
  fireEvent.click(within(confirmation).getByRole("button", { name: "Delete plan and tasks" }));
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Physics revision" })).not.toBeInTheDocument());
  expect(http.delete).toHaveBeenCalledWith("/study/plans/plan-1");
});

it("retries loading plans without hiding the agenda", async () => {
  const get = http.get.getMockImplementation();
  let failed = false;
  http.get.mockImplementation(url => {
    if (url === "/study/plans" && !failed) { failed = true; return Promise.reject(new Error("Plans unavailable")); }
    return get(url);
  });
  mount(); fireEvent.click(screen.getByRole("button", { name: "Revision plans" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Plans unavailable");
  expect(screen.getByLabelText("Starting date")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry plans" }));
  expect(await screen.findByRole("heading", { name: "Physics revision" })).toBeVisible();
});

it("shows capacity using whole lessons on selected days before the exam", async () => {
  mount(); await openPlans();
  fireEvent.click(screen.getByRole("button", { name: "New revision plan" }));
  fireEvent.click(screen.getByText("Planning settings"));
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2099-10-12" } });
  fireEvent.change(screen.getByLabelText("Exam date"), { target: { value: "2099-10-19" } });
  fireEvent.change(screen.getByLabelText("Daily study minutes"), { target: { value: "45" } });
  ["Tuesday", "Thursday", "Friday"].forEach(day => fireEvent.click(screen.getByLabelText(day)));
  expect(screen.getByText("2 lesson slots before the exam")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Daily study minutes"), { target: { value: "60" } });
  expect(screen.getByText("4 lesson slots before the exam")).toBeVisible();
});
