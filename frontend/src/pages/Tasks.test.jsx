import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import Tasks from "./Tasks";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), patch: vi.fn() }, formatError: String }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
it("opens the exact task linked from Today", async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/tasks" ? [{ task_id: "t", title: "Worksheet", priority: "normal" }] : [] }));
  render(<MemoryRouter initialEntries={["/tasks?task=t"]}><Tasks /></MemoryRouter>);
  expect(await screen.findByDisplayValue("Worksheet")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save task" })).toBeInTheDocument();
});

it("opens a labelled task dialog and returns keyboard focus when dismissed", async () => {
  http.get.mockResolvedValue({ data: [] });
  render(<MemoryRouter><Tasks /></MemoryRouter>);
  const trigger = screen.getByRole("button", { name: "New task" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(await screen.findByRole("dialog", { name: "New task" })).toBeVisible();
  expect(screen.getByLabelText("Title")).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});
