import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({ snapshot: null, loading: true, busy: false, error: "", displaySeconds: 0, act: vi.fn(), refresh: vi.fn() }));
const subjects = vi.hoisted(() => ({ data: [{ subject_id: "s", name: "Science", focus_minutes: 45 }], isPending: false, isError: false, refetch: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { user_id: "u" } }) }));
vi.mock("@/hooks/useSharedFocusTimer", () => ({ useSharedFocusTimer: () => shared }));
vi.mock("@/hooks/useAcademicQueries", () => ({ useSubjectsQuery: () => subjects }));
import NotebookFocus from "./NotebookFocus";
const notebook = { notebook_id: "n", subject_id: "s", lesson_id: "l" };
const mount = beforeStart => render(<MemoryRouter><NotebookFocus notebook={notebook} beforeStart={beforeStart} /></MemoryRouter>);
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); Object.assign(subjects, { data: [{ subject_id: "s", name: "Science", focus_minutes: 45 }], isPending: false, isError: false }); Object.assign(shared, { snapshot: { revision: 0, timer: null }, loading: false, busy: false, error: "", displaySeconds: 0 }); shared.act.mockResolvedValue({ timer: null }); });

it("waits for timer sync and shows recovery when the server is unavailable", () => {
  shared.snapshot = null; shared.loading = false; shared.error = "Offline";
  mount();
  expect(screen.getByRole("button", { name: "Start focus" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry timer sync" }));
  expect(shared.refresh).toHaveBeenCalled();
});
it("flushes the notebook before starting its lesson's server timer", async () => {
  const flush = vi.fn().mockResolvedValue(true);
  mount(flush);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start focus" })));
  expect(flush).toHaveBeenCalled();
  expect(shared.act).toHaveBeenCalledWith("start", { mode: "pomodoro", duration_seconds: 2700, subject_id: "s", lesson_id: "l" });
});
it("preserves an unsaved notebook when flushing fails", async () => {
  mount(vi.fn().mockResolvedValue(false));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start focus" })));
  expect(shared.act).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Save your notebook");
});
it("uses shared timer controls and identifies a different active lesson", async () => {
  shared.snapshot = { revision: 1, timer: { status: "running", mode: "pomodoro", lesson_id: "other", lesson_title: "Algebra", duration_seconds: 1500 } };
  shared.displaySeconds = 1234;
  mount();
  expect(screen.getByText("20:34")).toBeVisible();
  expect(screen.getByText(/Algebra/)).toBeVisible();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pause focus" })));
  expect(shared.act).toHaveBeenCalledWith("pause");
  expect(screen.getByRole("button", { name: "Pause focus" })).toBeVisible();
});

it("waits for the subject preset instead of starting an arbitrary duration", () => {
  subjects.data = []; subjects.isPending = true;
  mount();
  expect(screen.getByRole("button", { name: "Start focus" })).toBeDisabled();
  expect(screen.getByText("Loading focus preset…")).toBeVisible();
});

it("offers preset recovery without blocking an already active timer", () => {
  subjects.isError = true;
  const view = mount();
  expect(screen.getByRole("button", { name: "Start focus" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry focus preset" }));
  expect(subjects.refetch).toHaveBeenCalled();
  shared.snapshot.timer = { mode: "pomodoro", status: "running", subject_id: "s", lesson_id: "l" };
  view.rerender(<MemoryRouter><NotebookFocus notebook={notebook} /></MemoryRouter>);
  expect(screen.getByRole("button", { name: "Pause focus" })).toBeEnabled();
});

it("keeps older unsaved local sessions recoverable before starting a new one", () => {
  localStorage.setItem("syllo.timer.v1", JSON.stringify({ ownerId: "u", mode: "pomodoro", seconds: 100, synced: false, startedAt: "2026-10-10T01:00:00Z" }));
  mount();
  expect(screen.getByRole("button", { name: "Start focus" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "Recover earlier session" })).toHaveAttribute("href", "/timer");
});
