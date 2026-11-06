import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { http } from "@/lib/api";
import { getLibrary, patchLibrary } from "./libraryApi";
import { useStudioLibrary } from "./useStudioLibrary";

vi.mock("@/lib/api", () => ({
  http: { get: vi.fn(), patch: vi.fn() },
  formatError: error => error?.response?.data?.detail?.message || error.message,
}));

const empty = () => ({ revision: 0, favorites: [], recent: [], items: [] });
const respond = data => ({ data });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const conflict = current => ({ response: { status: 409, data: { detail: { message: "Library changed", current } } } });
const item = (id = "item-a", name = "Saved component") => ({ id, name, kind: "component", document: { version: 2, objects: [] } });
async function mount(accountId = "account-a") {
  const hook = renderHook(props => useStudioLibrary(props.accountId), { initialProps: { accountId } });
  await act(async () => {});
  return hook;
}

beforeEach(() => {
  http.get.mockReset().mockResolvedValue(respond(empty()));
  http.patch.mockReset();
});

it("discards a failed capacity-limited save and lets queued removal free library space", async () => {
  const full = { ...empty(), revision: 1, items: Array.from({ length: 20 }, (_, i) => item(`saved-${i}`)) };
  http.get.mockResolvedValue(respond(full));
  http.patch.mockRejectedValueOnce({ message: "Library supports at most 20 saved items", response: { status: 422 } });
  const { result } = await mount();
  await act(async () => expect(await result.current.saveItem(item("extra"))).toBe(false));
  expect(result.current.canDiscard).toBe(true);
  await act(async () => expect(await result.current.removeItem("saved-0")).toBe(false));
  const reduced = { ...full, revision: 2, items: full.items.slice(1) };
  http.patch.mockResolvedValueOnce(respond(reduced));
  await act(async () => expect(await result.current.discardFailed()).toBe(true));
  expect(http.patch.mock.calls[1][1]).toEqual({ action: "remove", item_id: "saved-0", expected_revision: 1 });
  expect(result.current.state).toEqual(reduced);
  expect(result.current.canDiscard).toBe(false); expect(result.current.error).toBe("");
});

it("discards unsent changes after a failed load without silently losing the retry control", async () => {
  http.get.mockRejectedValueOnce(new Error("Offline"));
  const { result } = await mount();
  await act(async () => expect(await result.current.toggleFavorite("mitochondrion")).toBe(false));
  expect(result.current.canDiscard).toBe(true);
  await act(async () => expect(await result.current.discardFailed()).toBe(true));
  expect(result.current.canDiscard).toBe(false); expect(result.current.error).not.toBe("");
  http.get.mockResolvedValueOnce(respond(empty()));
  await act(async () => expect(await result.current.retry()).toBe(true));
  expect(result.current.error).toBe(""); expect(http.patch).not.toHaveBeenCalled();
});

it("uses the authenticated library endpoint and expected revision without an owner in the body", async () => {
  const state = { ...empty(), revision: 7 };
  http.patch.mockResolvedValue(respond(state));
  expect(await getLibrary()).toEqual(empty());
  expect(await patchLibrary({ action: "recent", asset_id: "mitochondrion" }, 6)).toEqual(state);
  expect(http.get).toHaveBeenCalledWith("/illustrations/library", expect.objectContaining({ timeout: 15000 }));
  expect(http.patch).toHaveBeenCalledWith("/illustrations/library", {
    action: "recent", asset_id: "mitochondrion", expected_revision: 6,
  }, expect.objectContaining({ timeout: 15000 }));
});

it("does not request or mutate a library until an account is available", async () => {
  const { result, rerender } = await mount(null);
  expect(result.current.state).toEqual(empty());
  expect(result.current.loading).toBe(false);
  await act(async () => expect(await result.current.saveItem(item())).toBe(false));
  expect(http.get).not.toHaveBeenCalled();
  expect(http.patch).not.toHaveBeenCalled();
  rerender({ accountId: "account-b" });
  await act(async () => {});
  expect(http.get).toHaveBeenCalledOnce();
  expect(result.current.state).toEqual(empty());
});

