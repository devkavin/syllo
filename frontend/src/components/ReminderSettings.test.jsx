import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ReminderSettings from "./ReminderSettings";
import { http } from "@/lib/api";

vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), patch: vi.fn() }, formatError: error => error.message }));
const prefs = { enabled: false, quiet_start: "22:00", quiet_end: "07:00", digest_time: "17:00" };
const browserKey = owner => `syllo.reminders.browser.${encodeURIComponent(owner)}`;
let permission;
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  permission = vi.fn().mockResolvedValue("granted");
  vi.stubGlobal("Notification", Object.assign(vi.fn(), { permission: "default", requestPermission: permission }));
  http.get.mockResolvedValue({ data: prefs });
  http.patch.mockImplementation(async (url, body) => ({ data: body }));
});
afterEach(() => vi.unstubAllGlobals());

it("does not fetch reminder preferences without an account", () => {
  render(<ReminderSettings />);
  expect(http.get).not.toHaveBeenCalled();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

it("saves in-app reminders and times independently of browser permission", async () => {
  render(<ReminderSettings userId="student-a" />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "In-app reminders" }));
  fireEvent.change(screen.getByLabelText("Quiet hours start"), { target: { value: "21:30" } });
  fireEvent.change(screen.getByLabelText("Digest time"), { target: { value: "16:45" } });
  fireEvent.click(screen.getByRole("button", { name: "Save reminder settings" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Reminder settings saved");
  expect(http.patch).toHaveBeenCalledWith("/study/reminders", { enabled: true, quiet_start: "21:30", quiet_end: "07:00", digest_time: "16:45" });
  expect(permission).not.toHaveBeenCalled();
  expect(localStorage.getItem(browserKey("student-a"))).toBeNull();
});

it("requests browser permission only from the explicit enable action and records owner opt-in after saving", async () => {
  render(<ReminderSettings userId="student-a" />);
  const enable = await screen.findByRole("button", { name: "Enable browser alerts" });
  expect(permission).not.toHaveBeenCalled();
  expect(screen.getByText("Browser reminders appear while Syllo is open.")).toBeVisible();
  fireEvent.click(enable);
  await waitFor(() => expect(localStorage.getItem(browserKey("student-a"))).toBe("true"));
  expect(permission).toHaveBeenCalledOnce();
  expect(http.patch).toHaveBeenCalledWith("/study/reminders", { ...prefs, enabled: true });
  expect(screen.getByRole("checkbox", { name: "In-app reminders" })).toBeChecked();
  expect(localStorage.getItem(browserKey("student-b"))).toBeNull();
});

it("retains entered settings after a save failure and leaves browser opt-in off when permission is denied", async () => {
  permission.mockResolvedValueOnce("denied");
  http.patch.mockRejectedValueOnce(new Error("Could not save reminders"));
  render(<ReminderSettings userId="student-a" />);
  fireEvent.click(await screen.findByRole("button", { name: "Enable browser alerts" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/permission/i);
  expect(http.patch).not.toHaveBeenCalled();
  expect(localStorage.getItem(browserKey("student-a"))).toBeNull();
  fireEvent.change(screen.getByLabelText("Quiet hours start"), { target: { value: "23:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Save reminder settings" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save reminders");
  expect(screen.getByLabelText("Quiet hours start")).toHaveValue("23:00");
});

it("discards old-account preferences and permission responses after an account switch", async () => {
  let oldResponse;
  http.get.mockReturnValueOnce(new Promise(resolve => { oldResponse = resolve; }));
  const { rerender } = render(<ReminderSettings userId="student-a" />);
  rerender(<ReminderSettings userId="student-b" />);
  expect(await screen.findByLabelText("Digest time")).toHaveValue("17:00");
  oldResponse({ data: { ...prefs, digest_time: "09:00" } });
  await waitFor(() => expect(screen.getByLabelText("Digest time")).toHaveValue("17:00"));
  let permissionResponse;
  permission.mockReturnValueOnce(new Promise(resolve => { permissionResponse = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "Enable browser alerts" }));
  rerender(<ReminderSettings userId="student-c" />);
  await screen.findByLabelText("Digest time");
  permissionResponse("granted");
  await waitFor(() => expect(screen.getByRole("button", { name: "Enable browser alerts" })).toBeEnabled());
  expect(http.patch).not.toHaveBeenCalled();
  expect(localStorage.getItem(browserKey("student-b"))).toBeNull();
});
