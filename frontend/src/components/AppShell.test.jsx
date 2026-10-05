import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { name: "Student" }, logout: vi.fn() }) }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light", toggle: vi.fn() }) }));
vi.mock("@/lib/usage", () => ({ useUsage: () => ({ usage: null }) }));

const token = "abcdefghijklmnopqrstuvwxyz123456";
const renderShell = () => render(<MemoryRouter><AppShell><h1>Today</h1></AppShell></MemoryRouter>);

it("provides a skip link to the main workspace", () => {
  renderShell();
  const skip = screen.getByRole("link", { name: "Skip to content" });
  expect(skip).toHaveAttribute("href", "#main-content");
  expect(document.getElementById("main-content")).toBe(screen.getByRole("main"));
});

it("dismisses mobile navigation with Escape and restores its trigger", async () => {
  renderShell();
  const trigger = screen.getByRole("button", { name: "Open menu" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(await screen.findByRole("dialog", { name: "Navigation" })).toBeVisible();
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

it("restores a persistent opener after a warmed Companion is opened from mobile navigation", async () => {
  renderShell();
  const topbar = screen.getByTestId("mobile-ai-btn");
  topbar.focus(); fireEvent.click(topbar);
  await screen.findByRole("dialog", { name: "Study Companion" });
  fireEvent.click(screen.getByRole("button", { name: "Close Study Companion" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const menu = screen.getByRole("button", { name: "Open menu" });
  menu.focus(); fireEvent.click(menu);
  const navigation = screen.getByRole("dialog", { name: "Navigation" });
  const opener = within(navigation).getByRole("button", { name: "Study Companion" });
  opener.focus(); fireEvent.click(opener);
  const companion = await screen.findByRole("dialog", { name: "Study Companion" });
  await waitFor(() => expect(companion).toContainElement(document.activeElement));
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(menu).toHaveFocus();
});

it("restores the menu trigger after warmed Search is opened from mobile navigation", async () => {
  renderShell();
  const topbar = screen.getByTestId("mobile-search-btn");
  topbar.focus(); fireEvent.click(topbar);
  await screen.findByRole("dialog", { name: "Search" });
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const menu = screen.getByRole("button", { name: "Open menu" });
  menu.focus(); fireEvent.click(menu);
  const navigation = screen.getByRole("dialog", { name: "Navigation" });
  const opener = within(navigation).getByTestId("sidebar-search-btn");
  opener.focus(); fireEvent.click(opener);
  const search = await screen.findByRole("dialog", { name: "Search" });
  await waitFor(() => expect(search).toContainElement(document.activeElement));
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(menu).toHaveFocus();
});

describe("circle invitation notice", () => {
  beforeEach(() => sessionStorage.clear());

  it("makes the invitation accessible with a direct review action", () => {
    sessionStorage.setItem("syllo.circleInvite", JSON.stringify({ token, ref: "friend" }));
    renderShell();
    expect(screen.getByRole("region", { name: /invited to a study circle/i })).toBeVisible();
    expect(screen.getByRole("link", { name: "View invitation" })).toHaveAttribute("href", `/join/${token}?ref=friend`);
  });

  it("lets the student dismiss the notice without losing the invitation", () => {
    sessionStorage.setItem("syllo.circleInvite", JSON.stringify({ token }));
    const view = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("region", { name: /invited to a study circle/i })).not.toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("syllo.circleInvite")).token).toBe(token);
    view.unmount();
    renderShell();
    expect(screen.queryByRole("link", { name: "View invitation" })).not.toBeInTheDocument();
  });

  it("does not show a notice without a valid invitation", () => {
    sessionStorage.setItem("syllo.circleInvite", JSON.stringify({ token: "invalid" }));
    renderShell();
    expect(screen.queryByRole("link", { name: "View invitation" })).not.toBeInTheDocument();
  });

  it("leaves invitation presentation to the Circles page instead of duplicating it", () => {
    sessionStorage.setItem("syllo.circleInvite", JSON.stringify({ token }));
    render(<MemoryRouter initialEntries={["/circles"]}><AppShell><h1>Circles</h1></AppShell></MemoryRouter>);
    expect(screen.queryByRole("region", { name: /invited to a study circle/i })).not.toBeInTheDocument();
  });
});
