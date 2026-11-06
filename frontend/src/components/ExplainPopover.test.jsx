import React, { createRef } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

it("keeps the selection action compact and reveals the privacy notice only when requested", async () => {
  const notesRef = createRef(), containerRef = createRef();
  render(<div ref={containerRef}><div ref={notesRef} role="textbox">Mitosis</div><ExplainPopover textareaRef={notesRef} containerRef={containerRef} getSelectedText={() => "Mitosis"} /></div>);
  fireEvent.mouseUp(screen.getByRole("textbox"));
  const toolbar = await screen.findByTestId("explain-popover");
  expect(within(toolbar).getByText("1 help")).toBeVisible();
  expect(screen.queryByText(/Requests are processed by Google Gemini/)).not.toBeInTheDocument();
  fireEvent.click(within(toolbar).getByRole("button", { name: "AI privacy and usage" }));
  const notice = await screen.findByRole("dialog", { name: "AI privacy and usage" });
  expect(within(notice).getByText(/Don't include sensitive information/)).toBeVisible();
  fireEvent.mouseDown(within(notice).getByText(/Don't include sensitive information/));
  expect(screen.getByRole("button", { name: "Explain this" })).toBeVisible();
});

it.each(["Escape", "scroll", "resize"])("dismisses a stale selection action on %s", async event => {
  const notesRef = createRef(), containerRef = createRef();
  render(<div ref={containerRef}><div ref={notesRef} role="textbox">Mitosis</div><ExplainPopover textareaRef={notesRef} containerRef={containerRef} getSelectedText={() => "Mitosis"} /></div>);
  fireEvent.mouseUp(screen.getByRole("textbox"));
  await screen.findByRole("button", { name: "Explain this" });
  if (event === "Escape") {
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyUp(screen.getByRole("textbox"), { key: "Escape" });
  }
  else if (event === "scroll") fireEvent.scroll(screen.getByRole("textbox"));
  else fireEvent.resize(window);
  await waitFor(() => expect(screen.queryByTestId("explain-popover")).not.toBeInTheDocument());
});
