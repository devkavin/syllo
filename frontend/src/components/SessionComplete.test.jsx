import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import SessionComplete from "./SessionComplete";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { patch: vi.fn().mockResolvedValue({ data: {} }) }, formatError: String }));
it("saves the private note before finishing", async () => {
  const finish = vi.fn(); render(<MemoryRouter><SessionComplete session={{ session_id: "s", duration_seconds: 2700 }} onFinish={finish} /></MemoryRouter>);
  fireEvent.click(screen.getByText("Add a private note"));
  fireEvent.change(screen.getByLabelText("Private session note"), { target: { value: "I understand limits" } });
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  await waitFor(() => expect(http.patch).toHaveBeenCalledWith("/sessions/s", { note: "I understand limits" }));
  expect(finish).toHaveBeenCalledOnce();
});
it("keeps optional controls tucked away and saves the note before continuing to lesson practice", async () => {
  http.patch.mockClear();
  render(<MemoryRouter><Routes><Route path="/" element={<SessionComplete session={{ session_id: "s", lesson_id: "l", duration_seconds: 1800 }} onFinish={vi.fn()} />} /><Route path="/reviews" element={<p>Lesson practice</p>} /></Routes></MemoryRouter>);
  expect(screen.getByText("Add a private note").closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText("Schedule a review").closest("details")).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Add a private note"));
  fireEvent.change(screen.getByLabelText("Private session note"), { target: { value: "Keep this note" } });
  fireEvent.click(screen.getByRole("button", { name: "Review what I learned" }));
  expect(await screen.findByText("Lesson practice")).toBeInTheDocument();
  expect(http.patch).toHaveBeenCalledWith("/sessions/s", { note: "Keep this note" });
});
