import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import Analytics from "./Analytics";
import { http } from "@/lib/api";

vi.mock("@/lib/api", () => ({ http: { get: vi.fn() }, formatError: e => e.message }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
const time = { total_seconds: 0, daily: [], by_subject: [], heatmap: [], streak: { current: 0, longest: 0 } };
const practice = {
  questions_count: 5, mistakes_count: 2, attempts_count: 9, successful_attempts: 4, due_count: 3,
  topics: [{ lesson_id: "forces", subject_id: "physics", title: "Forces", attempts: 6, successful_attempts: 2, needs_practice: true, last_quality: "again" },
    { lesson_id: "energy", subject_id: "physics", title: "Energy", attempts: 3, successful_attempts: 2, needs_practice: false, last_quality: "good" }],
};
beforeEach(() => { vi.resetAllMocks(); http.get.mockImplementation(async url => ({ data: url === "/study/progress" ? practice : time })); });
const mount = () => render(<MemoryRouter><Analytics /></MemoryRouter>);

it("shows self-rated recall outcomes and topics independently of recorded focus time", async () => {
  mount();
  expect(await screen.findByRole("heading", { name: "Self-rated recall results" })).toBeVisible();
  expect(screen.getByText("9 recall attempts")).toBeVisible();
  expect(screen.getByText("4 rated Good")).toBeVisible();
  expect(screen.getByText("3 due for practice")).toBeVisible();
  expect(screen.getByText("5 questions · 2 mistakes")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Topics to revisit" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Forces" })).toHaveAttribute("href", "/lessons/forces");
  expect(screen.queryByRole("link", { name: "Energy" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Practise due questions" })).toHaveAttribute("href", "/reviews");
  expect(screen.getByRole("link", { name: "Start Focus" })).toBeVisible();
});

it("keeps the focus-time view available while recall results fail and retry", async () => {
  let failed = false;
  http.get.mockImplementation(async url => {
    if (url === "/study/progress") {
      if (!failed) { failed = true; throw new Error("Recall results unavailable"); }
      return { data: practice };
    }
    return { data: time };
  });
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("Recall results unavailable");
  expect(screen.getByRole("link", { name: "Start Focus" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry recall results" }));
  expect(await screen.findByText("9 recall attempts")).toBeVisible();
});

it("explains the self-rating measure and gives an actionable empty practice state", async () => {
  http.get.mockImplementation(async url => ({ data: url === "/study/progress" ? { questions_count: 0, mistakes_count: 0, attempts_count: 0, successful_attempts: 0, due_count: 0, topics: [] } : time }));
  mount();
  expect(await screen.findByText(/Good means you felt able to recall/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Add practice in a notebook" })).toHaveAttribute("href", "/notebooks");
  expect(screen.queryByRole("heading", { name: "Topics to revisit" })).not.toBeInTheDocument();
});
