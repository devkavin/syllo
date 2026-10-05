import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import Today from "./Today";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn() }, formatError: String }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { name: "Student", timezone: "Asia/Colombo" } }) }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/lib/usage", () => ({ useUsage: () => ({ usage: null, setRemaining: vi.fn() }) }));
it("makes focus and due work visible without analytics cards", async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/today" ? { today: "2026-10-05", agenda: [], tasks: [{ task_id: "t", title: "Physics worksheet", due_date: "2026-10-05" }], reviews_due: [] } : [] }));
  render(<MemoryRouter><Today /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Start Focus" })).toHaveAttribute("href", "/timer");
  expect(screen.getAllByRole("link", { name: "Physics worksheet" })[0]).toHaveAttribute("href", "/tasks?task=t");
  expect(screen.queryByTestId("streak-calendar")).not.toBeInTheDocument();
  expect(http.get).not.toHaveBeenCalledWith("/analytics");
});
