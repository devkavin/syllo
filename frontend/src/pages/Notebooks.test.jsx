import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, it, expect, vi } from "vitest";
import Notebooks from "./Notebooks";
import AppShell from "@/components/AppShell";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() }, formatError: String }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { user_id: "student" } }) }));
vi.mock("@/components/NotebookFocus", () => ({ default: () => null }));
vi.mock("@/components/ActiveFocusBar", () => ({ default: () => <div aria-label="Active focus session">Focus in progress</div> }));
vi.mock("@/components/NotebookPractice", () => ({ default: () => null }));
vi.mock("@/components/ReminderCentre", () => ({ default: () => null }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/lib/usage", () => ({ useUsage: () => ({ setRemaining: vi.fn() }) }));
// The real editor is exercised in NotebookEditor.test; isolate page autosave here.
vi.mock("@/components/NotebookEditor", () => ({ default: ({ notebook, onChange }) => <textarea aria-label="Notebook notes" defaultValue={notebook.content || ""} onChange={e => onChange({ content: e.target.value, rich_content: [{ type: "paragraph", content: [{ type: "text", text: e.target.value, styles: {} }] }] })} /> }));
async function openNotebookList() {
  fireEvent.click(screen.getByRole("button", { name: "Notebooks", exact: true }));
  await screen.findByRole("dialog", { name: "Notebooks", exact: true });
}
async function chooseNotebook(id) {
  await openNotebookList();
  fireEvent.click(await screen.findByTestId(`notebook-item-${id}`));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notebooks", exact: true })).not.toBeInTheDocument());
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); });

it("expands the notebook without replacing the editor, draft or selection, and exits with Escape", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const notebook = { notebook_id: "wide", title: "Wide notes", content: "Original", revision: 2 };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  render(<MemoryRouter initialEntries={["/notebooks"]}><AppShell><Notebooks /></AppShell></MemoryRouter>);
  const editor = await screen.findByRole("textbox", { name: "Notebook notes" });
  fireEvent.change(editor, { target: { value: "My pending draft" } });
  editor.focus(); editor.setSelectionRange(3, 10);
  fireEvent.click(screen.getByRole("button", { name: "Expand notebook" }));
  expect(screen.getByTestId("notebooks-page")).toHaveAttribute("data-expanded", "true");
  expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument();
  expect(screen.queryByTestId("desktop-sidebar")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toBe(editor);
  expect(editor).toHaveValue("My pending draft");
  expect(editor.selectionStart).toBe(3); expect(editor.selectionEnd).toBe(10);
  fireEvent.keyDown(editor, { key: "Escape" });
  expect(screen.getByTestId("notebooks-page")).toHaveAttribute("data-expanded", "false");
  expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toBe(editor);
});

it("opens the notebook list only when requested and closes the drawer before leaving expanded view", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const notebook = { notebook_id: "drawer", title: "My notebook", content: "Notes", revision: 1 };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  const editor = await screen.findByRole("textbox", { name: "Notebook notes" });
  fireEvent.click(screen.getByRole("button", { name: "Expand notebook" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Notebooks", exact: true }));
  expect(await screen.findByRole("dialog", { name: "Notebooks", exact: true })).toBeVisible();
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Exit expanded view" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toBe(editor);
});
it("saves title and content together instead of dropping a pending title", async () => {
  const notebook = { notebook_id: "nb", title: "Old", content: "", subject_id: null };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  http.patch.mockImplementation((url, patch) => Promise.resolve({ data: { ...notebook, ...patch } }));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  await screen.findByRole("textbox", { name: "Notebook notes" });
  const content = await screen.findByRole("textbox", { name: "Notebook notes" });
  fireEvent.change(screen.getByTestId("notebook-title-input"), { target: { value: "Limits" } });
  fireEvent.change(content, { target: { value: "Limit definition" } });
  await waitFor(() => expect(http.patch).toHaveBeenCalledWith("/notebooks/nb", expect.objectContaining({ title: "Limits", content: "Limit definition", rich_content: expect.any(Array) })), { timeout: 2000 });
});

it("keeps a requested Trash drawer open while automatically selecting the first notebook", async () => {
  const notebook = { notebook_id: "trash-route", title: "Active notebook", content: "Notes", revision: 1 };
  const trashed = { notebook_id: "trashed-route", title: "Discarded notes", revision: 2 };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : url === "/notebooks?trash=true" ? [trashed] : notebook }));
  render(<MemoryRouter initialEntries={["/notebooks?trash=1"]}><Notebooks /></MemoryRouter>);
  expect(await screen.findByRole("button", { name: "Restore Discarded notes" })).toBeVisible();
  await waitFor(() => expect(screen.getByTestId("notebook-title-input")).toHaveValue("Active notebook"));
  expect(screen.getByRole("dialog", { name: "Notebooks", exact: true })).toBeVisible();
});

