import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, it, expect, vi } from "vitest";
import Notebooks from "./Notebooks";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() }, formatError: String }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { user_id: "student" } }) }));
vi.mock("@/components/NotebookFocus", () => ({ default: () => null }));
vi.mock("@/components/NotebookPractice", () => ({ default: () => null }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/lib/usage", () => ({ useUsage: () => ({ setRemaining: vi.fn() }) }));
// The real editor is exercised in NotebookEditor.test; isolate page autosave here.
vi.mock("@/components/NotebookEditor", () => ({ default: ({ notebook, onChange }) => <textarea aria-label="Notebook notes" defaultValue={notebook.content || ""} onChange={e => onChange({ content: e.target.value, rich_content: [{ type: "paragraph", content: [{ type: "text", text: e.target.value, styles: {} }] }] })} /> }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); });
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
  fireEvent.click(screen.getByText("Page settings"));
  expect(screen.getByLabelText("Notebook paper")).toHaveValue("ruled");
  expect(screen.getByLabelText("Notebook font")).toHaveValue("serif");
  fireEvent.change(screen.getByLabelText("Notebook paper"), { target: { value: "dotted" } });
  fireEvent.change(screen.getByLabelText("Notebook font"), { target: { value: "mono" } });
  await waitFor(() => expect(http.patch).toHaveBeenCalledWith("/notebooks/rich", expect.objectContaining({ paper_style: "dotted", font_style: "mono" })), { timeout: 2000 });
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Cells");
  expect(screen.getByTestId("notebook-editor")).toHaveAttribute("data-paper-style", "dotted");
});

it("keeps conflicted rich notes until choosing to save a recovered copy", async () => {
  const notebook = { notebook_id: "conflicted", title: "Biology", content: "Cells", revision: 2 };
  const current = { ...notebook, content: "Server notes", revision: 3 };
  const recovered = { ...notebook, notebook_id: "copy", title: "Biology (recovered copy)", content: "My notes", revision: 1 };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : url === "/notebooks/copy" ? recovered : notebook }));
  http.patch.mockRejectedValue({ response: { status: 409, data: { detail: { current } } } });
  http.post.mockResolvedValue({ data: recovered });
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Notebook notes" }), { target: { value: "My notes" } });
  expect(await screen.findByRole("button", { name: "Save recovered copy" }, { timeout: 2000 })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("My notes");
  expect(http.patch).toHaveBeenCalledWith("/notebooks/conflicted", expect.objectContaining({ expected_revision: 2 }));
  fireEvent.click(screen.getByRole("button", { name: "Save recovered copy" }));
  await waitFor(() => expect(http.post).toHaveBeenCalledWith("/notebooks", expect.objectContaining({ title: "Biology (recovered copy)", content: "My notes", rich_content: expect.any(Array) })));
  expect(await screen.findByDisplayValue("Biology (recovered copy)")).toBeInTheDocument();
  expect(http.patch).toHaveBeenCalledTimes(1);
});

it("replaces the editor only after explicitly loading the server version", async () => {
  const notebook = { notebook_id: "load-server", title: "Limits", content: "Old", revision: 1 };
  const current = { ...notebook, content: "Another device", revision: 2 };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  http.patch.mockRejectedValue({ response: { status: 409, data: { detail: { current } } } });
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Notebook notes" }), { target: { value: "My draft" } });
  fireEvent.click(await screen.findByRole("button", { name: "Load server version" }, { timeout: 2000 }));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Another device"));
  expect(http.post).not.toHaveBeenCalled();
});

it("restores a previous rich version with the current revision", async () => {
  const notebook = { notebook_id: "history", title: "Limits", content: "Current", revision: 4 };
  const version = { version_id: "v2", revision: 2, title: "Limits", content: "Earlier", created_at: "2026-10-09T12:00:00Z", rich_content: [{ type: "heading", content: "Earlier" }] };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : url.endsWith("/history") ? [version] : notebook }));
  http.post.mockResolvedValue({ data: { ...notebook, content: "Earlier", rich_content: version.rich_content, revision: 5 } });
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  await screen.findByRole("textbox", { name: "Notebook notes" });
  fireEvent.click(screen.getByText("Notebook options"));
  fireEvent.click(screen.getByRole("button", { name: "Version history" }));
  fireEvent.click(await screen.findByRole("button", { name: "Restore version 2" }));
  await waitFor(() => expect(http.post).toHaveBeenCalledWith("/notebooks/history/history/v2/restore", { expected_revision: 4 }));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Earlier"));
});

