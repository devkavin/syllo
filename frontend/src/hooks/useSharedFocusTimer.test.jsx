import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http } from "@/lib/api";
import { useSharedFocusTimer } from "./useSharedFocusTimer";

vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), post: vi.fn() }, formatError: error => error.message }));
let monotonic;
const envelope = (revision = 1, timer = {}) => ({ revision, server_now: "2026-10-10T00:00:00Z", last_session: null,
  timer: timer === null ? null : { timer_id: "timer-a", mode: "pomodoro", status: "running", duration_seconds: 60, elapsed_seconds: 10, ...timer } });
const respond = data => ({ data });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function mount(userId = "account-a") {
  const hook = renderHook(props => useSharedFocusTimer(props), { initialProps: { userId } });
  await act(async () => {});
  return hook;
}
beforeEach(() => {
  monotonic = 1000;
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => monotonic);
  http.get.mockReset().mockResolvedValue(respond(envelope()));
  http.post.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("ticks monotonically despite wall clock changes, with ceil countdown and floor stopwatch", async () => {
  const { result } = await mount();
  expect(result.current.displaySeconds).toBe(50);
  monotonic += 1250;
  vi.setSystemTime(new Date("2030-01-01"));
  act(() => vi.advanceTimersByTime(250));
  expect(result.current.elapsedSeconds).toBe(11.25);
  expect(result.current.displaySeconds).toBe(49);
  http.get.mockResolvedValue(respond(envelope(2, { mode: "stopwatch", duration_seconds: 0, elapsed_seconds: 12.9 })));
  await act(async () => result.current.refresh());
  expect(result.current.displaySeconds).toBe(12);
});

it("accounts for response transit time without counting time the server already measured", async () => {
  const pending = deferred();
  http.get.mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useSharedFocusTimer({ userId: "account-a" }));
  monotonic += 1200;
  await act(async () => pending.resolve(respond({ ...envelope(), server_received_at: "2026-10-09T23:59:59.200Z" })));
  // 1.2s round trip - 0.8s server processing = 0.4s transit; estimate 0.2s return.
  expect(result.current.elapsedSeconds).toBeCloseTo(10.2);
});

it("does not let a GET started before a mutation replace the acknowledged pause", async () => {
  const { result } = await mount();
  const old = deferred();
  http.get.mockReturnValueOnce(old.promise);
  let polling;
  act(() => { polling = result.current.refresh(); });
  http.post.mockResolvedValue(respond(envelope(2, { status: "paused", elapsed_seconds: 15 })));
  await act(async () => result.current.act("pause"));
  await act(async () => { old.resolve(respond(envelope(1))); await polling; });
  expect(result.current.snapshot.revision).toBe(2);
  expect(result.current.snapshot.timer.status).toBe("paused");
});

it("guards out-of-order poll responses even when their revisions match", async () => {
  const { result } = await mount();
  const older = deferred();
  http.get.mockReturnValueOnce(older.promise).mockResolvedValueOnce(respond(envelope(1, { elapsed_seconds: 20 })));
  let first;
  act(() => { first = result.current.refresh(); });
  await act(async () => result.current.refresh());
  await act(async () => { older.resolve(respond(envelope(1, { elapsed_seconds: 11 }))); await first; });
  expect(result.current.elapsedSeconds).toBe(20);
});

it("retries a lost mutation response with the same request ID and expected revision", async () => {
  const { result } = await mount();
  http.post.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce(respond(envelope(2, { status: "paused" })));
  await act(async () => result.current.act("pause"));
  const requests = http.post.mock.calls;
  expect(requests).toHaveLength(2);
  expect(requests[0][1]).toEqual(requests[1][1]);
  expect(requests[0][1]).toMatchObject({ action: "pause", expected_revision: 1 });
  expect(requests[0][1].request_id).toMatch(/^[0-9a-f-]{36}$/i);
});

it("keeps a failed pause running and exposes the error without optimistic changes", async () => {
  const { result } = await mount();
  http.post.mockRejectedValue(new Error("Offline"));
  await act(async () => { await expect(result.current.act("pause")).rejects.toThrow("Offline"); });
  monotonic += 1000;
  act(() => vi.advanceTimersByTime(250));
  expect(result.current.snapshot.timer.status).toBe("running");
  expect(result.current.elapsedSeconds).toBe(11);
  expect(result.current.error).toContain("Offline");
});

