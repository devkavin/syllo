import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import StudyGuidance from "./StudyGuidance";

const guide = owner => <MemoryRouter><StudyGuidance accountId={owner} context="notebook" defaultOpen><p>Try recalling a paragraph before reading it again.</p></StudyGuidance></MemoryRouter>;
beforeEach(() => localStorage.clear());

it("remembers dismissal for the same account and allows the guide to be reopened", () => {
  const view = render(guide("student"));
  fireEvent.click(screen.getByRole("button", { name: "Dismiss guidance" }));
  view.unmount(); render(guide("student"));
  expect(screen.queryByRole("region", { name: "Study guidance" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Study guide" }));
  expect(screen.getByRole("region", { name: "Study guidance" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Try a guided first session" })).toHaveAttribute("href", "/onboarding?guide=1");
});

it("keeps guidance preferences separate when the account changes", () => {
  const view = render(guide("student"));
  fireEvent.click(screen.getByRole("button", { name: "Dismiss guidance" }));
  view.rerender(guide("another-student"));
  expect(screen.getByRole("region", { name: "Study guidance" })).toBeVisible();
});

it("can still dismiss and reopen guidance when browser storage is unavailable", () => {
  const getter = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Unavailable"); });
  const setter = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Unavailable"); });
  try {
    render(guide("student"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss guidance" }));
    fireEvent.click(screen.getByRole("button", { name: "Study guide" }));
    expect(screen.getByRole("region", { name: "Study guidance" })).toBeVisible();
  } finally { getter.mockRestore(); setter.mockRestore(); }
});