it("opens Trash on query-only navigation without replacing the current editor", async () => {
  const notebook = { notebook_id: "trash-query", title: "Active notebook", content: "Notes", revision: 1 };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" || url === "/notebooks?trash=true" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  function Page() { const navigate = useNavigate(); return <><button onClick={() => navigate("/notebooks?notebook=trash-query&trash=1")}>Open notebook Trash</button><Notebooks /></>; }
  render(<MemoryRouter initialEntries={["/notebooks?notebook=trash-query"]}><Page /></MemoryRouter>);
  const editor = await screen.findByRole("textbox", { name: "Notebook notes" });
  fireEvent.click(screen.getByRole("button", { name: "Open notebook Trash" }));
  expect(await screen.findByRole("dialog", { name: "Notebooks", exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Close notebooks" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toBe(editor);
});

it("keeps the same editor, draft and selection when switching Write and Practice modes", async () => {
  const notebook = { notebook_id: "modes", title: "Chemistry", content: "Original", revision: 2 };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  const editor = await screen.findByRole("textbox", { name: "Notebook notes" });
  fireEvent.change(editor, { target: { value: "Unsaved recall text" } });
  editor.setSelectionRange(2, 8);
  fireEvent.click(screen.getByRole("button", { name: "Practice" }));
  expect(screen.queryByRole("textbox", { name: "Notebook notes" })).not.toBeInTheDocument();
  expect(editor).toHaveValue("Unsaved recall text");
  fireEvent.click(screen.getByRole("button", { name: "Write" }));
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toBe(editor);
  expect(editor.selectionStart).toBe(2);
  expect(editor.selectionEnd).toBe(8);
  expect(editor).toHaveValue("Unsaved recall text");
});

it("keeps offline pending sync visible outside collapsed notebook options", async () => {
  const notebook = { notebook_id: "offline-status", title: "Chemistry", content: "Original", revision: 2 };
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  http.patch.mockRejectedValue(new Error("Offline"));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Notebook notes" }), { target: { value: "Device draft" } });
  await waitFor(() => expect(screen.getByTestId("notebook-autosave-indicator")).toHaveTextContent("Saved on device · pending sync"), { timeout: 2000 });
  expect(screen.getByTestId("notebook-autosave-indicator")).toBeVisible();
  expect(JSON.parse(localStorage.getItem("syllo.draft.account.student.notebook.offline-status"))).toMatchObject({ baseRevision: 2, patch: { content: "Device draft" } });
});

it("switches cached notebooks offline while restoring the durable account draft and base revision", async () => {
  const a = { notebook_id: "cached-a", title: "Alpha", content: "Saved A", revision: 3 };
  const b = { notebook_id: "cached-b", title: "Beta", content: "Saved B", revision: 5 };
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [a, b] : url === "/notebooks/cached-b" ? b : a }));
  http.patch.mockRejectedValue(new Error("Offline"));
  const page = <MemoryRouter><Notebooks /></MemoryRouter>;
  const view = render(page);
  fireEvent.change(await screen.findByRole("textbox", { name: "Notebook notes" }), { target: { value: "Pending A notes" } });
  await chooseNotebook("cached-b");
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Saved B"));
  await chooseNotebook("cached-a");
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Pending A notes"));
  expect(screen.getByTestId("notebook-autosave-indicator")).toHaveTextContent("Saved on device · pending sync");
  expect(http.patch).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("syllo.draft.account.student.notebook.cached-a"))).toMatchObject({ baseRevision: 3, patch: { content: "Pending A notes" } });
  view.unmount();
  render(page);
  expect(await screen.findByRole("textbox", { name: "Notebook notes" })).toHaveValue("Pending A notes");
  expect(screen.getByTestId("notebook-autosave-indicator")).toHaveTextContent("Saved on device · pending sync");
});

