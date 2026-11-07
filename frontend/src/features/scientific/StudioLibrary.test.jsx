import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import StudioLibrary from "./StudioLibrary";

vi.mock("./document", async importOriginal => {
  const original = await importOriginal();
  return { ...original, catalog: Array.from({ length: 75 }, (_, i) => ({ id: i === 0 ? "mitochondrion" : `fixture-${i}`, name: i === 0 ? "Mitochondrion" : `Organelle ${i + 1}`, category: i < 60 ? "Cell Biology" : "Anatomy", tags: ["teaching"], author: "Test fixture", license: "CC0-1.0" })), assetUrl: id => `/fixtures/${id}.svg` };
});
const library = state => ({ state: { revision: 0, favorites: [], recent: [], items: [], ...state }, loading: false, busy: false, error: "", toggleFavorite: vi.fn() });

it("bounds mounted thumbnails, reveals more and resets the window after filtering", () => {
  render(<StudioLibrary onAsset={vi.fn()} library={library()} accountId="test" />);
  expect(screen.getAllByRole("button", { name: /^Insert / })).toHaveLength(30);
  fireEvent.click(screen.getByRole("button", { name: "Show more illustrations" }));
  expect(screen.getAllByRole("button", { name: /^Insert / })).toHaveLength(60);
  fireEvent.change(screen.getByLabelText("Search scientific assets"), { target: { value: "teaching" } });
  expect(screen.getAllByRole("button", { name: /^Insert / })).toHaveLength(30);
  fireEvent.change(screen.getByLabelText("Search scientific assets"), { target: { value: "" } });
  expect(screen.getAllByRole("button", { name: /^Insert / })).toHaveLength(30);
  fireEvent.change(screen.getByLabelText("Asset category"), { target: { value: "Human Anatomy" } });
  expect(screen.getAllByRole("button", { name: /^Insert / })).toHaveLength(15);
  expect(screen.queryByRole("button", { name: "Show more illustrations" })).not.toBeInTheDocument();
});
it("finds a favorite beyond the first page and inserts the actual matching ID", () => {
  const onAsset = vi.fn();
  render(<StudioLibrary onAsset={onAsset} library={library({ favorites: ["fixture-74"] })} accountId="test" />);
  fireEvent.click(screen.getByRole("button", { name: "Favorites", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Insert Organelle 75" }));
  expect(onAsset).toHaveBeenCalledExactlyOnceWith("fixture-74");
});
it("renders recent assets in insertion order across the complete catalog", () => {
  render(<StudioLibrary onAsset={vi.fn()} library={library({ recent: ["fixture-74", "mitochondrion"] })} accountId="test" />);
  fireEvent.click(screen.getByRole("button", { name: "Recent", exact: true }));
  expect(screen.getAllByRole("button", { name: /^Insert / }).map(el => el.getAttribute("aria-label"))).toEqual(["Insert Organelle 75", "Insert Mitochondrion"]);
});
