import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "@/lib/api";

const queryState = vi.hoisted(() => ({ pending: false, failed: false, subjects: [] }));
vi.mock("@/lib/api", () => ({ http: { post: vi.fn() }, formatError: String }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/hooks/useAcademicQueries", () => ({ useSubjectsQuery: () => ({ data: queryState.subjects, isPending: queryState.pending, isError: queryState.failed }) }));
import FocusTimer from "./FocusTimer";

function setMinutes(value) {
  fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Apply time" }));
}
function advance(seconds) {
  for (let i = 0; i < seconds; i++) act(() => vi.advanceTimersByTime(1000));
}

beforeEach(() => {
  localStorage.clear();
  queryState.pending = false;
  queryState.failed = false;
  queryState.subjects = [{ subject_id: "math", name: "Math", color: "sage", focus_minutes: 45, break_minutes: 10 }];
  vi.clearAllMocks();
  http.post.mockResolvedValue({ data: {} });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, writable: true, value: null });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, writable: true, value: undefined });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, writable: true, value: undefined });
});
afterEach(() => vi.useRealTimers());

describe("focus duration", () => {
  it("preserves a legacy session through a failed subject request and recovers on retry", async () => {
    localStorage.setItem("syllo.timer.v1", JSON.stringify({ mode: "pomodoro", subjectId: "math", seconds: 1400, running: false, startedAt: "2026-10-05T00:00:00Z" }));
    queryState.subjects = [];
    queryState.failed = true;
    const view = render(<FocusTimer />);
    expect(JSON.parse(localStorage.getItem("syllo.timer.v1")).sessionSeconds).toBeUndefined();
    expect(screen.getByTestId("timer-save")).toBeDisabled();
    queryState.failed = false;
    queryState.subjects = [{ subject_id: "math", name: "Math", color: "sage", focus_minutes: 45, break_minutes: 10 }];
    view.rerender(<FocusTimer />);
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    expect(http.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({ duration_seconds: 1300 }));
  });
  it.each([2600, 1400])("restores legacy subject timers after subjects load (%s seconds left)", async (remaining) => {
    localStorage.setItem("syllo.timer.v1", JSON.stringify({ mode: "pomodoro", subjectId: "math", seconds: remaining, running: false, startedAt: "2026-10-05T00:00:00Z" }));
    queryState.subjects = [];
    queryState.pending = true;
    const view = render(<FocusTimer />);
    expect(JSON.parse(localStorage.getItem("syllo.timer.v1")).sessionSeconds).toBeUndefined();
    queryState.pending = false;
    queryState.subjects = [{ subject_id: "math", name: "Math", color: "sage", focus_minutes: 45, break_minutes: 10 }];
    view.rerender(<FocusTimer />);
    expect(screen.getByLabelText("Duration (minutes)")).toHaveValue(45);
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    expect(http.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({ duration_seconds: 2700 - remaining, subject_id: "math" }));
  });
  it("remembers custom times across modes, reset, and reload", () => {
    const view = render(<FocusTimer />);
    setMinutes("40");
    expect(screen.getByTestId("timer-display")).toHaveTextContent("40:00");
    fireEvent.click(screen.getByTestId("mode-short"));
    setMinutes("8");
    fireEvent.click(screen.getByTestId("mode-pomodoro"));
    fireEvent.click(screen.getByTestId("timer-reset"));
    expect(screen.getByTestId("timer-display")).toHaveTextContent("40:00");
    view.unmount();
    render(<FocusTimer />);
    expect(screen.getByTestId("timer-display")).toHaveTextContent("40:00");
    fireEvent.click(screen.getByTestId("mode-short"));
    expect(screen.getByTestId("timer-display")).toHaveTextContent("08:00");
  });

  it("offers quick presets and can return to the subject preset", () => {
    render(<FocusTimer />);
    fireEvent.change(screen.getByTestId("timer-subject-select"), { target: { value: "math" } });
    expect(screen.getByTestId("timer-display")).toHaveTextContent("45:00");
    fireEvent.click(screen.getByRole("button", { name: "50 min" }));
    expect(screen.getByTestId("timer-display")).toHaveTextContent("50:00");
    fireEvent.click(screen.getByRole("button", { name: "Use subject preset" }));
    expect(screen.getByTestId("timer-display")).toHaveTextContent("45:00");
  });

  it.each(["", "0", "241", "1.5"])("rejects invalid duration %s without changing the timer", (value) => {
    render(<FocusTimer />);
    setMinutes(value);
    expect(screen.getByRole("alert")).toHaveTextContent("whole number between 1 and 240");
    expect(screen.getByTestId("timer-display")).toHaveTextContent("25:00");
  });

  it("protects a running session from time and subject changes", () => {
    render(<FocusTimer />);
    fireEvent.click(screen.getByTestId("timer-start"));
    expect(screen.getByLabelText("Duration (minutes)")).toBeDisabled();
    expect(screen.getByTestId("timer-subject-select")).toBeDisabled();
  });

  it("logs elapsed time from the custom duration", async () => {
    vi.useFakeTimers();
    render(<FocusTimer />);
    setMinutes("40");
    fireEvent.click(screen.getByTestId("timer-start"));
    advance(12);
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    expect(http.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({ duration_seconds: 12 }));
    expect(screen.getByTestId("timer-display")).toHaveTextContent("40:00");
  });

  it("automatically logs a completed custom session once", async () => {
    vi.useFakeTimers();
    render(<React.StrictMode><FocusTimer /></React.StrictMode>);
    setMinutes("1");
    fireEvent.click(screen.getByTestId("timer-start"));
    advance(60);
    await act(async () => {});
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({ duration_seconds: 60 }));
    expect(screen.getByTestId("timer-display")).toHaveTextContent("01:00");
  });

  it("ignores malformed saved timer state", () => {
    localStorage.setItem("syllo.timer.v1", JSON.stringify({ mode: "missing", seconds: -2, running: true }));
    render(<FocusTimer />);
    expect(screen.getByTestId("timer-display")).toHaveTextContent("25:00");
  });
});