it("keeps the current offline draft if another tab overwrites it while the next note loads", async () => {
  const a = { notebook_id: "delayed-a", title: "Alpha", content: "Saved A", revision: 3 };
  const b = { notebook_id: "delayed-b", title: "Beta", content: "Saved B", revision: 5 };
  let resolveB;
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  http.get.mockImplementation(url => url === "/notebooks/delayed-b" ? new Promise(resolve => { resolveB = resolve; }) : Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [a, b] : a }));
  http.patch.mockRejectedValue(new Error("Offline"));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Notebook notes" }), { target: { value: "My pending notes" } });
  await chooseNotebook("delayed-b");
  await waitFor(() => expect(resolveB).toBeTypeOf("function"));
  const otherDraft = JSON.stringify({ baseRevision: 3, patch: { content: "Other tab notes" } });
  localStorage.setItem("syllo.draft.account.student.notebook.delayed-a", otherDraft);
  await act(async () => resolveB({ data: b }));
  expect(await screen.findByText("Save or retry your current draft before switching notebooks.")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("My pending notes");
  expect(localStorage.getItem("syllo.draft.account.student.notebook.delayed-a")).toBe(otherDraft);
});

it("keeps the active focus controls available when there are no notebooks", async () => {
  http.get.mockResolvedValue({ data: [] });
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  expect(await screen.findByText("Start with a blank page.")).toBeVisible();
  expect(screen.getByLabelText("Active focus session")).toBeVisible();
});

it("blocks offline switching when the pending draft could not be saved on the device", async () => {
  const a = { notebook_id: "storage-a", title: "Alpha", content: "Saved A", revision: 3 };
  const b = { notebook_id: "storage-b", title: "Beta", content: "Saved B", revision: 5 };
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage full"); });
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [a, b] : url === "/notebooks/storage-b" ? b : a }));
  http.patch.mockRejectedValue(new Error("Offline"));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Notebook notes" }), { target: { value: "Keep my unpersisted notes" } });
  await chooseNotebook("storage-b");
  expect(await screen.findByText("Save or retry your current draft before switching notebooks.")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Keep my unpersisted notes");
  expect(screen.getByTestId("notebook-autosave-indicator")).toHaveTextContent("Not saved · Retry");
  expect(http.get).not.toHaveBeenCalledWith("/notebooks/storage-b");
});

it("requires a confirmed server save before online switching even with a durable draft", async () => {
  const a = { notebook_id: "online-a", title: "Alpha", content: "Saved A", revision: 3 };
  const b = { notebook_id: "online-b", title: "Beta", content: "Saved B", revision: 5 };
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [a, b] : url === "/notebooks/online-b" ? b : a }));
  http.patch.mockRejectedValue(new Error("Server unavailable"));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Notebook notes" }), { target: { value: "Awaiting server confirmation" } });
  await chooseNotebook("online-b");
  expect(await screen.findByText("Save or retry your current draft before switching notebooks.")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Awaiting server confirmation");
  expect(http.get).not.toHaveBeenCalledWith("/notebooks/online-b");
  expect(http.patch).toHaveBeenCalledWith("/notebooks/online-a", expect.objectContaining({ expected_revision: 3, content: "Awaiting server confirmation" }));
});

it("requires recovery before offline switching away from a conflicting durable draft", async () => {
  const a = { notebook_id: "conflict-a", title: "Alpha", content: "Saved A", revision: 3 };
  const b = { notebook_id: "conflict-b", title: "Beta", content: "Saved B", revision: 5 };
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  localStorage.setItem("syllo.draft.account.student.notebook.conflict-a", JSON.stringify({ baseRevision: 2, patch: { content: "Conflicting notes" } }));
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [a, b] : url === "/notebooks/conflict-b" ? b : a }));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  expect(await screen.findByRole("textbox", { name: "Notebook notes" })).toHaveValue("Conflicting notes");
  await chooseNotebook("conflict-b");
  expect(await screen.findByText("Save or retry your current draft before switching notebooks.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Save recovered copy" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Conflicting notes");
  expect(http.get).not.toHaveBeenCalledWith("/notebooks/conflict-b");
});

