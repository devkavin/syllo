import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import StudioLibrary from "./StudioLibrary";

vi.mock("./document", async importOriginal => {
  const original = await importOriginal();
  return { ...original, catalog: Array.from({ length: 75 }, (_, i) => ({ id: i === 0 ? "mitochondrion" : i === 1 ? "dna-double-helix" : `fixture-${i}`, name: i === 0 ? "Mitochondrion" : i === 1 ? "DNA double helix" : `Organelle ${i + 1}`, category: i < 60 ? "Cell Biology" : "Anatomy", tags: ["teaching"], author: "Test fixture", source: "Bioicons", sourceUrl: "https://example.com/artwork", license: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", modifications: "Normalized SVG metadata." })), assetUrl: id => `/fixtures/${id}.svg` };
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

it("browses pack artwork and templates without changing the canvas until an explicit action", () => {
  const onAsset = vi.fn(), onTemplate = vi.fn();
  render(<StudioLibrary onAsset={onAsset} onTemplate={onTemplate} library={library()} />);
  fireEvent.click(screen.getByRole("button", { name: "Browse Gene expression pack" }));
  expect(screen.getAllByRole("button", { name: /^Insert / })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Insert DNA double helix" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Insert Mitochondrion" })).not.toBeInTheDocument();
  expect(onAsset).not.toHaveBeenCalled(); expect(onTemplate).not.toHaveBeenCalled();
  const templateSummary = screen.getByText("7 prepared templates");
  expect(templateSummary.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(templateSummary);
  expect(templateSummary.closest("details")).toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "Use template Transcription strand direction" }));
  expect(onTemplate).toHaveBeenCalledExactlyOnceWith("transcription-strand-direction");
  fireEvent.change(screen.getByLabelText("Search scientific assets"), { target: { value: "no-such-result" } });
  expect(screen.queryByRole("button", { name: /^Insert / })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Use template / })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search scientific assets"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "All packs" }));
  expect(screen.getAllByRole("button", { name: /^Insert / })).toHaveLength(30);
});

it("keeps additional curriculum packs collapsed until requested and filters their actual artwork", () => {
  const onAsset = vi.fn();
  render(<StudioLibrary onAsset={onAsset} library={library()} />);
  const summary = screen.getByText("More curriculum packs");
  expect(summary.closest("details")).not.toHaveAttribute("open");
  expect(screen.getByRole("button", { name: "All packs" })).toBeVisible();
  fireEvent.click(summary);
  expect(summary.closest("details")).toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "Browse Energy and metabolism pack" }));
  expect(screen.getAllByRole("button", { name: /^Insert / }).map(el => el.getAttribute("aria-label"))).toEqual(["Insert Mitochondrion"]);
  expect(onAsset).not.toHaveBeenCalled();
});

it("previews source, author, license and modifications without an account before explicit insertion", () => {
  const onAsset = vi.fn();
  render(<StudioLibrary onAsset={onAsset} library={library()} />);
  fireEvent.click(screen.getByRole("button", { name: "Preview Mitochondrion" }));
  const preview = screen.getByRole("region", { name: "Mitochondrion preview" });
  expect(preview).toHaveTextContent("Test fixture");
  expect(preview).toHaveTextContent("Normalized SVG metadata.");
  expect(screen.getByRole("link", { name: "Bioicons" })).toHaveAttribute("href", "https://example.com/artwork");
  expect(screen.getByRole("link", { name: "CC0-1.0" })).toBeInTheDocument();
  expect(onAsset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Insert previewed Mitochondrion" }));
  expect(onAsset).toHaveBeenCalledExactlyOnceWith("mitochondrion");
  fireEvent.click(screen.getByRole("button", { name: "Close asset preview" }));
  expect(screen.queryByRole("region", { name: "Mitochondrion preview" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Preview Mitochondrion" })).toHaveFocus();
});

it("topic chips filter assets and keep saved component controls reachable", () => {
  render(<StudioLibrary onAsset={vi.fn()} library={library()} />);
  expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["All categories", "Cell Biology (60)", "Human Anatomy (15)"]);
  fireEvent.click(screen.getByRole("button", { name: "Laboratory", exact: true }));
  expect(screen.queryByRole("button", { name: /^Insert / })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cell Biology", exact: true }));
  expect(screen.getAllByRole("button", { name: /^Insert / })).toHaveLength(30);
  fireEvent.click(screen.getByRole("button", { name: "Components", exact: true }));
  expect(screen.getByRole("button", { name: "Save selected component" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Presets", exact: true }));
  expect(screen.getByRole("button", { name: "Save canvas preset" })).toBeDisabled();
});