it("serializes commands and sends each write with the preceding acknowledged revision", async () => {
  const first = deferred();
  http.patch.mockReturnValueOnce(first.promise).mockResolvedValueOnce(respond({ ...empty(), revision: 2, favorites: ["mitochondrion", "cell"] }));
  const { result } = await mount();
  let a, b;
  act(() => {
    a = result.current.toggleFavorite("mitochondrion");
    b = result.current.toggleFavorite("cell");
  });
  expect(result.current.busy).toBe(true);
  expect(http.patch).toHaveBeenCalledTimes(1);
  await act(async () => {
    first.resolve(respond({ ...empty(), revision: 1, favorites: ["mitochondrion"] }));
    expect(await a).toBe(true);
    expect(await b).toBe(true);
  });
  expect(http.patch.mock.calls[1][1]).toMatchObject({ expected_revision: 1, asset_id: "cell", enabled: true });
  expect(result.current.state).toEqual({ ...empty(), revision: 2, favorites: ["mitochondrion", "cell"] });
  expect(result.current.busy).toBe(false);
});

it("keeps rapid toggle intent and retries a conflict as the same desired favorite state", async () => {
  const { result } = await mount();
  http.patch.mockRejectedValueOnce(conflict({ ...empty(), revision: 3, favorites: ["mitochondrion"] }))
    .mockResolvedValueOnce(respond({ ...empty(), revision: 3, favorites: ["mitochondrion"] }))
    .mockResolvedValueOnce(respond({ ...empty(), revision: 4 }));
  let first, second;
  await act(async () => {
    first = result.current.toggleFavorite("mitochondrion");
    second = result.current.toggleFavorite("mitochondrion");
    expect(await first).toBe(true);
    expect(await second).toBe(true);
  });
  expect(http.patch.mock.calls.map(call => call[1])).toEqual([
    { action: "favorite", asset_id: "mitochondrion", enabled: true, expected_revision: 0 },
    { action: "favorite", asset_id: "mitochondrion", enabled: true, expected_revision: 3 },
    { action: "favorite", asset_id: "mitochondrion", enabled: false, expected_revision: 3 },
  ]);
  expect(result.current.state).toEqual({ ...empty(), revision: 4 });
});

it("rebases a new saved item onto a conflict without discarding other account items", async () => {
  const other = item("other"), desired = item();
  http.patch.mockRejectedValueOnce(conflict({ ...empty(), revision: 4, items: [other] }))
    .mockResolvedValueOnce(respond({ ...empty(), revision: 5, items: [other, desired] }));
  const { result } = await mount();
  await act(async () => expect(await result.current.saveItem(desired)).toBe(true));
  expect(http.patch.mock.calls[1][1]).toEqual({ action: "save", item: desired, expected_revision: 4 });
  expect(result.current.state.items).toEqual([other, desired]);
});

it("retains a concurrent edit to the same item for explicit retry before replacing it", async () => {
  const original = item(), remote = item("item-a", "Remote edit"), desired = item("item-a", "My edit");
  http.get.mockResolvedValue(respond({ ...empty(), revision: 1, items: [original] }));
  http.patch.mockRejectedValueOnce(conflict({ ...empty(), revision: 2, items: [remote] }));
  const { result } = await mount();
  await act(async () => expect(await result.current.saveItem(desired)).toBe(false));
  expect(http.patch).toHaveBeenCalledOnce();
  expect(result.current.state.items).toEqual([remote]);
  expect(result.current.error).toMatch(/changed|another device/i);
  http.patch.mockResolvedValueOnce(respond({ ...empty(), revision: 3, items: [desired] }));
  await act(async () => expect(await result.current.retry()).toBe(true));
  expect(http.patch.mock.calls[1][1]).toEqual({ action: "save", item: desired, expected_revision: 2 });
  expect(result.current.state.items).toEqual([desired]);
  expect(result.current.error).toBe("");
});

