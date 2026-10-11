import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ReminderCentre from "./ReminderCentre";
import { http } from "@/lib/api";

vi.mock("@/lib/api", () => ({ http: { get: vi.fn() }, formatError: error => error.message }));
const prefs = { enabled: true, quiet_start: "22:00", quiet_end: "07:00", digest_time: "17:00" };
const digest = { date: "2026-10-11", timezone: "Asia/Colombo", quiet: false, notification_due: true, total_count: 5,
  practice_due: { questions: 2, mistakes: 1 }, tasks: [{ task_id: "worksheet", title: "Worksheet", due_date: "2026-10-11" }],
  sessions: [{ title: "Physics study", starts_at: "2026-10-11T13:00:00Z", href: "/timetable?edit=study" }],
};
const browserKey = owner => `syllo.reminders.browser.${encodeURIComponent(owner)}`;
const deliveredKey = owner => `syllo.reminders.delivered.${encodeURIComponent(owner)}.${digest.date}`;
let notify;
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  notify = vi.fn(function () {
    const notification = new EventTarget();
    queueMicrotask(() => notification.dispatchEvent(new Event("show")));
    return notification;
  });
  vi.stubGlobal("Notification", Object.assign(notify, { permission: "granted", requestPermission: vi.fn() }));
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
  http.get.mockImplementation(async url => ({ data: url.endsWith("/digest") ? structuredClone(digest) : prefs }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const mount = userId => render(<MemoryRouter><ReminderCentre userId={userId} /></MemoryRouter>);

it("skips reminder APIs without an account and skips digest loading when reminders are disabled", async () => {
  const anonymous = mount();
  expect(http.get).not.toHaveBeenCalled();
  anonymous.unmount();
  http.get.mockResolvedValue({ data: { ...prefs, enabled: false } });
  mount("student-a");
  await waitFor(() => expect(http.get).toHaveBeenCalledWith("/study/reminders"));
  expect(http.get).not.toHaveBeenCalledWith("/study/reminders/digest");
  expect(notify).not.toHaveBeenCalled();
});

it("shows an expandable owner digest without requesting permission or sending alerts for in-app-only opt-in", async () => {
  mount("student-a");
  const summary = await screen.findByText("Reminders · 5 due");
  expect(screen.getByRole("link", { name: "Worksheet" })).not.toBeVisible();
  fireEvent.click(summary);
  expect(screen.getByRole("link", { name: "Worksheet" })).toHaveAttribute("href", "/tasks?task=worksheet");
  expect(screen.getByRole("link", { name: "Physics study" })).toHaveAttribute("href", "/timetable?edit=study");
  expect(screen.getByRole("link", { name: /Start practice/ })).toHaveAttribute("href", "/reviews");
  expect(screen.getByText(/2 questions/)).toHaveTextContent("1 mistake");
  expect(notify).not.toHaveBeenCalled();
  expect(Notification.requestPermission).not.toHaveBeenCalled();
});

it("delivers at most one browser alert per account and digest date", async () => {
  localStorage.setItem(browserKey("student-a"), "true");
  const first = mount("student-a");
  await waitFor(() => expect(localStorage.getItem(deliveredKey("student-a"))).toBe("true"));
  expect(notify).toHaveBeenCalledOnce();
  fireEvent.focus(window);
  await screen.findByText("Reminders · 5 due");
  expect(notify).toHaveBeenCalledOnce();
  first.unmount();
  mount("student-a");
  await screen.findByText("Reminders · 5 due");
  expect(notify).toHaveBeenCalledOnce();
});

it("coalesces overlapping digest delivery for the same account and day", async () => {
  localStorage.setItem(browserKey("student-a"), "true");
  render(<MemoryRouter><ReminderCentre userId="student-a" /><ReminderCentre userId="student-a" /></MemoryRouter>);
  await waitFor(() => expect(localStorage.getItem(deliveredKey("student-a"))).toBe("true"));
  expect(notify).toHaveBeenCalledOnce();
});

it("uses a service-worker alert and retries delivery failures without marking the day sent", async () => {
  localStorage.setItem(browserKey("student-a"), "true");
  const showNotification = vi.fn().mockRejectedValueOnce(new Error("Delivery failed")).mockResolvedValueOnce(undefined);
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue({ showNotification }) } });
  mount("student-a");
  expect(await screen.findByRole("alert")).toHaveTextContent(/deliver/i);
  expect(localStorage.getItem(deliveredKey("student-a"))).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry reminders" }));
  await waitFor(() => expect(localStorage.getItem(deliveredKey("student-a"))).toBe("true"));
  expect(showNotification).toHaveBeenCalledTimes(2);
  expect(notify).not.toHaveBeenCalled();
});

it("does not mark a fallback notification delivered when the browser reports an asynchronous failure", async () => {
  localStorage.setItem(browserKey("student-a"), "true");
  notify.mockImplementationOnce(function () {
    const notification = new EventTarget();
    queueMicrotask(() => notification.dispatchEvent(new Event("error")));
    return notification;
  });
  mount("student-a");
  expect(await screen.findByRole("alert")).toHaveTextContent(/deliver/i);
  expect(localStorage.getItem(deliveredKey("student-a"))).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry reminders" }));
  await waitFor(() => expect(localStorage.getItem(deliveredKey("student-a"))).toBe("true"));
});

it("suppresses quiet-hour alerts and old-account responses", async () => {
  localStorage.setItem(browserKey("student-a"), "true");
  let oldDigest;
  http.get.mockImplementation(url => url.endsWith("/digest") ? new Promise(resolve => { oldDigest = resolve; }) : Promise.resolve({ data: prefs }));
  const { rerender } = mount("student-a");
  await waitFor(() => expect(http.get).toHaveBeenCalledWith("/study/reminders/digest"));
  http.get.mockImplementation(async url => ({ data: url.endsWith("/digest") ? { ...digest, quiet: true, tasks: [], sessions: [] } : prefs }));
  localStorage.setItem(browserKey("student-b"), "true");
  rerender(<MemoryRouter><ReminderCentre userId="student-b" /></MemoryRouter>);
  await screen.findByText("Reminders · 5 due");
  await act(async () => { oldDigest({ data: digest }); });
  expect(screen.queryByRole("link", { name: "Worksheet" })).not.toBeInTheDocument();
  expect(notify).not.toHaveBeenCalled();
  expect(localStorage.getItem(deliveredKey("student-a"))).toBeNull();
  expect(localStorage.getItem(deliveredKey("student-b"))).toBeNull();
});

it("refreshes the digest every minute while mounted and clears polling after unmount", async () => {
  vi.useFakeTimers();
  const instance = mount("student-a");
  await act(async () => {});
  expect(screen.getByText("Reminders · 5 due")).toBeVisible();
  http.get.mockImplementation(async url => ({ data: url.endsWith("/digest") ? { ...digest, total_count: 6 } : prefs }));
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(screen.getByText("Reminders · 6 due")).toBeVisible();
  instance.unmount();
  http.get.mockClear();
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(http.get).not.toHaveBeenCalled();
});
