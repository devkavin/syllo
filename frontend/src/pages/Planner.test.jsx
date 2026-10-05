import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import Planner from "./Planner";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn() }, formatError: String }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { timezone: "Asia/Colombo" } }) }));
it("shows a dated agenda and links the actual activity", async () => {
  http.get.mockResolvedValue({ data: { items: [{ id: "exam", kind: "exam", title: "Physics exam", starts_at: "2026-10-05T03:30:00Z", ends_at: "2026-10-05T04:30:00Z", href: "/timetable?edit=exam" }], warnings: [] } });
  render(<MemoryRouter><Planner /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: /Physics exam/ })).toHaveAttribute("href", "/timetable?edit=exam");
  expect(screen.getByRole("button", { name: "Week" })).toBeInTheDocument();
});

it("provides labelled date navigation with the current view preserved", async () => {
  http.get.mockResolvedValue({ data: { items: [], warnings: [] } });
  render(<MemoryRouter><Planner /></MemoryRouter>);
  const date = screen.getByLabelText("Starting date");
  fireEvent.change(date, { target: { value: "2026-10-05" } });
  fireEvent.click(screen.getByRole("button", { name: "Week" }));
  fireEvent.click(screen.getByRole("button", { name: "Next week" }));
  await waitFor(() => expect(date).toHaveValue("2026-10-12"));
  fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
  expect(date).toHaveValue("2026-10-05");
  expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("link", { name: "Add activity" })).toHaveAttribute("href", "/timetable?new=1");
});