describe("focus fullscreen", () => {
  it("contains keyboard focus and isolates background controls in fallback fullscreen", async () => {
    const view = render(<><button>Background control</button><FocusTimer /></>);
    await act(async () => fireEvent.click(screen.getByTestId("timer-fullscreen")));
    const overlay = screen.getByTestId("fullscreen-timer");
    const controls = [...overlay.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled)")];
    const first = controls[0];
    const last = controls[controls.length - 1];
    expect(view.container.closest("[inert]")).not.toBeNull();
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(view.container.closest("[inert]")).toBeNull();
  });
  it("enters native fullscreen on a stable timer element and exits using the button", async () => {
    let fullElement = null;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullElement });
    const request = vi.fn(function () {
      fullElement = this;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, writable: true, value: request });
    document.exitFullscreen = vi.fn(async () => {
      fullElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    render(<FocusTimer />);
    await act(async () => fireEvent.click(screen.getByTestId("timer-fullscreen")));
    expect(request).toHaveBeenCalledOnce();
    expect(fullElement).toBe(screen.getByTestId("fullscreen-timer"));
    expect(fullElement.isConnected).toBe(true);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" })));
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("fullscreen-timer")).not.toBeInTheDocument();
  });

  it("syncs the UI after the browser exits fullscreen", async () => {
    let fullElement = null;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullElement });
    HTMLElement.prototype.requestFullscreen = async function () {
      fullElement = this;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
    render(<FocusTimer />);
    await act(async () => fireEvent.click(screen.getByTestId("timer-fullscreen")));
    act(() => { fullElement = null; document.dispatchEvent(new Event("fullscreenchange")); });
    expect(screen.queryByTestId("fullscreen-timer")).not.toBeInTheDocument();
    expect(screen.getByTestId("timer-fullscreen")).toHaveFocus();
  });

  it.each([false, true])("provides an Escape-exitable fallback (request rejected: %s)", async (reject) => {
    if (reject) HTMLElement.prototype.requestFullscreen = vi.fn().mockRejectedValue(new Error("Unavailable"));
    const view = render(<FocusTimer />);
    await act(async () => fireEvent.click(screen.getByTestId("timer-fullscreen")));
    expect(screen.getByTestId("fullscreen-timer").parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("fullscreen-timer")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByTestId("timer-fullscreen")).toHaveFocus();
    view.unmount();
  });
});
