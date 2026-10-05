import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import Analytics from "./Analytics";
import SubjectDetail from "./SubjectDetail";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, formatError: String }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/lib/usage", () => ({ useUsage: () => ({ setRemaining: vi.fn() }) }));
afterEach(() => vi.clearAllMocks());

it("shows a useful next action instead of empty charts before any study", async () => {
  http.get.mockResolvedValue({ data: { total_seconds: 0, daily: [], by_subject: [], heatmap: [], streak: { current: 0, longest: 0 } } });
  render(<MemoryRouter><Analytics /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Start Focus" })).toHaveAttribute("href", "/timer");
  expect(screen.queryByTestId("daily-bars")).not.toBeInTheDocument();
});

it("creates a unit through the app dialog rather than a browser prompt", async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [{ subject_id: "math", name: "Mathematics", color: "sage" }] : [] }));
  http.post.mockResolvedValue({ data: {} });
  render(<MemoryRouter initialEntries={["/subjects/math"]}><Routes><Route path="/subjects/:id" element={<SubjectDetail />} /></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "New unit" }));
  expect(screen.getByRole("dialog", { name: "New unit" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("Unit name"), { target: { value: "Calculus" } });
  fireEvent.click(screen.getByRole("button", { name: "Add unit" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(http.post).toHaveBeenCalledWith("/units", { subject_id: "math", name: "Calculus", order: 0 });
});

it("offers weekly reflection in Progress only after the student explicitly asks for it", async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/analytics" ? { total_seconds: 1500, daily: [], by_subject: [], heatmap: [], streak: { current: 1, longest: 1 } } : { text: "You studied for 25 minutes. Try a short review tomorrow.", credits_remaining: 9 } }));
  render(<MemoryRouter><Analytics /></MemoryRouter>);
  const action = await screen.findByRole("button", { name: "Reflect on my week" });
  expect(http.get).not.toHaveBeenCalledWith("/ai/reflection");
  fireEvent.click(action);
  expect(await screen.findByText(/You studied for 25 minutes/)).toBeVisible();
  expect(http.get).toHaveBeenCalledWith("/ai/reflection");
});
