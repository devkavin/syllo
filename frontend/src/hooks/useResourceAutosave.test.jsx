import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useResourceAutosave } from "./useResourceAutosave";
afterEach(() => { vi.useRealTimers(); sessionStorage.clear(); localStorage.clear(); });
it("keeps a failed draft and retries it", async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ notes: "Draft" });
  const { result } = renderHook(() => useResourceAutosave({ resourceKey: "retry", initialValue: { notes: "" }, save }));
  act(() => result.current.update({ notes: "Draft" }));
  await act(async () => result.current.flush());
  expect(result.current.saveState).toBe("failed");
  expect(result.current.draft.notes).toBe("Draft");
  await act(async () => result.current.retry());
  expect(result.current.saveState).toBe("saved");
});
it("does not apply an old save response to the new resource", async () => {
  let resolve;
  const oldSave = () => new Promise(r => { resolve = r; });
  const { result, rerender } = renderHook(({ key }) => useResourceAutosave({ resourceKey: key, initialValue: { notes: key }, save: oldSave }), { initialProps: { key: "a" } });
  act(() => result.current.update({ notes: "Changed A" }));
  act(() => { void result.current.flush(); });
  rerender({ key: "b" });
  await act(async () => resolve({ notes: "Changed A" }));
  expect(result.current.draft.notes).toBe("b");
});
it("restores queued text after navigation without writing into another resource", () => {
  vi.useFakeTimers();
  const save = vi.fn();
  const first = renderHook(() => useResourceAutosave({ resourceKey: "draft", initialValue: { notes: "" }, save }));
  act(() => first.result.current.update({ notes: "Keep this" }));
  first.unmount();
  act(() => vi.advanceTimersByTime(1000));
  expect(save).not.toHaveBeenCalled();
  const next = renderHook(() => useResourceAutosave({ resourceKey: "draft", initialValue: { notes: "" }, save }));
  expect(next.result.current.draft.notes).toBe("Keep this");
});
it("retains in-flight and newer fields together in the recovery draft", async () => {
  let reject;
  const save = vi.fn(() => new Promise((_, r) => { reject = r; }));
  const first = renderHook(() => useResourceAutosave({ resourceKey: "in-flight", initialValue: { title: "Old", content: "" }, save }));
  act(() => first.result.current.update({ title: "New title" }));
  act(() => { void first.result.current.flush(); });
  act(() => first.result.current.update({ content: "New content" }));
  first.unmount();
  const restored = renderHook(() => useResourceAutosave({ resourceKey: "in-flight", initialValue: { title: "Old", content: "" }, save }));
  expect(restored.result.current.draft).toEqual({ title: "New title", content: "New content" });
  restored.unmount();
  await act(async () => reject(new Error("offline")));
});
it("does not erase a newer recovered draft when an old response arrives", async () => {
  let resolve;
  const oldSave = () => new Promise(r => { resolve = r; });
  const first = renderHook(() => useResourceAutosave({ resourceKey: "revisited", initialValue: { notes: "Old" }, save: oldSave }));
  act(() => first.result.current.update({ notes: "First edit" }));
  act(() => { void first.result.current.flush(); });
  first.unmount();
  const next = renderHook(() => useResourceAutosave({ resourceKey: "revisited", initialValue: { notes: "Old" }, save: vi.fn() }));
  act(() => next.result.current.update({ notes: "Latest edit" }));
  await act(async () => resolve({ notes: "First edit" }));
  next.unmount();
  const restored = renderHook(() => useResourceAutosave({ resourceKey: "revisited", initialValue: { notes: "First edit" }, save: vi.fn() }));
  expect(restored.result.current.draft.notes).toBe("Latest edit");
});
it("serializes saves across a resource's remount", async () => {
  let resolve;
  const oldSave = () => new Promise(r => { resolve = r; });
  const first = renderHook(() => useResourceAutosave({ resourceKey: "serialized", initialValue: { notes: "Old" }, save: oldSave }));
  act(() => first.result.current.update({ notes: "First edit" }));
  act(() => { void first.result.current.flush(); });
  first.unmount();
  const newSave = vi.fn().mockResolvedValue({ notes: "Latest edit" });
  const next = renderHook(() => useResourceAutosave({ resourceKey: "serialized", initialValue: { notes: "Old" }, save: newSave }));
  act(() => next.result.current.update({ notes: "Latest edit" }));
  let finishing;
  act(() => { finishing = next.result.current.flush(); });
  expect(newSave).not.toHaveBeenCalled();
  await act(async () => { resolve({ notes: "First edit" }); await finishing; });
  expect(next.result.current.draft.notes).toBe("Latest edit");
});
it("does not replay an inactive editor's queued changes after a newer editor saves", async () => {
  let resolve;
  const oldSave = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({ notes: "Older queued edit" });
  const first = renderHook(() => useResourceAutosave({ resourceKey: "inactive", initialValue: { notes: "Old" }, save: oldSave }));
  act(() => first.result.current.update({ notes: "First edit" }));
  let oldFlush;
  act(() => { oldFlush = first.result.current.flush(); });
  act(() => first.result.current.update({ notes: "Older queued edit" }));
  first.unmount();
  const newSave = vi.fn().mockResolvedValue({ notes: "Newest edit" });
  const next = renderHook(() => useResourceAutosave({ resourceKey: "inactive", initialValue: { notes: "Old" }, save: newSave }));
  act(() => next.result.current.update({ notes: "Newest edit" }));
  let newFlush;
  act(() => { newFlush = next.result.current.flush(); });
  await act(async () => { resolve({ notes: "First edit" }); await Promise.all([oldFlush, newFlush]); });
  expect(oldSave).toHaveBeenCalledTimes(1);
  expect(newSave).toHaveBeenCalledWith({ notes: "Newest edit" });
});

