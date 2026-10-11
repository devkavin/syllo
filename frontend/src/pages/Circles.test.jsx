import React from "react";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Circles, { CircleInvite } from "./Circles";
import { http } from "@/lib/api";

const auth = vi.hoisted(() => ({ user: { user_id: "u", timezone: "UTC" } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, formatError: () => "Please try again" }));
const token = "A".repeat(43);
const circle = { id: "c", name: "Physics friends", owner_id: "u", invite_url: `https://syllo.app/join/${token}?ref=friend`, share_weekly_time: false, share_availability: false, members: [{ id: "u", name: "Sam", weekly_minutes: null }], goals: [] };
beforeEach(() => {
  auth.user = { user_id: "u", timezone: "UTC" };
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/circles" ? [circle] : url === "/circles/c" ? circle : [] }));
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); });
const show = (path = "/circles") => render(<MemoryRouter initialEntries={[path]}><Circles /></MemoryRouter>);

it("keeps creation out of the library until requested and opens the created circle", async () => {
  show();
  expect(await screen.findByRole("link", { name: /Physics friends/ })).toHaveAttribute("href", "/circles?circle=c");
  expect(screen.queryByLabelText("Circle name")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create circle" }));
  const dialog = screen.getByRole("dialog", { name: "Create a circle" });
  http.post.mockResolvedValue({ data: circle });
  fireEvent.change(within(dialog).getByLabelText("Circle name"), { target: { value: "Physics friends" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create circle" }));
  expect(await screen.findByRole("tab", { name: "Sessions" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("starts with sessions and hides privacy until settings are expanded", async () => {
  show("/circles?circle=c");
  expect(await screen.findByRole("tab", { name: "Sessions" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("checkbox", { name: /Share my total/ })).not.toBeVisible();
  fireEvent.click(screen.getByText("Circle settings"));
  const checkbox = screen.getByRole("checkbox", { name: /Share my total/ });
  expect(checkbox).not.toBeChecked();
  http.patch.mockResolvedValue({ data: {} });
  fireEvent.click(checkbox);
  await waitFor(() => expect(http.patch).toHaveBeenCalledWith("/circles/c/privacy", { share_weekly_time: true }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Invite friends" })).toBeEnabled());
});
it("keeps a selectable invite link when clipboard access is denied", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
  show("/circles?circle=c");
  fireEvent.click(await screen.findByRole("button", { name: "Invite friends" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  expect(await screen.findByText(/Copy the link manually/)).toBeInTheDocument();
  expect(screen.getByLabelText("Invite link")).toHaveValue(circle.invite_url);
});
it("keeps the invitation QR code tucked away until requested", async () => {
  show("/circles?circle=c");
  fireEvent.click(await screen.findByRole("button", { name: "Invite friends" }));
  const details = screen.getByText("Show QR code").closest("details");
  expect(details).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Show QR code"));
  expect(screen.getByRole("img", { name: "Scan to join Physics friends" })).toBeVisible();
});
it("treats cancelling native sharing as neutral and never changes membership", async () => {
  Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")) });
  show("/circles?circle=c");
  fireEvent.click(await screen.findByRole("button", { name: "Invite friends" }));
  fireEvent.click(screen.getByRole("button", { name: "Share invitation" }));
  await waitFor(() => expect(navigator.share).toHaveBeenCalledWith(expect.objectContaining({ url: circle.invite_url })));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(http.post).not.toHaveBeenCalled();
  delete navigator.share;
});
it("validates pasted invitations before opening a local invitation preview", async () => {
  render(<MemoryRouter><Routes><Route path="/" element={<Circles />} /><Route path="/join/:token" element={<p>Invitation preview</p>} /></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Join with link" }));
  fireEvent.change(screen.getByLabelText("Invitation link"), { target: { value: "javascript:alert(1)" } });
  fireEvent.click(screen.getByRole("button", { name: "View invitation" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/valid/);
  fireEvent.change(screen.getByLabelText("Invitation link"), { target: { value: circle.invite_url } });
  fireEvent.click(screen.getByRole("button", { name: "View invitation" }));
  expect(screen.getByText("Invitation preview")).toBeInTheDocument();
  expect(http.post).not.toHaveBeenCalled();
});
it("joins only on confirmation and opens the specific circle returned by the server", async () => {
  http.get.mockResolvedValue({ data: { name: circle.name } }); http.post.mockResolvedValue({ data: { id: "c" } });
  render(<MemoryRouter initialEntries={[`/join/${token}`]}><Routes><Route path="/join/:token" element={<CircleInvite />} /><Route path="/circles" element={<p>Joined workspace</p>} /></Routes></MemoryRouter>);
  const button = await screen.findByRole("button", { name: "Join circle" });
  expect(http.post).not.toHaveBeenCalled(); fireEvent.click(button);
  expect(await screen.findByText("Joined workspace")).toBeInTheDocument();
});
it("does not navigate after a joining account is replaced while the request is pending", async () => {
  let finish;
  http.get.mockResolvedValue({ data: { name: circle.name } });
  http.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const app = () => <MemoryRouter initialEntries={[`/join/${token}`]}><Routes><Route path="/join/:token" element={<CircleInvite />} /><Route path="/circles" element={<p>Wrong account navigation</p>} /></Routes></MemoryRouter>;
  const view = render(app());
  fireEvent.click(await screen.findByRole("button", { name: "Join circle" }));
  auth.user = { user_id: "new-user" }; view.rerender(app());
  await screen.findByRole("button", { name: "Join circle" });
  await act(async () => finish({ data: { id: "c" } }));
  expect(screen.queryByText("Wrong account navigation")).not.toBeInTheDocument();
});
it("waits for the new invitation after replacing a link", async () => {
  show("/circles?circle=c");
  await screen.findByRole("button", { name: "Invite friends" });
  fireEvent.click(screen.getByText("Circle settings"));
  fireEvent.keyDown(screen.getByRole("button", { name: "Circle management" }), { key: "Enter" });
  const replace = await screen.findByRole("menuitem", { name: "Replace invite link" });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  let refresh;
  http.post.mockResolvedValue({ data: {} });
  http.get.mockImplementation(url => url === "/circles/c" ? new Promise(resolve => { refresh = resolve; }) : Promise.resolve({ data: [] }));
  fireEvent.click(replace);
  await waitFor(() => expect(refresh).toBeTypeOf("function"));
  expect(screen.getByRole("button", { name: "Invite friends" })).toBeDisabled();
  await act(async () => refresh({ data: { ...circle, invite_url: `https://syllo.app/join/${"B".repeat(43)}` } }));
  fireEvent.click(screen.getByRole("button", { name: "Invite friends" }));
  expect(screen.getByLabelText("Invite link")).toHaveValue(`https://syllo.app/join/${"B".repeat(43)}`);
  vi.restoreAllMocks();
});
