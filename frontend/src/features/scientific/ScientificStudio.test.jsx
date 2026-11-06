import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, expect, it, vi } from "vitest";
import ScientificStudio from "./ScientificStudio";
import { createDocument, createObject } from "./document";
import * as libraryHooks from "./useStudioLibrary";

beforeAll(() => { globalThis.ResizeObserver ||= class { observe() {} disconnect() {} }; });

it("saves and returns to Notes when the personal library cannot load and has no unsent changes", async () => {
  const onSave = vi.fn().mockResolvedValue(true), onClose = vi.fn();
  vi.spyOn(libraryHooks, "useStudioLibrary").mockReturnValue({ state: { revision: 0, favorites: [], recent: [], items: [] }, loading: false, busy: false, error: "Library unavailable", canDiscard: false });
  const view = render(<ScientificStudio accountId="student" initialDocument={createDocument()} onSave={onSave} onClose={onClose} />);
  try { fireEvent.click(screen.getByRole("button", { name: "Save and return to Notes" })); await waitFor(() => expect(onClose).toHaveBeenCalledOnce()); expect(onSave).toHaveBeenCalledOnce(); }
  finally { view.unmount(); vi.restoreAllMocks(); }
});

it("saves selected editable components through the account-scoped library", async () => {
  const saveItem = vi.fn().mockResolvedValue(true), asset = createObject("asset", { assetId: "mitochondrion" });
  vi.spyOn(libraryHooks, "useStudioLibrary").mockReturnValue({ state: { revision: 1, favorites: [], recent: [], items: [] }, loading: false, busy: false, error: "", saveItem, recordRecent: vi.fn() });
  const view = render(<ScientificStudio accountId="student" initialDocument={{ ...createDocument(), objects: [asset] }} onSave={vi.fn()} onClose={vi.fn()} />);
  try {
    fireEvent.click(screen.getByRole("button", { name: "Canvas Mitochondrion" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Canvas Mitochondrion" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Components", exact: true }));
    fireEvent.change(screen.getByLabelText("Saved item name"), { target: { value: "Mitochondrial component" } });
    fireEvent.click(screen.getByRole("button", { name: "Save selected component" }));
    await waitFor(() => expect(saveItem).toHaveBeenCalledOnce());
    const item = saveItem.mock.calls[0][0];
    expect(item.kind).toBe("component"); expect(item.document.objects[0].assetId).toBe("mitochondrion");
    expect(item.document.objects[0].id).not.toBe(asset.id);
    expect(await screen.findByText("Saved to your library.")).toBeVisible();
  } finally { view.unmount(); vi.restoreAllMocks(); }
});

it("lets an unsynced library change be discarded without losing the figure", () => {
  const discardFailed = vi.fn(), asset = createObject("asset", { assetId: "mitochondrion" });
  vi.spyOn(libraryHooks, "useStudioLibrary").mockReturnValue({ state: { revision: 1, favorites: [], recent: [], items: [] }, loading: false, busy: false, error: "Library capacity reached", canDiscard: true, discardFailed });
  const view = render(<ScientificStudio accountId="student" initialDocument={{ ...createDocument(), objects: [asset] }} onSave={vi.fn()} onClose={vi.fn()} />);
  try {
    fireEvent.click(screen.getByRole("button", { name: "Discard unsynced library change" }));
    expect(discardFailed).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Canvas Mitochondrion" })).toBeInTheDocument();
  } finally { view.unmount(); vi.restoreAllMocks(); }
});

