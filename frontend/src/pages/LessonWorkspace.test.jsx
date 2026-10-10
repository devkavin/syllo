import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { http } from "@/lib/api";
import LessonWorkspace from "./LessonWorkspace";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() }, formatError: String }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { user_id: "student" } }) }));
afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); });
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

it("opens the canonical rich notebook and keeps literal legacy notes read-only", async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/lessons/l" ? { lesson_id: "l", subject_id: "s", unit_id: "u", title: "Limits", notes: "<p>Literal legacy</p>", status: "learning", total_seconds: 60 } : url === "/lessons/l/notebook" ? { notebook_id: "canonical", lesson_id: "l", title: "Limits", content: "<p>Literal legacy</p>", revision: 1 } : [] }));
  http.patch.mockImplementation((url, patch) => Promise.resolve({ data: { status: patch.status } }));
  render(<MemoryRouter initialEntries={["/lessons/l"]}><Routes><Route path="/lessons/:id" element={<LessonWorkspace />} /></Routes></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Open lesson notebook" })).toHaveAttribute("href", "/notebooks?notebook=canonical");
  expect(screen.getByDisplayValue("<p>Literal legacy</p>")).toHaveAttribute("readonly");
  fireEvent.change(screen.getByLabelText("Lesson status"), { target: { value: "done" } });
  await waitFor(() => expect(http.patch).toHaveBeenCalledWith("/lessons/l", { status: "done" }), { timeout: 2000 });
});

it("keeps lesson tools available and offers Trash when the canonical notebook is deleted", async () => {
  http.get.mockImplementation(url => url === "/lessons/l/notebook" ? Promise.reject({ response: { status: 409, data: { detail: { message: "Restore the linked notebook from Trash", notebook_id: "deleted" } } } }) : Promise.resolve({ data: url === "/lessons/l" ? { lesson_id: "l", subject_id: "s", unit_id: "u", title: "Limits", notes: "Preserve this", status: "learning", total_seconds: 60 } : [] }));
  render(<MemoryRouter initialEntries={["/lessons/l"]}><Routes><Route path="/lessons/:id" element={<LessonWorkspace />} /></Routes></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Open notebook Trash" })).toHaveAttribute("href", "/notebooks?trash=1");
  expect(screen.getByDisplayValue("Preserve this")).toHaveAttribute("readonly");
  expect(screen.getByLabelText("Lesson status")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Open lesson notebook" })).not.toBeInTheDocument();
});

it("keeps a pre-upgrade lesson draft across sessions and recovers it without overwriting canonical notes", async () => {
  sessionStorage.setItem("syllo.draft.lesson.l", JSON.stringify({ notes: "<b>Unsaved literal notes</b>", status: "done" }));
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/lessons/l" ? { lesson_id: "l", subject_id: "s", unit_id: "u", title: "Limits", notes: "Original legacy", status: "learning", total_seconds: 60 } : url === "/lessons/l/notebook" ? { notebook_id: "canonical", lesson_id: "l", title: "Limits", content: "Rich canonical notes", revision: 4 } : [] }));
  http.post.mockResolvedValue({ data: { notebook_id: "recovered", title: "Limits (recovered copy)", content: "<b>Unsaved literal notes</b>", revision: 1 } });
  const page = <MemoryRouter initialEntries={["/lessons/l"]}><Routes><Route path="/lessons/:id" element={<LessonWorkspace />} /></Routes></MemoryRouter>;
  const first = render(page);
  expect(await screen.findByDisplayValue("<b>Unsaved literal notes</b>")).toHaveAttribute("readonly");
  expect(screen.getByLabelText("Lesson status")).toHaveValue("done");
  first.unmount(); sessionStorage.clear();
  render(page);
  await screen.findByDisplayValue("<b>Unsaved literal notes</b>");
  expect(screen.getByRole("link", { name: "Open lesson notebook" })).toHaveAttribute("href", "/notebooks?notebook=canonical");
  fireEvent.click(screen.getByRole("button", { name: "Save recovered notebook" }));
  await waitFor(() => expect(http.post).toHaveBeenCalledWith("/notebooks", expect.objectContaining({ content: "<b>Unsaved literal notes</b>", rich_content: null, lesson_id: "l", subject_id: "s" })));
  expect(await screen.findByRole("link", { name: "Open recovered notebook" })).toHaveAttribute("href", "/notebooks?notebook=recovered");
  expect(http.patch).not.toHaveBeenCalled();
});