it("restores a trashed notebook with revision protection", async () => {
  const notebook = { notebook_id: "trash", title: "Deleted notes", content: "Keep this", revision: 6 };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/notebooks?trash=true" ? [notebook] : url === "/notebooks/trash" ? notebook : [] }));
  http.post.mockResolvedValue({ data: { ...notebook, revision: 7 } });
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  fireEvent.click(screen.getByText("Trash"));
  fireEvent.click(await screen.findByRole("button", { name: "Restore Deleted notes" }));
  await waitFor(() => expect(http.post).toHaveBeenCalledWith("/notebooks/trash/restore", { expected_revision: 6 }));
  expect(await screen.findByRole("textbox", { name: "Notebook notes" })).toHaveValue("Keep this");
});

it("follows a changed notebook link while the page is mounted", async () => {
  const a = { notebook_id: "a", title: "Alpha", content: "A", revision: 1 }, b = { notebook_id: "b", title: "Beta", content: "B", revision: 1 };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [a, b] : url === "/notebooks/b" ? b : a }));
  function Page() { const navigate = useNavigate(); return <><button onClick={() => navigate("/notebooks?notebook=b")}>Open linked notebook</button><Notebooks /></>; }
  render(<MemoryRouter initialEntries={["/notebooks?notebook=a"]}><Page /></MemoryRouter>);
  expect(await screen.findByRole("textbox", { name: "Notebook notes" })).toHaveValue("A");
  fireEvent.click(screen.getByRole("button", { name: "Open linked notebook" }));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("B"));
});

it("does not trash a notebook when its current draft fails to save", async () => {
  const notebook = { notebook_id: "offline-delete", title: "Safe notes", content: "Saved", revision: 1 };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  http.patch.mockRejectedValue(new Error("offline"));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Notebook notes" }), { target: { value: "Unsaved notes" } });
  fireEvent.click(screen.getByText("Notebook options"));
  fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Save or recover your draft");
  expect(http.delete).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Unsaved notes");
});

it("exports the full rich draft including unsaved changes", async () => {
  const notebook = { notebook_id: "export", title: "Rich notes", content: "Heading", revision: 3, paper_style: "dotted", font_style: "serif", rich_content: [{ type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Heading", styles: { bold: true } }], children: [] }] };
  let blob, download;
  URL.createObjectURL = vi.fn(value => { blob = value; return "blob:notebook"; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { download = this.download; });
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Notebook title" }), { target: { value: "Unsaved title" } });
  fireEvent.click(screen.getByText("Notebook options"));
  fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
  const exported = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(JSON.parse(reader.result)); reader.readAsText(blob); });
  expect(download).toBe("Unsaved title.json");
  expect(exported).toMatchObject({ title: "Unsaved title", paper_style: "dotted", font_style: "serif", rich_content: notebook.rich_content });
});

it("restores history using the revision produced by flushing pending notes", async () => {
  const notebook = { notebook_id: "history-flush", title: "Limits", content: "Original", revision: 4 };
  const version = { version_id: "v1", revision: 1, title: "Limits", content: "Earlier", created_at: "2026-10-09T12:00:00Z" };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : url.endsWith("/history") ? [version] : notebook }));
  http.patch.mockImplementation((url, patch) => Promise.resolve({ data: { ...notebook, ...patch, revision: 5 } }));
  http.post.mockResolvedValue({ data: { ...notebook, content: "Earlier", revision: 6 } });
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Notebook notes" }), { target: { value: "Pending notes" } });
  fireEvent.click(screen.getByText("Notebook options"));
  fireEvent.click(screen.getByRole("button", { name: "Version history" }));
  fireEvent.click(await screen.findByRole("button", { name: "Restore version 1" }));
  await waitFor(() => expect(http.post).toHaveBeenCalledWith("/notebooks/history-flush/history/v1/restore", { expected_revision: 5 }));
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Earlier");
});

it("refreshes the deleted revision before offering an immediate Trash restore", async () => {
  const notebook = { notebook_id: "delete-restore", title: "Keep notes", content: "Original", revision: 3 };
  let deleted = false;
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : url === "/notebooks?trash=true" ? deleted ? [{ ...notebook, content: "Latest notes", revision: 5 }] : [] : notebook }));
  http.patch.mockImplementation((url, patch) => Promise.resolve({ data: { ...notebook, ...patch, revision: 4 } }));
  http.delete.mockImplementation(() => { deleted = true; return Promise.resolve({ data: { ok: true } }); });
  http.post.mockResolvedValue({ data: { ...notebook, content: "Latest notes", revision: 6 } });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Notebook notes" }), { target: { value: "Latest notes" } });
  fireEvent.click(screen.getByText("Trash"));
  await screen.findByText("Trash is empty.");
  fireEvent.click(screen.getByText("Notebook options"));
  fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
  fireEvent.click(await screen.findByRole("button", { name: "Restore Keep notes" }));
  await waitFor(() => expect(http.post).toHaveBeenCalledWith("/notebooks/delete-restore/restore", { expected_revision: 5 }));
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Latest notes");
});
