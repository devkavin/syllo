import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, it, expect, vi } from "vitest";
import Notebooks from "./Notebooks";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), patch: vi.fn() }, formatError: String }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/lib/usage", () => ({ useUsage: () => ({ setRemaining: vi.fn() }) }));
// The real editor is exercised in NotebookEditor.test; isolate page autosave here.
vi.mock("@/components/NotebookEditor", () => ({ default: ({ notebook, onChange }) => <textarea aria-label="Notebook notes" defaultValue={notebook.content || ""} onChange={e => onChange({ content: e.target.value, rich_content: [{ type: "paragraph", content: [{ type: "text", text: e.target.value, styles: {} }] }] })} /> }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); sessionStorage.clear(); });
it("saves title and content together instead of dropping a pending title", async () => {
  const notebook = { notebook_id: "nb", title: "Old", content: "", subject_id: null };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  http.patch.mockImplementation((url, patch) => Promise.resolve({ data: { ...notebook, ...patch } }));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  fireEvent.click(await screen.findByText("Old"));
  const content = await screen.findByRole("textbox", { name: "Notebook notes" });
  fireEvent.change(screen.getByTestId("notebook-title-input"), { target: { value: "Limits" } });
  fireEvent.change(content, { target: { value: "Limit definition" } });
  await waitFor(() => expect(http.patch).toHaveBeenCalledWith("/notebooks/nb", expect.objectContaining({ title: "Limits", content: "Limit definition", rich_content: expect.any(Array) })), { timeout: 2000 });
});
it("gives notebook title and content accessible editor names", async () => {
  const notebook = { notebook_id: "n", title: "Limits", content: "Definition", subject_id: null };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  expect(await screen.findByRole("textbox", { name: "Notebook title" })).toHaveValue("Limits");
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Definition");
});
it("keeps the latest selected notebook when fetches arrive out of order", async () => {
  const a = { notebook_id: "a", title: "Alpha", content: "A" }, b = { notebook_id: "b", title: "Beta", content: "B" }, c = { notebook_id: "c", title: "Gamma", content: "C" };
  let resolveB;
  http.get.mockImplementation(url => url === "/notebooks/b" ? new Promise(resolve => { resolveB = resolve; }) : Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [a, b, c] : url === "/notebooks/c" ? c : a }));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  await screen.findByRole("textbox", { name: "Notebook notes" });
  fireEvent.click(screen.getByTestId("notebook-item-b"));
  await act(async () => {});
  fireEvent.click(screen.getByTestId("notebook-item-c"));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("C"));
  await act(async () => resolveB({ data: b }));
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("C");
});

it("saves paper and font preferences together while preserving notes", async () => {
  const notebook = { notebook_id: "rich", title: "Biology", content: "Cells", paper_style: "ruled", font_style: "serif", rich_content: [{ id: "heading", type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Cells", styles: { textColor: "blue", backgroundColor: "yellow" } }], children: [] }] };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  http.patch.mockImplementation((url, patch) => Promise.resolve({ data: { ...notebook, ...patch } }));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  expect(await screen.findByRole("textbox", { name: "Notebook notes" })).toHaveValue("Cells");
  expect(screen.getByLabelText("Notebook paper")).toHaveValue("ruled");
  expect(screen.getByLabelText("Notebook font")).toHaveValue("serif");
  fireEvent.change(screen.getByLabelText("Notebook paper"), { target: { value: "dotted" } });
  fireEvent.change(screen.getByLabelText("Notebook font"), { target: { value: "mono" } });
  await waitFor(() => expect(http.patch).toHaveBeenCalledWith("/notebooks/rich", expect.objectContaining({ paper_style: "dotted", font_style: "mono" })), { timeout: 2000 });
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Cells");
  expect(screen.getByTestId("notebook-editor")).toHaveAttribute("data-paper-style", "dotted");
});
