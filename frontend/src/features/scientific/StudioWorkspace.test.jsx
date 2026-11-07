import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, expect, it, vi } from "vitest";
import ScientificStudio from "./ScientificStudio";
import { createDocument, createObject } from "./document";

beforeAll(() => { globalThis.ResizeObserver ||= class { observe() {} disconnect() {} }; });
const figure = () => ({ ...createDocument("Genetics lesson"), objects: [
  createObject("asset", { assetId: "dna-double-helix", name: "DNA context" }),
  createObject("text", { text: "RNA product", name: "RNA label", isLabel: true, x: 400 }),
] });

it("keeps the outline available while resources change and opens real selected-object properties", () => {
  const onDraft = vi.fn();
  render(<ScientificStudio initialDocument={figure()} onDraft={onDraft} onSave={vi.fn()} onClose={vi.fn()} />);
  const outline = screen.getByRole("complementary", { name: "Figure outline" });
  fireEvent.click(screen.getByRole("tab", { name: "Templates", exact: true }));
  fireEvent.click(within(outline).getByRole("button", { name: "Select layer DNA context" }));
  expect(screen.getByRole("tab", { name: "Properties", exact: true })).toHaveAttribute("aria-selected", "true");
  fireEvent.change(screen.getByLabelText("Rotation"), { target: { value: "30" } });
  expect(onDraft.mock.calls.at(-1)[0].objects[0].rotation).toBe(30);
  fireEvent.click(within(outline).getByRole("button", { name: "Hide layer DNA context" }));
  expect(screen.queryByRole("button", { name: "Canvas DNA context" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  expect(screen.getByRole("button", { name: "Canvas DNA context" })).toBeInTheDocument();
});

it("offers real alignment commands from the toolbar without changing the selection", () => {
  const onDraft = vi.fn();
  render(<ScientificStudio initialDocument={figure()} onDraft={onDraft} onSave={vi.fn()} onClose={vi.fn()} />);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "a", ctrlKey: true });
  fireEvent.click(screen.getByRole("button", { name: "Arrange selection", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Align left", exact: true }));
  const objects = onDraft.mock.calls.at(-1)[0].objects;
  expect(objects[0].x).toBe(objects[1].x);
});

it("keeps practice separate from drafts, undo history and saved Notes content", async () => {
  const initial = figure(), snapshot = structuredClone(initial), onDraft = vi.fn(), onSave = vi.fn().mockResolvedValue(true);
  render(<ScientificStudio initialDocument={initial} onDraft={onDraft} onSave={onSave} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Practice labels", exact: true }));
  expect(screen.getByRole("region", { name: "Label practice" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save and return to Notes" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Delete" });
  expect(onDraft).not.toHaveBeenCalled();
  expect(initial).toEqual(snapshot);
  fireEvent.click(screen.getByRole("button", { name: "Return to editor", exact: true }));
  expect(screen.queryByRole("region", { name: "Label practice" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save and return to Notes" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  expect(onSave.mock.calls[0][0].objects).toEqual(snapshot.objects);
});

it("returns to editing before asking to save when leaving a changed practice figure", async () => {
  const onSave = vi.fn().mockResolvedValue(true);
  render(<ScientificStudio initialDocument={figure()} onSave={onSave} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Illustration title"), { target: { value: "Updated genetics lesson" } });
  fireEvent.click(screen.getByRole("button", { name: "Practice labels", exact: true }));
  expect(screen.getByRole("region", { name: "Label practice" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Return to Notes" }));
  expect(screen.queryByRole("region", { name: "Label practice" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save and return", exact: true }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  expect(onSave.mock.calls[0][0].title).toBe("Updated genetics lesson");
});

it("retains the selected pack and search after inserting artwork and visiting Properties", () => {
  render(<ScientificStudio initialDocument={createDocument()} onSave={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Browse Gene expression pack" }));
  fireEvent.change(screen.getByLabelText("Search scientific assets"), { target: { value: "Transfer RNA" } });
  fireEvent.click(screen.getByRole("button", { name: "Insert Transfer RNA", exact: true }));
  expect(screen.getByRole("tab", { name: "Properties" })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("tab", { name: "Assets", exact: true }));
  expect(screen.getByLabelText("Search scientific assets")).toHaveValue("Transfer RNA");
  expect(screen.getByRole("button", { name: "Browse Gene expression pack" })).toHaveAttribute("aria-pressed", "true");
});
