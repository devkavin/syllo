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

it("groups symbols and script styles under Format and templates beside scientific illustrations under Insert", () => {
  render(<NotebookStudyTools editor={makeEditor()} onIllustration={vi.fn()} />);
  expect(screen.getByText("Format")).toBeVisible();
  expect(screen.getByText("Cornell notes")).not.toBeVisible();
  fireEvent.click(screen.getByText("Insert"));
  expect(screen.getByRole("button", { name: "Cornell notes" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Scientific Illustration" })).toBeVisible();
  fireEvent.click(screen.getByText("Format"));
  expect(screen.getByRole("button", { name: "Superscript" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Insert α" })).toBeVisible();
  expect(screen.getByText("Cornell notes")).not.toBeVisible();
});

it("inserts a chosen study symbol at the preserved editor selection", () => {
  const editor = makeEditor();
  render(<NotebookStudyTools editor={editor} />);
  fireEvent.click(screen.getByText("Format"));
  const symbol = screen.getByRole("button", { name: "Insert α" });
  expect(fireEvent.mouseDown(symbol)).toBe(false);
  fireEvent.click(symbol);
  expect(editor.focus).toHaveBeenCalled();
  expect(editor.insertInlineContent).toHaveBeenCalledWith("α");
  expect(screen.getByText("Format").closest("details")).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Format"));
  expect(screen.getByText("Format").closest("details")).toHaveAttribute("open");
});

it("makes script styles mutually exclusive without replacing selected text", () => {
  const editor = makeEditor();
  render(<NotebookStudyTools editor={editor} />);
  fireEvent.click(screen.getByText("Format"));
  fireEvent.click(screen.getByRole("button", { name: "Superscript" }));
  expect(editor.removeStyles).toHaveBeenCalledWith({ subscript: true });
  expect(editor.toggleStyles).toHaveBeenCalledWith({ superscript: true });
  expect(editor.insertInlineContent).not.toHaveBeenCalled();
});

it.each(["Cornell notes", "Lab report", "Worked problem", "Vocabulary"])("inserts %s after the current block while keeping existing notes", name => {
  const editor = makeEditor();
  render(<NotebookStudyTools editor={editor} />);
  fireEvent.click(screen.getByText("Insert"));
  fireEvent.click(screen.getByRole("button", { name }));
  expect(editor.insertBlocks).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ type: "heading", content: name }),
  ]), "existing", "after");
  expect(editor.document[0].content[0].text).toBe("Keep my notes");
  expect(editor.setTextCursorPosition).toHaveBeenCalledWith("inserted", "end");
  expect(screen.getByText("Insert").closest("details")).not.toHaveAttribute("open");
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

it("closes the previous dropdown when another toolbar dropdown opens", () => {
  render(<NotebookStudyTools editor={makeEditor()} onIllustration={vi.fn()} />);
  for (const label of ["Insert", "Format", "Outline"]) {
    const trigger = screen.getByText(label);
    fireEvent.click(trigger);
    expect(trigger.closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("toolbar").querySelectorAll("details[open]")).toHaveLength(1);
  }
});

it.each(["Insert", "Format", "Outline"])("closes %s when clicking outside it", label => {
  render(<><NotebookStudyTools editor={makeEditor()} onIllustration={vi.fn()} /><textarea aria-label="Notes" /></>);
  const menu = screen.getByText(label).closest("details");
  fireEvent.click(screen.getByText(label));
  expect(menu).toHaveAttribute("open");
  fireEvent.pointerDown(screen.getByRole("textbox", { name: "Notes" }));
  expect(menu).not.toHaveAttribute("open");
});

it("closes the dropdown with Escape and returns focus to its trigger", () => {
  render(<NotebookStudyTools editor={makeEditor()} />);
  const trigger = screen.getByText("Format");
  fireEvent.click(trigger);
  screen.getByRole("button", { name: "Insert α" }).focus();
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  expect(trigger.closest("details")).not.toHaveAttribute("open");
  expect(trigger).toHaveFocus();
});

it("closes a dropdown when keyboard focus leaves it", () => {
  render(<><NotebookStudyTools editor={makeEditor()} /><input aria-label="Notebook title" /></>);
  fireEvent.click(screen.getByText("Insert"));
  fireEvent.focusIn(screen.getByRole("textbox", { name: "Notebook title" }));
  expect(screen.getByText("Insert").closest("details")).not.toHaveAttribute("open");
});

it("toggles a dropdown closed by clicking its trigger again", () => {
  render(<NotebookStudyTools editor={makeEditor()} />);
  const trigger = screen.getByText("Format");
  fireEvent.click(trigger);
  expect(trigger.closest("details")).toHaveAttribute("open");
  fireEvent.click(trigger);
  expect(trigger.closest("details")).not.toHaveAttribute("open");
});
