import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
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

it("keeps secondary filters collapsed while preserving the selected task view", async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/tasks" ? [
    { task_id: "open", title: "Worksheet", priority: "normal", completed: false },
    { task_id: "done", title: "Read notes", priority: "normal", completed: true },
  ] : [] }));
  render(<MemoryRouter><Tasks /></MemoryRouter>);
  expect(await screen.findByRole("button", { name: "Worksheet" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Done", exact: true })).not.toBeVisible();
  fireEvent.click(screen.getByText(/Task filters/));
  fireEvent.click(screen.getByRole("button", { name: "Done", exact: true }));
  expect(screen.getByRole("button", { name: "Read notes" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Worksheet" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText(/Task filters/));
  expect(screen.getByRole("button", { name: "Read notes" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Done", exact: true })).not.toBeVisible();
});

it("opens quick-command task creation once per navigation", async () => {
  http.get.mockResolvedValue({ data: [] });
  render(<MemoryRouter initialEntries={["/tasks?new=1"]}><Link to="/tasks?new=1">Quick new task</Link><Tasks /></MemoryRouter>);
  expect(await screen.findByRole("dialog", { name: "New task" })).toBeVisible();
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("link", { name: "Quick new task" }));
  expect(await screen.findByRole("dialog", { name: "New task" })).toBeVisible();
});
