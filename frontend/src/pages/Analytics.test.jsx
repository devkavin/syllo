import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import Analytics from "./Analytics";
import { http } from "@/lib/api";

vi.mock("@/lib/api", () => ({ http: { get: vi.fn() }, formatError: e => e.message }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/lib/usage", () => ({ useUsage: () => ({ setRemaining: vi.fn() }) }));
const time = { total_seconds: 1500, daily: [{ day: "2026-10-10", seconds: 1500 }], by_subject: [{ subject_id: "physics", name: "Physics", color: "sage", seconds: 1500 }], heatmap: [{ day: "2026-10-10", seconds: 1500 }], streak: { current: 1, longest: 1 } };
const practice = { questions_count: 1, mistakes_count: 0, attempts_count: 2, successful_attempts: 1, due_count: 0, topics: [] };
beforeEach(() => vi.resetAllMocks());

it("keeps self-rated recall results visible after study-time loading fails and retries time separately", async () => {
  let failed = false;
  http.get.mockImplementation(async url => {
    if (url === "/study/progress") return { data: practice };
    if (!failed) { failed = true; throw new Error("Study time unavailable"); }
    return { data: time };
  });
  render(<MemoryRouter><Analytics /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Study time unavailable");
  expect(await screen.findByText("2 recall attempts")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry study time" }));
  expect(await screen.findByText("Total study time")).toBeVisible();
  expect(screen.getByTestId("daily-bars")).toBeVisible();
});

it("distinguishes recall attempts from elapsed study time when both exist", async () => {
  http.get.mockImplementation(async url => ({ data: url === "/study/progress" ? practice : time }));
  render(<MemoryRouter><Analytics /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "Self-rated recall results" })).toBeVisible();
  expect(screen.getByText("Total study time")).toBeVisible();
  expect(screen.getByText("2 recall attempts")).toBeVisible();
  expect(screen.getByText("1 rated Good")).toBeVisible();
  expect(http.get).not.toHaveBeenCalledWith("/ai/reflection");
});