it("keeps hidden group labels in place relative to moved and scaled artwork", () => {
  const onDraft = vi.fn(), asset = createObject("asset", { assetId: "mitochondrion", name: "Grouped organelle", x: 100, groupId: "g" });
  const label = createObject("text", { text: "Hidden group label", x: 300, hidden: true, groupId: "g" });
  render(<ScientificStudio initialDocument={{ ...createDocument(), objects: [asset, label] }} onDraft={onDraft} onSave={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "Layers" }));
  fireEvent.click(screen.getByRole("button", { name: "Select layer Grouped organelle" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight", shiftKey: true });
  let next = onDraft.mock.calls.at(-1)[0];
  expect(next.objects.map(obj => obj.x)).toEqual([110, 310]);
  fireEvent.click(screen.getByRole("button", { name: "Scale +10%", exact: true }));
  next = onDraft.mock.calls.at(-1)[0];
  expect(next.objects[1].x - next.objects[0].x).toBeCloseTo(220);
  expect(next.objects[1].hidden).toBe(true);
});

it("manages hidden and locked layers without deleting or moving protected artwork", () => {
  const onDraft = vi.fn(), asset = createObject("asset", { assetId: "mitochondrion", name: "My mitochondrion" });
  const view = render(<ScientificStudio initialDocument={{ ...createDocument(), objects: [asset] }} onDraft={onDraft} onSave={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "Layers" }));
  fireEvent.click(screen.getByRole("button", { name: "Select layer My mitochondrion" }));
  fireEvent.click(screen.getByRole("button", { name: "Lock layer My mitochondrion" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Delete" });
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
  expect(onDraft.mock.calls.at(-1)[0].objects[0]).toMatchObject({ locked: true, x: asset.x });
  fireEvent.click(screen.getByRole("button", { name: "Hide layer My mitochondrion" }));
  expect(view.container.ownerDocument.querySelector(`[data-object-id="${asset.id}"]`)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show layer My mitochondrion" }));
  fireEvent.click(screen.getByRole("button", { name: "Unlock layer My mitochondrion" }));
  fireEvent.change(screen.getByLabelText("X position"), { target: { value: "240" } });
  expect(onDraft.mock.calls.at(-1)[0].objects[0].x).toBe(240);
});

it("binds a connector to an illustration and retains it after moving the target", () => {
  const onDraft = vi.fn(), asset = createObject("asset", { assetId: "mitochondrion", name: "Target organelle" });
  render(<ScientificStudio initialDocument={{ ...createDocument(), objects: [asset] }} onDraft={onDraft} onSave={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "Insert" }));
  fireEvent.click(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Connector", exact: true }));
  fireEvent.change(screen.getByLabelText("Start target"), { target: { value: asset.id } });
  fireEvent.click(screen.getByRole("tab", { name: "Layers" }));
  fireEvent.click(screen.getByRole("button", { name: "Select layer Target organelle" }));
  fireEvent.change(screen.getByLabelText("X position"), { target: { value: "300" } });
  const line = onDraft.mock.calls.at(-1)[0].objects.find(obj => obj.type === "connector");
  expect(line.startBinding).toMatchObject({ objectId: asset.id });
  expect(Math.max(line.x, line.x + line.width)).toBeGreaterThanOrEqual(390);
});

it("searches genuine assets, inserts, labels, edits transforms and undoes independently", async () => {
  const onSave = vi.fn().mockResolvedValue(true);
  render(<ScientificStudio initialDocument={createDocument()} onSave={onSave} onClose={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText("Search cells, proteins, equipment…"), { target: { value: "mitochond" } });
  fireEvent.click(screen.getByRole("button", { name: "Insert Mitochondrion" }));
  fireEvent.change(screen.getByLabelText("Rotation"), { target: { value: "45" } });
  fireEvent.click(screen.getByRole("button", { name: "Add label" }));
  fireEvent.change(screen.getByLabelText("Label text"), { target: { value: "H₂O + Δψ" } });
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByLabelText("Label text")).toHaveValue("Scientific label");
  fireEvent.click(screen.getByRole("button", { name: "Redo" }));
  fireEvent.click(screen.getByRole("button", { name: "Save and return to Notes" }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  const saved = onSave.mock.calls.at(-1)[0];
  expect(saved.objects.find(o => o.type === "asset")).toMatchObject({ assetId: "mitochondrion", rotation: 45 });
  expect(saved.objects.find(o => o.type === "text").text).toBe("H₂O + Δψ");
});

it("keeps a failed save open and offers retry without losing objects", async () => {
  const onClose = vi.fn(), onSave = vi.fn().mockResolvedValue(false);
  render(<ScientificStudio initialDocument={createDocument()} onSave={onSave} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Add label" }));
  fireEvent.click(screen.getByRole("button", { name: "Save and return to Notes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/not saved/i);
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Label text")).toBeVisible();
});

it("starts an editable ETC copy and exposes review limits and credits", () => {
  render(<ScientificStudio initialDocument={createDocument()} onSave={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "Templates" }));
  fireEvent.click(screen.getByRole("button", { name: "Use Electron Transport Chain" }));
  expect(screen.getAllByText(/scientific review required/i).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Asset credits" }));
  expect(screen.getAllByText(/LadyofHats/).length).toBeGreaterThan(0);
});

it("freezes document mutations while a save is pending so later edits cannot be discarded", async () => {
  let resolveSave;
  const pending = new Promise(resolve => { resolveSave = resolve; });
  const onClose = vi.fn();
  render(<ScientificStudio initialDocument={createDocument()} onSave={() => pending} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Add label" }));
  fireEvent.click(screen.getByRole("button", { name: "Save and return to Notes" }));
  fireEvent.change(screen.getByLabelText("Label text"), { target: { value: "This edit must not disappear" } });
  expect(screen.getByLabelText("Label text")).toHaveValue("Scientific label");
  await act(async () => resolveSave(true));
  expect(onClose).toHaveBeenCalledOnce();
});

it("writes each completed change into Notes before immediate SPA unmount, including undo", () => {
  const onDraft = vi.fn();
  const view = render(<ScientificStudio initialDocument={createDocument()} onDraft={onDraft} onSave={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Add label" }));
  fireEvent.change(screen.getByLabelText("Label text"), { target: { value: "Latest scientific note" } });
  expect(onDraft.mock.calls.at(-1)[0].objects[0].text).toBe("Latest scientific note");
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(onDraft.mock.calls.at(-1)[0].objects[0].text).toBe("Scientific label");
  view.unmount();
});

it("confirms template replacement inline and lets the user undo it", () => {
  render(<ScientificStudio initialDocument={createDocument()} onSave={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Add label" }));
  fireEvent.click(screen.getByRole("tab", { name: "Templates" }));
  fireEvent.click(screen.getByRole("button", { name: "Use Electron Transport Chain" }));
  expect(screen.getByLabelText("Label text")).toHaveValue("Scientific label");
  fireEvent.click(screen.getByRole("button", { name: "Replace canvas", exact: true }));
  expect(screen.getByLabelText("Illustration title")).toHaveValue("Electron Transport Chain");
  fireEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  expect(screen.getByLabelText("Illustration title")).toHaveValue("Untitled illustration");
});
