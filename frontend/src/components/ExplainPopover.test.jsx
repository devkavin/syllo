import React, { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ExplainPopover from "./ExplainPopover";
import { http } from "@/lib/api";

vi.mock("@/lib/api", () => ({ http: { post: vi.fn() }, formatError: String }));
vi.mock("@/lib/usage", () => ({ useUsage: () => ({ setRemaining: vi.fn() }) }));

it("explains text selected in the rich editor", async () => {
  const notesRef = createRef(), containerRef = createRef();
  http.post.mockResolvedValue({ data: { text: "Cell explanation", credits_remaining: 5 } });
  render(<div ref={containerRef}><div ref={notesRef} role="textbox">Mitosis</div><ExplainPopover textareaRef={notesRef} containerRef={containerRef} getSelectedText={() => "Mitosis"} subjectName="Biology" /></div>);
  fireEvent.mouseUp(screen.getByRole("textbox"));
  fireEvent.click(await screen.findByRole("button", { name: "Explain this" }));
  expect(http.post).toHaveBeenCalledWith("/ai/explain", { concept: "Mitosis", subject_name: "Biology" });
  expect(await screen.findByText("Cell explanation")).toBeVisible();
});

it("keeps textarea selection support in lesson notes", async () => {
  const notesRef = createRef(), containerRef = createRef();
  render(<div ref={containerRef}><textarea ref={notesRef} aria-label="Lesson notes" defaultValue="Learn Mitosis" /><ExplainPopover textareaRef={notesRef} containerRef={containerRef} /></div>);
  const notes = screen.getByRole("textbox");
  notes.setSelectionRange(6, 13);
  fireEvent.select(notes);
  expect(await screen.findByRole("button", { name: "Explain this" })).toBeVisible();
});
