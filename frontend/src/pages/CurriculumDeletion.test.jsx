import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import SubjectDetail from "./SubjectDetail";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() }, formatError: e => e.message }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/lib/usage", () => ({ useUsage: () => ({ setRemaining: vi.fn() }) }));
const subject = { subject_id: "math", name: "Math", color: "sage" };
const unit = { unit_id: "calculus", name: "Calculus" };
const lesson = { lesson_id: "limits", unit_id: "calculus", title: "Limits", status: "not_started" };
beforeEach(() => {
  vi.clearAllMocks();
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [subject] : url.includes("/lessons") ? [lesson] : [unit] }));
  http.delete.mockResolvedValue({ data: { ok: true } });
});
function mount() { render(<MemoryRouter initialEntries={["/subjects/math"]}><Routes><Route path="/subjects/:id" element={<SubjectDetail />} /><Route path="/subjects" element={<h1>Subject shelf</h1>} /></Routes></MemoryRouter>); }
it("requires explicit confirmation before deleting a unit and its lessons", async () => {
  mount(); fireEvent.click(await screen.findByRole("button", { name: "Delete unit Calculus" }));
  expect(http.delete).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toHaveTextContent(/1 lesson/i);
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(http.delete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete unit Calculus" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
  await waitFor(() => expect(http.delete).toHaveBeenCalledWith("/units/calculus"));
  await waitFor(() => expect(screen.queryByTestId("unit-calculus")).not.toBeInTheDocument());
});
it("keeps a lesson and a retryable error when deletion fails", async () => {
  http.delete.mockRejectedValue(new Error("Could not delete")); mount();
  fireEvent.click(await screen.findByRole("button", { name: "Delete lesson Limits" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete");
  expect(screen.getByTestId("lesson-limits")).toBeInTheDocument();
  http.delete.mockResolvedValue({ data: {} });
  fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
  await waitFor(() => expect(screen.queryByTestId("lesson-limits")).not.toBeInTheDocument());
});
it("confirms subject deletion and returns to the subject shelf", async () => {
  mount(); fireEvent.click(await screen.findByRole("button", { name: "Delete subject Math" }));
  expect(screen.getByRole("dialog")).toHaveTextContent(/units and lessons/i);
  fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
  expect(await screen.findByRole("heading", { name: "Subject shelf" })).toBeVisible();
  expect(http.delete).toHaveBeenCalledWith("/subjects/math");
});
