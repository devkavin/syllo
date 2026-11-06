import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import StudioCanvas from "./StudioCanvas";
import { createDocument, createObject } from "./document";

beforeAll(() => {
  vi.stubGlobal("PointerEvent", class extends MouseEvent { constructor(type, options = {}) { super(type, options); this.pointerId = options.pointerId || 1; this.pointerType = options.pointerType || "mouse"; } });
});
afterAll(() => vi.unstubAllGlobals());

it("drags hidden members with a visible group while preserving locked objects", () => {
  const asset = createObject("asset", { assetId: "mitochondrion", groupId: "g", x: 100 });
  const label = createObject("text", { groupId: "g", x: 350, hidden: true });
  const locked = createObject("text", { groupId: "g", x: 500, locked: true });
  const commit = vi.fn(), doc = { ...createDocument(), objects: [asset, label, locked] };
  render(<StudioCanvas document={doc} selected={[asset.id, label.id, locked.id]} setSelected={vi.fn()} tool="select" setTool={vi.fn()} grid snap={false} commit={commit} onAdd={vi.fn()} onAsset={vi.fn()} onZoom={vi.fn()} />);
  const viewport = screen.getByRole("region", { name: "Scientific illustration canvas" });
  fireEvent.pointerDown(screen.getByRole("button", { name: "Canvas Mitochondrion" }), { clientX: 50, clientY: 50, button: 0 });
  fireEvent.pointerMove(viewport, { clientX: 70, clientY: 60 });
  fireEvent.pointerUp(viewport, { clientX: 70, clientY: 60 });
  const next = commit.mock.calls.at(-1)[0];
  expect(next.objects[0].x).toBeGreaterThan(asset.x);
  expect(next.objects[1].x - next.objects[0].x).toBe(250);
  expect(next.objects[2].x).toBe(500);
  expect(next.objects[1].hidden).toBe(true);
});

it("pinches and pans without committing a partial drawing gesture", () => {
  const commit = vi.fn(), onAdd = vi.fn(), onZoom = vi.fn();
  render(<StudioCanvas document={createDocument()} selected={[]} setSelected={vi.fn()} tool="shape" setTool={vi.fn()} grid snap commit={commit} onAdd={onAdd} onAsset={vi.fn()} onZoom={onZoom} />);
  const viewport = screen.getByRole("region", { name: "Scientific illustration canvas" });
  fireEvent.pointerDown(viewport, { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100, button: 0 });
  fireEvent.pointerMove(viewport, { pointerId: 1, pointerType: "touch", clientX: 110, clientY: 100 });
  const before = onZoom.mock.calls.at(-1)[0];
  fireEvent.pointerDown(viewport, { pointerId: 2, pointerType: "touch", clientX: 200, clientY: 100, button: 0 });
  fireEvent.pointerMove(viewport, { pointerId: 2, pointerType: "touch", clientX: 290, clientY: 120 });
  fireEvent.pointerUp(viewport, { pointerId: 2, pointerType: "touch", clientX: 290, clientY: 120 });
  fireEvent.pointerUp(viewport, { pointerId: 1, pointerType: "touch", clientX: 110, clientY: 100 });
  expect(onZoom.mock.calls.at(-1)[0]).toBeGreaterThan(before);
  expect(commit).not.toHaveBeenCalled(); expect(onAdd).not.toHaveBeenCalled();
});
