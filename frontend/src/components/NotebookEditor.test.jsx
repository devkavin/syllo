import React, { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import NotebookEditor from "./NotebookEditor";
import { SuggestionMenu } from "@blocknote/core/extensions";
import { createDocument, createObject } from "@/features/scientific/document";

beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 400, 32));
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">';
});
afterAll(() => vi.restoreAllMocks());

it("restores saved headings and inline colors", () => {
  render(<NotebookEditor notebook={{ rich_content: [{ type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Saved heading", styles: { textColor: "blue", backgroundColor: "yellow" } }] }] }} theme="dark" editorRef={createRef()} onChange={vi.fn()} />);
  const heading = screen.getByRole("heading", { level: 2, name: "Saved heading" });
  expect(heading).toBeVisible();
  expect(heading.querySelector('[data-style-type="textColor"]')).toBeInTheDocument();
  expect(heading.querySelector('[data-style-type="backgroundColor"]')).toBeInTheDocument();
});

it("renders legacy text literally in an accessible rich editor", () => {
  render(<NotebookEditor notebook={{ content: "<b>Literal</b>\n\nNext line" }} theme="light" editorRef={createRef()} onChange={vi.fn()} />);
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveTextContent("<b>Literal</b>");
  expect(screen.getByText("Next line")).toBeVisible();
  expect(screen.queryByText("Literal", { selector: "b" })).not.toBeInTheDocument();
});

it("shows review notes without allowing edits or writing controls", async () => {
  const editorRef = createRef();
  render(<NotebookEditor notebook={{ rich_content: [{ type: "callout", props: { kind: "definition" }, content: "Saved lesson notes" }] }} theme="light" editorRef={editorRef} readOnly />);
  expect(editorRef.current.isEditable).toBe(false);
  expect(screen.getByText("Saved lesson notes")).toBeVisible();
  expect(await screen.findByLabelText("Callout type")).toBeDisabled();
  expect(screen.queryByText(/Type \/ for equations/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Insert/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Illustration Studio", exact: true })).not.toBeInTheDocument();
});

it("saves real heading, ink and highlight edits with readable plain text", async () => {
  const editorRef = createRef(), onChange = vi.fn();
  render(<NotebookEditor notebook={{ content: "Cells" }} theme="light" editorRef={editorRef} onChange={onChange} />);
  await act(async () => editorRef.current.updateBlock(editorRef.current.document[0], {
    type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Cell division", styles: { textColor: "blue", backgroundColor: "yellow" } }],
  }));
  expect(screen.getByRole("heading", { name: "Cell division", level: 2 })).toBeVisible();
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    content: "Cell division", rich_content: expect.arrayContaining([expect.objectContaining({ type: "heading", content: expect.arrayContaining([expect.objectContaining({ styles: expect.objectContaining({ textColor: "blue", backgroundColor: "yellow" }) })]) })]),
  }));
});

it("opens the free slash menu without any AI service", async () => {
  const editorRef = createRef();
  render(<NotebookEditor notebook={{ content: "" }} theme="light" editorRef={editorRef} onChange={vi.fn()} />);
  await act(async () => editorRef.current.getExtension(SuggestionMenu).openSuggestionMenu("/"));
  const heading = await screen.findByText("Heading 1");
  for (const mediaOption of ["Image", "Video", "Audio", "File"]) {
    expect(screen.queryByText(mediaOption, { exact: true })).not.toBeInTheDocument();
  }
  expect(screen.getByText("Table", { exact: true })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(heading);
  expect(editorRef.current.document[0]).toMatchObject({ type: "heading", props: { level: 1 } });
});

it("restores equations, scientific text and editable callouts", async () => {
  const editorRef = createRef();
  render(<NotebookEditor notebook={{ rich_content: [
    { type: "mathBlock", content: "x^2 + y^2 = z^2" },
    { type: "paragraph", content: [{ type: "text", text: "2", styles: { superscript: true } }, { type: "math", content: "E=mc^2" }] },
    { type: "callout", props: { kind: "definition" }, content: "A cell is the basic unit of life." },
  ] }} theme="light" editorRef={editorRef} onChange={vi.fn()} />);
  expect(editorRef.current.document[0]).toMatchObject({ type: "mathBlock", content: [{ type: "text", text: "x^2 + y^2 = z^2", styles: {} }] });
  expect(screen.getByText("2", { selector: "sup" })).toBeInTheDocument();
  expect(screen.getByText("A cell is the basic unit of life.")).toBeVisible();
  expect(await screen.findByLabelText("Callout type")).toHaveValue("definition");
});

it("offers equation, diagram and subject callout slash commands", async () => {
  const editorRef = createRef();
  render(<NotebookEditor notebook={{ content: "" }} theme="light" editorRef={editorRef} onChange={vi.fn()} />);
  await act(async () => editorRef.current.getExtension(SuggestionMenu).openSuggestionMenu("/"));
  expect(await screen.findByText("Definition", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("Diagram", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("Block Equation", { exact: true })).toBeInTheDocument();
  fireEvent.click(screen.getByText("Definition", { exact: true }));
  expect(editorRef.current.document[0]).toMatchObject({ type: "callout", props: { kind: "definition" } });
});

it("inserts an editable scientific figure between paragraphs and reopens it", async () => {
  const editorRef = createRef(), onChange = vi.fn();
  render(<NotebookEditor notebook={{ content: "Before\nAfter" }} theme="light" editorRef={editorRef} onChange={onChange} />);
  fireEvent.click(screen.getByText("Insert", { exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Scientific Illustration" }));
  expect(await screen.findByRole("dialog", {}, { timeout: 10000 })).toHaveTextContent("Scientific Illustration Studio");
  expect(editorRef.current.document.map(b => b.type)).toEqual(["paragraph", "scientificIllustration", "paragraph"]);
  fireEvent.click(screen.getByRole("button", { name: "Return to Notes" }));
  fireEvent.click(await screen.findByRole("button", { name: "Edit scientific illustration" }));
  expect(await screen.findByRole("dialog", {}, { timeout: 10000 })).toBeVisible();
});

it("opens the studio from the visible shortcut and retains a paragraph for continuing notes", async () => {
  const editorRef = createRef(), onChange = vi.fn();
  render(<NotebookEditor notebook={{ content: "Biology notes" }} theme="light" editorRef={editorRef} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Illustration Studio", exact: true }));
  expect(await screen.findByRole("dialog", {}, { timeout: 10000 })).toHaveTextContent("Scientific Illustration Studio");
  expect(editorRef.current.document.map(block => block.type)).toEqual(["paragraph", "scientificIllustration", "paragraph"]);
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rich_content: expect.arrayContaining([expect.objectContaining({ type: "scientificIllustration" })]) }));
});

it("restores independent figure objects, caption and display size and duplicates safely", async () => {
  const doc = createDocument("Cell figure"); doc.objects = [createObject("asset", { assetId: "mitochondrion" }), createObject("text", { text: "H₂O", rotation: 30 })];
  const editorRef = createRef();
  render(<NotebookEditor notebook={{ rich_content: [{ type: "scientificIllustration", props: { document: JSON.stringify(doc), caption: "Mitochondria", displayWidth: 75 } }, { type: "paragraph", content: "Continue writing" }] }} theme="light" editorRef={editorRef} onChange={vi.fn()} />);
  expect(await screen.findByLabelText("Figure caption")).toHaveValue("Mitochondria");
  expect(screen.getByLabelText("Figure display width")).toHaveValue("75");
  fireEvent.click(screen.getByRole("button", { name: "Duplicate scientific illustration" }));
  const figures = editorRef.current.document.filter(b => b.type === "scientificIllustration");
  expect(figures).toHaveLength(2);
  const copy = JSON.parse(figures[1].props.document);
  expect(copy.objects[1]).toMatchObject({ text: "H₂O", rotation: 30 });
  expect(copy.id).not.toBe(doc.id); expect(copy.objects[0].id).not.toBe(doc.objects[0].id);
  expect(screen.getByText("Continue writing")).toBeVisible();
});

it("renders saved scientific vectors sharply even when a PNG thumbnail is available", async () => {
  const doc = createDocument("Vector note figure"); doc.objects = [createObject("text", { text: "H₂O · editable vector label", rotation: 20 })];
  render(<NotebookEditor notebook={{ rich_content: [{ type: "scientificIllustration", props: { document: JSON.stringify(doc), preview: "data:image/png;base64,iVBORw0KGgo=", caption: "Vector figure" } }] }} theme="light" onChange={vi.fn()} />);
  const figure = await screen.findByTestId("scientific-note-figure");
  expect([...figure.querySelectorAll("svg text tspan")].map(line => line.textContent).join(" ")).toBe("H₂O · editable vector label");
  expect(figure.querySelector("img")).toBeNull();
});

it("shows saved figures in read-only review without edit controls", async () => {
  const doc = createDocument("Read only figure"); doc.objects = [createObject("text", { text: "CO₂" })];
  render(<NotebookEditor notebook={{ rich_content: [{ type: "scientificIllustration", props: { document: JSON.stringify(doc), caption: "Carbon dioxide" } }] }} theme="light" readOnly />);
  expect(await screen.findByText("Carbon dioxide")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Edit scientific illustration" })).not.toBeInTheDocument();
});
