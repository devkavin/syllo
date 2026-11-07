import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import StudioPractice from "./StudioPractice";
import { createDocument, createObject } from "./document";

function fixture() {
  return { ...createDocument("RNA polymerase"), objects: [
    createObject("asset", { assetId: "mitochondrion" }),
    createObject("text", { text: "RNA polymerase", isLabel: true, groupId: "transcription" }),
    createObject("text", { text: "H₂O + Δψ", isLabel: true }),
    createObject("text", { text: "Invisible secret", isLabel: true, hidden: true }),
  ] };
}

function deepFreeze(value) { Object.freeze(value); Object.values(value).forEach(child => { if (child && typeof child === "object") deepFreeze(child); }); return value; }

it("checks, reveals, advances and retries locally with no changes to the frozen original", () => {
  const doc = deepFreeze(fixture()), original = JSON.stringify(doc), close = vi.fn();
  render(<StudioPractice document={doc} onClose={close} />);
  const figure = screen.getByRole("img", { name: "Label practice figure" });
  expect(figure.textContent).toContain("1 ?");
  expect(figure.textContent).toContain("2 ?");
  expect(figure.textContent).not.toContain("RNA polymerase");
  expect(figure.textContent).not.toContain("H₂O");
  expect(figure.textContent).not.toContain("Mitochondrion");
  expect(screen.queryByText("Invisible secret")).not.toBeInTheDocument();
  expect(screen.getByText(/source artwork.*lettering.*cannot be hidden/i)).toBeVisible();
  expect(screen.getByText(/zero AI credits/i)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Answer for label 1"), { target: { value: "  rna   POLYMERASE " } });
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(screen.getByRole("status")).toHaveTextContent(/correct/i);
  fireEvent.click(screen.getByRole("button", { name: "Next label" }));
  fireEvent.change(screen.getByLabelText("Answer for label 2"), { target: { value: "H2O + Δψ" } });
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(screen.getByRole("status")).toHaveTextContent(/try again/i);
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  expect(screen.getByRole("status")).toHaveTextContent("H₂O + Δψ");
  expect(figure.textContent).not.toContain("H₂O");
  fireEvent.click(screen.getByRole("button", { name: "Finish practice" }));
  expect(screen.getByText(/1 of 2 answered correctly/i)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry all labels" }));
  expect(screen.getByLabelText("Answer for label 1")).toHaveValue("");
  expect(screen.getByText(/0 of 2 completed/i)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Return to editor" }));
  expect(close).toHaveBeenCalledOnce();
  expect(JSON.stringify(doc)).toBe(original);
});

it("shows an actionable empty state for hidden or unprepared text", () => {
  const close = vi.fn();
  const doc = fixture();
  doc.objects = doc.objects.map(obj => ({ ...obj, hidden: true }));
  render(<StudioPractice document={doc} onClose={close} />);
  expect(screen.getByText(/no visible prepared labels/i)).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Return to editor" }));
  expect(close).toHaveBeenCalledOnce();
});

it("resets an incorrect result when an answer is edited and accepts exact scientific symbols", () => {
  const doc = { ...fixture(), objects: [createObject("text", { text: "H₂O + Δψ", isLabel: true })] };
  render(<StudioPractice document={doc} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Answer for label 1"), { target: { value: "wrong" } });
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(screen.getByRole("status")).toHaveTextContent(/try again/i);
  fireEvent.change(screen.getByLabelText("Answer for label 1"), { target: { value: " h₂o + ΔΨ " } });
  expect(screen.getByRole("status")).not.toHaveTextContent(/try again/i);
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(screen.getByRole("status")).toHaveTextContent(/correct/i);
  expect(within(screen.getByRole("region", { name: "Label practice" })).getByText(/1 of 1 completed/i)).toBeVisible();
});
