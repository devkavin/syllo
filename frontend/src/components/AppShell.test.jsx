import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { name: "Student" }, logout: vi.fn() }) }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light", toggle: vi.fn() }) }));
vi.mock("@/lib/usage", () => ({ useUsage: () => ({ usage: null }) }));

const token = "abcdefghijklmnopqrstuvwxyz123456";
const renderShell = () => render(<MemoryRouter><AppShell><h1>Today</h1></AppShell></MemoryRouter>);

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