it("keeps a durable draft's base revision across browser sessions and accounts", async () => {
  const save = vi.fn();
  const options = { resourceKey: "notebook.durable", accountId: "alice", versioned: true, initialValue: { title: "Server", content: "", revision: 3 }, save };
  const first = renderHook(() => useResourceAutosave(options));
  act(() => first.result.current.update({ content: "Remember this" }));
  first.unmount();
  sessionStorage.clear();
  const otherAccount = renderHook(() => useResourceAutosave({ ...options, accountId: "bob" }));
  expect(otherAccount.result.current.draft.content).toBe("");
  otherAccount.unmount();
  const reopened = renderHook(() => useResourceAutosave({ ...options, initialValue: { title: "New server", content: "Server edit", revision: 4 } }));
  expect(reopened.result.current.draft.content).toBe("Remember this");
  expect(reopened.result.current.saveState).toBe("conflict");
  await act(async () => reopened.result.current.flush());
  expect(save).not.toHaveBeenCalled();
  expect(reopened.result.current.conflict.current.content).toBe("Server edit");
  act(() => reopened.result.current.replace(reopened.result.current.conflict.current));
  expect(reopened.result.current.draft.content).toBe("Server edit");
  reopened.unmount();
  const next = renderHook(() => useResourceAutosave({ ...options, initialValue: { content: "Server edit", revision: 4 } }));
  expect(next.result.current.draft.content).toBe("Server edit");
  expect(next.result.current.saveState).toBe("idle");
});

it("sends the original revision on retry and blocks writes after a conflict", async () => {
  const current = { title: "Server", content: "Other edit", revision: 8 };
  const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce({ response: { status: 409, data: { detail: { current } } } });
  const { result } = renderHook(() => useResourceAutosave({ resourceKey: "notebook.conflict", accountId: "alice", versioned: true, initialValue: { content: "Old", revision: 7 }, save }));
  act(() => result.current.update({ content: "My edit" }));
  await act(async () => result.current.flush());
  await act(async () => result.current.retry());
  expect(save).toHaveBeenNthCalledWith(1, { content: "My edit", expected_revision: 7 });
  expect(save).toHaveBeenNthCalledWith(2, { content: "My edit", expected_revision: 7 });
  expect(result.current.saveState).toBe("conflict");
  expect(result.current.draft.content).toBe("My edit");
  act(() => result.current.update({ title: "Still editing" }));
  await act(async () => result.current.flush());
  expect(save).toHaveBeenCalledTimes(2);
  expect(result.current.conflict.current).toEqual(current);
});

