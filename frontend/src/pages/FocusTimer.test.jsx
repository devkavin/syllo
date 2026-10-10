import React from "react";
import { act, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "@/lib/api";

const queryState = vi.hoisted(() => ({ pending: false, failed: false, subjects: [], refetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ http: { post: vi.fn(), get: vi.fn(), patch: vi.fn(), put: vi.fn() }, formatError: String }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/hooks/useAcademicQueries", () => ({ useSubjectsQuery: () => ({ data: queryState.subjects, isPending: queryState.pending, isError: queryState.failed, refetch: queryState.refetch }) }));
import FocusTimer from "./FocusTimer";
const render = ui => rtlRender(ui, { wrapper: MemoryRouter });

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
  http.get.mockResolvedValue({ data: [] });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, writable: true, value: null });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, writable: true, value: undefined });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, writable: true, value: undefined });
});
afterEach(() => vi.useRealTimers());

describe("focus duration", () => {
  it("catches up after a delayed browser callback instead of counting ticks", () => {
    vi.useFakeTimers();
    render(<FocusTimer />);
    setMinutes("40");
    fireEvent.click(screen.getByTestId("timer-start"));
    vi.setSystemTime(Date.now() + 30 * 60 * 1000);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("timer-display")).toHaveTextContent("09:59");
  });

  it.each(["visibilitychange", "focus", "pageshow"])("refreshes elapsed time on %s without waiting for a tick", (event) => {
    vi.useFakeTimers();
    render(<FocusTimer />);
    fireEvent.click(screen.getByTestId("mode-stopwatch"));
    fireEvent.click(screen.getByTestId("timer-start"));
    vi.setSystemTime(Date.now() + 30 * 60 * 1000);
    fireEvent(event === "visibilitychange" ? document : window, new Event(event));
    expect(screen.getByTestId("timer-display")).toHaveTextContent("30:00");
  });

  it("logs current elapsed time even when no timer callback has run", async () => {
    vi.useFakeTimers();
    render(<FocusTimer />);
    fireEvent.click(screen.getByTestId("mode-stopwatch"));
    fireEvent.click(screen.getByTestId("timer-start"));
    vi.setSystemTime(Date.now() + 30 * 60 * 1000);
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    expect(http.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({ duration_seconds: 1800 }));
  });

  it.each(["pomodoro", "stopwatch"])("restores elapsed %s time after leaving Focus or reloading", (mode) => {
    vi.useFakeTimers();
    const view = render(<FocusTimer />);
    fireEvent.click(screen.getByTestId(`mode-${mode}`));
    fireEvent.click(screen.getByTestId("timer-start"));
    view.unmount();
    vi.setSystemTime(Date.now() + 12 * 60 * 1000);
    render(<FocusTimer />);
    expect(screen.getByTestId("timer-display")).toHaveTextContent(mode === "pomodoro" ? "13:00" : "12:00");
  });

  it("excludes paused time and retains partial seconds across resume and reload", async () => {
    vi.useFakeTimers();
    const view = render(<FocusTimer />);
    fireEvent.click(screen.getByTestId("mode-stopwatch"));
    fireEvent.click(screen.getByTestId("timer-start"));
    vi.setSystemTime(Date.now() + 10750);
    fireEvent.click(screen.getByTestId("timer-pause"));
    expect(screen.getByTestId("timer-display")).toHaveTextContent("00:10");
    view.unmount();
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    render(<FocusTimer />);
    expect(screen.getByTestId("timer-display")).toHaveTextContent("00:10");
    fireEvent.click(screen.getByTestId("timer-start"));
    vi.setSystemTime(Date.now() + 10250);
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    expect(http.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({ duration_seconds: 21 }));
  });

  it("completes an expired restored countdown once and caps the recorded duration", async () => {
    vi.useFakeTimers();
    const view = render(<FocusTimer />);
    setMinutes("1");
    fireEvent.click(screen.getByTestId("timer-start"));
    view.unmount();
    vi.setSystemTime(Date.now() + 30 * 60 * 1000);
    render(<React.StrictMode><FocusTimer /></React.StrictMode>);
    await act(async () => {});
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({ duration_seconds: 60 }));
  });

  it("prefills a subject-linked focus session and uses its duration", async () => {
    rtlRender(<MemoryRouter initialEntries={["/timer?subject=math"]}><FocusTimer /></MemoryRouter>);
    await act(async () => {});
    expect(screen.getByTestId("timer-subject-select")).toHaveValue("math");
    expect(screen.getByLabelText("Duration (minutes)")).toHaveValue(45);
  });
  it("waits for a linked subject before starting and offers retry on load failure", async () => {
    queryState.pending = true; queryState.subjects = [];
    const view = rtlRender(<MemoryRouter initialEntries={["/timer?subject=math"]}><FocusTimer /></MemoryRouter>);
    expect(screen.getByTestId("timer-start")).toBeDisabled();
    queryState.pending = false; queryState.failed = true;
    view.rerender(<MemoryRouter initialEntries={["/timer?subject=math"]}><FocusTimer /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Retry linked subject" }));
    expect(queryState.refetch).toHaveBeenCalled();
    queryState.failed = false; queryState.subjects = [{ subject_id: "math", name: "Math", focus_minutes: 45 }];
    view.rerender(<MemoryRouter initialEntries={["/timer?subject=math"]}><FocusTimer /></MemoryRouter>);
    await act(async () => {});
    expect(screen.getByTestId("timer-start")).toBeEnabled();
    expect(screen.getByTestId("timer-subject-select")).toHaveValue("math");
  });
  it("explains an unavailable subject and allows unlinked focus", async () => {
    localStorage.setItem("syllo.timer.v1", JSON.stringify({ mode: "pomodoro", subjectId: "math", unitId: "old-unit", lessonId: "old-lesson", seconds: 2700, sessionSeconds: 2700, running: false }));
    rtlRender(<MemoryRouter initialEntries={["/timer?subject=deleted"]}><FocusTimer /></MemoryRouter>);
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent("Could not open the subject");
    expect(screen.getByTestId("timer-start")).toBeEnabled();
    expect(JSON.parse(localStorage.getItem("syllo.timer.v1"))).toMatchObject({ subjectId: "", lessonId: null, unitId: null, sessionSeconds: 1500 });
  });
  it("clears restored academic context when explicitly choosing unlinked focus after a load failure", async () => {
    queryState.failed = true; queryState.subjects = [];
    localStorage.setItem("syllo.timer.v1", JSON.stringify({ mode: "pomodoro", subjectId: "previous", unitId: "unit", lessonId: "old-lesson", lessonTitle: "Old lesson", seconds: 2700, sessionSeconds: 2700, running: false }));
    rtlRender(<MemoryRouter initialEntries={["/timer?subject=math"]}><FocusTimer /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Focus without a subject" }));
    await act(async () => {});
    const saved = JSON.parse(localStorage.getItem("syllo.timer.v1"));
    expect(saved).toMatchObject({ subjectId: "", unitId: null, lessonId: null, lessonTitle: "", sessionSeconds: 1500 });
    expect(screen.getByTestId("timer-start")).toBeEnabled();
  });
  it("does not overwrite a paused session with a subject link", async () => {
    localStorage.setItem("syllo.timer.v1", JSON.stringify({ mode: "pomodoro", subjectId: "", seconds: 1200, sessionSeconds: 1500, startedAt: "2026-10-06T05:00:00Z", running: false }));
    rtlRender(<MemoryRouter initialEntries={["/timer?subject=math"]}><FocusTimer /></MemoryRouter>);
    await act(async () => {});
    expect(screen.getByTestId("timer-subject-select")).toHaveValue("");
    expect(screen.getByLabelText("Duration (minutes)")).toHaveValue(25);
  });
  it("lets lesson context take precedence over a subject-only link", async () => {
    http.get.mockImplementation(url => Promise.resolve({ data: url === "/lessons/limits" ? { lesson_id: "limits", title: "Limits", subject_id: "math", unit_id: "calc" } : [] }));
    rtlRender(<MemoryRouter initialEntries={["/timer?subject=other&lesson=limits"]}><FocusTimer /></MemoryRouter>);
    await act(async () => {});
    expect(screen.getByTestId("timer-subject-select")).toHaveValue("math");
    expect(screen.queryByText(/Could not open the subject/)).not.toBeInTheDocument();
  });
  it("hides setup controls during focus and restores them when paused", () => {
    render(<FocusTimer />);
    fireEvent.click(screen.getByTestId("timer-start"));
    expect(screen.queryByRole("spinbutton", { name: "Duration (minutes)" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("spinbutton", { name: "Duration (minutes)" })).toBeDisabled();
  });
  it("waits for lesson prefill before allowing a session to start", async () => {
    let resolveLesson; http.get.mockImplementation(url => url === "/lessons/limits" ? new Promise(resolve => { resolveLesson = resolve; }) : Promise.resolve({ data: [] }));
    rtlRender(<MemoryRouter initialEntries={["/timer?lesson=limits"]}><FocusTimer /></MemoryRouter>);
    expect(screen.getByTestId("timer-start")).toBeDisabled();
    await act(async () => resolveLesson({ data: { lesson_id: "limits", subject_id: "math", unit_id: "calculus", title: "Limits" } }));
    expect(screen.getByTestId("timer-start")).toBeEnabled();
  });
  it("does not count breaks as focused study", async () => {
    render(<FocusTimer />); vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("mode-short"));
    fireEvent.click(screen.getByTestId("timer-start")); advance(20);
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    expect(http.post).not.toHaveBeenCalled();
  });
  it("keeps lesson selection locked while a session is paused", async () => {
    http.get.mockImplementation(url => Promise.resolve({ data: url === "/lessons/limits" ? { lesson_id: "limits", subject_id: "math", unit_id: "calculus", title: "Limits" } : [] }));
    rtlRender(<MemoryRouter initialEntries={["/timer?lesson=limits"]}><FocusTimer /></MemoryRouter>);
    await act(async () => {}); vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("timer-start")); advance(20);
    fireEvent.click(screen.getByTestId("timer-pause"));
    expect(screen.getByTestId("timer-subject-select")).toBeDisabled();
    expect(screen.getByTestId("mode-short")).toBeDisabled();
  });
  it("starts from a lesson and offers review only after saving actual study time", async () => {
    http.get.mockImplementation(url => Promise.resolve({ data: url === "/lessons/limits" ? { lesson_id: "limits", subject_id: "math", unit_id: "calculus", title: "Limits" } : [] }));
    http.post.mockResolvedValue({ data: { session_id: "saved", duration_seconds: 45, lesson_id: "limits" } });
    rtlRender(<FocusTimer />, { wrapper: ({ children }) => <MemoryRouter initialEntries={["/timer?lesson=limits"]}>{children}</MemoryRouter> });
    await act(async () => {});
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("timer-start"));
    advance(45);
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    expect(http.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({ lesson_id: "limits", duration_seconds: 45, request_id: expect.any(String) }));
    expect(screen.getByRole("heading", { name: "Session complete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 minutes" })).toBeInTheDocument();
  });
  it("retains the same recording request when a failed save is retried", async () => {
    http.post.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ data: { session_id: "saved", duration_seconds: 20 } });
    render(<FocusTimer />);
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("timer-start")); advance(20);
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    const first = http.post.mock.calls[0][1];
    expect(first.request_id).toEqual(expect.any(String));
    expect(http.post.mock.calls[1][1]).toEqual(first);
  });
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
  it("starts fresh personal focus without a previous Circle context", async () => {
    localStorage.setItem("syllo.timer.v1", JSON.stringify({ mode: "pomodoro", seconds: 1500, sessionSeconds: 1500, running: false, startedAt: null, eventId: "old", eventTopic: "Old group" }));
    render(<FocusTimer />);
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("timer-start")); advance(20);
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    expect(http.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({ circle_event_id: null }));
  });
  it("preserves an active Circle timer when returning through plain Focus", async () => {
    localStorage.setItem("syllo.timer.v1", JSON.stringify({ mode: "pomodoro", seconds: 1480, sessionSeconds: 1500, running: false, startedAt: "2026-10-05T09:00:00Z", eventId: "active", eventTopic: "Study group" }));
    render(<FocusTimer />);
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    expect(http.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({ circle_event_id: "active" }));
  });
  it("detaches the Circle context after a successful session", async () => {
    http.get.mockImplementation(url => Promise.resolve({ data: url === "/circle-sessions/e" ? { id: "e", topic: "Limits together", my_status: "accepted", canceled: false } : [] }));
    http.post.mockResolvedValue({ data: { session_id: "s", duration_seconds: 20 } });
    rtlRender(<MemoryRouter initialEntries={["/timer?event=e"]}><FocusTimer /></MemoryRouter>);
    await screen.findByText("Limits together");
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("timer-start")); advance(20);
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    fireEvent.click(screen.getByTestId("timer-start")); advance(20);
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    expect(http.post.mock.calls[0][1].circle_event_id).toBe("e");
    expect(http.post.mock.calls[1][1].circle_event_id).toBeNull();
  });
  it("links accepted Circle study to actual recorded time only", async () => {
    http.get.mockImplementation(url => Promise.resolve({ data: url === "/circle-sessions/e" ? { id: "e", topic: "Limits with friends", my_status: "accepted", canceled: false } : [] }));
    http.post.mockResolvedValue({ data: { session_id: "s", duration_seconds: 30 } });
    rtlRender(<MemoryRouter initialEntries={["/timer?event=e"]}><FocusTimer /></MemoryRouter>);
    expect(await screen.findByText("Limits with friends")).toBeInTheDocument();
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("timer-start"));
    act(() => vi.advanceTimersByTime(30000));
    await act(async () => fireEvent.click(screen.getByTestId("timer-save")));
    expect(http.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({ circle_event_id: "e", duration_seconds: 30 }));
  });
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
