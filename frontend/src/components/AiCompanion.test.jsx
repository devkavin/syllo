import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const usageState = vi.hoisted(() => ({ credits: 10 }));
beforeEach(() => { usageState.credits = 10; });

vi.mock("@/lib/api", () => ({
  http: { post: vi.fn() },
  formatError: (error) => String(error),
}));
vi.mock("@/lib/usage", () => ({
  useUsage: () => ({
    usage: { credits_remaining: usageState.credits },
    setRemaining: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import AiCompanion from "./AiCompanion";

describe("Study Companion privacy", () => {
  it("places focus inside the panel when the exhausted allowance hides its composer", async () => {
    usageState.credits = 0;
    render(<MemoryRouter><AiCompanion open onClose={() => {}} /></MemoryRouter>);
    const dialog = screen.getByRole("dialog", { name: "Study Companion" });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement));
    expect(screen.queryByRole("textbox", { name: "Your study question" })).not.toBeInTheDocument();
  });
  it("opens an accessible panel and restores focus to the opener on Escape", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return <><button onClick={() => setOpen(true)}>Ask for help</button>{open && <AiCompanion open onClose={() => setOpen(false)} />}</>;
    }
    render(<MemoryRouter><Harness /></MemoryRouter>);
    const trigger = screen.getByRole("button", { name: "Ask for help" });
    trigger.focus(); fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Study Companion" })).toBeVisible();
    fireEvent.keyDown(document.activeElement, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
  it("tells students that requests are processed by Google Gemini", () => {
    render(
      <MemoryRouter>
        <AiCompanion open onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/processed by Google Gemini/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/one successful response uses one help/i)).toBeInTheDocument();
  });
});