it("uses each successful server revision for the next notebook save", async () => {
  const save = vi.fn().mockResolvedValueOnce({ title: "New", content: "Old", revision: 2 }).mockResolvedValueOnce({ title: "New", content: "Next", revision: 3 });
  const { result } = renderHook(() => useResourceAutosave({ resourceKey: "notebook.next", accountId: "alice", versioned: true, initialValue: { title: "Old", content: "Old", revision: 1 }, save }));
  act(() => result.current.update({ title: "New" }));
  await act(async () => result.current.flush());
  act(() => result.current.update({ content: "Next" }));
  await act(async () => result.current.flush());
  expect(save).toHaveBeenLastCalledWith({ content: "Next", expected_revision: 2 });
  expect(result.current.draft.revision).toBe(3);
});

it("recovers pre-upgrade session drafts only after notebook ownership is confirmed", () => {
  sessionStorage.setItem("syllo.draft.notebook.legacy", JSON.stringify({ content: "Old unsaved notes" }));
  const save = vi.fn();
  const noOwnership = renderHook(() => useResourceAutosave({ resourceKey: "notebook.legacy", accountId: "alice", versioned: true, initialValue: null, save }));
  expect(noOwnership.result.current.draft.content).toBeUndefined();
  noOwnership.unmount();
  const owned = renderHook(() => useResourceAutosave({ resourceKey: "notebook.legacy", accountId: "alice", versioned: true, initialValue: { notebook_id: "legacy", content: "Server", revision: 3 }, save }));
  expect(owned.result.current.draft.content).toBe("Old unsaved notes");
  expect(owned.result.current.saveState).toBe("conflict");
  owned.unmount(); sessionStorage.clear();
  const nextSession = renderHook(() => useResourceAutosave({ resourceKey: "notebook.legacy", accountId: "alice", versioned: true, initialValue: { notebook_id: "legacy", content: "Server", revision: 3 }, save }));
  expect(nextSession.result.current.draft.content).toBe("Old unsaved notes");
});

it("does not apply an in-flight save after explicitly replacing the notebook", async () => {
  let resolve;
  const save = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({ content: "New draft", revision: 11 });
  const { result } = renderHook(() => useResourceAutosave({ resourceKey: "notebook.replaced", accountId: "alice", versioned: true, initialValue: { content: "Old", revision: 1 }, save }));
  act(() => result.current.update({ content: "Discarded draft" }));
  let flushing;
  act(() => { flushing = result.current.flush(); });
  act(() => result.current.replace({ content: "Server copy", revision: 10 }));
  await act(async () => { resolve({ content: "Discarded draft", revision: 2 }); await flushing; });
  expect(result.current.draft).toMatchObject({ content: "Server copy", revision: 10 });
  act(() => result.current.update({ content: "New draft" }));
  await act(async () => result.current.flush());
  expect(save).toHaveBeenLastCalledWith({ content: "New draft", expected_revision: 10 });
});

it("does not erase a newer remounted draft when an old recovery operation finishes", () => {
  const options = { resourceKey: "notebook.old-recovery", accountId: "alice", versioned: true, initialValue: { content: "Server", revision: 1 }, save: vi.fn() };
  const first = renderHook(() => useResourceAutosave(options));
  act(() => first.result.current.update({ content: "First draft" }));
  const oldRecovery = first.result.current.replace;
  first.unmount();
  const next = renderHook(() => useResourceAutosave(options));
  act(() => next.result.current.update({ content: "Latest draft" }));
  act(() => oldRecovery({ content: "Server", revision: 2 }));
  next.unmount();
  const reopened = renderHook(() => useResourceAutosave({ ...options, initialValue: { content: "Server", revision: 2 } }));
  expect(reopened.result.current.draft.content).toBe("Latest draft");
  expect(reopened.result.current.saveState).toBe("conflict");
});
