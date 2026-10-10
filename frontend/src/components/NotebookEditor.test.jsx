import React, { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import NotebookEditor from "./NotebookEditor";
import { SuggestionMenu } from "@blocknote/core/extensions";

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
  expect(screen.getByRole("textbox", { name: "Notebook notes" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(heading);
  expect(editorRef.current.document[0]).toMatchObject({ type: "heading", props: { level: 1 } });
});