it("refreshes conflicts and informs the caller without replaying against a new revision", async () => {
  const { result } = await mount();
  http.post.mockRejectedValue({ message: "Conflict", response: { status: 409 } });
  http.get.mockResolvedValue(respond(envelope(3, { status: "paused" })));
  await act(async () => { await expect(result.current.act("pause")).rejects.toMatchObject({ response: { status: 409 } }); });
  expect(http.post).toHaveBeenCalledTimes(1);
  expect(result.current.snapshot.revision).toBe(3);
  expect(result.current.error).toMatch(/another|changed/i);
});

it("refreshes an expired countdown for server completion, never creating a client session", async () => {
  http.get.mockResolvedValueOnce(respond(envelope(1, { elapsed_seconds: 59 }))).mockResolvedValue(respond(envelope(2, null)));
  const { result } = await mount();
  monotonic += 5000;
  await act(async () => vi.advanceTimersByTime(250));
  expect(result.current.snapshot.timer).toBeNull();
  expect(http.post).not.toHaveBeenCalled();
});

it("restores the latest server timer after unmount and updates a second consumer", async () => {
  const first = await mount();
  const second = await mount();
  first.unmount();
  http.get.mockResolvedValue(respond(envelope(4, { status: "paused", elapsed_seconds: 28 })));
  const restored = await mount();
  await act(async () => second.result.current.refresh());
  expect(restored.result.current.elapsedSeconds).toBe(28);
  expect(second.result.current.snapshot.revision).toBe(4);
});

it("blocks actions after initial failure and retains an existing view during poll failure", async () => {
  http.get.mockRejectedValueOnce(new Error("Unavailable"));
  const initial = await mount();
  expect(initial.result.current.loading).toBe(false);
  await act(async () => { await expect(initial.result.current.act("start", { mode: "pomodoro", duration_seconds: 60 })).rejects.toThrow(); });
  expect(http.post).not.toHaveBeenCalled();
  const existing = await mount();
  http.get.mockRejectedValue(new Error("Unavailable"));
  await act(async () => existing.result.current.refresh());
  expect(existing.result.current.snapshot.timer.status).toBe("running");
  expect(existing.result.current.error).toBeTruthy();
});

it("clears account state immediately and ignores an old account response", async () => {
  const first = deferred();
  http.get.mockReturnValueOnce(first.promise).mockResolvedValueOnce(respond(envelope(9, null)));
  const hook = renderHook(({ userId }) => useSharedFocusTimer({ userId }), { initialProps: { userId: "a" } });
  await act(async () => hook.rerender({ userId: "b" }));
  await act(async () => first.resolve(respond(envelope())));
  expect(hook.result.current.snapshot.revision).toBe(9);
  expect(hook.result.current.snapshot.timer).toBeNull();
});

it("does not fetch or permit mutations when disabled", async () => {
  const { result } = renderHook(() => useSharedFocusTimer({ enabled: false }));
  expect(result.current.loading).toBe(false);
  expect(result.current.snapshot).toBeNull();
  await expect(result.current.act("start")).rejects.toThrow(/unavailable/);
  expect(http.get).not.toHaveBeenCalled();
  expect(http.post).not.toHaveBeenCalled();
});

it("defers focus refresh while an action is pending and reconciles afterward", async () => {
  const { result } = await mount();
  const pending = deferred();
  http.post.mockReturnValueOnce(pending.promise);
  let action;
  act(() => { action = result.current.act("pause"); });
  const count = http.get.mock.calls.length;
  act(() => window.dispatchEvent(new Event("focus")));
  expect(http.get).toHaveBeenCalledTimes(count);
  http.get.mockResolvedValue(respond(envelope(2, { status: "paused" })));
  await act(async () => { pending.resolve(respond(envelope(2, { status: "paused" }))); await action; });
  expect(http.get).toHaveBeenCalledTimes(count + 1);
  expect(result.current.busy).toBe(false);
});

it("polls visible running timers and refreshes after returning from another page", async () => {
  await mount();
  monotonic += 2000;
  await act(async () => vi.advanceTimersByTime(250));
  expect(http.get).toHaveBeenCalledTimes(2);
  await act(async () => window.dispatchEvent(new Event("pageshow")));
  expect(http.get).toHaveBeenCalledTimes(3);
});
