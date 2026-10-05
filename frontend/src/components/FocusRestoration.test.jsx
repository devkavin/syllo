import React, { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import Modal from "./Modal";
import AiCompanion from "./AiCompanion";

vi.mock("@/lib/usage", () => ({ useUsage: () => ({ usage: null }) }));

it.each(["Search", "Study Companion"])("restores a persistent trigger when %s mounts after focus has fallen to the body", async name => {
  function Harness() {
    const fallback = useRef(null);
    const [open, setOpen] = useState(true);
    return <><button ref={fallback}>Open menu</button>{open && (name === "Search"
      ? <Modal title="Search" onClose={() => setOpen(false)} fallbackFocusRef={fallback}><input aria-label="Search" /></Modal>
      : <AiCompanion open onClose={() => setOpen(false)} fallbackFocusRef={fallback} />)}</>;
  }
  // Mirrors the cold lazy-load gap: the old drawer opener has gone, and no new
  // overlay has mounted yet. The document body is not a useful return target.
  expect(document.activeElement).toBe(document.body);
  render(<MemoryRouter><Harness /></MemoryRouter>);
  const dialog = await screen.findByRole("dialog", { name });
  await waitFor(() => expect(dialog).toContainElement(document.activeElement));
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus());
});
