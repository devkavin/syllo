import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import StudioLayers from "./StudioLayers";
import { createDocument, createObject } from "./document";

it("collapses a prepared group and lets its label be edited independently without ungrouping", () => {
  const art = createObject("asset", { assetId: "mitochondrion", name: "Respiration", groupId: "g" });
  const label = createObject("text", { text: "Matrix", name: "Matrix label", groupId: "g", isLabel: true });
  const setSelected = vi.fn(), onLayer = vi.fn();
  render(<StudioLayers compact document={{ ...createDocument(), objects: [art, label] }} selected={[]} setSelected={setSelected} onLayer={onLayer} onReorder={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Select group Respiration" }));
  expect(setSelected).toHaveBeenLastCalledWith([art.id, label.id]);
  fireEvent.click(screen.getByRole("button", { name: "Expand group Respiration" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit layer Matrix label" }));
  expect(setSelected).toHaveBeenLastCalledWith([label.id]);
  fireEvent.click(screen.getByRole("button", { name: "Hide group Respiration" }));
  expect(onLayer).toHaveBeenLastCalledWith([art.id, label.id], { hidden: true });
});

it("keeps title and review objects reachable in a secondary outline section", () => {
  const title = createObject("text", { text: "Cell diagram", role: "title" });
  render(<StudioLayers compact document={{ ...createDocument(), objects: [title] }} selected={[]} setSelected={vi.fn()} onLayer={vi.fn()} onReorder={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Select layer Cell diagram" }).closest("details")).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Figure details (1)"));
  expect(screen.getByRole("button", { name: "Select layer Cell diagram" }).closest("details")).toHaveAttribute("open");
});