it("pauses ordered writes after a network failure and retries retained immutable copies", async () => {
  const pending = deferred(), desired = item();
  http.patch.mockReturnValueOnce(pending.promise);
  const { result } = await mount();
  let first, second;
  act(() => {
    first = result.current.saveItem(desired);
    second = result.current.recordRecent("mitochondrion");
    desired.name = "Later editor mutation";
  });
  await act(async () => {
    pending.reject(new Error("Network unavailable"));
    expect(await first).toBe(false);
    expect(await second).toBe(false);
  });
  expect(http.patch).toHaveBeenCalledOnce();
  expect(result.current.error).toContain("Network unavailable");
  expect(result.current.busy).toBe(false);
  http.patch.mockResolvedValueOnce(respond({ ...empty(), revision: 1, items: [item()] }))
    .mockResolvedValueOnce(respond({ ...empty(), revision: 2, items: [item()], recent: ["mitochondrion"] }));
  await act(async () => expect(await result.current.retry()).toBe(true));
  expect(http.patch.mock.calls[1][1].item.name).toBe("Saved component");
  expect(http.patch.mock.calls[2][1]).toEqual({ action: "recent", asset_id: "mitochondrion", expected_revision: 1 });
  expect(result.current.state.recent).toEqual(["mitochondrion"]);
});

it("keeps a failed initial load recoverable without issuing unversioned writes", async () => {
  http.get.mockRejectedValueOnce(new Error("Library unavailable"));
  const { result } = await mount();
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toContain("Library unavailable");
  await act(async () => expect(await result.current.removeItem("item-a")).toBe(false));
  expect(http.patch).not.toHaveBeenCalled();
  http.get.mockResolvedValueOnce(respond({ ...empty(), revision: 5, items: [item()] }));
  http.patch.mockResolvedValueOnce(respond({ ...empty(), revision: 6 }));
  await act(async () => expect(await result.current.retryLoad()).toBe(true));
  expect(http.patch.mock.calls[0][1]).toEqual({ action: "remove", item_id: "item-a", expected_revision: 5 });
  expect(result.current.state).toEqual({ ...empty(), revision: 6 });
});

it("discards old account GET responses and never invokes old queued writes after switching", async () => {
  const old = deferred();
  http.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(respond({ ...empty(), revision: 9, favorites: ["other-account"] }));
  const hook = renderHook(props => useStudioLibrary(props.accountId), { initialProps: { accountId: "account-a" } });
  let queued;
  act(() => { queued = hook.result.current.saveItem(item()); });
  hook.rerender({ accountId: "account-b" });
  await act(async () => {});
  await act(async () => {
    old.resolve(respond({ ...empty(), revision: 3, favorites: ["old-account"] }));
    expect(await queued).toBe(false);
  });
  expect(hook.result.current.state).toEqual({ ...empty(), revision: 9, favorites: ["other-account"] });
  expect(http.patch).not.toHaveBeenCalled();
  expect(http.get.mock.calls[0][1].signal.aborted).toBe(true);
});

it("ignores an old account write result and cancels its queued successor on switch or unmount", async () => {
  const pending = deferred();
  http.patch.mockReturnValueOnce(pending.promise);
  const { result, rerender, unmount } = await mount();
  let first, second;
  act(() => { first = result.current.saveItem(item()); second = result.current.removeItem("another"); });
  rerender({ accountId: "account-b" });
  await act(async () => {});
  await act(async () => {
    pending.resolve(respond({ ...empty(), revision: 2, items: [item()] }));
    expect(await first).toBe(false);
    expect(await second).toBe(false);
  });
  expect(result.current.state).toEqual(empty());
  expect(http.patch).toHaveBeenCalledOnce();
  expect(http.patch.mock.calls[0][2].signal.aborted).toBe(true);
  const staleMethod = result.current.saveItem;
  unmount();
  expect(await staleMethod(item())).toBe(false);
  expect(http.patch).toHaveBeenCalledOnce();
});

it("never lets a refresh response roll back a later acknowledged write", async () => {
  const { result } = await mount();
  const old = deferred();
  http.get.mockReturnValueOnce(old.promise);
  let loading;
  act(() => { loading = result.current.retryLoad(); });
  http.patch.mockResolvedValue(respond({ ...empty(), revision: 1, recent: ["mitochondrion"] }));
  await act(async () => expect(await result.current.recordRecent("mitochondrion")).toBe(true));
  await act(async () => { old.resolve(respond(empty())); await loading; });
  expect(result.current.state).toEqual({ ...empty(), revision: 1, recent: ["mitochondrion"] });
});
