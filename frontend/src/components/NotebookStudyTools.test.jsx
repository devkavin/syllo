import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import NotebookStudyTools from "./NotebookStudyTools";

function makeEditor() {
  let changed;
  const unsubscribe = vi.fn();
  return {
    document: [{ id: "existing", type: "paragraph", content: [{ type: "text", text: "Keep my notes" }], children: [] }],
    onChange: vi.fn(callback => { changed = callback; return unsubscribe; }),
    notifyChange: () => changed(), unsubscribe,
    getTextCursorPosition: vi.fn(() => ({ block: { id: "existing" } })),
    getActiveStyles: vi.fn(() => ({ subscript: true })),
    focus: vi.fn(), insertInlineContent: vi.fn(), removeStyles: vi.fn(), toggleStyles: vi.fn(),
    insertBlocks: vi.fn(() => [{ id: "inserted" }]), setTextCursorPosition: vi.fn(),
  };
}

it("inserts a chosen study symbol at the preserved editor selection", () => {
  const editor = makeEditor();
  render(<NotebookStudyTools editor={editor} />);
  fireEvent.click(screen.getByText("Symbols"));
  const symbol = screen.getByRole("button", { name: "Insert α" });
  expect(fireEvent.mouseDown(symbol)).toBe(false);
  fireEvent.click(symbol);
  expect(editor.focus).toHaveBeenCalled();
  expect(editor.insertInlineContent).toHaveBeenCalledWith("α");
});

it("makes script styles mutually exclusive without replacing selected text", () => {
  const editor = makeEditor();
  render(<NotebookStudyTools editor={editor} />);
  fireEvent.click(screen.getByRole("button", { name: "Superscript" }));
  expect(editor.removeStyles).toHaveBeenCalledWith({ subscript: true });
  expect(editor.toggleStyles).toHaveBeenCalledWith({ superscript: true });
  expect(editor.insertInlineContent).not.toHaveBeenCalled();
});

it.each(["Cornell notes", "Lab report", "Worked problem", "Vocabulary"])("inserts %s after the current block while keeping existing notes", name => {
  const editor = makeEditor();
  render(<NotebookStudyTools editor={editor} />);
  fireEvent.click(screen.getByText("Templates"));
  fireEvent.click(screen.getByRole("button", { name }));
  expect(editor.insertBlocks).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ type: "heading", content: name }),
  ]), "existing", "after");
  expect(editor.document[0].content[0].text).toBe("Keep my notes");
  expect(editor.setTextCursorPosition).toHaveBeenCalledWith("inserted", "end");
});

it("updates the outline from nested headings, jumps to them, and unsubscribes", () => {
  const editor = makeEditor();
  const headingNode = document.createElement("div");
  headingNode.dataset.id = "nested";
  headingNode.scrollIntoView = vi.fn();
  editor.domElement = document.createElement("div");
  editor.domElement.append(headingNode);
  const { unmount } = render(<NotebookStudyTools editor={editor} />);
  editor.document = [{ id: "parent", type: "paragraph", children: [
    { id: "nested", type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Cell " }, { type: "text", text: "division" }] },
  ] }];
  act(() => editor.notifyChange());
  fireEvent.click(screen.getByText("Outline"));
  fireEvent.click(screen.getByRole("button", { name: "Cell division" }));
  expect(editor.setTextCursorPosition).toHaveBeenCalledWith("nested", "start");
  expect(editor.focus).toHaveBeenCalled();
  expect(headingNode.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  unmount();
  expect(editor.unsubscribe).toHaveBeenCalled();
});
