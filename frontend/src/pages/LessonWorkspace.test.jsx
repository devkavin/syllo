import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { http } from "@/lib/api";
import LessonWorkspace from "./LessonWorkspace";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() }, formatError: String }));
afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
it("opens private lesson notes with linked work and focus actions", async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/lessons/l" ? { lesson_id: "l", subject_id: "s", unit_id: "u", title: "Limits", notes: "Private notes", status: "learning", total_seconds: 2700 } : url === "/subjects" ? [{ subject_id: "s", name: "Math" }] : url.includes("/units") ? [{ unit_id: "u", name: "Calculus" }] : url === "/tasks" ? [{ task_id: "t", lesson_id: "l", title: "Exercise 4" }] : [] }));
  render(<MemoryRouter initialEntries={["/lessons/l"]}><Routes><Route path="/lessons/:id" element={<LessonWorkspace />} /></Routes></MemoryRouter>);
  expect(await screen.findByDisplayValue("Private notes")).toBeInTheDocument();
  expect(screen.getByText("Exercise 4")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Start studying" })).toHaveAttribute("href", "/timer?lesson=l");
  expect(screen.getByRole("link", { name: "Add task" })).toHaveAttribute("href", "/tasks?lesson=l");
  fireEvent.click(screen.getByRole("button", { name: "Schedule review" }));
  expect(screen.getByRole("button", { name: "30 minutes" })).toBeInTheDocument();
});
it.each(["good", "again"])("completes an owned due review from its lesson (%s)", async quality => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/lessons/l" ? { lesson_id: "l", subject_id: "s", unit_id: "u", title: "Limits", notes: "Read this first", status: "learning", total_seconds: 60 } : url === "/reviews" ? [{ review_id: "r", lesson_id: "l", next_review_at: "2026-01-01T00:00:00Z", state: "due" }] : [] }));
  http.post.mockResolvedValue({ data: { review_id: "r", lesson_id: "l", next_review_at: "2099-01-01T00:00:00Z", state: "upcoming" } });
  render(<MemoryRouter initialEntries={["/lessons/l"]}><Routes><Route path="/lessons/:id" element={<LessonWorkspace />} /></Routes></MemoryRouter>);
  await screen.findByDisplayValue("Read this first");
  fireEvent.click(screen.getByRole("button", { name: quality === "good" ? "Good · understood" : "Again · revisit tomorrow" }));
  await waitFor(() => expect(http.post).toHaveBeenCalledWith("/reviews/r/mark", { quality }));
  expect(await screen.findByText("Review complete. Your next review is scheduled.")).toBeInTheDocument();
});
