import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import StudioTemplates from "./StudioTemplates";
import { createDocument } from "./document";

vi.mock("./templates", async () => {
  const { createDocument } = await import("./document");
  return { templates: Array.from({ length: 25 }, (_, i) => ({ id: `process-${i}`, name: `Process ${i + 1}`, subject: "Biology", category: i < 18 ? "Cell biology" : "Laboratory", description: "Editable teaching composition", document: createDocument(`Process ${i + 1}`), reviewStatus: "draft", reviewNotes: "Fixture", references: [] })) };
});
it("bounds SVG previews and resets paging when the topic changes", () => {
  render(<StudioTemplates document={createDocument()} onLayer={vi.fn()} onTemplate={vi.fn()} />);
  expect(screen.getAllByRole("img")).toHaveLength(8);
  fireEvent.click(screen.getByRole("button", { name: "Show more templates" }));
  expect(screen.getAllByRole("img")).toHaveLength(16);
  fireEvent.change(screen.getByLabelText("Template topic"), { target: { value: "Laboratory" } });
  expect(screen.getAllByRole("img")).toHaveLength(7);
  fireEvent.change(screen.getByLabelText("Template topic"), { target: { value: "All subjects" } });
  expect(screen.getAllByRole("img")).toHaveLength(8);
});
it("searches the full template registry beyond the mounted preview window", () => {
  const onTemplate = vi.fn();
  render(<StudioTemplates document={createDocument()} onLayer={vi.fn()} onTemplate={onTemplate} />);
  fireEvent.change(screen.getByLabelText("Search scientific templates"), { target: { value: "Process 24" } });
  fireEvent.click(screen.getByRole("button", { name: "Use Process 24" }));
  expect(onTemplate).toHaveBeenCalledExactlyOnceWith("process-23");
});
