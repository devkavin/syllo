import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Circles, { CircleInvite } from "./Circles";
import Checkout from "./Checkout";
import { http } from "@/lib/api";

const state = vi.hoisted(() => ({ user: null }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), post: vi.fn() }, formatError: () => "Request failed" }));
afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); delete window.Paddle; state.user = null; });

describe("circle invitations and sandbox checkout", () => {
  it("prioritizes the pending invitation even after the global notice is dismissed", async () => {
    state.user = { user_id: "student" };
    const token = "A".repeat(43);
    sessionStorage.setItem("syllo.circleInvite", JSON.stringify({ token, ref: "friend01" }));
    sessionStorage.setItem("syllo.circleInviteDismissed", token);
    http.get.mockResolvedValue({ data: [] });
    render(<MemoryRouter><Circles /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "You have a circle invitation" })).toBeVisible();
    expect(screen.getByRole("link", { name: "View invitation" })).toHaveAttribute("href", `/join/${token}?ref=friend01`);
    expect(http.post).not.toHaveBeenCalled();
    await screen.findByRole("button", { name: "Create circle" });
  });
  it("shows a private empty circle view", async () => {
    state.user = { user_id: "student" };
    http.get.mockResolvedValue({ data: [] });
    render(<MemoryRouter><Circles /></MemoryRouter>);
    expect(await screen.findByText(/Create a private circle and invite a few friends/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create circle" })).toBeDisabled();
    expect(http.post).not.toHaveBeenCalled();
  });
  it("remembers an invite without automatically joining or registering", async () => {
    http.get.mockResolvedValue({ data: { name: "Physics friends", referral_code: "abc12345" } });
    const token = "A".repeat(43);
    render(<MemoryRouter initialEntries={[`/join/${token}?ref=friend01`]}><Routes><Route path="/join/:token" element={<CircleInvite />} /><Route path="/register" element={<p>Register</p>} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Join Physics friends" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Create free account" });
    expect(link).toHaveAttribute("href", "/register?ref=friend01");
    fireEvent.click(link);
    expect(JSON.parse(sessionStorage.getItem("syllo.circleInvite"))).toEqual({ token, ref: "friend01" });
    expect(http.post).not.toHaveBeenCalled();
  });
  it("opens only a backend-owned transaction in sandbox", async () => {
    const paddle = { Environment: { set: vi.fn() }, Initialize: vi.fn(), Checkout: { open: vi.fn(), close: vi.fn() } };
    window.Paddle = paddle;
    http.get.mockImplementation(url => Promise.resolve({ data: url.endsWith("config") ? { token: "test_client", environment: "sandbox" } : { id: "txn_owned", status: "pending" } }));
    render(<MemoryRouter initialEntries={["/checkout?_ptxn=txn_owned"]}><Checkout /></MemoryRouter>);
    await waitFor(() => expect(paddle.Checkout.open).toHaveBeenCalledOnce());
    expect(paddle.Environment.set).toHaveBeenCalledWith("sandbox");
    expect(paddle.Checkout.open.mock.calls[0][0].transactionId).toBe("txn_owned");
    expect(paddle.Checkout.open.mock.calls[0][0]).not.toHaveProperty("items");
    expect(paddle.Initialize.mock.calls[0][0].token).toBe("test_client");
  });
  it("never opens checkout if transaction ownership fails", async () => {
    const paddle = { Environment: { set: vi.fn() }, Initialize: vi.fn(), Checkout: { open: vi.fn(), close: vi.fn() } };
    window.Paddle = paddle;
    http.get.mockRejectedValue(new Error("Not owned"));
    render(<MemoryRouter initialEntries={["/checkout?_ptxn=txn_foreign"]}><Checkout /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Request failed");
    expect(paddle.Checkout.open).not.toHaveBeenCalled();
  });
});
