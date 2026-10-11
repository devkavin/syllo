import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TimerAlarmProvider, TimerAlarmControls } from "./TimerAlarm";
const mocks = vi.hoisted(() => ({ shared: { snapshot: null }, enable: vi.fn(), play: vi.fn(), stop: vi.fn(), close: vi.fn() }));
vi.mock("@/hooks/useSharedFocusTimer", () => ({ useSharedFocusTimer: () => mocks.shared }));
vi.mock("@/lib/timerSound", () => ({ createTimerSound: () => ({ enable: mocks.enable, play: mocks.play, stop: mocks.stop, close: mocks.close }) }));
beforeEach(() => { vi.clearAllMocks(); mocks.shared = { snapshot: { timer: null, completed_timer_id: null } }; mocks.enable.mockResolvedValue(); mocks.play.mockResolvedValue(); });
function Page({ userId = "student" }) { return <TimerAlarmProvider userId={userId}><TimerAlarmControls /><p>Notebook stays open</p></TimerAlarmProvider>; }
it("alarms once for a confirmed natural completion on another device, and can be dismissed", async () => {
  const view = render(<Page />);
  fireEvent.click(screen.getByRole("button", { name: "Enable alarm sound" }));
  await screen.findByRole("button", { name: "Test alarm sound" });
  mocks.play.mockClear();
  mocks.shared.snapshot = { timer: { timer_id: "phone-timer" }, completed_timer_id: null }; view.rerender(<Page />);
  mocks.shared.snapshot = { timer: null, completed_timer_id: "phone-timer", completion_automatic: true, completed_at: new Date().toISOString(), server_now: new Date().toISOString() }; view.rerender(<Page />);
  expect(await screen.findByRole("status", { name: "Timer alarm" })).toHaveTextContent("Timer finished");
  expect(mocks.play).toHaveBeenCalledTimes(1);
  view.rerender(<Page />); expect(mocks.play).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss alarm" })); expect(mocks.stop).toHaveBeenCalled();
});
it("does not alarm for historical completion, a manual finish, reset or stopwatch", () => {
  mocks.shared.snapshot = { timer: null, completed_timer_id: "old", completion_automatic: true };
  const view = render(<Page />);
  mocks.shared.snapshot = { timer: null, completed_timer_id: "manual", completion_automatic: false }; view.rerender(<Page />);
  mocks.shared.snapshot = { timer: null, completed_timer_id: null }; view.rerender(<Page />);
  expect(screen.queryByRole("status", { name: "Timer alarm" })).not.toBeInTheDocument(); expect(mocks.play).not.toHaveBeenCalled();
});
it("delivers a durable completion even when another device already started or manually finished the next timer", async () => {
  const view = render(<Page />); fireEvent.click(screen.getByRole("button", { name: "Enable alarm sound" })); await screen.findByRole("button", { name: "Test alarm sound" }); mocks.play.mockClear();
  mocks.shared.snapshot = { timer: null, completed_timer_id: "next-manual", completion_automatic: false, alarm_timer_id: "first-natural", alarm_completed_at: new Date().toISOString(), server_now: new Date().toISOString() }; view.rerender(<Page />);
  expect(await screen.findByRole("status", { name: "Timer alarm" })).toBeVisible(); expect(mocks.play).toHaveBeenCalledTimes(1);
});
it("shows a visual completion when sound is disabled and reports blocked sound honestly", async () => {
  const view = render(<Page />);
  mocks.shared.snapshot = { timer: null, completed_timer_id: "done", completion_automatic: true }; view.rerender(<Page />);
  expect(screen.getByRole("status", { name: "Timer alarm" })).toBeVisible(); expect(mocks.play).not.toHaveBeenCalled();
  mocks.enable.mockRejectedValue(new Error("Audio blocked")); fireEvent.click(screen.getByRole("button", { name: "Enable alarm sound" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not enable/i);
});
it("discards the prior account's alarm and closes audio on account change", async () => {
  const view = render(<Page />); fireEvent.click(screen.getByRole("button", { name: "Enable alarm sound" })); await screen.findByRole("button", { name: "Test alarm sound" });
  mocks.shared.snapshot = { timer: null, completed_timer_id: "done", completion_automatic: true }; view.rerender(<Page />);
  view.rerender(<Page userId="other" />);
  await waitFor(() => expect(screen.queryByRole("status", { name: "Timer alarm" })).not.toBeInTheDocument()); expect(mocks.close).toHaveBeenCalled();
});
it("keeps the alarm dismissible inside native fullscreen", () => {
  const fullscreen = document.createElement("div"); document.body.append(fullscreen);
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreen });
  const view = render(<Page />);
  mocks.shared.snapshot = { timer: null, alarm_timer_id: "finished", alarm_completed_at: new Date().toISOString(), server_now: new Date().toISOString() }; view.rerender(<Page />);
  expect(within(fullscreen).getByRole("button", { name: "Dismiss alarm" })).toBeVisible();
  view.unmount(); delete document.fullscreenElement; fullscreen.remove();
});
