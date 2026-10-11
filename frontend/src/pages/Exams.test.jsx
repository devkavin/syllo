import React from "react";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import Exams from "./Exams";
import { http } from "@/lib/api";

vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), delete: vi.fn() }, formatError: error => error.message }));

const exam = {
  plan_id: "physics-exam", title: "Physics revision", subject_id: "physics", exam_date: "2099-11-01", daily_minutes: 60, completed_count: 1, total_items: 3,
  topics: [
    { lesson_id: "forces", title: "Forces", status: "in_progress", scheduled_count: 2, completed_count: 1, questions_count: 4, due_count: 2, needs_practice: 3, last_quality: "hard" },
    { lesson_id: "energy", title: "Energy", status: "not_started", scheduled_count: 1, completed_count: 0, questions_count: 0, due_count: 0, needs_practice: 0, last_quality: null },
  ],
};
beforeEach(() => vi.resetAllMocks());
const mount = () => render(<MemoryRouter><Exams /></MemoryRouter>);
it("confirms removal of an exam plan and its generated tasks", async () => {
  http.get.mockResolvedValue({ data: [exam] }); http.delete.mockResolvedValue({ data: {} }); mount();
  fireEvent.click(await screen.findByRole("button", { name: "Delete exam plan Physics revision" }));
  expect(http.delete).not.toHaveBeenCalled(); expect(screen.getByRole("dialog")).toHaveTextContent(/generated tasks/);
  fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
  await waitFor(() => expect(http.delete).toHaveBeenCalledWith("/study/plans/physics-exam"));
  await waitFor(() => expect(screen.queryByRole("article", { name: "Physics revision" })).not.toBeInTheDocument());
});

it("shows actual exam work and manual recall ratings with scoped lesson practice", async () => {
  http.get.mockResolvedValue({ data: [exam] });
  mount();
  const summary = await screen.findByRole("article", { name: "Physics revision" });
  expect(summary).toHaveTextContent("1 of 3 revision sessions completed");
  const forces = within(summary).getByRole("region", { name: "Forces" });
  expect(forces).toHaveTextContent("1 of 2 revision sessions completed");
  expect(forces).toHaveTextContent("2 due");
  expect(forces).toHaveTextContent("3 need practice");
  expect(forces).toHaveTextContent("Last self-rating: Hard · uncertain");
  expect(within(forces).getByRole("link", { name: "Open lesson" })).toHaveAttribute("href", "/lessons/forces");
  expect(within(forces).getByRole("link", { name: "Practice topic" })).toHaveAttribute("href", "/reviews?lesson=forces");
  expect(summary).not.toHaveTextContent(/\d+%|predicted grade|mastery/i);
  expect(within(summary).getByRole("region", { name: "Energy" })).toHaveTextContent("No self-rating yet");
  expect(within(summary).getByRole("region", { name: "Energy" })).toHaveTextContent("No practice cards yet");
});

it("explains how to add an exam when no revision plans exist", async () => {
  http.get.mockResolvedValue({ data: [] });
  mount();
  expect(await screen.findByText("No exam plans yet")).toBeVisible();
  expect(screen.getByRole("link", { name: "Plan revision" })).toHaveAttribute("href", "/planner");
});

it("keeps failed exam loading visible and allows a real retry", async () => {
  http.get.mockRejectedValueOnce(new Error("Exams unavailable"));
  http.get.mockResolvedValueOnce({ data: [exam] });
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("Exams unavailable");
  expect(screen.queryByText("No exam plans yet")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry exams" }));
  expect(await screen.findByRole("article", { name: "Physics revision" })).toBeVisible();
});