it("offers retry loading after the initial cached notebook list is unavailable", async () => {
  const notebook = { notebook_id: "retry-cache", title: "Cached notes", content: "Available now", revision: 2 };
  http.get.mockImplementation(url => url === "/notebooks" ? Promise.reject(new Error("No cached notebooks available")) : Promise.resolve({ data: [] }));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("No cached notebooks available");
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
  expect(await screen.findByRole("textbox", { name: "Notebook notes" })).toHaveValue("Available now");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("retries an unavailable cached note while preserving the current offline draft", async () => {
  const a = { notebook_id: "retry-a", title: "Alpha", content: "Saved A", revision: 3 };
  const b = { notebook_id: "retry-b", title: "Beta", content: "Saved B", revision: 5 };
  let available = false;
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  http.get.mockImplementation(url => url === "/notebooks/retry-b" && !available ? Promise.reject(new Error("This note is not cached")) : Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [a, b] : url === "/notebooks/retry-b" ? b : a }));
  http.patch.mockRejectedValue(new Error("Offline"));
  render(<MemoryRouter><Notebooks /></MemoryRouter>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Notebook notes" }), { target: { value: "Draft remains safe" } });
  await chooseNotebook("retry-b");
  expect(await screen.findByRole("alert")).toHaveTextContent("This note is not cached");
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Draft remains safe");
  available = true;
  fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Saved B"));
  expect(JSON.parse(localStorage.getItem("syllo.draft.account.student.notebook.retry-a"))).toMatchObject({ baseRevision: 3, patch: { content: "Draft remains safe" } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(http.patch).not.toHaveBeenCalled();
});

it("opens the new-note command once and creates the named notebook", async () => {
  const notebook = { notebook_id: "created", title: "New study note", content: "", revision: 1 };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" || url === "/notebooks" ? [] : notebook }));
  http.post.mockResolvedValue({ data: notebook });
  render(<React.StrictMode><MemoryRouter initialEntries={["/notebooks?new=1"]}><Notebooks /></MemoryRouter></React.StrictMode>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Title", exact: true }), { target: { value: notebook.title } });
  fireEvent.click(screen.getByRole("button", { name: "Create note" }));
  expect(await screen.findByRole("textbox", { name: "Notebook title" })).toHaveValue(notebook.title);
  expect(http.post).toHaveBeenCalledWith("/notebooks", { title: notebook.title, content: "", subject_id: null, lesson_id: null });
  expect(http.post).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps a failed notebook draft before opening the new-note command", async () => {
  const notebook = { notebook_id: "command-draft", title: "Existing", content: "Original", revision: 2 };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : url === "/notebooks" ? [notebook] : notebook }));
  http.patch.mockRejectedValue(new Error("Offline"));
  function Page() { const navigate = useNavigate(); return <><button onClick={() => navigate("/notebooks?notebook=command-draft&new=1")}>New note command</button><Notebooks /></>; }
  render(<MemoryRouter><Page /></MemoryRouter>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Notebook notes" }), { target: { value: "Keep my pending work" } });
  fireEvent.click(screen.getByRole("button", { name: "New note command" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Save or recover your current draft");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Keep my pending work");
  expect(http.post).not.toHaveBeenCalled();
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
  await chooseNotebook("b");
  await act(async () => {});
  await chooseNotebook("c");
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
  fireEvent.click(screen.getByRole("button", { name: "Notebook options" }));
  expect(screen.getByLabelText("Notebook paper")).toHaveValue("ruled");
  expect(screen.getByLabelText("Notebook font")).toHaveValue("serif");
  fireEvent.change(screen.getByLabelText("Notebook paper"), { target: { value: "dotted" } });
  fireEvent.change(screen.getByLabelText("Notebook font"), { target: { value: "mono" } });
  await waitFor(() => expect(http.patch).toHaveBeenCalledWith("/notebooks/rich", expect.objectContaining({ paper_style: "dotted", font_style: "mono" })), { timeout: 2000 });
  fireEvent.click(screen.getByRole("button", { name: "Close notebook options" }));
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
  await openNotebookList();
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
  await openNotebookList();
  fireEvent.click(screen.getByText("Trash"));
  await screen.findByText("Trash is empty.");
  fireEvent.click(screen.getByRole("button", { name: "Close notebooks" }));
  fireEvent.click(screen.getByText("Notebook options"));
  fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
  await waitFor(() => expect(http.delete).toHaveBeenCalledWith("/notebooks/delete-restore"));
  await waitFor(() => expect(screen.getByRole("button", { name: "New notebook" })).toBeEnabled());
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("button", { name: "Notebooks", exact: true })).toHaveFocus());
  await openNotebookList();
  const trashMenu = screen.getByText("Trash");
  if (!trashMenu.closest("details").open) fireEvent.click(trashMenu);
  await waitFor(() => expect(screen.getByRole("button", { name: "Restore Keep notes" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Restore Keep notes" }));
  await waitFor(() => expect(http.post).toHaveBeenCalledWith("/notebooks/delete-restore/restore", { expected_revision: 5 }));
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveValue("Latest notes");
});
